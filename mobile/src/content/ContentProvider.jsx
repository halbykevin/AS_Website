// Loads the shared content both halves of the app need on startup:
//   • the AS Company marketing content (hero, what-we-do, events, predictor…)
//   • the AS Store settings (announcement, contact, publish gate)
//
// Held in one context so screens read it synchronously via useContent(); a
// pull-to-refresh anywhere can call refresh(). Falls back to static defaults so
// the app renders even with both APIs offline.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadWebsiteContent } from '@/src/lib/websiteApi';
import { loadStoreSettings, loadPopup, defaultStoreSettings } from '@/src/lib/storeApi';
import { defaultWebsiteContent } from './websiteDefaults';

const ContentContext = createContext(null);

export function ContentProvider({ children }) {
  const [website, setWebsite] = useState({ content: defaultWebsiteContent, events: [] });
  const [storeSettings, setStoreSettings] = useState(defaultStoreSettings);
  const [popup, setPopup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const [site, settings, promo] = await Promise.all([
      loadWebsiteContent(),
      loadStoreSettings(),
      loadPopup()
    ]);
    if (site) setWebsite(site);
    else setError(true);
    setStoreSettings(settings);
    setPopup(promo);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  const value = useMemo(
    () => ({
      loading,
      error,
      refresh,
      content: website.content,
      events: website.events,
      storeSettings,
      popup
    }),
    [loading, error, refresh, website, storeSettings, popup]
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent must be used within ContentProvider');
  return ctx;
}
