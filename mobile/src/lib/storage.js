// Thin async wrapper over AsyncStorage — the RN replacement for the web's
// localStorage. All persistence (auth tokens, the cart) goes through here.

import AsyncStorage from '@react-native-async-storage/async-storage';

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
  cart: 'as_store_cart'
};

export default storage;
