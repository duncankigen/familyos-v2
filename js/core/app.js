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

function toggleAccountCenterTheme(section = 'settings') {
  toggleTheme();
  openProfileCenter(section);
}

function accountThemeSwitch(section = 'settings') {
  return `
    <button
      type="button"
      class="theme-switch ${State.isDark ? 'is-dark' : 'is-light'}"
      role="switch"
      aria-checked="${State.isDark ? 'true' : 'false'}"
      aria-label="Theme preference. ${State.isDark ? 'Dark mode is active.' : 'Light mode is active.'}"
      onclick="toggleAccountCenterTheme('${section}')">
      <span class="theme-switch-label theme-switch-label-light">Light</span>
      <span class="theme-switch-label theme-switch-label-dark">Dark</span>
      <span class="theme-switch-thumb" aria-hidden="true"></span>
    </button>`;
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

async function handleInactiveAccount() {
  try {
    await DB.client.auth.signOut();
  } catch (error) {
    console.warn('[App] Failed to fully sign out inactive account:', error);
  }

  if (window.Router?.clearRememberedPage) Router.clearRememberedPage();
  if (typeof resetSessionState === 'function') resetSessionState();
  show('auth-screen');
  showErr('auth-err', 'Your account has been deactivated. Contact your family admin or platform support.');
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
            <div class="card-title">2. Inviting and joining members</div>
            <div class="profile-center-list">
              <div>Admins can open <strong>Members</strong> and use <strong>Invite Member</strong> to create an invite code for a new person.</div>
              <div>Share the invite code with the person you want to add, and note the role and expiry period chosen for that invite.</div>
              <div>The invited person should sign up or sign in, choose <strong>Join Family</strong> during onboarding, then enter the invite code exactly as shared.</div>
              <div>After joining, they should confirm their name, phone, and assigned role, then open the workspace sections relevant to their responsibilities.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">3. Managing money</div>
            <div class="profile-center-list">
              <div>Record contributions as money coming into the family.</div>
              <div>Record expenses as money going out of the shared ledger.</div>
              <div>Use School Fees and Emergency Fund for specialized workflows that still affect family obligations and cash reporting.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">4. Running projects and farming</div>
            <div class="profile-center-list">
              <div>Create projects to track operational work, budgets, and progress.</div>
              <div>Use project-linked tasks and expenses to keep execution in context.</div>
              <div>Use Farm Manager for farm inputs, outputs, livestock activity, operational cost, and farm cash spend.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">5. Working with people</div>
            <div class="profile-center-list">
              <div>Use Announcements for family-wide notices and updates.</div>
              <div>Use Meetings for agendas, decisions, and votes.</div>
              <div>Use Directory for vendors and external partners.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">6. Using Vault and AI</div>
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
        ${accountThemeSwitch('profile')}
        <button class="btn btn-sm btn-danger" onclick="Auth.signOut()">Sign Out</button>
      </div>
      <div class="profile-center-meta">${updatedLabel}</div>
    </div>`;
}

function openProfileCenter(section = 'profile') {
  const normalizedSection = section === 'admin' ? 'profile' : (section || 'profile');
  if (normalizedSection !== 'billing') {
    State.billingManagementNotice = '';
  }
  const profile = State.currentProfile || {};
  const user = State.currentUser || {};
  const displayName = escapeHtml((profile.full_name || user.email || 'Member').trim());

  Modal.open('Account Center', `
    <div class="account-center">
      ${accountCenterNav(normalizedSection)}
      <div class="account-center-main">
        <div class="account-center-subtitle">
          Manage your account experience, support resources, and FamilyOS guidance from one place.
        </div>
        ${accountCenterSection(normalizedSection)}
      </div>
    </div>
  `);

  const modalTitle = document.getElementById('modal-title');
  if (modalTitle) {
    modalTitle.textContent = 'Account Center';
    modalTitle.setAttribute('title', displayName);
  }

  const modalCard = document.querySelector('#modal .modal');
  if (modalCard) {
    modalCard.style.maxWidth = '1100px';
  }

  const footer = document.getElementById('modal-footer');
  if (footer) {
    footer.style.display = 'none';
  }

  if (normalizedSection === 'contact') {
    hydrateContactSupportPanel().catch((error) => {
      console.warn('[Account Center] Failed to hydrate support panel:', error);
    });
  }
}

function isPlatformAdminUser() {
  if (State.isPlatformAdmin) return true;
  const role = String(State.currentProfile?.role || '').toLowerCase();
  if (role === 'super_admin') return true;

  const email = String(State.currentUser?.email || '').trim().toLowerCase();
  const configured = window.FAMILYOS_CONFIG?.platform?.adminEmails;
  const adminEmails = Array.isArray(configured)
    ? configured.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : [];

  return Boolean(email && adminEmails.includes(email));
}

async function loadPlatformAdminStatus() {
  State.isPlatformAdmin = false;
  if (!State.uid || !DB.client) return false;

  const { data, error } = await DB.client
    .from('platform_admins')
    .select('user_id,is_active')
    .eq('user_id', State.uid)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    if (!String(error.message || '').toLowerCase().includes('platform_admins')) {
      console.warn('[Account Center] Failed to load platform admin status:', error);
    }
    return false;
  }

  State.isPlatformAdmin = Boolean(data?.user_id && data?.is_active);
  return State.isPlatformAdmin;
}

function supportCategoryLabel(category) {
  const labels = {
    bug_report: 'Bug report',
    account_issue: 'Account issue',
    data_issue: 'Data issue',
    feature_request: 'Feature request',
    complaint: 'Complaint',
    other: 'Other',
  };
  return labels[category] || 'Other';
}

function supportStatusBadge(status) {
  const map = {
    open: 'b-red',
    in_progress: 'b-amber',
    resolved: 'b-green',
    closed: 'b-gray',
  };
  return `<span class="badge ${map[status] || 'b-gray'}">${escapeHtml(String(status || 'open').replace(/_/g, ' '))}</span>`;
}

function setSupportFormStatus(message = '', tone = 'info') {
  const el = document.getElementById('support-form-status');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  const colors = {
    info: 'var(--text2)',
    success: 'var(--success)',
    error: 'var(--danger)',
  };
  el.style.display = 'block';
  el.style.color = colors[tone] || colors.info;
  el.textContent = message;
}

async function hydrateContactSupportPanel() {
  const listEl = document.getElementById('support-ticket-list');
  if (!listEl || !DB.client || !State.uid) return;

  listEl.innerHTML = `<div style="font-size:12px;color:var(--text3);">Loading your support history...</div>`;
  const { data, error } = await DB.client
    .from('support_tickets')
    .select('id,category,subject,status,priority,created_at,updated_at')
    .eq('submitted_by', State.uid)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) {
    const message = String(error.message || '');
    if (message.toLowerCase().includes('support_tickets')) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text3);">Support history will appear here after the support SQL upgrade is applied.</div>`;
      return;
    }

    console.warn('[Account Center] Failed to load support tickets:', error);
    listEl.innerHTML = `<div style="font-size:12px;color:var(--danger);">Unable to load support tickets right now.</div>`;
    return;
  }

  if (!data?.length) {
    listEl.innerHTML = `<div style="font-size:12px;color:var(--text3);">No support tickets submitted yet.</div>`;
    return;
  }

  listEl.innerHTML = data.map((ticket) => `
    <div class="card" style="padding:12px 14px;">
      <div class="flex-between" style="align-items:flex-start;gap:10px;margin-bottom:6px;">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(ticket.subject || 'Untitled')}</div>
          <div style="font-size:12px;color:var(--text3);">${escapeHtml(supportCategoryLabel(ticket.category))} · ${ago(ticket.created_at)}</div>
        </div>
        ${supportStatusBadge(ticket.status)}
      </div>
      <div style="font-size:12px;color:var(--text2);">
        Priority: ${escapeHtml(ticket.priority || 'normal')} · Updated ${ago(ticket.updated_at || ticket.created_at)}
      </div>
    </div>
  `).join('');
}

