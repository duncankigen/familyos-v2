/**
 * js/core/app.js
 * Application bootstrap and onboarding flow.
 */

let profileLoadPromise = null;

function initTheme() {
  document.body.setAttribute('data-theme', State.isDark ? 'dark' : 'light');
}

function toggleTheme() {
  State.isDark = !State.isDark;
  localStorage.setItem('fos_theme', State.isDark ? 'dark' : 'light');
  initTheme();
}

function show(id) {
  ['auth-screen', 'app'].forEach((screenId) => {
    const el = document.getElementById(screenId);
    if (el) el.style.display = screenId === id ? 'flex' : 'none';
  });
}

function showFatal(msg) {
  console.error('[App] Fatal startup error:', msg);
  Modal.close();
  show('auth-screen');
  showErr('auth-err', msg || 'Something went wrong while starting FamilyOS.');
}

function profileFromRpc(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function getMyProfile() {
  const { data, error } = await DB.client.rpc('get_my_profile');
  return {
    profile: profileFromRpc(data),
    error,
  };
}

function setSidebarIdentity(profile, user) {
  const displayName = (profile?.full_name || user?.email || 'Member').trim();
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  document.getElementById('sb-username').textContent = displayName;
  document.getElementById('sb-role').textContent = profile?.role || 'member';
  document.getElementById('sb-avatar').textContent = initials;
  document.getElementById('sb-family-name').textContent = profile?.family_id ? 'Loading...' : 'Set up family';
  document.getElementById('sb-logo-text').textContent = profile?.family_id ? 'FA' : initials || 'F';
}

function renderOnboardingShell(profile, user) {
  const displayName = (profile?.full_name || user?.email || 'Member').trim();
  setTopbar('Finish Setup');
  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="card">
        <div class="card-title">Welcome, ${displayName}</div>
        <p style="font-size:13px;color:var(--text2);margin-bottom:16px;">
          Your account is ready. Choose how you want to enter FamilyOS:
          create your family workspace if this is the first account, or join an
          existing family using an invite code from an admin.
        </p>
        <div class="flex gap8">
          <button class="btn btn-primary" onclick="showFamilySetup()">Create or Join Family</button>
          <button class="btn" onclick="Auth.signOut()">Sign Out</button>
        </div>
      </div>
    </div>`;
}

function setOnboardingError(msg) {
  if (!msg) {
    hideErr('onboarding-err');
    return;
  }
  showErr('onboarding-err', msg);
}

function showFamilySetup() {
  show('app');
  renderOnboardingShell(State.currentProfile, State.currentUser);
  Modal.open('Finish Family Setup', `
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px;">
      Create a new family workspace if you are the first member, or join an
      existing one with an invite code.
    </p>
    <div class="form-group">
      <label class="form-label">Create Family Workspace</label>
      <input id="fam-name" class="form-input" placeholder="e.g. Otieno Family"/>
    </div>
    <div class="form-group">
      <label class="form-label">Description (optional)</label>
      <input id="fam-desc" class="form-input" placeholder="Shared family enterprise"/>
    </div>
    <hr class="divider" />
    <div class="form-group">
      <label class="form-label">Join With Invite Code</label>
      <input id="fam-invite-code" class="form-input" placeholder="e.g. 7D8F1A2B3C"/>
    </div>
    <p id="onboarding-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [
    { label: 'Join Family', cls: 'btn', fn: joinFamilyWithInvite },
    { label: 'Create Family', cls: 'btn-primary', fn: createFamily },
  ]);
  setOnboardingError('');
}

async function createFamily() {
  const name = document.getElementById('fam-name')?.value.trim() || '';
  const description = document.getElementById('fam-desc')?.value.trim() || '';

  if (!name) {
    setOnboardingError('Enter a family name before creating the workspace.');
    return;
  }

  setOnboardingError('');
  const { error } = await DB.client.rpc('create_family_workspace', {
    p_name: name,
    p_description: description || null,
  });

  if (error) {
    setOnboardingError(error.message);
    return;
  }

  Modal.close();
  await loadUserProfile(State.currentUser);
}

