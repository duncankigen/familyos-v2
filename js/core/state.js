/**
 * js/core/state.js
 * ─────────────────────────────────────────────────────
 * Single source of truth for all shared application state.
 * Import / mutate via the State object — never use raw globals.
 */

const State = {
  supabase:        null,   // Supabase client instance
  currentUser:     null,   // auth.users row
  currentProfile:  null,   // public.users row
  currentFamilyId: null,   // UUID of the active family
  authSubscription: null,  // auth state listener cleanup handle
  currentPage:     'dashboard',
  unreadAnnouncements: 0,
  unreadNotifications: 0,
  isDark:          localStorage.getItem('fos_theme') === 'dark',

  /** Convenience getter so pages don't repeat this pattern. */
  get fid() { return this.currentFamilyId; },
  get uid() { return this.currentUser?.id; },
};
