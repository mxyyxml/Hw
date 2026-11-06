// =============================================================================
//  storage.js — tiny localStorage wrapper. Every call is wrapped in try/catch
//  because storage can be blocked (private mode, school-managed browsers).
// =============================================================================
const PREFIX = 'lunchBreakSkate.';

export const Storage = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
};