async function submitSupportTicket() {
  const category = document.getElementById('support-category')?.value || 'bug_report';
  const subject = document.getElementById('support-subject')?.value.trim() || '';
  const message = document.getElementById('support-message')?.value.trim() || '';

  if (!subject || !message) {
    setSupportFormStatus('Add both a subject and a clear message before submitting.', 'error');
    return;
  }

  setSupportFormStatus('');
  const payload = {
    family_id: State.fid || null,
    submitted_by: State.uid,
    category,
    subject,
    message,
    status: 'open',
    priority: 'normal',
    page_context: State.currentPage || null,
    browser_context: window.location.hash || window.location.pathname || null,
  };

  const { error } = await DB.client.from('support_tickets').insert(payload);
  if (error) {
    const errorText = String(error.message || '');
    if (errorText.toLowerCase().includes('support_tickets')) {
      setSupportFormStatus('Support submissions are not ready yet. Run the platform support SQL upgrade, then try again.', 'error');
      return;
    }
    console.error('[Account Center] Failed to submit support ticket:', error);
    setSupportFormStatus(errorText || 'Unable to submit support ticket right now.', 'error');
    return;
  }

  document.getElementById('support-subject').value = '';
  document.getElementById('support-message').value = '';
  setSupportFormStatus('Support ticket submitted. The platform owner will be able to review it from the admin inbox.', 'success');
  await hydrateContactSupportPanel();
}

function setAdminSectionHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

async function saveSupportTicketAdmin(ticketId) {
  if (!ticketId || !isPlatformAdminUser()) return;

  const status = document.getElementById(`admin-ticket-status-${ticketId}`)?.value || 'open';
  const notes = document.getElementById(`admin-ticket-notes-${ticketId}`)?.value.trim() || null;
  const payload = {
    status,
    admin_notes: notes,
    resolved_at: ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null,
    resolved_by: ['resolved', 'closed'].includes(status) ? State.uid : null,
  };

  const { error } = await DB.client
    .from('support_tickets')
    .update(payload)
    .eq('id', ticketId);

  if (error) {
    alert(error.message || 'Unable to update this support ticket right now.');
    return;
  }

  await hydrateAdminPanel();
}

async function togglePlatformUserActive(userId, nextState) {
  if (!userId || !isPlatformAdminUser()) return;

  const { error } = await DB.client
    .from('users')
    .update({ is_active: nextState })
    .eq('id', userId);

  if (error) {
    alert(error.message || 'Unable to update this user right now.');
    return;
  }

  await hydrateAdminPanel();
}

async function hydrateAdminPanel() {
  if (!isPlatformAdminUser() || !DB.client) return;

  setAdminSectionHtml('admin-overview-metrics', `<div style="font-size:12px;color:var(--text3);">Loading admin overview...</div>`);
  setAdminSectionHtml('admin-support-list', `<div style="font-size:12px;color:var(--text3);">Loading support inbox...</div>`);
  setAdminSectionHtml('admin-family-list', `<div style="font-size:12px;color:var(--text3);">Loading family workspaces...</div>`);
  setAdminSectionHtml('admin-user-list', `<div style="font-size:12px;color:var(--text3);">Loading user accounts...</div>`);

  const [{ data: tickets, error: ticketError }, { data: families, error: familyError }, { data: users, error: userError }] = await Promise.all([
    DB.client.from('support_tickets').select('id,family_id,submitted_by,category,subject,message,status,priority,admin_notes,created_at,updated_at').order('created_at', { ascending: false }).limit(10),
    DB.client.from('families').select('id,name,description,created_at').order('created_at', { ascending: false }).limit(12),
    DB.client.from('users').select('id,full_name,role,is_active,family_id,created_at').order('created_at', { ascending: false }).limit(20),
  ]);

  if (ticketError || familyError || userError) {
    const error = ticketError || familyError || userError;
    const message = error?.message || 'Unable to load admin data right now.';
    setAdminSectionHtml('admin-overview-metrics', `<div style="font-size:12px;color:var(--danger);">${escapeHtml(message)}</div>`);
    setAdminSectionHtml('admin-support-list', `<div style="font-size:12px;color:var(--danger);">Admin policies are not ready or the platform support SQL upgrade still needs to be applied.</div>`);
    setAdminSectionHtml('admin-family-list', '');
    setAdminSectionHtml('admin-user-list', '');
    return;
  }

  const familyNameById = Object.fromEntries((families || []).map((family) => [family.id, family.name]));
  const userNameById = Object.fromEntries((users || []).map((member) => [member.id, member.full_name || 'Member']));

  const openTickets = (tickets || []).filter((ticket) => ['open', 'in_progress'].includes(ticket.status)).length;
  const activeUsers = (users || []).filter((member) => member.is_active).length;

  setAdminSectionHtml('admin-overview-metrics', `
    <div class="account-center-grid">
      <div class="metric-card"><div class="metric-label">Families</div><div class="metric-value">${(families || []).length}</div><div class="metric-sub">Tracked workspaces</div></div>
      <div class="metric-card"><div class="metric-label">Users</div><div class="metric-value">${(users || []).length}</div><div class="metric-sub">${activeUsers} active accounts</div></div>
      <div class="metric-card"><div class="metric-label">Support</div><div class="metric-value">${openTickets}</div><div class="metric-sub">Open or in progress</div></div>
    </div>
  `);

  setAdminSectionHtml('admin-support-list', (tickets || []).length
    ? (tickets || []).map((ticket) => `
      <div class="card" style="padding:12px 14px;">
        <div class="flex-between" style="align-items:flex-start;gap:10px;margin-bottom:8px;">
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:700;">${escapeHtml(ticket.subject || 'Untitled ticket')}</div>
            <div style="font-size:12px;color:var(--text3);">${escapeHtml(supportCategoryLabel(ticket.category))} · ${escapeHtml(userNameById[ticket.submitted_by] || 'Member')} · ${ago(ticket.created_at)}</div>
            <div style="font-size:12px;color:var(--text3);">${escapeHtml(familyNameById[ticket.family_id] || 'No family linked')}</div>
          </div>
          ${supportStatusBadge(ticket.status)}
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6;white-space:pre-wrap;margin-bottom:10px;">${escapeHtml(ticket.message || '')}</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="admin-ticket-status-${ticket.id}" class="form-select">
              ${['open','in_progress','resolved','closed'].map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${status.replace(/_/g, ' ')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <input class="form-input" value="${escapeHtml(ticket.priority || 'normal')}" disabled />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Admin notes</label>
          <textarea id="admin-ticket-notes-${ticket.id}" class="form-textarea" style="min-height:90px;">${escapeHtml(ticket.admin_notes || '')}</textarea>
        </div>
        <div class="account-center-actions">
          <button class="btn btn-sm btn-primary" onclick="saveSupportTicketAdmin('${ticket.id}')">Save Ticket</button>
        </div>
      </div>
    `).join('')
    : `<div style="font-size:12px;color:var(--text3);">No support tickets have been submitted yet.</div>`);

  setAdminSectionHtml('admin-family-list', (families || []).length
    ? (families || []).map((family) => `
      <div class="card" style="padding:12px 14px;">
        <div style="font-size:13px;font-weight:700;">${escapeHtml(family.name || 'Untitled family')}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px;">Created ${ago(family.created_at)}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px;">${escapeHtml(family.description || 'No description provided.')}</div>
      </div>
    `).join('')
    : `<div style="font-size:12px;color:var(--text3);">No families found.</div>`);

  setAdminSectionHtml('admin-user-list', (users || []).length
    ? (users || []).map((member) => `
      <div class="card" style="padding:12px 14px;">
        <div class="flex-between" style="align-items:flex-start;gap:10px;">
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:700;">${escapeHtml(member.full_name || 'Unnamed user')}</div>
            <div style="font-size:12px;color:var(--text3);">${escapeHtml(familyNameById[member.family_id] || 'No family linked')} · ${escapeHtml(member.role || 'member')}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:4px;">Created ${ago(member.created_at)}</div>
          </div>
          <span class="badge ${member.is_active ? 'b-green' : 'b-gray'}">${member.is_active ? 'active' : 'inactive'}</span>
        </div>
        <div class="account-center-actions" style="margin-top:10px;">
          <button class="btn btn-sm" onclick="togglePlatformUserActive('${member.id}', ${member.is_active ? 'false' : 'true'})">
            ${member.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
    `).join('')
    : `<div style="font-size:12px;color:var(--text3);">No users found.</div>`);
}

