/**
 * js/components/Auth.js
 * Authentication: sign-in, sign-up, password recovery, and Google sign-in.
 * All Supabase auth calls live here — never in page files.
 */

const Auth = {
  _mode: 'signin',
  _isBusy: false,
  _pendingResetEmail: '',
  _lastResetEmailAt: 0,
  _resetCooldownMs: 30000,
  _canonicalAppUrl: 'https://familyoshq.com/app/',

  initFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const mode = (params.get('mode') || '').trim().toLowerCase();
    this._mode = ['signup', 'register', 'trial'].includes(mode) ? 'signup' : 'signin';
    if (mode === 'recovery') {
      this._mode = 'recovery';
    }
    this.syncUi();
  },

  buildFullName(firstName, lastName) {
    return [firstName, lastName].filter(Boolean).join(' ').trim();
  },

  buildRedirectUrl(mode = 'signin') {
    const fallbackUrl = new URL(window.location.href);
    const base = this._canonicalAppUrl || `${fallbackUrl.origin}/app/`;
    const url = new URL(base);
    url.searchParams.set('mode', mode);
    ['billing', 'reference', 'trxref'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return url.toString();
  },

  isRecoveryMode() {
    return this._mode === 'recovery';
  },

  isSignUpMode() {
    return this._mode === 'signup';
  },

  resetCooldownSeconds() {
    const remaining = this._resetCooldownMs - (Date.now() - this._lastResetEmailAt);
    return Math.max(0, Math.ceil(remaining / 1000));
  },

  canResendResetEmail() {
    return Boolean(this._pendingResetEmail) && this.resetCooldownSeconds() === 0 && !this._isBusy;
  },

  clearFeedback() {
    hideErr('auth-err');
    const status = document.getElementById('auth-status');
    if (status) {
      status.style.display = 'none';
      status.textContent = '';
    }
  },

  showStatus(message, tone = 'info') {
    const status = document.getElementById('auth-status');
    if (!status) return;
    const colors = {
      info: 'var(--text2)',
      success: 'var(--success)',
      error: 'var(--danger)',
    };
    status.style.display = message ? 'block' : 'none';
    status.style.color = colors[tone] || colors.info;
    status.textContent = message || '';
  },

  syncUi() {
    const isSignUp = this.isSignUpMode();
    const isRecovery = this.isRecoveryMode();
    const isBusy = this._isBusy;
    const submitLabel = isRecovery
      ? (isBusy ? 'Updating Password...' : 'Update Password')
      : isSignUp
        ? (isBusy ? 'Creating Account...' : 'Create Account')
        : (isBusy ? 'Signing In...' : 'Sign In');

    const title = isRecovery ? 'Reset your password' : (isSignUp ? 'Create Account' : 'Sign in to FamilyOS');
    const subtitle = isRecovery
      ? 'Create a new password to finish recovery for your FamilyOS account.'
      : isSignUp
        ? 'Create your account, then create or join a family workspace.'
        : 'Sign in to access your family workspace.';

    const passwordLabel = isRecovery ? 'New Password' : 'Password';
    const passwordInput = document.getElementById('auth-password');
    const confirmGroup = document.getElementById('auth-password-confirm-group');
    const toggle = document.getElementById('auth-toggle');
    const nameRow = document.getElementById('auth-name-row');
    const emailGroup = document.getElementById('auth-email-group');
    const googleBtn = document.getElementById('auth-google-btn');
    const divider = document.getElementById('auth-divider');
    const forgotActions = document.getElementById('auth-forgot-actions');
    const forgotLink = document.getElementById('auth-forgot-link');
    const resendLink = document.getElementById('auth-resend-link');
    const legalConsent = document.getElementById('auth-legal-consent');
    const guide = document.getElementById('auth-guide');
    const submitBtn = document.getElementById('auth-submit-btn');
    const spinner = document.getElementById('auth-btn-spinner');

    document.getElementById('auth-title').textContent = title;
    document.getElementById('auth-sub').textContent = subtitle;
    document.getElementById('auth-btn-text').textContent = submitLabel;
    document.getElementById('auth-password-label').textContent = passwordLabel;

    if (nameRow) nameRow.style.display = isSignUp ? 'grid' : 'none';
    if (confirmGroup) confirmGroup.style.display = (isSignUp || isRecovery) ? 'block' : 'none';
    if (emailGroup) emailGroup.style.display = isRecovery ? 'none' : 'block';
    if (googleBtn) googleBtn.style.display = isRecovery ? 'none' : 'block';
    if (divider) divider.style.display = isRecovery ? 'none' : 'flex';
    if (forgotActions) forgotActions.style.display = (!isSignUp && !isRecovery) ? 'flex' : 'none';
    if (legalConsent) legalConsent.style.display = isSignUp ? 'block' : 'none';
    if (forgotLink) forgotLink.disabled = isBusy;

    if (passwordInput) {
      passwordInput.placeholder = '••••••••';
      passwordInput.autocomplete = (isSignUp || isRecovery) ? 'new-password' : 'current-password';
    }

    if (toggle) {
      toggle.textContent = isRecovery ? 'Back to sign in' : (isSignUp ? 'Already have an account?' : 'Create an account');
      toggle.style.pointerEvents = isBusy ? 'none' : 'auto';
    }

    if (submitBtn) {
      submitBtn.disabled = isBusy;
      submitBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
    if (spinner) spinner.style.display = isBusy ? 'inline-block' : 'none';

    if (resendLink) {
      const canResend = this.canResendResetEmail();
      const seconds = this.resetCooldownSeconds();
      resendLink.style.display = this._pendingResetEmail && !isRecovery ? 'inline-block' : 'none';
      resendLink.disabled = !canResend;
      resendLink.textContent = canResend ? 'Resend reset email' : `Resend in ${seconds}s`;
    }

    if (guide) {
      if (isRecovery) {
        const recoveryEmail = this._pendingResetEmail || State.currentUser?.email || 'your email address';
        guide.style.display = 'block';
        guide.innerHTML = `
          <strong>Secure recovery</strong>
          Create a new password for ${escapeHtml(recoveryEmail)}. If this screen does not complete after a moment, reopen the latest recovery email and click the reset link again.
        `;
      } else if (this._pendingResetEmail) {
        guide.style.display = 'block';
        guide.innerHTML = `
          <strong>Reset email sent</strong>
          We sent a password reset link to ${escapeHtml(this._pendingResetEmail)}. Check inbox, spam, and promotions, then open the newest email. If it does not arrive after about a minute, use resend.
        `;
      } else {
        guide.style.display = 'none';
        guide.innerHTML = '';
      }
    }
  },

  setBusy(isBusy) {
    this._isBusy = isBusy;
    this.syncUi();
  },

  toggleMode(event) {
    event?.preventDefault?.();
    if (this._isBusy) return;
    this.clearFeedback();
    this._mode = this.isSignUpMode() || this.isRecoveryMode() ? 'signin' : 'signup';
    this.syncUi();
  },

  enterRecoveryMode(email = '') {
    this.clearFeedback();
    this._mode = 'recovery';
    if (email) {
      this._pendingResetEmail = email;
    }
    this.syncUi();
    show('auth-screen');
  },

  async handleForgotPassword(event, isResend = false) {
    event?.preventDefault?.();
    if (this._isBusy) return;

    const emailInput = document.getElementById('auth-email');
    const email = (emailInput?.value || this._pendingResetEmail || '').trim();
    if (!email) {
      showErr('auth-err', 'Enter your email address first so we know where to send the reset link.');
      return;
    }
    if (isResend && !this.canResendResetEmail()) return;

    this.clearFeedback();
    this.setBusy(true);

    try {
      const { error } = await DB.client.auth.resetPasswordForEmail(email, {
        redirectTo: this.buildRedirectUrl('recovery'),
      });
      if (error) {
        showErr('auth-err', error.message || 'Unable to send the password reset email right now.');
        return;
      }

      this._pendingResetEmail = email;
      this._lastResetEmailAt = Date.now();
      this.showStatus(
        isResend
          ? 'A fresh reset email is on the way. Open the newest message when it arrives.'
          : 'Password reset email sent. Open the newest message in your inbox to continue.',
        'success',
      );
      window.setTimeout(() => this.syncUi(), this._resetCooldownMs + 100);
    } catch (error) {
      showErr('auth-err', error?.message || 'Unable to send the password reset email right now.');
    } finally {
      this.setBusy(false);
    }
  },

  async signInWithGoogle() {
    if (this._isBusy) return;
    if (this.isSignUpMode() && !document.getElementById('auth-accept-legal')?.checked) {
      showErr('auth-err', 'Please agree to the Terms of Use and Privacy Policy before creating an account.');
      return;
    }
    this.clearFeedback();
    this.setBusy(true);

    try {
      const { error } = await DB.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: this.buildRedirectUrl(this.isSignUpMode() ? 'signup' : 'signin'),
        },
      });

      if (error) {
        showErr('auth-err', error.message || 'Google sign-in could not start right now.');
        return;
      }
    } catch (error) {
      showErr('auth-err', error?.message || 'Google sign-in could not start right now.');
    } finally {
      this.setBusy(false);
    }
  },

  async handle(event) {
    event?.preventDefault?.();
    if (this._isBusy) return;

    const isSignUp = this.isSignUpMode();
    const isRecovery = this.isRecoveryMode();
    const email = document.getElementById('auth-email')?.value.trim() || '';
    const password = document.getElementById('auth-password')?.value || '';
    const confirmPassword = document.getElementById('auth-password-confirm')?.value || '';

    this.clearFeedback();

    if (!password) {
      showErr('auth-err', isRecovery ? 'Enter your new password.' : 'Please fill in all required fields.');
      return;
    }

    const sb = DB.client;

    if (isRecovery) {
      if (!State.currentUser?.id) {
        showErr('auth-err', 'Recovery is still loading. Wait a moment, or reopen the reset link from your email.');
        return;
      }
      if (password.length < 8) {
        showErr('auth-err', 'Use a password with at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        showErr('auth-err', 'Passwords do not match.');
        return;
      }

      this.setBusy(true);
      try {
        const { error } = await sb.auth.updateUser({ password });
        if (error) {
          showErr('auth-err', error.message || 'Unable to update your password right now.');
          return;
        }

        this._pendingResetEmail = '';
        await sb.auth.signOut();
        this._mode = 'signin';
        if (typeof clearAuthModeParam === 'function') clearAuthModeParam();
        this.showStatus('Password updated. Sign in with your new password.', 'success');
      } catch (error) {
        showErr('auth-err', error?.message || 'Unable to update your password right now.');
      } finally {
        this.setBusy(false);
        this.syncUi();
      }
      return;
    }

    if (!email || !password) {
      showErr('auth-err', 'Please fill in all fields.');
      return;
    }

    let firstName = '';
    let lastName = '';
    let fullName = '';

    if (isSignUp) {
      firstName = document.getElementById('auth-first-name')?.value.trim() || '';
      lastName = document.getElementById('auth-last-name')?.value.trim() || '';
      fullName = this.buildFullName(firstName, lastName);
      const acceptedLegal = Boolean(document.getElementById('auth-accept-legal')?.checked);

      if (!firstName || !lastName) {
        showErr('auth-err', 'Please enter both first and last name.');
        return;
      }
      if (!acceptedLegal) {
        showErr('auth-err', 'Please agree to the Terms of Use and Privacy Policy before creating an account.');
        return;
      }
      if (password.length < 8) {
        showErr('auth-err', 'Use a password with at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        showErr('auth-err', 'Passwords do not match.');
        return;
      }
    }

    this.setBusy(true);

    try {
      if (isSignUp) {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
            },
          },
        });
        if (error) {
          showErr('auth-err', error.message);
          return;
        }

        if (data?.session && data?.user) {
          this._pendingResetEmail = '';
          await loadUserProfile(data.user);
          return;
        }

        this.showStatus('Account created. Check your email to confirm, then sign in.', 'success');
        this._mode = 'signin';
        this.syncUi();
        return;
      }

      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        showErr('auth-err', error.message);
        return;
      }
      this._pendingResetEmail = '';
      await loadUserProfile(data.user);
    } catch (error) {
      showErr('auth-err', error?.message || 'Unable to complete authentication right now.');
    } finally {
      this.setBusy(false);
    }
  },

  async signOut() {
    await DB.client.auth.signOut();
    if (window.Router?.clearRememberedPage) Router.clearRememberedPage();
    if (typeof resetSessionState === 'function') resetSessionState();
    if (typeof clearAuthModeParam === 'function') clearAuthModeParam();
    this._mode = 'signin';
    this.syncUi();
    show('auth-screen');
  },
};
