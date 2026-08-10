// Mobile notification layer: API client, push-token registration, foreground /
// background / cold-start handling, deep-link routing, and a provider exposing
// the unread count + permission onboarding to the UI.

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STORE_API_URL } from '@/src/config/env';
import { storage, KEYS } from './storage';
import { getCustomerToken, useAccount } from './account';
import { rememberPushToken } from './pushToken';
import { noteAuthFailure } from './session';

const API = STORE_API_URL;

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  const token = getCustomerToken();
  const sentToken = Boolean(auth && token);
  if (sentToken) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    noteAuthFailure(res.status, sentToken);
    const e = await res.json().catch(() => ({}));
    const err = new Error(e.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const notificationsApi = {
  list: before => req(`/api/notifications${before ? `?before=${before}` : ''}`),
  unreadCount: () => req('/api/notifications/unread-count'),
  markRead: id => req(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => req('/api/notifications/read-all', { method: 'POST' }),
  click: id => req(`/api/notifications/${id}/click`, { method: 'POST' }),
  getPrefs: () => req('/api/notifications/prefs'),
  savePrefs: prefs => req('/api/notifications/prefs', { method: 'PUT', body: prefs }),
  registerDevice: data => req('/api/devices', { method: 'POST', body: data }),
  removeDevice: (token, mode) => req('/api/devices', { method: 'DELETE', body: { token, mode } }),
  getSurvey: id => req(`/api/surveys/${id}`, { auth: false }),
  respondSurvey: (id, orderId, answers) =>
    req(`/api/surveys/${id}/responses`, { method: 'POST', body: { orderId, answers } })
};

// Foreground pushes still show a banner (and play no sound to stay polite).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true
  })
});

// --- Deep links -------------------------------------------------------------

// Server deep links are store-web paths; translate them onto this app's routes
// and refuse anything we don't recognize.
//
// `fallback` is what an empty/unusable link resolves to. Tapping a *push* with
// no link should land on the inbox, so that's the default — but the inbox's own
// rows pass '' instead: resolving to '/notifications' from the notifications
// screen pushed a second copy of itself, and repeat taps stacked up forever.
export function resolveDeepLink(link, fallback = '/notifications') {
  let path = String(link || '').trim();
  if (!path) return fallback;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname || '/';
    } catch {
      return fallback;
    }
  }
  if (!path.startsWith('/')) return fallback;
  path = path.replace(/^\/account\/orders\//, '/orders/'); // web → app route
  const allowed = [
    /^\/$/,
    /^\/orders(\/\d+)?$/,
    /^\/product\/[\w-]+$/,
    /^\/category\/[\w-]+$/,
    /^\/shop$/,
    /^\/bag$/,
    /^\/events(\/\d+)?$/,
    /^\/what-we-do(\/[\w-]+)?$/,
    /^\/account(\/(edit|addresses|notifications))?$/,
    /^\/account\/survey\/\d+/,
    /^\/notifications$/,
    /^\/predictor$/
  ];
  return allowed.some(re => re.test(path.split('?')[0])) ? path : fallback;
}

function openFromPush(data) {
  const target = resolveDeepLink(data?.deepLink);
  // Mark the tapped notification read/clicked (best-effort, needs a session).
  if (data?.notificationId && getCustomerToken()) {
    notificationsApi.click(data.notificationId).catch(() => {});
  }
  // navigate (not push): if that screen is already in the stack it is reused
  // instead of duplicated, so tapping several pushes can't pile up screens.
  if (target) router.navigate(target);
}

// --- Push registration ------------------------------------------------------

// Channel importance is what makes a push audible and heads-up on Android —
// the server can only ask for it; the channel decides. NOTE: Android freezes a
// channel's settings at first creation, so bumps here only apply to fresh
// installs (or after the user clears app data).
async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250],
    lightColor: '#A41E22',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
  });
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#A41E22',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
  });
}

// Register this device's Expo push token with the API. `interactive` also asks
// the OS for permission (call it only from the explainer UI); otherwise it
// no-ops unless permission was already granted.
export async function registerForPush({ interactive = false } = {}) {
  try {
    if (!Device.isDevice) return null; // simulators have no push
    await ensureAndroidChannels();

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && interactive) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return null;

    await rememberPushToken(token);
    await notificationsApi.registerDevice({
      token,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || '',
      locale: 'en'
    });
    return token;
  } catch (e) {
    // Expo Go can't receive remote pushes (SDK 53+) — the inbox still works.
    console.log('[push] registration unavailable:', e?.message || e);
    return null;
  }
}

// --- Provider ---------------------------------------------------------------

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const account = useAccount();
  const customer = account?.customer;
  const qc = useQueryClient();
  const respondedTo = useRef(null);

  // Unread badge for the whole app; polls gently and refetches on foreground.
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread', customer?.id ?? null],
    queryFn: notificationsApi.unreadCount,
    enabled: Boolean(customer),
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => sub.remove();
  }, [qc]);

  // Ask for the OS permission once, up front — the way messaging apps do — so
  // pushes work without the user having to discover the settings screen. A
  // decline is remembered (we never re-prompt; the "Enable notifications" card
  // in settings stays as the re-entry point). After that first ask, this
  // effect just (re-)registers the token whenever the signed-in customer
  // changes, so the device row follows the session (guest → user on login).
  useEffect(() => {
    if (account?.loading) return;
    let active = true;
    (async () => {
      const prompted = await storage.get(KEYS.pushPromptSeen);
      if (!active) return;
      if (prompted) {
        registerForPush();
      } else {
        await storage.set(KEYS.pushPromptSeen, '1');
        registerForPush({ interactive: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [account?.loading, customer?.id]);

  // Taps on notifications: background/foreground taps + cold starts.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const data = resp?.notification?.request?.content?.data;
      openFromPush(data);
    });
    Notifications.getLastNotificationResponseAsync().then(resp => {
      const id = resp?.notification?.request?.identifier;
      if (resp && respondedTo.current !== id) {
        respondedTo.current = id;
        openFromPush(resp.notification.request.content.data);
      }
    });
    return () => sub.remove();
  }, []);

  // Any received push means the inbox changed.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => sub.remove();
  }, [qc]);

  const enablePush = useCallback(async () => {
    await storage.set(KEYS.pushPromptSeen, '1');
    return registerForPush({ interactive: true });
  }, []);

  return (
    <NotificationsContext.Provider value={{ unreadCount: unread?.unreadCount ?? 0, enablePush }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext) || { unreadCount: 0, enablePush: async () => null };