async function joinFamilyWithInvite() {
  const inviteCode = (document.getElementById('fam-invite-code')?.value || '').trim().toUpperCase();

  if (!inviteCode) {
    setOnboardingError('Enter an invite code to join an existing family.');
    return;
  }

  setOnboardingError('');
  const { error } = await DB.client.rpc('accept_family_invite', {
    p_invite_code: inviteCode,
  });

  if (error) {
    setOnboardingError(error.message);
    return;
  }

  Modal.close();
  await loadUserProfile(State.currentUser);
}

async function ensureUserProfile() {
  let { profile, error } = await getMyProfile();
  if (!error && profile) return profile;

  if (error) {
    console.warn('[App] Initial profile read failed, trying ensure_my_profile:', error);
  }

  const { error: ensureError } = await DB.client.rpc('ensure_my_profile');
  if (ensureError) {
    console.error('[App] Failed to ensure user profile:', ensureError);
    return null;
  }

  ({ profile, error } = await getMyProfile());
  if (error || !profile) {
    console.error('[App] Profile still missing after ensure_my_profile:', error);
    return null;
  }

  return profile;
}

async function hydrateFamily(profile, user) {
  State.currentProfile = profile;
  State.currentFamilyId = profile.family_id;
  setSidebarIdentity(profile, user);
  Sidebar.updateAnnouncementBadge(0);

  if (!State.currentFamilyId) {
    showFamilySetup();
    return;
  }

  const { data: family } = await DB.client
    .from('families')
    .select('name')
    .eq('id', State.currentFamilyId)
    .single();

  if (family?.name) {
    document.getElementById('sb-family-name').textContent = family.name;
    document.getElementById('sb-logo-text').textContent = family.name.substring(0, 2).toUpperCase();
  }

  Modal.close();
  show('app');
  Router.go(Router.restore());
}

async function loadUserProfile(user) {
  if (!user) return null;

  if (profileLoadPromise) return profileLoadPromise;

  profileLoadPromise = (async () => {
    State.currentUser = user;
    hideErr('auth-err');

    const profile = await ensureUserProfile();
    if (!profile) {
      showErr(
        'auth-err',
        'We signed you in, but your profile is still unavailable. Re-run supabase/auth_fix.sql, then refresh and try again.'
      );
      show('auth-screen');
      return null;
    }

    await hydrateFamily(profile, user);
    return profile;
  })();

  try {
    return await profileLoadPromise;
  } finally {
    profileLoadPromise = null;
  }
}

function resetSessionState() {
  State.currentUser = null;
  State.currentProfile = null;
  State.currentFamilyId = null;
  State.unreadAnnouncements = 0;
  State.unreadNotifications = 0;
  State.sectionIndicators = {};
  Modal.close();
}

async function handleAuthStateChange(event, session) {
  const nextUser = session?.user || null;
  const currentUserId = State.currentUser?.id || null;
  const nextUserId = nextUser?.id || null;

  if (!nextUser) {
    resetSessionState();
    show('auth-screen');
    return;
  }

  State.currentUser = nextUser;

  // Supabase can emit auth events repeatedly for the same browser session.
  if (event === 'TOKEN_REFRESHED') return;

  const alreadyHydrated = currentUserId === nextUserId && Boolean(State.currentProfile);
  if (alreadyHydrated && ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
    return;
  }

  await loadUserProfile(nextUser);
}

function installAuthListener() {
  if (State.authSubscription) return;

  const { data } = DB.client.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      handleAuthStateChange(event, session).catch((err) => {
        showFatal(err?.message || 'Authentication state failed to load.');
      });
    }, 0);
  });

  State.authSubscription = data.subscription;
}

async function init() {
  try {
    initTheme();
    Sidebar.render();

    if (!DB.init()) {
      show('auth-screen');
      showErr('auth-err', 'FamilyOS is not configured. Set the Supabase URL and anon key in js/config.js, then refresh.');
      return;
    }

    installAuthListener();
  } catch (e) {
    console.error('[App] Init failed:', e);
    showFatal(e?.message || 'FamilyOS could not start.');
  }
}

window.addEventListener('DOMContentLoaded', init);
