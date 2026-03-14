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

function profileRoleSummary(role) {
  const normalized = role || 'member';
  const summaries = {
    admin: 'Can manage the workspace, members, meetings, announcements, AI insights, and high-trust records across FamilyOS.',
    treasurer: 'Can manage core financial records such as contributions, expenses, school fees, emergency fund activity, reports, and approved vault records.',
    project_manager: 'Can manage projects, tasks, farming operations, vendors, and delivery coordination across active family work.',
    member: 'Can participate in the workspace, view shared records allowed by policy, and contribute to family activity within their role.',
  };
  return summaries[normalized] || summaries.member;
}

function profileCenterNav(activeSection) {
  const items = [
    ['profile', 'Profile'],
    ['help', 'Help Center'],
    ['faq', 'FAQ'],
    ['guide', 'User Guide'],
    ['terms', 'Terms'],
    ['privacy', 'Privacy'],
  ];

  return `
    <div class="profile-center-nav">
      ${items.map(([key, label]) => `
        <button class="profile-center-nav-btn ${activeSection === key ? 'active' : ''}"
                onclick="openProfileCenter('${key}')">${label}</button>
      `).join('')}
    </div>`;
}

function profileCenterSection(section) {
  const profile = State.currentProfile || {};
  const user = State.currentUser || {};
  const familyName = document.getElementById('sb-family-name')?.textContent || 'Family Workspace';
  const displayName = escapeHtml((profile.full_name || user.email || 'Member').trim());
  const role = escapeHtml(profile.role || 'member');
  const email = escapeHtml(user.email || 'No email on file');
  const familyId = escapeHtml(profile.family_id || 'Not linked yet');
  const updatedLabel = 'Updated 15 Mar 2026';

  if (section === 'help') {
    return `
      <div class="profile-center-section">
        <div class="profile-center-heading">Help Center</div>
        <div class="profile-center-copy">
          FamilyOS is built to help one family workspace coordinate money, projects, farming, documents, meetings, and guidance in one place.
        </div>
        <div class="profile-center-stack">
          <div class="card">
            <div class="card-title">Where to start</div>
            <div class="profile-center-list">
              <div>Use <strong>Dashboard</strong> for the current family snapshot, urgent items, and exports.</div>
              <div>Use <strong>Finance</strong>, <strong>Contributions</strong>, and <strong>Expenses</strong> for the cash ledger.</div>
              <div>Use <strong>Projects</strong>, <strong>Tasks</strong>, and <strong>Farm Manager</strong> for delivery and operations.</div>
              <div>Use <strong>Vault</strong> for shared records, contracts, certificates, and family media links.</div>
              <div>Use <strong>AI Advisor</strong> for answers and operational insight generation, not as a substitute for professional legal or financial advice.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">If something looks wrong</div>
            <div class="profile-center-list">
              <div>Refresh the page first if totals or cards look stale after a change from another user.</div>
              <div>Confirm you are in the correct family workspace before entering or editing records.</div>
              <div>If a save is blocked, check your role. Some actions are limited to admins, treasurers, or project managers.</div>
              <div>If uploads fail, check the Vault storage setup and permissions in Supabase before retrying.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Support path</div>
            <div class="profile-center-copy">
              Day-to-day support should usually start with your family admin. Technical issues such as login, storage, database policy, or deployment problems should be escalated to the workspace owner or implementation team managing this FamilyOS deployment.
            </div>
          </div>
        </div>
        <div class="profile-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'faq') {
    return `
      <div class="profile-center-section">
        <div class="profile-center-heading">Frequently Asked Questions</div>
        <div class="profile-center-stack">
          <div class="card">
            <div class="card-title">Who can see my family data?</div>
            <div class="profile-center-copy">
              FamilyOS is designed around family-scoped access. Members should only see records that belong to their family workspace and that their role is allowed to access.
            </div>
          </div>
          <div class="card">
            <div class="card-title">Why can one user save something while another cannot?</div>
            <div class="profile-center-copy">
              Different roles have different permissions. For example, finance and vault actions are more restricted than general viewing.
            </div>
          </div>
          <div class="card">
            <div class="card-title">Does AI store every question as a family insight?</div>
            <div class="profile-center-copy">
              No. Ask AI Advisor responses are conversational only. The saved insight feed is reserved for generated operational insights.
            </div>
          </div>
          <div class="card">
            <div class="card-title">Can we store Google Drive or family photo links?</div>
            <div class="profile-center-copy">
              Yes. Vault supports shared external links, including Drive-based family media, under the family media category.
            </div>
          </div>
          <div class="card">
            <div class="card-title">Why do exports matter?</div>
            <div class="profile-center-copy">
              Reports and dashboard exports are meant for meetings, accountability, treasurer review, and sharing clean summaries outside the app.
            </div>
          </div>
          <div class="card">
            <div class="card-title">What happens if two people edit at the same time?</div>
            <div class="profile-center-copy">
              Today, FamilyOS supports multiple signed-in users, but some edit flows still behave like latest-save-wins. That means teams should avoid simultaneous edits on the same record until stronger conflict handling is rolled out.
            </div>
          </div>
        </div>
        <div class="profile-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'guide') {
    return `
      <div class="profile-center-section">
        <div class="profile-center-heading">System Guide</div>
        <div class="profile-center-stack">
          <div class="card">
            <div class="card-title">1. Getting started</div>
            <div class="profile-center-list">
              <div>Create or join a family workspace.</div>
              <div>Confirm your name, role, and family identity in the sidebar.</div>
              <div>Use Members to understand who is active in the workspace.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">2. Managing money</div>
            <div class="profile-center-list">
              <div>Record contributions as money coming into the family.</div>
              <div>Record expenses as money going out of the shared ledger.</div>
              <div>Use School Fees and Emergency Fund for specialized workflows that still affect family obligations and cash reporting.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">3. Running projects and farming</div>
            <div class="profile-center-list">
              <div>Create projects to track operational work, budgets, and progress.</div>
              <div>Use project-linked tasks and expenses to keep execution in context.</div>
              <div>Use Farm Manager for farm inputs, outputs, livestock activity, operational cost, and farm cash spend.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">4. Working with people</div>
            <div class="profile-center-list">
              <div>Use Announcements for family-wide notices and updates.</div>
              <div>Use Meetings for agendas, decisions, and votes.</div>
              <div>Use Directory for vendors and external partners.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">5. Using Vault and AI</div>
            <div class="profile-center-list">
              <div>Vault stores shared family documents, financial files, certificates, contracts, and family media links.</div>
              <div>AI Advisor answers questions using current family context and can also generate operational insights for the family feed.</div>
              <div>Always verify high-stakes conclusions before acting on them in the real world.</div>
            </div>
          </div>
        </div>
        <div class="profile-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'terms') {
    return `
      <div class="profile-center-section">
        <div class="profile-center-heading">Terms of Use</div>
        <div class="profile-center-copy">
          By using FamilyOS, you agree to use the workspace responsibly for legitimate family coordination, finance tracking, planning, record keeping, operations, and governance.
        </div>
        <div class="profile-center-stack">
          <div class="card">
            <div class="card-title">Workspace use</div>
            <div class="profile-center-list">
              <div>You must use a valid account and keep your login secure.</div>
              <div>You may only access data and actions permitted by your role and family membership.</div>
              <div>You should not upload unlawful, abusive, deceptive, or unauthorized content into announcements, documents, comments, or records.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Data accuracy and responsibility</div>
            <div class="profile-center-list">
              <div>Financial, project, and governance records should be entered honestly and reviewed carefully before major decisions are made.</div>
              <div>Reports and exports depend on the quality of the data entered by family members and administrators.</div>
              <div>FamilyOS helps organize decisions, but it does not itself guarantee legal, tax, accounting, agricultural, medical, or investment correctness.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">AI guidance</div>
            <div class="profile-center-list">
              <div>AI Advisor outputs are advisory only and should be treated as support for discussion, not as professional advice.</div>
              <div>Users remain responsible for validating important conclusions before acting on them.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Files and shared materials</div>
            <div class="profile-center-list">
              <div>Uploaded documents and shared media links should belong to the family or be shared with proper permission.</div>
              <div>You should not upload material that infringes privacy, copyright, or contractual obligations.</div>
            </div>
          </div>
        </div>
        <div class="profile-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'privacy') {
    return `
      <div class="profile-center-section">
        <div class="profile-center-heading">Privacy Policy</div>
        <div class="profile-center-copy">
          FamilyOS stores family workspace information so members can coordinate operations, finances, projects, documents, and planning within one shared system.
        </div>
        <div class="profile-center-stack">
          <div class="card">
            <div class="card-title">What data the system uses</div>
            <div class="profile-center-list">
              <div>Account identity such as your email, profile name, role, and family membership.</div>
              <div>Operational records such as contributions, expenses, school fees, projects, tasks, meetings, votes, announcements, vault documents, and reports.</div>
              <div>Uploaded files and external document links added to the family Vault.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">How data is used</div>
            <div class="profile-center-list">
              <div>To display the correct family workspace and role-based access.</div>
              <div>To calculate dashboards, reports, insight feeds, and operational summaries.</div>
              <div>To support internal notifications, history, accountability, and family collaboration.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">AI and privacy</div>
            <div class="profile-center-list">
              <div>When AI features are enabled, relevant family context may be used to generate answers or insights.</div>
              <div>AI outputs should be reviewed carefully, especially where they touch money, farming, school fees, health, or governance.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Access and retention</div>
            <div class="profile-center-list">
              <div>Access is intended to be scoped by family membership and role permissions.</div>
              <div>Records may remain available for continuity, reporting, audits, and historical reference unless removed by authorized users or administrators.</div>
            </div>
          </div>
        </div>
        <div class="profile-center-meta">${updatedLabel}</div>
      </div>`;
  }

  return `
    <div class="profile-center-section">
      <div class="profile-center-hero">
        <div class="avatar av-md av-blue" style="width:48px;height:48px;font-size:15px;">${escapeHtml((displayName.match(/[A-Z0-9]/gi) || ['F']).slice(0, 2).join('').toUpperCase())}</div>
        <div style="min-width:0;">
          <div class="profile-center-heading" style="margin-bottom:4px;">${displayName}</div>
          <div class="tag-row" style="margin-top:0;">
            <span class="badge b-blue">${escapeHtml(familyName)}</span>
            <span class="badge b-gray">${role}</span>
          </div>
        </div>
      </div>
      <div class="profile-center-stack">
        <div class="card">
          <div class="card-title">Account</div>
          <div class="details-grid">
            <div>
              <div class="details-label">Email</div>
              <div class="details-value">${email}</div>
            </div>
            <div>
              <div class="details-label">Family ID</div>
              <div class="details-value">${familyId}</div>
            </div>
            <div>
              <div class="details-label">Role</div>
              <div class="details-value">${role}</div>
            </div>
            <div>
              <div class="details-label">Workspace</div>
              <div class="details-value">${escapeHtml(familyName)}</div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">What your role can do</div>
          <div class="profile-center-copy">${escapeHtml(profileRoleSummary(profile.role))}</div>
        </div>
        <div class="card">
          <div class="card-title">Recommended next stops</div>
          <div class="profile-center-list">
            <div>Open <strong>Help Center</strong> for quick troubleshooting and system use guidance.</div>
            <div>Open <strong>User Guide</strong> for a full walkthrough of how FamilyOS is structured.</div>
            <div>Review <strong>Terms</strong> and <strong>Privacy</strong> to understand how the workspace is intended to be used.</div>
          </div>
        </div>
      </div>
      <div class="profile-center-actions">
        <button class="btn btn-sm" onclick="toggleTheme()">Toggle Theme</button>
        <button class="btn btn-sm" onclick="Auth.signOut()">Sign Out</button>
      </div>
      <div class="profile-center-meta">${updatedLabel}</div>
    </div>`;
}

function openProfileCenter(section = 'profile') {
  const normalizedSection = section || 'profile';
  const profile = State.currentProfile || {};
  const user = State.currentUser || {};
  const displayName = escapeHtml((profile.full_name || user.email || 'Member').trim());

  Modal.open('Account, Help & Policies', `
    <div class="profile-center">
      <div class="profile-center-subtitle">
        Manage your account options and read how FamilyOS is designed to operate across your family workspace.
      </div>
      ${profileCenterNav(normalizedSection)}
      ${profileCenterSection(normalizedSection)}
    </div>
  `);

  const modalTitle = document.getElementById('modal-title');
  if (modalTitle) {
    modalTitle.textContent = `Account, Help & Policies`;
    modalTitle.setAttribute('title', displayName);
  }

  const modalCard = document.querySelector('#modal .modal');
  if (modalCard) {
    modalCard.style.maxWidth = '860px';
  }
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
  Sidebar.updateSectionIndicator('announcements', 0);
  Sidebar.updateSectionIndicator('tasks', 0);
  Sidebar.updateSectionIndicator('meetings', false);
  Sidebar.updateSectionIndicator('goals', false);
  Sidebar.updateSectionIndicator('ai', false);

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