function accountCenterAccordion(items, tone = 'blue') {
  return `
    <div class="account-accordion">
      ${(items || []).map((item, index) => `
        <details class="account-accordion-item account-accordion-${tone}" ${index === 0 ? 'open' : ''}>
          <summary>${item.question}</summary>
          <div class="account-accordion-body">${item.answer}</div>
        </details>
      `).join('')}
    </div>`;
}

function accountCenterNav(activeSection) {
  const groups = [
    {
      title: 'Account',
      items: [['profile', 'Profile'], ['billing', 'Billing'], ['settings', 'Settings']],
    },
    {
      title: 'Help & Policies',
      items: [
        ['help', 'Help Center'],
        ['faq', 'FAQ'],
        ['guide', 'User Guide'],
        ['terms', 'Terms of Use'],
        ['privacy', 'Privacy Policy'],
        ['contact', 'Contact Support'],
      ],
    },
  ];

  return `
    <div class="account-center-sidebar">
      ${groups.map((group) => `
        <div class="account-center-group">
          <div class="account-center-group-label">${group.title}</div>
          ${group.items.map(([key, label]) => `
            <button class="account-center-nav-btn ${activeSection === key ? 'active' : ''}"
                    onclick="openProfileCenter('${key}')">${label}</button>
          `).join('')}
        </div>
      `).join('')}
    </div>`;
}

