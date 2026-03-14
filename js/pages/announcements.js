/**
 * js/pages/announcements.js
 * Managed family announcements with lightweight pinning.
 */

const ANNOUNCEMENT_POST_ROLES = ['admin', 'treasurer', 'project_manager'];

const AnnouncementsPage = {
  items: [],
  loadError: '',
  openMenuId: null,
  menuDismissBound: false,

  canPost() {
    return ANNOUNCEMENT_POST_ROLES.includes(State.currentProfile?.role);
  },

  canManage(announcement) {
    return State.currentProfile?.role === 'admin' || announcement?.created_by === State.uid;
  },

  get(announcementId) {
    return this.items.find((item) => item.id === announcementId) || null;
  },

  closeMenu() {
    if (!this.openMenuId) return;
    this.openMenuId = null;
    renderAnnouncementsView();
  },

  bindMenuDismiss() {
    if (this.menuDismissBound) return;

    document.addEventListener('click', (event) => {
      if (State.currentPage !== 'announcements' || !this.openMenuId) return;
      if (event.target.closest('.ann-menu')) return;
      this.closeMenu();
    });

    this.menuDismissBound = true;
  },
};

function announcementErrorMessage(error) {
  const message = error?.message || 'Unable to load announcements right now.';
  if (
    message.includes('is_pinned') ||
    message.includes('is_archived') ||
    message.includes('updated_at') ||
    message.includes('archived_at') ||
    message.includes('archived_by')
  ) {
    return 'Announcements need the latest database update. Run supabase/announcements_upgrade.sql in Supabase SQL Editor, then refresh.';
  }
  return message;
}

function announcementMenuButton(icon, label, handler, danger = false) {
  return `
    <button class="ann-menu-item ${danger ? 'ann-menu-item-danger' : ''}" onclick="${handler}">
      ${icon}
      <span>${label}</span>
    </button>`;
}

function renderAnnouncementMenu(announcement) {
  if (!AnnouncementsPage.canManage(announcement)) return '';

  const isOpen = AnnouncementsPage.openMenuId === announcement.id;
  const pinLabel = announcement.is_pinned ? 'Unpin Announcement' : 'Pin Announcement';
  const pinHandler = `toggleAnnouncementPinned('${announcement.id}', ${announcement.is_pinned ? 'false' : 'true'});`;

  return `
    <div class="ann-menu" onclick="event.stopPropagation()">
      <button class="btn-icon ann-menu-toggle" onclick="toggleAnnouncementMenu('${announcement.id}');event.stopPropagation();" title="Manage announcement">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.3"></circle>
          <circle cx="8" cy="8" r="1.3"></circle>
          <circle cx="13" cy="8" r="1.3"></circle>
        </svg>
      </button>
      ${isOpen ? `
        <div class="ann-menu-pop">
          ${announcementMenuButton(
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.8 2.2a1.7 1.7 0 1 1 2.4 2.4L6 12.8l-3 1 1-3 7.8-8.6z"/></svg>',
            'Edit Announcement',
            `openEditAnnouncement('${announcement.id}');`
          )}
          ${announcementMenuButton(
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5l2.1 4.1 4.4.6-3.2 3.1.7 4.3L8 11.6 4 13.6l.7-4.3L1.5 6.2l4.4-.6L8 1.5z"/></svg>',
            pinLabel,
            pinHandler
          )}
          ${announcementMenuButton(
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2.5h4V4m-5 0v8.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4M6.5 7.2v3.8m3-3.8v3.8"/></svg>',
            'Archive Announcement',
            `archiveAnnouncement('${announcement.id}');`,
            true
          )}
        </div>` : ''}
    </div>`;
}

function renderAnnouncementsView() {
  const content = document.getElementById('page-content');

  if (AnnouncementsPage.loadError) {
    content.innerHTML = `
      <div class="content">
        <div class="card">
          <div class="card-title">Announcements unavailable</div>
          <p style="font-size:13px;color:var(--text2);line-height:1.6;">${AnnouncementsPage.loadError}</p>
        </div>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="content">
      <div class="flex-col">
        ${AnnouncementsPage.items.map((announcement) => `
          <div class="card">
            <div class="flex-between mb8" style="align-items:flex-start;gap:12px;">
              <div style="font-size:11px;font-weight:600;color:var(--accent);display:flex;align-items:center;gap:6px;">
                ${announcementIcon(12)}
                <span>${announcement.author?.full_name || 'Admin'} · ${ago(announcement.created_at)}</span>
              </div>
              ${renderAnnouncementMenu(announcement)}
            </div>
            <div style="display:flex;align-items:flex-start;gap:10px;">
              <div style="color:var(--accent);display:flex;align-items:center;justify-content:center;margin-top:2px;">
                ${announcementIcon(18)}
              </div>
              <div style="min-width:0;flex:1;">
                <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${announcement.title}</div>
                <div class="ann-flags" style="margin-bottom:8px;">
                  ${announcement.is_pinned ? '<span class="badge b-amber">Pinned</span>' : ''}
                  ${(announcement.updated_at && announcement.updated_at !== announcement.created_at)
                    ? `<span class="ann-meta">Edited ${ago(announcement.updated_at)}</span>`
                    : ''}
                </div>
                <div style="font-size:13px;color:var(--text2);line-height:1.6;white-space:pre-wrap;">${announcement.message}</div>
              </div>
            </div>
          </div>`).join('')}
        ${!AnnouncementsPage.items.length ? `<div class="card">${empty('No announcements yet')}</div>` : ''}
      </div>
    </div>`;
}

async function markAnnouncementsSeen() {
  if (!State.uid || !State.currentProfile) return;

  const seenAt = new Date().toISOString();
  const { error } = await DB.client
    .from('users')
    .update({ last_announcements_seen_at: seenAt })
    .eq('id', State.uid);

  if (error) {
    console.warn('[Announcements] Failed to mark announcements as seen:', error);
    return;
  }

  State.currentProfile.last_announcements_seen_at = seenAt;
  Sidebar.updateAnnouncementBadge(0);
}

async function renderAnnouncements() {
  AnnouncementsPage.bindMenuDismiss();
  AnnouncementsPage.openMenuId = null;
  AnnouncementsPage.loadError = '';

  setTopbar(
    'Announcements',
    AnnouncementsPage.canPost()
      ? `<button class="btn btn-primary btn-sm" onclick="openAddAnnouncement()">+ Post</button>`
      : ''
  );

  const { data, error } = await DB.client
    .from('announcements')
    .select(`
      id,
      family_id,
      title,
      message,
      created_by,
      created_at,
      updated_at,
      is_pinned,
      is_archived,
      author:users!announcements_created_by_fkey(full_name)
    `)
    .eq('family_id', State.fid)
    .eq('is_archived', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Announcements] Failed to load:', error);
    AnnouncementsPage.items = [];
    AnnouncementsPage.loadError = announcementErrorMessage(error);
    renderAnnouncementsView();
    return;
  }

  AnnouncementsPage.items = data || [];
  renderAnnouncementsView();
  markAnnouncementsSeen();
}

