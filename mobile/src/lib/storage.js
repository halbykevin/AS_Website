// Thin async wrapper over AsyncStorage — the RN replacement for the web's
// localStorage. All persistence (auth tokens, the cart) goes through here.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const storage = {
  async get(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  async remove(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  async getJSON(key, fallback = null) {
    const raw = await storage.get(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  async setJSON(key, value) {
    await storage.set(key, JSON.stringify(value));
  }
};

// Storage keys (kept in one place so nothing collides).
export const KEYS = {
  customerToken: 'as_store_customer_token',
  cart: 'as_store_cart',
  pushToken: 'as_push_token',
  pushPromptSeen: 'as_push_prompt_seen'
};

// Authentication credentials belong in the OS keychain/keystore, not plain
// AsyncStorage. The web build has no SecureStore implementation, so it keeps
// the existing storage fallback there. Reads migrate an older native token on
// first launch so this upgrade does not sign existing customers out.
export const secureStorage = {
  async get(key) {
    if (Platform.OS === 'web') return storage.get(key);
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value != null) return value;
      const legacy = await storage.get(key);
      if (legacy != null) {
        await SecureStore.setItemAsync(key, legacy);
        await storage.remove(key);
      }
      return legacy;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    if (Platform.OS === 'web') return storage.set(key, value);
    await SecureStore.setItemAsync(key, String(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
    await storage.remove(key);
  },
  async remove(key) {
    if (Platform.OS === 'web') return storage.remove(key);
    await Promise.allSettled([SecureStore.deleteItemAsync(key), storage.remove(key)]);
  }
};

export default storage;
