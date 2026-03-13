/**
 * js/components/Config.js
 * ─────────────────────────────────────────────────────
 * Manages the fallback Supabase project URL + anon key screen.
 * In normal deployments, js/config.js should already contain
 * the permanent project values and this screen stays hidden.
 */

const Config = {
  /** Load any previously saved credentials back into the setup form. */
  prefill() {
    const urlEl = document.getElementById('sb-url');
    const keyEl = document.getElementById('sb-key');
    if (urlEl) urlEl.value = window.RuntimeConfig?.supabaseUrl || '';
    if (keyEl) keyEl.value = window.RuntimeConfig?.supabaseAnonKey || '';
  },

  /** Persist credentials and re-initialise the app. */
  save() {
    const url = document.getElementById('sb-url').value.trim();
    const key = document.getElementById('sb-key').value.trim();

    if (!url || !key) {
      showErr('setup-err', 'Please enter both URL and key.');
      return;
    }

    localStorage.setItem('fos_url', url);
    localStorage.setItem('fos_key', key);
    hideErr('setup-err');

    // Re-init with new credentials
    if (DB.init()) {
      init(); // from app.js
    } else {
      showErr('setup-err', 'Failed to connect. Please check your credentials.');
    }
  },

  /** Navigate to the setup screen (e.g. to change the database). */
  showSetup(e) {
    e.preventDefault();
    this.prefill();
    show('setup-screen');
  },
};
