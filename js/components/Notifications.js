/**
 * js/components/Notifications.js
 * Lightweight topbar notifications for general and personal updates.
 */

const Notifications = {
  items: [],

  buttonHtml() {
    const count = State.unreadNotifications > 99 ? '99+' : String(State.unreadNotifications || '');
    return `
      <button class="btn-icon notif-btn" onclick="Notifications.open()" title="Notifications" aria-label="Notifications">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2.2a3.2 3.2 0 0 0-3.2 3.2v1.3c0 .8-.2 1.6-.7 2.3L3 10.5h10l-1.1-1.5a4 4 0 0 1-.7-2.3V5.4A3.2 3.2 0 0 0 8 2.2z"/>
          <path d="M6.3 12.2a1.9 1.9 0 0 0 3.4 0"/>
        </svg>
        <span id="topbar-notification-badge" class="topbar-badge" style="${count ? '' : 'display:none;'}">${count}</span>
      </button>`;
  },

  updateBadge(count) {
    State.unreadNotifications = Number(count || 0);
    const badge = document.getElementById('topbar-notification-badge');
    if (!badge) return;

    if (State.unreadNotifications > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = State.unreadNotifications > 99 ? '99+' : String(State.unreadNotifications);
      return;
    }

    badge.style.display = 'none';
    badge.textContent = '';
  },

  async refreshBadge() {
    if (!State.uid || !State.fid || !DB.client) {
      this.updateBadge(0);
      return;
    }

    const { count, error } = await DB.client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', State.uid)
      .eq('read', false);

    if (error) {
      console.warn('[Notifications] Failed to refresh badge:', error);
      return;
    }

    this.updateBadge(count || 0);
  },

  async load() {
    if (!State.uid || !DB.client) {
      this.items = [];
      return [];
    }

    const { data, error } = await DB.client
      .from('notifications')
      .select('id,title,message,type,entity_type,entity_id,read,created_at')
      .eq('user_id', State.uid)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[Notifications] Failed to load notifications:', error);
      this.items = [];
      return [];
    }

    this.items = data || [];
    return this.items;
  },

  modalBody() {
    if (!this.items.length) {
      return empty('No notifications yet');
    }

    return `
      <div class="notif-list">
        ${this.items.map((item) => `
          <button class="notif-item ${item.read ? '' : 'notif-item-unread'}" onclick="Notifications.openNotificationTarget('${item.id}')">
            <div class="notif-head">
              <div class="notif-title-row">
                <span class="notif-dot notif-dot-${escapeHtml(item.type || 'info')}"></span>
                <span class="notif-title">${escapeHtml(item.title || 'Notification')}</span>
              </div>
              <span class="notif-time">${ago(item.created_at)}</span>
            </div>
            <div class="notif-message">${escapeHtml(item.message || '')}</div>
          </button>`).join('')}
      </div>`;
  },

  async open() {
    await this.load();
    Modal.open('Notifications', this.modalBody(), [
      this.items.some((item) => !item.read)
        ? { label: 'Mark All Read', cls: 'btn', fn: async () => this.markAllRead() }
        : null,
    ].filter(Boolean));
  },

  routeFor(notification) {
    const map = {
      announcement: 'announcements',
      task: 'tasks',
    };
    return map[notification?.entity_type] || '';
  },

  async markRead(notificationId) {
    const { error } = await DB.client
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', State.uid);

    if (error) {
      console.warn('[Notifications] Failed to mark notification read:', error);
      return false;
    }

    const item = this.items.find((entry) => entry.id === notificationId);
    if (item) item.read = true;
    await this.refreshBadge();
    return true;
  },

  async markAllRead() {
    const { error } = await DB.client
      .from('notifications')
      .update({ read: true })
      .eq('user_id', State.uid)
      .eq('read', false);

    if (error) {
      console.warn('[Notifications] Failed to mark all read:', error);
      return;
    }

    this.items = this.items.map((item) => ({ ...item, read: true }));
    await this.refreshBadge();
    Modal.open('Notifications', this.modalBody(), []);
  },

  async openNotificationTarget(notificationId) {
    const notification = this.items.find((item) => item.id === notificationId);
    if (!notification) return;

    if (!notification.read) {
      await this.markRead(notificationId);
    }

    Modal.close();
    const route = this.routeFor(notification);
    if (route) nav(route);
  },

  async insert(rows) {
    const payload = (rows || []).filter((row) => row?.user_id && row.user_id !== State.uid);
    if (!payload.length) return;

    const { error } = await DB.client.from('notifications').insert(payload);
    if (error) {
      console.warn('[Notifications] Failed to create notifications:', error);
      return;
    }

    if (payload.some((row) => row.user_id === State.uid)) {
      await this.refreshBadge();
    }
  },

  async notifyUsers(userIds, payload) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !State.fid) return;

    await this.insert(ids.map((userId) => ({
      user_id: userId,
      family_id: State.fid,
      title: payload.title,
      message: payload.message,
      type: payload.type || 'info',
      entity_type: payload.entity_type || null,
      entity_id: payload.entity_id || null,
      read: false,
    })));
  },

  async notifyTaskAssignment(task, previousAssignedUser = '') {
    const assignedUser = task?.assigned_user || '';
    if (!assignedUser || assignedUser === State.uid || assignedUser === previousAssignedUser) return;

    const projectName = task.project_id ? (TasksPage.projectsById[task.project_id]?.name || 'a project') : 'family operations';
    await this.notifyUsers([assignedUser], {
      title: 'Task assigned to you',
      message: `${task.title} was assigned to you${projectName ? ` in ${projectName}` : ''}.`,
      type: 'info',
      entity_type: 'task',
      entity_id: task.id,
    });
  },

  async notifyAnnouncementCreated(title, announcementId) {
    if (!State.fid || !State.uid) return;

    const { data, error } = await DB.client
      .from('users')
      .select('id')
      .eq('family_id', State.fid)
      .neq('id', State.uid);

    if (error) {
      console.warn('[Notifications] Failed to find announcement recipients:', error);
      return;
    }

    await this.notifyUsers((data || []).map((user) => user.id), {
      title: 'New announcement',
      message: title,
      type: 'info',
      entity_type: 'announcement',
      entity_id: announcementId,
    });
  },
};
