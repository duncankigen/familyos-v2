/**
 * FamilyOS public runtime config
 * --------------------------------------------------
 * Edit this file to preconfigure browser-safe values.
 *
 * Safe here:
 * - Supabase project URL
 * - Supabase anon key
 * - Supabase Edge Function URL
 *
 * Do NOT put private API keys here.
 * Secrets like ANTHROPIC_API_KEY must stay in server-side env files
 * or in Supabase Edge Function Secrets.
 */

window.FAMILYOS_CONFIG = window.FAMILYOS_CONFIG || {
  supabase: {
    url: "https://oibaqxipzhfqosgzhfng.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pYmFxeGlwemhmcW9zZ3poZm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTg2MzksImV4cCI6MjA4ODkzNDYzOX0.5J-lO00JAS8K-no50pP3SMM4Jp-4tRMmnwiSC4Bdxm4",
  },
  ai: {
    edgeFunctionUrl: "",
  },
};

window.RuntimeConfig = {
  get supabaseUrl() {
    return window.FAMILYOS_CONFIG?.supabase?.url
      || localStorage.getItem("fos_url")
      || "";
  },

  get supabaseAnonKey() {
    return window.FAMILYOS_CONFIG?.supabase?.anonKey
      || localStorage.getItem("fos_key")
      || "";
  },

  get aiEdgeFunctionUrl() {
    return window.FAMILYOS_CONFIG?.ai?.edgeFunctionUrl
      || localStorage.getItem("fos_ai_url")
      || "";
  },
};
