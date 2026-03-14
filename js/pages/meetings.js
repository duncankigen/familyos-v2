/**
 * js/pages/meetings.js
 * ─────────────────────────────────────────────────────
 * Family meetings: schedule, minutes, votes.
 */

async function renderMeetings() {
  setTopbar('Meetings', `<button class="btn btn-primary btn-sm" onclick="openAddMeeting()">+ Schedule Meeting</button>`);
  const sb = DB.client;

  const [{ data: meetings }, { data: votes }] = await Promise.all([
    sb.from('meetings').select('*').eq('family_id', State.fid).order('meeting_date', { ascending: false }),
    sb.from('votes').select('*,vote_responses(*)').eq('family_id', State.fid).eq('status', 'open').order('created_at', { ascending: false }),
  ]);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g2 mb16">

        <!-- Meetings list -->
        <div class="card">
          <div class="card-title">Meetings</div>
          <div class="flex-col">
            ${(meetings || []).map(m => `
              <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);">
                <div class="flex-between mb8">
                  <span style="font-size:14px;font-weight:700;">${m.title}</span>
                  ${statusBadge(m.status)}
                </div>
                <div style="font-size:12px;color:var(--text2);">📅 ${fmtDate(m.meeting_date)} ${m.location ? '· 📍 ' + m.location : ''}</div>
                ${m.agenda  ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;">Agenda: ${m.agenda.substring(0, 80)}${m.agenda.length > 80 ? '...' : ''}</div>` : ''}
                ${m.minutes ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">Minutes available ✓</div>` : ''}
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button class="btn btn-sm" onclick="openAddVote('${m.id}')">+ Vote</button>
                  <button class="btn btn-sm" onclick="openAddMinutes('${m.id}', \`${(m.minutes || '').replace(/`/g,"'")}\`)">📝 Minutes</button>
                </div>
              </div>`).join('')}
            ${!(meetings || []).length ? empty('No meetings scheduled') : ''}
          </div>
        </div>

        <!-- Active votes -->
        <div class="card">
          <div class="card-title">Active Votes</div>
          <div class="flex-col">
            ${(votes || []).map(v => {
              const responses = v.vote_responses || [];
              const yes = responses.filter(r => r.response === 'yes').length;
              const no  = responses.filter(r => r.response === 'no').length;
              const total = responses.length;
              return `
                <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);">
                  <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${v.question}</div>
                  <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
                    ✅ ${yes} Yes  &nbsp; ❌ ${no} No  &nbsp; 📊 ${total} votes
                  </div>
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm" style="background:var(--success-bg);color:var(--success);" onclick="castVote('${v.id}','yes')">✅ Yes</button>
                    <button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);"   onclick="castVote('${v.id}','no')">❌ No</button>
                    <button class="btn btn-sm" onclick="castVote('${v.id}','abstain')">Abstain</button>
                  </div>
                </div>`;
            }).join('')}
            ${!(votes || []).length ? empty('No open votes') : ''}
          </div>
        </div>
      </div>
    </div>`;

  Sidebar.markSectionSeen('meetings').catch((error) => {
    console.warn('[Meetings] Failed to mark meetings as seen:', error);
  });
}

function openAddMeeting() {
  Modal.open('Schedule Meeting', `
    <div class="form-group"><label class="form-label">Meeting Title</label>
      <input id="m-title" class="form-input" placeholder="Annual General Meeting 2025"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date</label>
        <input id="m-date" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">Location</label>
        <input id="m-loc" class="form-input" placeholder="Otieno homestead, Kitale"/></div>
    </div>
    <div class="form-group"><label class="form-label">Agenda</label>
      <textarea id="m-agenda" class="form-textarea" placeholder="1. Reports\n2. Elections\n3. AOB"></textarea></div>
  `, [{ label: 'Schedule', cls: 'btn-primary', fn: async () => {
    await DB.client.from('meetings').insert({
      family_id:    State.fid,
      title:        document.getElementById('m-title').value,
      meeting_date: document.getElementById('m-date').value || null,
      location:     document.getElementById('m-loc').value,
      agenda:       document.getElementById('m-agenda').value,
      status:       'scheduled',
      created_by:   State.uid,
    });
    Modal.close(); renderPage('meetings');
  }}]);
}

function openAddVote(meetingId) {
  Modal.open('Create Vote', `
    <div class="form-group"><label class="form-label">Question</label>
      <input id="v-q" class="form-input" placeholder="Do we approve the construction budget of KES 500,000?"/></div>
    <div class="form-group"><label class="form-label">Description (optional)</label>
      <textarea id="v-desc" class="form-textarea" placeholder="Additional context..."></textarea></div>
    <div class="form-group"><label class="form-label">Deadline</label>
      <input id="v-dead" class="form-input" type="date"/></div>
  `, [{ label: 'Open Vote', cls: 'btn-primary', fn: async () => {
    await DB.client.from('votes').insert({
      family_id:  State.fid,
      meeting_id: meetingId,
      question:   document.getElementById('v-q').value,
      description: document.getElementById('v-desc').value,
      deadline:   document.getElementById('v-dead').value || null,
      status:     'open',
      created_by: State.uid,
    });
    Modal.close(); renderPage('meetings');
  }}]);
}

async function castVote(voteId, response) {
  await DB.client.from('vote_responses').upsert({
    vote_id:   voteId,
    user_id:   State.uid,
    response,
  }, { onConflict: 'vote_id,user_id' });
  renderPage('meetings');
}

function openAddMinutes(meetingId, existing) {
  Modal.open('Add Meeting Minutes', `
    <div class="form-group"><label class="form-label">Minutes</label>
      <textarea id="min-text" class="form-textarea" style="min-height:200px;">${existing}</textarea></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('meetings').update({ minutes: document.getElementById('min-text').value, status: 'completed' }).eq('id', meetingId);
    Modal.close(); renderPage('meetings');
  }}]);
}

Router.register('meetings', renderMeetings);