function toggleAnnouncementMenu(announcementId) {
  AnnouncementsPage.openMenuId = AnnouncementsPage.openMenuId === announcementId ? null : announcementId;
  renderAnnouncementsView();
}

function openAddAnnouncement() {
  if (!AnnouncementsPage.canPost()) {
    alert('Only admins, treasurers, and project managers can post announcements.');
    return;
  }

  AnnouncementsPage.closeMenu();
  Modal.open('Post Announcement', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input id="ann-title" class="form-input" placeholder="Announcement title"/>
    </div>
    <div class="form-group">
      <label class="form-label">Message</label>
      <textarea id="ann-msg" class="form-textarea" placeholder="Write your message..."></textarea>
    </div>
    <p id="announcement-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Post', cls: 'btn-primary', fn: () => saveAnnouncement() }]);
}

function openEditAnnouncement(announcementId) {
  const announcement = AnnouncementsPage.get(announcementId);
  if (!announcement || !AnnouncementsPage.canManage(announcement)) return;

  AnnouncementsPage.closeMenu();
  Modal.open('Edit Announcement', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input id="ann-title" class="form-input" value="${announcement.title}" />
    </div>
    <div class="form-group">
      <label class="form-label">Message</label>
      <textarea id="ann-msg" class="form-textarea">${announcement.message}</textarea>
    </div>
    <p id="announcement-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save Changes', cls: 'btn-primary', fn: () => saveAnnouncement(announcementId) }]);
}

async function saveAnnouncement(announcementId = null) {
  hideErr('announcement-err');

  const title = document.getElementById('ann-title')?.value.trim() || '';
  const message = document.getElementById('ann-msg')?.value.trim() || '';
  if (!title || !message) {
    showErr('announcement-err', 'Add both a title and a message.');
    return;
  }

  const now = new Date().toISOString();
  let error = null;

  if (announcementId) {
    const announcement = AnnouncementsPage.get(announcementId);
    if (!announcement || !AnnouncementsPage.canManage(announcement)) {
      showErr('announcement-err', 'You do not have permission to edit this announcement.');
      return;
    }

    ({ error } = await DB.client
      .from('announcements')
      .update({ title, message, updated_at: now })
      .eq('id', announcementId));
  } else {
    if (!AnnouncementsPage.canPost()) {
      showErr('announcement-err', 'You do not have permission to post announcements.');
      return;
    }

    ({ error } = await DB.client.from('announcements').insert({
      family_id: State.fid,
      title,
      message,
      created_by: State.uid,
      updated_at: now,
    }));
  }

  if (error) {
    showErr('announcement-err', announcementErrorMessage(error));
    return;
  }

  Modal.close();
  renderPage('announcements');
}

async function toggleAnnouncementPinned(announcementId, nextPinned) {
  const announcement = AnnouncementsPage.get(announcementId);
  if (!announcement || !AnnouncementsPage.canManage(announcement)) return;

  AnnouncementsPage.closeMenu();
  const { error } = await DB.client
    .from('announcements')
    .update({
      is_pinned: nextPinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', announcementId);

  if (error) {
    alert(announcementErrorMessage(error));
    return;
  }

  renderPage('announcements');
}

async function archiveAnnouncement(announcementId) {
  const announcement = AnnouncementsPage.get(announcementId);
  if (!announcement || !AnnouncementsPage.canManage(announcement)) return;

  if (!confirm(`Archive "${announcement.title}"?`)) return;

  AnnouncementsPage.closeMenu();
  const now = new Date().toISOString();
  const { error } = await DB.client
    .from('announcements')
    .update({
      is_archived: true,
      is_pinned: false,
      archived_at: now,
      archived_by: State.uid,
      updated_at: now,
    })
    .eq('id', announcementId);

  if (error) {
    alert(announcementErrorMessage(error));
    return;
  }

  renderPage('announcements');
}

Router.register('announcements', renderAnnouncements);