function accountCenterSection(section) {
  const profile = State.currentProfile || {};
  const user = State.currentUser || {};
  const familyName = document.getElementById('sb-family-name')?.textContent || 'Family Workspace';
  const displayName = escapeHtml((profile.full_name || user.email || 'Member').trim());
  const role = escapeHtml(profile.role || 'member');
  const email = escapeHtml(user.email || 'No email on file');
  const familyId = escapeHtml(profile.family_id || 'Not linked yet');
  const updatedLabel = 'Updated 15 Mar 2026';

  const helpTopics = [
    {
      question: 'How should I use FamilyOS each week?',
      answer: 'Start in Dashboard for the current family snapshot, then move into the area that needs action: Finance for money movement, Projects and Tasks for delivery work, Farm Manager for farm operations, and Vault for shared records. Use Reports or exports when preparing family meetings or external sharing.',
    },
    {
      question: 'How do I keep reports and totals trustworthy?',
      answer: 'Record contributions as money in and expenses as money out. Link expenses to projects and vendors where possible, avoid duplicate manual records, and review unusual totals before exporting. The more disciplined the original entries are, the more trustworthy the dashboard, reports, and AI context become.',
    },
    {
      question: 'How should we use Projects, Tasks, and Farm Manager together?',
      answer: 'Use Projects to define the work, Tasks to drive execution, and Farm Manager for farming-specific operational activity such as inputs, outputs, livestock events, and farm cost signals. Keep related records linked so the family can see cost, responsibility, and progress together.',
    },
    {
      question: 'What is the right way to use Vault and AI?',
      answer: 'Use Vault for documents and shared media worth keeping over time. Use AI Advisor for pattern spotting, prioritization, and family planning support, but validate important conclusions before acting on money, legal, school, or health decisions.',
    },
  ];

  const faqTopics = [
    {
      question: 'Why can I view a section but not edit it?',
      answer: 'FamilyOS separates visibility from management. Some records are visible for awareness, but editing is limited by role, record ownership, and safety rules.',
    },
    {
      question: 'Why did an upload or save fail?',
      answer: 'The most common causes are missing fields, database policy restrictions, or storage policy problems. If it is a Vault upload, confirm the bucket and policies are configured and that your role allows the action.',
    },
    {
      question: 'Can I store Google Drive or shared media links?',
      answer: 'Yes. Family Media is the intended Vault category for shared photo albums, Google Drive links, and similar family media collections.',
    },
    {
      question: 'What happens if two users edit the same thing?',
      answer: 'Some areas still behave like latest-save-wins. That means the most recent save can overwrite an earlier edit if two users change the same record without coordinating. Stronger conflict handling is part of the ship-readiness work.',
    },
  ];

  if (section === 'billing') {
    const billing = State.billing || deriveBillingState();
    const planLabel = billingPlanLabel(billing.plan);
    const statusLabel = billingStatusLabel(billing.status);
    const tierLabel = billingTierLabel(billing);
    const trialEndsLabel = billingDateLabel(billing.trialEndsAt);
    const renewsLabel = billingDateLabel(billing.subscriptionEndsAt);
    const amountLabel = billing.plan === 'yearly' ? 'KES 1,000 / year' : 'KES 100 / month';
    const isScholarship = billing.accessSource === 'scholarship';
    const canManageBillingRole = isPlatformAdminUser() || String(State.currentProfile?.role || '').toLowerCase() === 'admin';
    const hasManagedSubscription = hasManagedBillingSubscription(billing);
    const inlineNotice = State.billingManagementNotice
      ? `<div class="billing-readonly-note" style="margin-bottom:14px;">${escapeHtml(State.billingManagementNotice)}</div>`
      : '';
    const actionHtml = !canManageBillingRole
      ? `<button class="btn btn-secondary" type="button" data-billing-allow="true" disabled>Ask a Family Admin to Manage Billing</button>`
      : hasManagedSubscription
        ? billingActionButton({
          label: 'Manage Subscription',
          loadingLabel: 'Opening...',
          action: 'manage-subscription',
          cls: 'btn btn-secondary',
          onclick: 'openPaystackBillingManagement()',
        })
        : `<button class="btn btn-primary" type="button" data-billing-allow="true" onclick="openBillingStatusModal('plans')">Subscribe</button>`;

    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-amber">
          <div class="account-center-hero-title">Billing</div>
          <div class="account-center-hero-copy">Review your workspace plan and dates here. Use Subscribe to start billing, or Manage Subscription to review or update your current subscription.</div>
        </div>
        ${inlineNotice}
        <div class="account-center-grid">
          <div class="card">
            <div class="card-title">Current Workspace Plan</div>
            <div class="tag-row" style="margin:0 0 12px 0;">
              <span class="tag ${isScholarship ? 'b-blue' : hasManagedSubscription ? 'b-green' : billing.access === 'trialing' ? 'b-amber' : 'b-red'}">${escapeHtml(tierLabel)}</span>
            </div>
            <div class="details-grid">
              <div><div class="details-label">Workspace</div><div class="details-value">${escapeHtml(familyName)}</div></div>
              <div><div class="details-label">Status</div><div class="details-value">${escapeHtml(statusLabel)}</div></div>
              <div><div class="details-label">Plan</div><div class="details-value">${escapeHtml(planLabel)}</div></div>
              <div><div class="details-label">Current Price</div><div class="details-value">${amountLabel}</div></div>
              <div><div class="details-label">Billing Currency</div><div class="details-value">${escapeHtml(billing.currency)}</div></div>
              <div><div class="details-label">Access Source</div><div class="details-value">${escapeHtml(billing.accessSource === 'scholarship' ? 'Scholarship' : 'Billing')}</div></div>
            </div>
            ${!isScholarship ? `
              <div class="account-center-actions" style="margin-top:12px;">
                ${actionHtml}
              </div>
            ` : ''}
          </div>
          <div class="card">
            <div class="card-title">Important Dates</div>
            <div class="details-grid">
              <div><div class="details-label">Trial Ends</div><div class="details-value">${escapeHtml(trialEndsLabel || 'Not set')}</div></div>
              <div><div class="details-label">Subscription Ends</div><div class="details-value">${escapeHtml(renewsLabel || 'Not set')}</div></div>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:10px;">
              <button class="btn"
                type="button"
                data-billing-allow="true"
                onclick="openBillingStatusModal('plans')"
                style="padding:0;border:none;background:none;color:var(--accent);font-size:12px;font-weight:600;">
                View Plans
              </button>
            </div>
            ${billing.scholarshipNote ? `<div class="account-center-copy" style="margin-top:12px;">${escapeHtml(billing.scholarshipNote)}</div>` : ''}
            ${!isScholarship && !hasManagedSubscription ? `
              <div class="account-center-copy" style="margin-top:12px;">Subscribe starts monthly or yearly billing in a new tab so the family admin can complete checkout and return here easily.</div>
            ` : ''}
            ${hasManagedSubscription ? `
              <div class="account-center-copy" style="margin-top:12px;">Manage Subscription opens the subscription page in a new tab so the family admin can review or update billing details.</div>
            ` : ''}
            ${isScholarship ? `
              <div class="account-center-copy" style="margin-top:12px;">This workspace currently has scholarship-based access rather than a paid subscription.</div>
            ` : ''}
          </div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'settings') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-green">
          <div class="account-center-hero-title">Settings</div>
          <div class="account-center-hero-copy">Manage your account experience, browser-level preferences, and the parts of FamilyOS that should feel consistent every time you return.</div>
        </div>
        <div class="account-center-grid">
          <div class="card">
            <div class="card-title">Appearance</div>
            <div class="account-center-copy">Theme preference is stored in this browser so the interface feels familiar each time you sign in.</div>
            <div class="account-center-actions" style="margin-top:12px;">
              ${accountThemeSwitch('settings')}
            </div>
          </div>
          <div class="card">
            <div class="card-title">Session</div>
            <div class="account-center-list">
              <div>Signed in as: ${email}</div>
              <div>Workspace: ${escapeHtml(familyName)}</div>
              <div>Role: ${role}</div>
            </div>
            <div class="account-center-actions" style="margin-top:12px;">
              <button class="btn btn-sm btn-danger" onclick="Auth.signOut()">Sign Out</button>
            </div>
          </div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'help') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-blue">
          <div class="account-center-hero-title">Help Center</div>
          <div class="account-center-hero-copy">This space explains how to use FamilyOS well in real family operations, not just what each button does. Expand the topics below for guided help.</div>
        </div>
        <div class="account-center-panel">${accountCenterAccordion(helpTopics, 'blue')}</div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'faq') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-amber">
          <div class="account-center-hero-title">FAQ</div>
          <div class="account-center-hero-copy">Quick answers to the most common questions users have while working across records, uploads, AI, reporting, and collaboration.</div>
        </div>
        <div class="account-center-panel">${accountCenterAccordion(faqTopics, 'amber')}</div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'guide') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-green">
          <div class="account-center-hero-title">User Guide</div>
          <div class="account-center-hero-copy">This guide is the practical reference for how FamilyOS should be used across daily coordination, financial accountability, project work, farming, shared records, and governance.</div>
        </div>
        <div class="account-center-grid">
          <div class="card"><div class="card-title">Getting started</div><div class="account-center-list"><div>Join or create the correct family workspace before entering any records.</div><div>Confirm your name, role, and family identity in the sidebar.</div><div>Use Dashboard first each session to see what needs attention now.</div></div></div>
          <div class="card"><div class="card-title">Inviting and joining members</div><div class="account-center-list"><div>Admins can open Members and use Invite Member to create an invite code for a new person.</div><div>Share the invite code with the person you want to add, and note the role and expiry period chosen for that invite.</div><div>The invited person should sign up or sign in, choose Join Family during onboarding, then enter the invite code exactly as shared.</div><div>After joining, they should confirm their name, phone, and assigned role, then open the workspace sections relevant to their responsibilities.</div></div></div>
          <div class="card"><div class="card-title">Finance and obligations</div><div class="account-center-list"><div>Record contributions as incoming family money and expenses as outgoing family money.</div><div>Use School Fees and Emergency Fund for specialized obligations, but maintain clean cash records.</div><div>Review totals before sending exports outside the app.</div></div></div>
          <div class="card"><div class="card-title">Operations and farming</div><div class="account-center-list"><div>Create projects when work has a budget, owner, or shared family impact.</div><div>Use tasks for execution and accountability.</div><div>Use Farm Manager for input cost, outputs, livestock events, and farm performance signals.</div></div></div>
          <div class="card"><div class="card-title">Documents, meetings, and AI</div><div class="account-center-list"><div>Use Vault for records worth retaining, including family media links.</div><div>Use Meetings and Announcements for structured visibility and family governance.</div><div>Use AI Advisor for planning support, but verify high-stakes conclusions before acting.</div></div></div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'terms') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-red">
          <div class="account-center-hero-title">Terms of Use</div>
          <div class="account-center-hero-copy">These terms explain the responsibilities attached to using FamilyOS for family finance, governance, operations, documentation, planning, and advisory support.</div>
        </div>
        <div class="account-center-doc">
          <div class="card"><div class="card-title">1. Acceptance and scope</div><div class="account-center-copy">By using FamilyOS, you agree to use the system only for legitimate family coordination, administration, financial recording, project management, farming operations, governance support, and shared record keeping. Access to the workspace is conditional on compliance with these terms and with family-specific rules applied by your administrators.</div></div>
          <div class="card"><div class="card-title">2. Account responsibility</div><div class="account-center-copy">You are responsible for maintaining the security of your credentials and for actions performed through your account. You should not share your login casually or allow another person to operate the system as if they were you.</div></div>
          <div class="card"><div class="card-title">3. Family workspace use</div><div class="account-center-copy">You should only use the workspace you are authorized to belong to, and you should only enter data relevant to that family context. Records such as contributions, expenses, school fees, projects, meetings, votes, vault files, and announcements should be entered in good faith and with reasonable care.</div></div>
          <div class="card"><div class="card-title">4. Data accuracy and decisions</div><div class="account-center-copy">FamilyOS helps structure financial and operational information, but it does not create truth on its own. Users remain responsible for verifying the accuracy of entries and for checking the underlying evidence before making major money, governance, land, school, health, or investment decisions.</div></div>
          <div class="card"><div class="card-title">5. Acceptable content and uploads</div><div class="account-center-copy">You must not use FamilyOS to upload unlawful, abusive, fraudulent, defamatory, or unauthorized content. Documents, photos, media links, and records placed in Vault should either belong to the family, be properly authorized for sharing, or be stored with informed consent.</div></div>
          <div class="card"><div class="card-title">6. AI advisory limitation</div><div class="account-center-copy">AI Advisor and AI-generated insights are support tools for pattern recognition, prioritization, and discussion. They are not legal, accounting, agricultural, medical, or investment advice, and they do not replace human judgment or professional review.</div></div>
          <div class="card"><div class="card-title">7. Misuse and updates</div><div class="account-center-copy">Access may be restricted where there is misuse, harmful conduct, or attempts to interfere with workspace integrity. FamilyOS may also evolve over time, and these terms may be updated as new operational, legal, or security requirements arise.</div></div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'privacy') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-blue">
          <div class="account-center-hero-title">Privacy Policy</div>
          <div class="account-center-hero-copy">This policy explains what FamilyOS stores, how the system uses that information, and what users should understand about shared family data, uploads, and AI-supported features.</div>
        </div>
        <div class="account-center-doc">
          <div class="card"><div class="card-title">1. What the system stores</div><div class="account-center-copy">FamilyOS stores account identity such as your email, profile name, family membership, and role. It also stores family operational records including contributions, expenses, school fees, emergency activity, projects, tasks, farming records, vendor data, meetings, votes, announcements, vault documents, and exports derived from those records.</div></div>
          <div class="card"><div class="card-title">2. Why the system uses this data</div><div class="account-center-copy">This information is used to authenticate users, separate family workspaces, apply permissions, calculate dashboards and reports, generate operational context, support accountability, and preserve records the family may need for planning, follow-up, or governance.</div></div>
          <div class="card"><div class="card-title">3. Shared family access model</div><div class="account-center-copy">FamilyOS is designed as a shared family workspace. Some records may be visible to multiple members within the same family, subject to role boundaries and access settings. Users should enter sensitive information carefully and assume that shared workspace records are part of a broader family operating environment.</div></div>
          <div class="card"><div class="card-title">4. Files, uploads, and external links</div><div class="account-center-copy">Vault may contain uploaded files as well as shared external links such as Google Drive or family media collections. Users are responsible for uploading or linking materials they are authorized to share. Availability may depend on storage configuration and on any external services hosting linked media.</div></div>
          <div class="card"><div class="card-title">5. AI and privacy</div><div class="account-center-copy">When AI features are enabled, relevant family context may be processed to answer user questions or generate insights. This can include financial totals, task pressure, goals, project signals, farming metrics, and similar operational context. AI should be treated as a support tool, not as a guarantee.</div></div>
          <div class="card"><div class="card-title">6. Retention and responsibility</div><div class="account-center-copy">Records may remain available for continuity, reporting, and accountability unless removed by authorized users. Because this is a shared family workspace, users should follow family governance practices around consent, confidentiality, and responsible record keeping.</div></div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'contact') {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-amber">
          <div class="account-center-hero-title">Contact Support</div>
          <div class="account-center-hero-copy">Use this section when you need to report a system issue, complaint, account problem, data inconsistency, or feature request to the platform owner.</div>
        </div>
        <div class="account-center-grid">
          <div class="card"><div class="card-title">What to include</div><div class="account-center-list"><div>What you were trying to do</div><div>Which page or section was involved</div><div>What happened instead</div><div>Whether the issue blocks your work fully or partially</div><div>Any family, project, or record context needed to reproduce the problem</div></div></div>
          <div class="card"><div class="card-title">Support categories</div><div class="account-center-list"><div>Bug report</div><div>Account issue</div><div>Data issue</div><div>Feature request</div><div>Complaint</div></div></div>
        </div>
        <div class="card">
          <div class="card-title">Submit a support ticket</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select id="support-category" class="form-select">
                <option value="bug_report">Bug report</option>
                <option value="account_issue">Account issue</option>
                <option value="data_issue">Data issue</option>
                <option value="feature_request">Feature request</option>
                <option value="complaint">Complaint</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Current workspace</label><input class="form-input" value="${escapeHtml(familyName)}" disabled /></div>
          </div>
          <div class="form-group"><label class="form-label">Subject</label><input id="support-subject" class="form-input" placeholder="Short summary of the issue" /></div>
          <div class="form-group"><label class="form-label">Message</label><textarea id="support-message" class="form-textarea" placeholder="Describe what happened, what you expected, and any family or page context that will help the platform owner investigate."></textarea></div>
          <div id="support-form-status" style="display:none;font-size:12px;"></div>
          <div class="account-center-actions" style="margin-top:12px;">
            <button class="btn btn-primary" onclick="submitSupportTicket()">Submit Ticket</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Your recent tickets</div>
          <div id="support-ticket-list" class="account-center-panel">
            <div style="font-size:12px;color:var(--text3);">Open this section after the support SQL upgrade to load your submitted tickets here.</div>
          </div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  if (section === 'admin' && isPlatformAdminUser()) {
    return `
      <div class="account-center-content">
        <div class="account-center-hero ai-red">
          <div class="account-center-hero-title">Platform Admin</div>
          <div class="account-center-hero-copy">This section is reserved for the system owner or superadmin. It is where platform-wide family, account, support, and audit management will live once the backend superadmin layer is wired.</div>
        </div>
        <div class="card">
          <div class="card-title">Overview</div>
          <div id="admin-overview-metrics" class="account-center-panel">
            <div style="font-size:12px;color:var(--text3);">Loading admin overview...</div>
          </div>
        </div>
        <div class="account-center-grid">
          <div class="card">
            <div class="card-title">Support Inbox</div>
            <div id="admin-support-list" class="account-center-panel">
              <div style="font-size:12px;color:var(--text3);">Loading support inbox...</div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Families</div>
            <div id="admin-family-list" class="account-center-panel">
              <div style="font-size:12px;color:var(--text3);">Loading family workspaces...</div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">User Accounts</div>
          <div id="admin-user-list" class="account-center-grid">
            <div style="font-size:12px;color:var(--text3);">Loading user accounts...</div>
          </div>
        </div>
        <div class="account-center-meta">${updatedLabel}</div>
      </div>`;
  }

  return `
    <div class="account-center-content">
      <div class="account-center-hero ai-blue">
        <div class="avatar av-md av-blue" style="width:48px;height:48px;font-size:15px;">${escapeHtml((displayName.match(/[A-Z0-9]/gi) || ['F']).slice(0, 2).join('').toUpperCase())}</div>
        <div style="min-width:0;">
          <div class="account-center-hero-title" style="margin-bottom:4px;">${displayName}</div>
          <div class="tag-row" style="margin-top:0;">
            <span class="badge b-blue">${escapeHtml(familyName)}</span>
            <span class="badge b-gray">${role}</span>
          </div>
        </div>
      </div>
      <div class="account-center-grid">
        <div class="card"><div class="card-title">Account</div><div class="details-grid"><div><div class="details-label">Email</div><div class="details-value">${email}</div></div><div><div class="details-label">Family ID</div><div class="details-value">${familyId}</div></div><div><div class="details-label">Role</div><div class="details-value">${role}</div></div><div><div class="details-label">Workspace</div><div class="details-value">${escapeHtml(familyName)}</div></div></div></div>
        <div class="card"><div class="card-title">What your role supports</div><div class="account-center-copy">${escapeHtml(profileRoleSummary(profile.role))}</div></div>
        <div class="card"><div class="card-title">Recommended next stops</div><div class="account-center-list"><div>Open <strong>Help Center</strong> when you need usage guidance.</div><div>Open <strong>User Guide</strong> for detailed workflows.</div><div>Open <strong>Contact Support</strong> if the issue goes beyond normal family admin help.</div></div></div>
      </div>
      <div class="account-center-actions">
        ${accountThemeSwitch('profile')}
        <button class="btn btn-sm btn-danger" onclick="Auth.signOut()">Sign Out</button>
      </div>
      <div class="account-center-meta">${updatedLabel}</div>
    </div>`;
}

