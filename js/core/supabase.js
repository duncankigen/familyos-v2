/**
 * js/core/supabase.js
 * ─────────────────────────────────────────────────────
 * Initialises the Supabase client from credentials stored
 * in localStorage. All pages read State.supabase — never
 * call createClient directly in page files.
 */

const DB = {
  _url: null,
  _key: null,

  /**
   * Attempt to build the Supabase client.
   * Returns true on success, false if credentials are missing.
   */
  init() {
    const url = window.RuntimeConfig?.supabaseUrl || '';
    const key = window.RuntimeConfig?.supabaseAnonKey || '';
    if (!url || !key) return false;

    if (State.supabase && this._url === url && this._key === key) {
      return true;
    }

    try {
      State.supabase = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          headers: {
            apikey: key,
          },
        },
      });
      this._url = url;
      this._key = key;
      return true;
    } catch (e) {
      console.error('[DB] Failed to create Supabase client:', e);
      return false;
    }
  },

  /** Convenience reference — avoids typing State.supabase everywhere. */
  get client() { return State.supabase; },
};
