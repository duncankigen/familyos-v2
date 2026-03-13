/**
 * js/pages/announcements.js
 */

async function renderAnnouncements() {
  setTopbar('Announcements', `<button class="btn btn-primary btn-sm" onclick="openAddAnnouncement()">+ Post</button>`);
  const { data } = await DB.client
    .from('announcements')
    .select('*,users(full_name)')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="flex-col">
        ${(data || []).map(a => `
          <div class="card">
            <div class="flex gap8 mb8">
              ${avatarHtml(a.users?.full_name || 'A', 'av-sm')}
              <div>
                <div style="font-size:13px;font-weight:600;">${a.users?.full_name || 'Admin'}</div>
                <div style="font-size:11px;color:var(--text3);">${ago(a.created_at)}</div>
              </div>
            </div>
            <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${a.title}</div>
            <div style="font-size:13px;color:var(--text2);line-height:1.6;">${a.message}</div>
          </div>`).join('')}
        ${!(data || []).length ? `<div class="card">${empty('No announcements yet')}</div>` : ''}
      </div>
    </div>`;
}

function openAddAnnouncement() {
  Modal.open('Post Announcement', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input id="ann-title" class="form-input" placeholder="Announcement title"/>
    </div>
    <div class="form-group">
      <label class="form-label">Message</label>
      <textarea id="ann-msg" class="form-textarea" placeholder="Write your message..."></textarea>
    </div>
  `, [{ label: 'Post', cls: 'btn-primary', fn: async () => {
    const title   = document.getElementById('ann-title').value.trim();
    const message = document.getElementById('ann-msg').value.trim();
    if (!title || !message) return;
    await DB.client.from('announcements').insert({
      family_id: State.fid, title, message, created_by: State.uid,
    });
    Modal.close();
    renderPage('announcements');
  }}]);
}

Router.register('announcements', renderAnnouncements);