function renderOnboardingShell(profile, user) {
  const displayName = escapeHtml((profile?.full_name || user?.email || 'Member').trim());
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

function clearAuthModeParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('mode')) return;

  url.searchParams.delete('mode');
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;

  if (window.history?.replaceState) {
    window.history.replaceState(null, '', nextUrl);
    return;
  }

  window.location.search = nextSearch ? `?${nextSearch}` : '';
}

const BILLING_READ_ONLY_PAGES = new Set(['dashboard', 'finance', 'members', 'reports', 'meetings', 'vault']);

function billingDateLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function billingDaysLeft(value) {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function deriveBillingState(family = {}) {
  const status = String(family.billing_status || 'active').trim().toLowerCase() || 'active';
  const plan = String(family.billing_plan || 'monthly').trim().toLowerCase() || 'monthly';
  const currency = String(family.billing_currency || 'KES').trim().toUpperCase() || 'KES';
  const country = String(family.billing_country || 'KE').trim().toUpperCase() || 'KE';
  const trialEndsAt = family.trial_ends_at || null;
  const subscriptionEndsAt = family.subscription_ends_at || null;
  const scholarshipActive = Boolean(family.scholarship_active);
  const scholarshipStartsAt = family.scholarship_started_at || null;
  const scholarshipEndsAt = family.scholarship_ends_at || null;
  const scholarshipNote = family.scholarship_note || null;
  const daysLeft = billingDaysLeft(status === 'trialing' ? trialEndsAt : subscriptionEndsAt);
  const scholarshipStartMs = scholarshipStartsAt ? new Date(scholarshipStartsAt).getTime() : null;
  const scholarshipEndMs = scholarshipEndsAt ? new Date(scholarshipEndsAt).getTime() : null;
  const now = Date.now();
  const scholarshipWindowOpen = scholarshipActive
    && (scholarshipStartMs === null || scholarshipStartMs <= now)
    && (scholarshipEndMs === null || scholarshipEndMs >= now);

  let access = 'active';
  let accessSource = 'billing';
  if (status === 'trialing') {
    access = daysLeft && daysLeft > 0 ? 'trialing' : 'restricted';
  } else if (status === 'cancelled') {
    access = (billingDaysLeft(subscriptionEndsAt) || 0) > 0 ? 'active' : 'restricted';
  } else if (['expired', 'past_due'].includes(status)) {
    access = 'restricted';
  } else if (status === 'active' && subscriptionEndsAt) {
    access = (billingDaysLeft(subscriptionEndsAt) || 0) > 0 ? 'active' : 'restricted';
  }

  if (scholarshipWindowOpen) {
    access = 'active';
    accessSource = 'scholarship';
  }

  return {
    status,
    access,
    accessSource,
    plan,
    currency,
    country,
    trialStartedAt: family.trial_started_at || null,
    trialEndsAt,
    subscriptionStartedAt: family.subscription_started_at || null,
    subscriptionEndsAt,
    scholarshipActive,
    scholarshipStartsAt,
    scholarshipEndsAt,
    scholarshipNote,
    daysLeft,
  };
}

function billingPlanLabel(plan = 'monthly') {
  return plan === 'yearly' ? 'Yearly' : 'Monthly';
}

function isSubscribedWorkspace(billing = State.billing || deriveBillingState()) {
  return ['active', 'cancelled'].includes(billing?.status)
    && billing?.access === 'active'
    && billing?.accessSource !== 'scholarship';
}

function hasManagedBillingSubscription(billing = State.billing || deriveBillingState()) {
  return isSubscribedWorkspace(billing);
}

function billingTierLabel(billing = State.billing || deriveBillingState()) {
  if (billing.accessSource === 'scholarship') return 'Scholarship';
  if (billing.access === 'trialing') return 'Free Trial';
  if (billing.status === 'cancelled' && billing.access === 'active') return 'Cancelled';
  if (billing.status === 'past_due') return 'Past Due';
  if (isSubscribedWorkspace(billing)) return 'Pro';
  if (billing.status === 'active') return 'Active';
  if (billing.status === 'cancelled') return 'Cancelled';
  return 'Expired';
}

function billingTierTone(billing = State.billing || deriveBillingState()) {
  if (billing.accessSource === 'scholarship') return 'is-scholarship';
  if (billing.access === 'trialing') return 'is-trial';
  if (isSubscribedWorkspace(billing)) return 'is-pro';
  return 'is-restricted';
}

function billingStatusLabel(status = 'active') {
  const labels = {
    active: 'Active',
    trialing: 'Trial',
    expired: 'Expired',
    past_due: 'Past Due',
    cancelled: 'Cancelled',
  };
  return labels[status] || 'Active';
}

function billingActionButton({ label, loadingLabel = 'Loading...', action = '', cls = 'btn', onclick = '', disabled = false, type = 'button' }) {
  const isLoading = Boolean(State.billingUi?.isLoading && State.billingUi.action === action);
  const content = isLoading
    ? `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(loadingLabel)}`
    : escapeHtml(label);

  return `
    <button class="${cls} btn-inline${isLoading ? ' is-loading' : ''}" type="${type}" data-billing-allow="true"
      ${action ? `data-billing-action="${action}"` : ''}
      data-billing-label="${escapeHtml(label)}"
      data-billing-loading-label="${escapeHtml(loadingLabel)}"
      ${disabled || isLoading ? 'disabled' : ''}
      ${onclick ? `onclick="${onclick}"` : ''}>${content}</button>`;
}

function syncBillingActionButtons() {
  const isLoading = Boolean(State.billingUi?.isLoading);
  const activeAction = State.billingUi?.action || '';
  document.querySelectorAll('[data-billing-action]').forEach((button) => {
    const label = button.dataset.billingLabel || button.textContent.trim() || 'Loading';
    const loadingLabel = button.dataset.billingLoadingLabel || 'Loading...';
    const matchesAction = isLoading && button.dataset.billingAction === activeAction;

    button.disabled = isLoading;
    button.classList.toggle('is-loading', matchesAction);
    button.innerHTML = matchesAction
      ? `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(loadingLabel)}`
      : escapeHtml(label);
  });
}

function setBillingActionLoading(action = '') {
  State.billingUi = {
    isLoading: Boolean(action),
    action: action || '',
  };
  syncBillingActionButtons();
}

function clearBillingActionLoading() {
  setBillingActionLoading('');
}

function prepareBillingLaunchWindow() {
  try {
    return window.open('about:blank', '_blank');
  } catch {
    return null;
  }
}

function openBillingDestination(url, launchWindow = null) {
  if (launchWindow && !launchWindow.closed) {
    try {
      launchWindow.location.replace(url);
      if (typeof launchWindow.focus === 'function') {
        launchWindow.focus();
      }
      return;
    } catch (error) {
      console.warn('[Billing] Failed to reuse prepared billing tab, falling back to current tab:', error);
    }
  }

  window.location.assign(url);
}

function openPaystackBillingManagement() {
  startWorkspaceBillingPortal().catch((error) => {
    clearBillingActionLoading();
    State.billingManagementNotice = error?.message || 'Unable to open subscription management right now.';
    openProfileCenter('billing');
  });
}

function isBillingBypassed() {
  return Boolean(State.isPlatformAdmin);
}

function isWorkspaceRestricted() {
  return !isBillingBypassed() && State.billing?.access === 'restricted';
}

function isReadOnlyBillingPage(page) {
  return BILLING_READ_ONLY_PAGES.has(page);
}

function billingBannerDismissKey() {
  if (!State.currentFamilyId) return null;
  const marker = State.billing?.trialEndsAt || State.billing?.subscriptionEndsAt || State.billing?.status || 'billing';
  return `fos_billing_banner_dismissed_${State.currentFamilyId}_${marker}`;
}

function hasDismissedBillingBanner() {
  const key = billingBannerDismissKey();
  if (!key) return false;
  return localStorage.getItem(key) === '1';
}

function dismissBillingBanner() {
  const key = billingBannerDismissKey();
  if (!key) return;
  localStorage.setItem(key, '1');
  State.billingBannerOverride = false;
  if (State.currentPage === 'dashboard' && typeof renderPage === 'function') {
    renderPage('dashboard');
  }
}

function shouldShowDashboardBillingBanner() {
  const billing = State.billing || deriveBillingState();
  if (billing.accessSource === 'scholarship') return false;
  if (State.billingBannerOverride) return true;
  if (billing.access === 'restricted') return true;
  if (billing.access !== 'trialing') return false;
  if ((billing.daysLeft || 0) <= 1) return true;
  return !hasDismissedBillingBanner();
}

function dashboardBillingBannerHtml() {
  const billing = State.billing || deriveBillingState();
  if (!shouldShowDashboardBillingBanner()) return '';

  const isTrialing = billing.access === 'trialing';
  const planLabel = billingPlanLabel(billing.plan);
  const trialEndsLabel = billingDateLabel(billing.trialEndsAt);
  const title = isTrialing
    ? `${billing.daysLeft || 0} day${billing.daysLeft === 1 ? '' : 's'} left in your free trial`
    : 'Billing is required to keep updating this workspace';
  const text = isTrialing
    ? `Your ${planLabel.toLowerCase()} workspace trial${trialEndsLabel ? ` ends on ${trialEndsLabel}` : ''}. You can review plans now so the family is ready before access changes.`
    : 'This workspace is in read-only mode. Renew on a monthly or yearly plan to restore full access.';
  const dismissHtml = isTrialing
    ? `<button type="button" class="dashboard-billing-close" data-billing-allow="true" onclick="dismissBillingBanner()" aria-label="Dismiss trial banner">×</button>`
    : '';

  return `
    <div class="dashboard-billing-banner ${isTrialing ? 'is-trial' : 'is-restricted'}">
      <div class="dashboard-billing-copy">
        <div class="dashboard-billing-title">${escapeHtml(title)}</div>
        <div class="dashboard-billing-text">${escapeHtml(text)}</div>
      </div>
      <div class="dashboard-billing-actions">
        <button class="btn btn-secondary" data-billing-allow="true" onclick="openBillingStatusModal('plans')">View plans</button>
        ${dismissHtml}
      </div>
    </div>`;
}

function refreshSidebarBillingStatus() {
  const statusEl = document.getElementById('sb-billing-status');
  if (!statusEl) return;
  const label = billingTierLabel();
  statusEl.textContent = label;
  statusEl.className = `sb-billing-status ${billingTierTone()}`;
}

function resolveBillingPageAccess(page) {
  if (!isWorkspaceRestricted()) {
    return { page, readOnly: false, showPrompt: false };
  }

  if (isReadOnlyBillingPage(page)) {
    return { page, readOnly: true, showPrompt: false };
  }

  return { page: 'dashboard', readOnly: true, showPrompt: true };
}

function applyBillingReadOnlyState(page, options = {}) {
  const { beforeRender = false, readOnly = isWorkspaceRestricted() && isReadOnlyBillingPage(page) } = options;
  const content = document.getElementById('page-content');
  if (!content) return;

  content.classList.toggle('billing-readonly', Boolean(readOnly));
  if (beforeRender || !readOnly) return;

  content.querySelectorAll('button, input, select, textarea, summary').forEach((el) => {
    if (el.dataset.billingAllow === 'true') return;
    if ('disabled' in el) el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
    el.tabIndex = -1;
  });

  if (content.querySelector('.billing-readonly-note')) return;
  const note = document.createElement('div');
  note.className = 'billing-readonly-note';
  note.textContent = 'This workspace is currently in read-only mode. Renew billing to keep adding or editing records.';
  content.prepend(note);
}

async function saveWorkspaceBillingPlan(plan) {
  if (!State.currentFamilyId || !plan) return;
  const normalizedPlan = plan === 'yearly' ? 'yearly' : 'monthly';
  const action = `choose-plan-${normalizedPlan}`;
  const role = String(State.currentProfile?.role || '').toLowerCase();
  if (!isPlatformAdminUser() && role !== 'admin') {
    alert('Only a family admin can choose the workspace billing plan.');
    return;
  }

  setBillingActionLoading(action);
  try {
    const { error } = await DB.client
      .from('families')
      .update({ billing_plan: normalizedPlan })
      .eq('id', State.currentFamilyId);

    if (error) {
      alert(error.message || 'Unable to update the workspace billing plan right now.');
      return;
    }

    State.billing = {
      ...State.billing,
      plan: normalizedPlan,
    };
    refreshSidebarBillingStatus();
    if (State.currentPage === 'dashboard' && typeof renderPage === 'function') {
      renderPage('dashboard');
    }
  } finally {
    clearBillingActionLoading();
  }

  openBillingStatusModal('plans');
}

async function callBillingFunction(functionName, payload = {}) {
  const { data } = await DB.client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Please sign in again before managing workspace billing.');
  }

  const response = await fetch(`${RuntimeConfig.supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: RuntimeConfig.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || result?.message || `Billing request failed (${response.status}).`);
  }

  return result || {};
}

async function startWorkspaceSubscriptionCheckout(plan) {
  const normalizedPlan = plan === 'yearly' ? 'yearly' : 'monthly';
  const action = `subscribe-${normalizedPlan}`;
  const role = String(State.currentProfile?.role || '').toLowerCase();
  if (!isPlatformAdminUser() && role !== 'admin') {
    throw new Error('Only a family admin can start workspace billing.');
  }

  setBillingActionLoading(action);
  const launchWindow = prepareBillingLaunchWindow();
  try {
    const result = await callBillingFunction('paystack-subscribe', { plan: normalizedPlan });
    if (result?.family) {
      State.billing = deriveBillingState(result.family);
      refreshSidebarBillingStatus();
    }

    if (!result?.authorization_url) {
      throw new Error('Billing checkout could not be opened right now.');
    }

    openBillingDestination(result.authorization_url, launchWindow);
    clearBillingActionLoading();
  } catch (error) {
    if (launchWindow && !launchWindow.closed) {
      launchWindow.close();
    }
    clearBillingActionLoading();
    throw error;
  }
}

async function startWorkspaceBillingPortal() {
  const role = String(State.currentProfile?.role || '').toLowerCase();
  if (!isPlatformAdminUser() && role !== 'admin') {
    throw new Error('Only a family admin can manage workspace billing.');
  }

  setBillingActionLoading('manage-subscription');
  const launchWindow = prepareBillingLaunchWindow();
  try {
    const result = await callBillingFunction('paystack-manage-subscription');
    if (!result?.manage_url) {
      throw new Error('Subscription management could not be opened right now.');
    }

    openBillingDestination(result.manage_url, launchWindow);
    clearBillingActionLoading();
  } catch (error) {
    if (launchWindow && !launchWindow.closed) {
      launchWindow.close();
    }
    clearBillingActionLoading();
    throw error;
  }
}

function clearBillingReturnParams() {
  const url = new URL(window.location.href);
  let changed = false;
  ['billing', 'reference', 'trxref'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (changed) {
    window.history.replaceState({}, '', url.toString());
  }
}

async function handleBillingReturnParams() {
  clearBillingActionLoading();
  const url = new URL(window.location.href);
  const billingState = String(url.searchParams.get('billing') || '').toLowerCase();
  const reference = url.searchParams.get('reference') || url.searchParams.get('trxref') || '';

  if (!billingState) return false;

  if (billingState !== 'success') {
    State.billingManagementNotice = 'Billing checkout was not completed.';
    clearBillingReturnParams();
    window.setTimeout(() => openProfileCenter('billing'), 120);
    return true;
  }

  if (!reference) {
    State.billingManagementNotice = 'Billing returned without a payment reference. Please retry if needed.';
    clearBillingReturnParams();
    window.setTimeout(() => openProfileCenter('billing'), 120);
    return true;
  }

  try {
    const result = await callBillingFunction('paystack-verify-return', { reference });
    if (result?.family) {
      State.billing = deriveBillingState(result.family);
      refreshSidebarBillingStatus();
      State.billingPromptShown = false;
      State.billingBannerOverride = false;
    }
    State.billingManagementNotice = result?.message || 'Workspace subscription payment confirmed.';
  } catch (error) {
    State.billingManagementNotice = error?.message || 'Payment verification did not complete yet. Please refresh shortly.';
  } finally {
    clearBillingReturnParams();
    if (State.currentPage === 'dashboard' && typeof renderPage === 'function') {
      renderPage('dashboard');
    }
    window.setTimeout(() => openProfileCenter('billing'), 120);
  }

  return true;
}

function openBillingStatusModal(initialSection = 'overview') {
  const billing = State.billing || deriveBillingState();
  const planLabel = billingPlanLabel(billing.plan);
  const statusLabel = billingStatusLabel(billing.status);
  const trialEndsLabel = billingDateLabel(billing.trialEndsAt);
  const renewsLabel = billingDateLabel(billing.subscriptionEndsAt);
  const amountLabel = billing.plan === 'yearly' ? 'KES 1,000 / year' : 'KES 100 / month';
  const scholarshipEndsLabel = billingDateLabel(billing.scholarshipEndsAt);
  const yearlySelected = billing.plan === 'yearly';
  const monthlySelected = !yearlySelected;
  const canManagePlan = isPlatformAdminUser() || String(State.currentProfile?.role || '').toLowerCase() === 'admin';
  const hasManagedSubscription = hasManagedBillingSubscription(billing);
  const canStartCheckout = canManagePlan && !hasManagedSubscription && billing.accessSource !== 'scholarship';
  const summaryLine = billing.accessSource === 'scholarship'
    ? `This workspace is active through a scholarship${scholarshipEndsLabel ? ` until ${scholarshipEndsLabel}` : ''}.`
    : billing.access === 'trialing'
      ? `Your workspace is on a 7-day trial${trialEndsLabel ? ` through ${trialEndsLabel}` : ''}.`
      : billing.status === 'cancelled' && billing.access === 'active'
        ? `This subscription has been cancelled and stays active${renewsLabel ? ` until ${renewsLabel}` : ' until the current paid period ends'}.`
      : billing.access === 'restricted'
        ? 'Your workspace is currently restricted to read-only pages until billing is renewed.'
        : 'Your workspace billing is active.';
  const planIntro = initialSection === 'plans'
    ? 'Choose the workspace plan you want to use for this family workspace.'
    : summaryLine;

  Modal.open('Workspace Billing', `
    <div class="account-center-content">
      <div class="account-center-hero ai-amber">
        <div class="account-center-hero-title">${statusLabel} Workspace</div>
        <div class="account-center-hero-copy">${planIntro}</div>
      </div>
      <div class="account-center-grid">
        <div class="card">
          <div class="card-title">Current Billing</div>
          <div class="details-grid">
            <div><div class="details-label">Plan</div><div class="details-value">${escapeHtml(planLabel)}</div></div>
            <div><div class="details-label">Billing Currency</div><div class="details-value">${escapeHtml(billing.currency)}</div></div>
            <div><div class="details-label">Current Price</div><div class="details-value">${amountLabel}</div></div>
            <div><div class="details-label">Status</div><div class="details-value">${escapeHtml(statusLabel)}</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">What Happens Next</div>
          <div class="account-center-list">
            <div>Monthly billing will be KES 100. Yearly billing will be KES 1,000.</div>
            <div>New workspaces start with a 7-day free trial.</div>
            <div>Starting billing opens a secure checkout page in a new tab.</div>
            <div>If billing lapses, core pages stay available in read-only mode until full access is restored.</div>
          </div>
        </div>
      </div>
      <div class="billing-plan-grid">
        <div class="billing-plan-card ${monthlySelected ? 'is-selected' : ''}">
          <div class="billing-plan-tag">Monthly</div>
          <div class="billing-plan-price">KES 100 <span>/ month</span></div>
          <div class="billing-plan-copy">Flexible month-to-month billing after the 7-day trial ends.</div>
          <div class="billing-plan-list">
            <div>Good for families starting with lighter usage</div>
            <div>One shared workspace subscription</div>
          </div>
          ${canStartCheckout
            ? billingActionButton({
              label: 'Subscribe monthly',
              loadingLabel: 'Redirecting...',
              action: 'subscribe-monthly',
              cls: 'btn btn-primary',
              onclick: "startWorkspaceSubscriptionCheckout('monthly').catch((error) => alert(error?.message || 'Unable to start monthly billing.'))",
            })
            : canManagePlan
              ? billingActionButton({
                label: monthlySelected ? 'Current plan' : 'Choose monthly',
                loadingLabel: 'Saving...',
                action: 'choose-plan-monthly',
                cls: `btn ${monthlySelected ? 'btn-secondary' : 'btn-primary'}`,
                onclick: "saveWorkspaceBillingPlan('monthly')",
              })
              : ''}
        </div>
        <div class="billing-plan-card is-recommended ${yearlySelected ? 'is-selected' : ''}">
          <div class="billing-plan-tag">Recommended</div>
          <div class="billing-plan-price">KES 1,000 <span>/ year</span></div>
          <div class="billing-plan-copy">Best value for active families that use the workspace throughout the year.</div>
          <div class="billing-plan-list">
            <div>Save KES 200 compared with paying monthly for a full year</div>
            <div>Fewer billing interruptions for the family team</div>
          </div>
          ${canStartCheckout
            ? billingActionButton({
              label: 'Subscribe yearly',
              loadingLabel: 'Redirecting...',
              action: 'subscribe-yearly',
              cls: 'btn btn-primary',
              onclick: "startWorkspaceSubscriptionCheckout('yearly').catch((error) => alert(error?.message || 'Unable to start yearly billing.'))",
            })
            : canManagePlan
              ? billingActionButton({
                label: yearlySelected ? 'Current plan' : 'Choose yearly',
                loadingLabel: 'Saving...',
                action: 'choose-plan-yearly',
                cls: `btn ${yearlySelected ? 'btn-secondary' : 'btn-primary'}`,
                onclick: "saveWorkspaceBillingPlan('yearly')",
              })
              : ''}
        </div>
      </div>
      ${billing.accessSource === 'scholarship' ? `
        <div class="card">
          <div class="card-title">Scholarship Override</div>
          <div class="details-grid">
            <div><div class="details-label">Access Source</div><div class="details-value">Scholarship</div></div>
            <div><div class="details-label">Scholarship Ends</div><div class="details-value">${escapeHtml(scholarshipEndsLabel || 'Open-ended')}</div></div>
          </div>
          ${billing.scholarshipNote ? `<div class="account-center-copy" style="margin-top:10px;">${escapeHtml(billing.scholarshipNote)}</div>` : ''}
        </div>
      ` : ''}
      <div class="card">
        <div class="card-title">Dates</div>
        <div class="details-grid">
          <div><div class="details-label">Trial Ends</div><div class="details-value">${escapeHtml(trialEndsLabel || 'Not set')}</div></div>
          <div><div class="details-label">Subscription Ends</div><div class="details-value">${escapeHtml(renewsLabel || 'Not set')}</div></div>
        </div>
      </div>
    </div>
  `, [
    { label: 'Close', cls: 'btn', fn: () => Modal.close() },
  ]);
}

async function fetchFamilyWorkspaceSnapshot(familyId) {
  const billingFields = 'name,billing_status,billing_plan,billing_currency,billing_country,trial_started_at,trial_ends_at,subscription_started_at,subscription_ends_at,scholarship_active,scholarship_started_at,scholarship_ends_at,scholarship_note';
  let { data, error } = await DB.client
    .from('families')
    .select(billingFields)
    .eq('id', familyId)
    .single();

  if (error && /(billing_|scholarship_)/i.test(error.message || '')) {
    ({ data, error } = await DB.client
      .from('families')
      .select('name')
      .eq('id', familyId)
      .single());
  }

  if (error) {
    console.warn('[App] Failed to load family billing snapshot:', error);
    return null;
  }

  return data || null;
}

async function hydrateFamily(profile, user) {
  State.currentProfile = profile;
  State.currentFamilyId = profile.family_id;
  await loadPlatformAdminStatus();
  Sidebar.render();
  setSidebarIdentity(profile, user);
  Sidebar.updateSectionIndicator('announcements', 0);
  Sidebar.updateSectionIndicator('tasks', 0);
  Sidebar.updateSectionIndicator('meetings', false);
  Sidebar.updateSectionIndicator('goals', false);
  Sidebar.updateSectionIndicator('ai', false);
  clearAuthModeParam();
  refreshSidebarBillingStatus();

  if (!State.currentFamilyId) {
    State.billing = deriveBillingState();
    refreshSidebarBillingStatus();
    showFamilySetup();
    return;
  }

  const family = await fetchFamilyWorkspaceSnapshot(State.currentFamilyId);
  State.billing = deriveBillingState(family || {});
  refreshSidebarBillingStatus();

  if (family?.name) {
    document.getElementById('sb-family-name').textContent = family.name;
    document.getElementById('sb-logo-text').textContent = family.name.substring(0, 2).toUpperCase();
  }

  Modal.close();
  show('app');
  Router.go(Router.restore());
  await handleBillingReturnParams();
  if (State.billing.access === 'restricted' && !State.billingPromptShown) {
    State.billingPromptShown = true;
    State.billingBannerOverride = true;
    window.setTimeout(() => openBillingStatusModal('plans'), 180);
  }
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

    if (profile.is_active === false) {
      await handleInactiveAccount();
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
  State.billing = deriveBillingState();
  State.billingUi = { isLoading: false, action: '' };
  State.billingPromptShown = false;
  State.billingBannerOverride = false;
  State.isPlatformAdmin = false;
  State.adminSnapshot = { tickets: [], families: [], users: [] };
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
    Auth.initFromLocation();

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
