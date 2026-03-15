/**
 * js/components/Auth.js
 * ─────────────────────────────────────────────────────
 * Authentication: sign-in, sign-up, sign-out.
 * All Supabase auth calls live here — never in page files.
 */

const Auth = {
  _isSignUp: false,
  _isBusy: false,

  buildFullName(firstName, lastName) {
    return [firstName, lastName].filter(Boolean).join(' ').trim();
  },

  syncUi() {
    const su = this._isSignUp;
    const isBusy = this._isBusy;
    const idleLabel = su ? 'Create Account' : 'Sign In';
    const busyLabel = su ? 'Creating Account...' : 'Signing In...';

    document.getElementById('auth-title').textContent = su ? 'Create Account' : 'Sign in to FamilyOS';
    document.getElementById('auth-sub').textContent = su
      ? 'Create your account, then create or join a family workspace.'
      : 'Sign in to access your family workspace.';
    document.getElementById('auth-btn-text').textContent = isBusy ? busyLabel : idleLabel;
    document.getElementById('auth-toggle').textContent = su ? 'Already have an account?' : 'Create an account';
    document.getElementById('auth-name-row').style.display = su ? 'grid' : 'none';
    document.getElementById('auth-password-confirm-group').style.display = su ? 'block' : 'none';

    const btn = document.getElementById('auth-submit-btn');
    const spinner = document.getElementById('auth-btn-spinner');
    const toggle = document.getElementById('auth-toggle');
    if (btn) {
      btn.disabled = isBusy;
      btn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
    if (spinner) spinner.style.display = isBusy ? 'inline-block' : 'none';
    if (toggle) toggle.style.pointerEvents = isBusy ? 'none' : 'auto';
  },

  setBusy(isBusy) {
    this._isBusy = isBusy;
    this.syncUi();
  },

  /** Toggle between sign-in and sign-up modes. */
  toggleMode(e) {
    e.preventDefault();
    if (this._isBusy) return;
    this._isSignUp = !this._isSignUp;
    this.syncUi();
  },

  /** Handle sign-in or sign-up form submission. */
  async handle(event) {
    event?.preventDefault?.();
    if (this._isBusy) return;

    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) { showErr('auth-err', 'Please fill in all fields.'); return; }
    hideErr('auth-err');

    const sb = DB.client;

    let firstName = '';
    let lastName = '';
    let confirmPassword = '';
    let fullName = '';

    if (this._isSignUp) {
      firstName = document.getElementById('auth-first-name').value.trim();
      lastName = document.getElementById('auth-last-name').value.trim();
      confirmPassword = document.getElementById('auth-password-confirm').value;
      fullName = this.buildFullName(firstName, lastName);

      if (!firstName || !lastName) { showErr('auth-err', 'Please enter both first and last name.'); return; }
      if (password.length < 8) { showErr('auth-err', 'Use a password with at least 8 characters.'); return; }
      if (password !== confirmPassword) { showErr('auth-err', 'Passwords do not match.'); return; }
    }

    this.setBusy(true);

    try {
      if (this._isSignUp) {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
            },
          },
        });
        if (error) { showErr('auth-err', error.message); return; }

        if (data?.session && data?.user) {
          await loadUserProfile(data.user);
          return;
        }

        showErr('auth-err', 'Account created. Check your email to confirm, then sign in.');
        return;
      }

      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { showErr('auth-err', error.message); return; }
      await loadUserProfile(data.user);
    } catch (error) {
      showErr('auth-err', error?.message || 'Unable to complete authentication right now.');
    } finally {
      this.setBusy(false);
    }
  },

  /** Sign out the current user and return to auth screen. */
  async signOut() {
    await DB.client.auth.signOut();
    if (window.Router?.clearRememberedPage) Router.clearRememberedPage();
    if (typeof resetSessionState === 'function') resetSessionState();
    show('auth-screen');
  },
};
