/**
 * js/components/Sidebar.js
 * ─────────────────────────────────────────────────────
 * Renders the sidebar navigation and manages the
 * open/close state for the mobile drawer.
 *
 * To add a new page:
 *   1. Add a nav item entry to ITEMS below.
 *   2. Create js/pages/yourpage.js.
 *   3. Add a <script> tag in index.html.
 */

const NAV_ITEMS = [
  { section: 'Main' },
  { page: 'dashboard',     label: 'Dashboard',     icon: '<rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>' },
  { page: 'members',       label: 'Members',        icon: '<circle cx="6" cy="5" r="3"/><path d="M0 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="13" cy="4" r="2"/><path d="M11 11c.3-.8 1.1-1.4 2-1.4s1.7.6 2 1.4"/>' },
  { page: 'announcements', label: 'Announcements',  icon: '<circle cx="8" cy="8" r="7"/><path d="M8 5v3m0 2v1" stroke="currentColor" stroke-width="1.5" fill="none"/>' },

  { section: 'Finance' },
  { page: 'finance',       label: 'Finance',        icon: '<rect x="2" y="4" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 9h4" stroke="currentColor" stroke-width="1.5"/>' },
  { page: 'contributions', label: 'Contributions',  icon: '<path d="M8 1v14m-4-4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'expenses',      label: 'Expenses',       icon: '<path d="M8 15V1m-4 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'schoolfees',    label: 'School Fees',    icon: '<path d="M2 5l6-3 6 3v2L8 10 2 7V5zm0 4l6 3 6-3" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'emergency',     label: 'Emergency Fund', icon: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5M8 10v1" stroke="currentColor" stroke-width="1.5"/>' },

  { section: 'Operations' },
  { page: 'projects',      label: 'Projects',       icon: '<rect x="1" y="1" width="6" height="9" rx="1"/><rect x="9" y="6" width="6" height="9" rx="1"/>' },
  { page: 'farming',       label: 'Farm Manager',   icon: '<path d="M2 14s1-5 6-6c0 0 1-5 6-6-1 6-5 7-5 7s0 3-7 5z"/>' },
  { page: 'tasks',         label: 'Tasks',          icon: '<path d="M2 3h12M2 7h8m-8 4h10m-10 4h5" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'assets',        label: 'Assets',         icon: '<path d="M1 11l4-8 3 6 2-3 5 5" stroke="currentColor" stroke-width="1.5" fill="none"/>' },

  { section: 'Community' },
  { page: 'directory',     label: 'Directory',      icon: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'meetings',      label: 'Meetings',       icon: '<rect x="1" y="3" width="14" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 1v3m6-3v3m-8 4h10" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'goals',         label: 'Family Goals',   icon: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
  { page: 'vault',         label: 'Vault',          icon: '<rect x="1" y="3" width="14" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 3V1m6 2V1m-9 5h12" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'reports',       label: 'Reports',        icon: '<path d="M3 14V6l4-4h6v12H3zm4-11v4H4" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
  { page: 'ai',            label: 'AI Advisor',     icon: '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2" stroke="currentColor" stroke-width="1.5" fill="none"/>' },
];

const Sidebar = {
  /** Inject the full sidebar HTML into <aside id="sidebar">. */
  render() {
    const items = NAV_ITEMS.map(item => {
      if (item.section) {
        return `<div class="sb-section">${item.section}</div>`;
      }
      return `
        <div class="sb-item" data-page="${item.page}" onclick="nav('${item.page}')">
          <svg viewBox="0 0 16 16" fill="currentColor">${item.icon}</svg>
          ${item.label}
        </div>`;
    }).join('');

    document.getElementById('sidebar').innerHTML = `
      <div class="sb-header">
        <div class="sb-logo">
          <div class="sb-logo-icon" id="sb-logo-text">F</div>
          <div>
            <div class="sb-family" id="sb-family-name">Family</div>
            <div class="sb-sub">Family Workspace</div>
          </div>
        </div>
      </div>
      <nav class="sb-nav">${items}</nav>
      <div class="sb-footer">
        <div class="user-pill">
          <div class="avatar av-md av-blue" id="sb-avatar">P</div>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                 id="sb-username">Loading...</div>
            <div style="font-size:11px;color:var(--text3);" id="sb-role">member</div>
          </div>
          <button class="btn-icon" style="margin-left:auto;"
                  onclick="event.stopPropagation();toggleTheme()" title="Toggle dark mode">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM8 13A5 5 0 118 3v10z"/>
            </svg>
          </button>
        </div>
        <button class="btn btn-sm" style="width:100%;margin-top:8px;" onclick="Auth.signOut()">Sign Out</button>
      </div>`;
  },

  toggle() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sb-overlay').classList.toggle('open');
  },

  close() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sb-overlay').classList.remove('open');
  },
};
