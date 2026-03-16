/**
 * js/pages/meetings.js
 * ─────────────────────────────────────────────────────
 * Family meetings: schedule meetings, record minutes,
 * and cast family votes.
 */

const MeetingsPage = {
  meetings: [],
};

function canManageMeetings() {
  return State.currentProfile?.role === 'admin';
}

function meetingButtonBar(meeting) {
  if (!canManageMeetings()) return '';
  return `
    <div style="display:flex;gap:6px;margin-top:8px;">
      <button class="btn btn-sm" onclick="openAddVote('${meeting.id}')">Create Vote</button>
      <button class="btn btn-sm" onclick="openAddMinutes('${meeting.id}', \`${escapeHtml(meeting.minutes || '').replace(/`/g, '&#96;')}\`)">Minutes</button>
      <button class="btn btn-sm" onclick="openManageMeeting('${meeting.id}')">Manage</button>
    </div>`;
}

async function renderMeetings() {
  setTopbar('Meetings', canManageMeetings() ? `<button class="btn btn-primary btn-sm" onclick="openAddMeeting()">+ Schedule Meeting</button>` : '');
  const sb = DB.client;

  const [{ data: meetings, error: meetingsError }, { data: votes, error: votesError }] = await Promise.all([
    sb.from('meetings').select('*').eq('family_id', State.fid).order('meeting_date', { ascending: false }),
    sb.from('votes').select('*,vote_responses(*)').eq('family_id', State.fid).eq('status', 'open').order('created_at', { ascending: false }),
  ]);

  if (meetingsError || votesError) {
    console.error('[Meetings] Failed to load:', meetingsError || votesError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load meetings right now')}</div>
      </div>`;
    return;
  }

  const meetingById = {};
  (meetings || []).forEach((meeting) => {
    meetingById[meeting.id] = meeting;
  });
  MeetingsPage.meetings = meetings || [];

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g2 mb16">

        <div class="card">
          <div class="card-title">Meetings</div>
          ${canManageMeetings() ? `<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Schedule a meeting first, then create votes from that meeting card.</div>` : ''}
          <div class="flex-col">
            ${(meetings || []).map((meeting) => `
              <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);">
                <div class="flex-between mb8">
                  <span style="font-size:14px;font-weight:700;">${escapeHtml(meeting.title)}</span>
                  ${statusBadge(meeting.status)}
                </div>
                <div style="font-size:12px;color:var(--text2);">
                  ${fmtDate(meeting.meeting_date)}${meeting.venue ? ` · ${escapeHtml(meeting.venue)}` : ''}
                </div>
                ${meeting.agenda ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;">Agenda: ${escapeHtml(meeting.agenda.length > 80 ? `${meeting.agenda.substring(0, 80)}...` : meeting.agenda)}</div>` : ''}
                ${meeting.minutes ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">Minutes available</div>` : ''}
                ${meetingButtonBar(meeting)}
              </div>`).join('')}
            ${!(meetings || []).length ? empty(canManageMeetings() ? 'No meetings scheduled yet. Create one to start votes and minutes.' : 'No meetings scheduled') : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Active Votes</div>
          ${canManageMeetings() ? `<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Votes are opened from the meeting cards and can be closed here once the family has voted.</div>` : ''}
          <div class="flex-col">
            ${(votes || []).map((vote) => {
              const responses = vote.vote_responses || [];
              const yes = responses.filter((item) => item.response === 'yes').length;
              const no = responses.filter((item) => item.response === 'no').length;
              const abstain = responses.filter((item) => item.response === 'abstain').length;
              const myVote = responses.find((item) => item.user_id === State.uid);
              const deadlinePassed = vote.deadline ? new Date(vote.deadline) < new Date() : false;
              const votingDisabled = !!myVote || deadlinePassed;
              const parentMeeting = meetingById[vote.meeting_id];

              return `
                <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);">
                  <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${escapeHtml(vote.proposal)}</div>
                  ${parentMeeting ? `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Meeting: ${escapeHtml(parentMeeting.title)}</div>` : ''}
                  ${vote.description ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">${escapeHtml(vote.description)}</div>` : ''}
                  <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
                    Yes ${yes} · No ${no} · Abstain ${abstain}
                    ${vote.deadline ? ` · Deadline ${fmtDate(vote.deadline)}` : ''}
                  </div>
                  ${myVote ? `<div style="font-size:12px;color:var(--accent);margin-bottom:10px;">You voted: ${escapeHtml(myVote.response)}</div>` : ''}
                  ${deadlinePassed && !myVote ? `<div style="font-size:12px;color:var(--warning);margin-bottom:10px;">Voting deadline has passed.</div>` : ''}
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm" ${votingDisabled ? 'disabled' : ''} style="background:var(--success-bg);color:var(--success);" onclick="castVote('${vote.id}','yes')">Yes</button>
                    <button class="btn btn-sm" ${votingDisabled ? 'disabled' : ''} style="background:var(--danger-bg);color:var(--danger);" onclick="castVote('${vote.id}','no')">No</button>
                    <button class="btn btn-sm" ${votingDisabled ? 'disabled' : ''} onclick="castVote('${vote.id}','abstain')">Abstain</button>
                    ${canManageMeetings() ? `<button class="btn btn-sm" onclick="updateVoteStatus('${vote.id}','closed')">Close Vote</button>` : ''}
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
  if (!canManageMeetings()) return;
  Modal.open('Schedule Meeting', `
    <div class="form-group"><label class="form-label">Meeting Title</label>
      <input id="m-title" class="form-input" placeholder="Annual General Meeting 2026"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date</label>
        <input id="m-date" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">Venue</label>
        <input id="m-venue" class="form-input" placeholder="Otieno homestead, Kitale"/></div>
    </div>
    <div class="form-group"><label class="form-label">Agenda</label>
      <textarea id="m-agenda" class="form-textarea" placeholder="1. Reports&#10;2. Elections&#10;3. AOB"></textarea></div>
    <p id="meeting-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Schedule', cls: 'btn-primary', fn: async () => {
    hideErr('meeting-err');
    const title = document.getElementById('m-title')?.value.trim() || '';
    const date = document.getElementById('m-date')?.value || '';
    if (!title || !date) {
      showErr('meeting-err', 'Meeting title and date are required.');
      return;
    }

    const { error } = await DB.client.from('meetings').insert({
      family_id: State.fid,
      title,
      meeting_date: date,
      venue: document.getElementById('m-venue')?.value.trim() || null,
      agenda: document.getElementById('m-agenda')?.value.trim() || null,
      status: 'scheduled',
      created_by: State.uid,
    });

    if (error) {
      showErr('meeting-err', error.message);
      return;
    }

    Modal.close();
    renderPage('meetings');
  }}]);
}

function openManageMeeting(meetingId) {
  if (!canManageMeetings()) return;
  const meeting = MeetingsPage.meetings.find((item) => item.id === meetingId);
  if (!meeting) return;

  Modal.open('Manage Meeting', `
    <div class="form-group"><label class="form-label">Meeting Title</label>
      <input id="m-title" class="form-input" value="${escapeHtml(meeting.title || '')}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date</label>
        <input id="m-date" class="form-input" type="date" value="${meeting.meeting_date ? String(meeting.meeting_date).slice(0, 10) : ''}"/></div>
      <div class="form-group"><label class="form-label">Venue</label>
        <input id="m-venue" class="form-input" value="${escapeHtml(meeting.venue || '')}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select id="m-status" class="form-select">
          ${['scheduled', 'completed', 'cancelled'].map((status) => `
            <option value="${status}" ${meeting.status === status ? 'selected' : ''}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>
          `).join('')}
        </select></div>
      <div class="form-group"></div>
    </div>
    <div class="form-group"><label class="form-label">Agenda</label>
      <textarea id="m-agenda" class="form-textarea" placeholder="1. Reports&#10;2. Elections&#10;3. AOB">${escapeHtml(meeting.agenda || '')}</textarea></div>
    <p id="meeting-manage-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [
    {
      label: 'Delete',
      cls: 'btn-danger',
      fn: async () => confirmDeleteMeeting(meetingId),
    },
    {
      label: 'Save',
      cls: 'btn-primary',
      fn: async () => saveMeeting(meetingId),
    },
  ]);
}

async function saveMeeting(meetingId) {
  hideErr('meeting-manage-err');
  const title = document.getElementById('m-title')?.value.trim() || '';
  const date = document.getElementById('m-date')?.value || '';
  if (!title || !date) {
    showErr('meeting-manage-err', 'Meeting title and date are required.');
    return;
  }

  const { error } = await DB.client.from('meetings').update({
    title,
    meeting_date: date,
    venue: document.getElementById('m-venue')?.value.trim() || null,
    agenda: document.getElementById('m-agenda')?.value.trim() || null,
    status: document.getElementById('m-status')?.value || 'scheduled',
  }).eq('id', meetingId);

  if (error) {
    showErr('meeting-manage-err', error.message);
    return;
  }

  Modal.close();
  renderPage('meetings');
}

function confirmDeleteMeeting(meetingId) {
  if (!canManageMeetings()) return;
  const meeting = MeetingsPage.meetings.find((item) => item.id === meetingId);
  if (!meeting) return;

  Modal.open('Delete Meeting', `
    <div style="font-size:14px;line-height:1.55;color:var(--text);">
      <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(meeting.title || 'Meeting')}</div>
      <div style="color:var(--text2);">
        This will permanently remove the meeting and any votes linked to it. This action cannot be undone.
      </div>
    </div>
    <p id="meeting-delete-err" style="color:var(--danger);font-size:12px;display:none;margin-top:10px;"></p>
  `, [
    { label: 'Cancel', cls: 'btn-ghost', fn: () => Modal.close() },
    {
      label: 'Delete Meeting',
      cls: 'btn-danger',
      fn: async () => deleteMeeting(meetingId),
    },
  ]);
}

async function deleteMeeting(meetingId) {
  const { error } = await DB.client.from('meetings').delete().eq('id', meetingId);
  if (error) {
    showErr('meeting-delete-err', error.message);
    return;
  }
  Modal.close();
  renderPage('meetings');
}

function openAddVote(meetingId) {
  if (!canManageMeetings()) return;
  Modal.open('Create Vote', `
    <div class="form-group"><label class="form-label">Proposal</label>
      <input id="v-proposal" class="form-input" placeholder="Do we approve the construction budget of KES 500,000?"/></div>
    <div class="form-group"><label class="form-label">Description (optional)</label>
      <textarea id="v-desc" class="form-textarea" placeholder="Additional context..."></textarea></div>
    <div class="form-group"><label class="form-label">Deadline</label>
      <input id="v-dead" class="form-input" type="date"/></div>
    <p id="vote-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Open Vote', cls: 'btn-primary', fn: async () => {
    hideErr('vote-err');
    const proposal = document.getElementById('v-proposal')?.value.trim() || '';
    if (!proposal) {
      showErr('vote-err', 'Proposal is required.');
      return;
    }

    const { error } = await DB.client.from('votes').insert({
      family_id: State.fid,
      meeting_id: meetingId,
      proposal,
      description: document.getElementById('v-desc')?.value.trim() || null,
      deadline: document.getElementById('v-dead')?.value || null,
      status: 'open',
    });

    if (error) {
      showErr('vote-err', error.message);
      return;
    }

    Modal.close();
    renderPage('meetings');
  }}]);
}

async function castVote(voteId, response) {
  const { data: existing, error: existingError } = await DB.client
    .from('vote_responses')
    .select('id,response')
    .eq('vote_id', voteId)
    .eq('user_id', State.uid)
    .maybeSingle();

  if (existingError) {
    console.error('[Meetings] Failed to check existing vote:', existingError);
    alert(existingError.message || 'Unable to submit your vote right now.');
    return;
  }

  if (existing) {
    renderPage('meetings');
    return;
  }

  const { error } = await DB.client.from('vote_responses').insert({
    vote_id: voteId,
    user_id: State.uid,
    response,
  });

  if (error) {
    console.error('[Meetings] Failed to cast vote:', error);
    alert(error.message || 'Unable to submit your vote right now.');
    return;
  }

  renderPage('meetings');
}

async function updateVoteStatus(voteId, status) {
  if (!canManageMeetings()) return;
  const { error } = await DB.client.from('votes').update({ status }).eq('id', voteId);
  if (error) {
    alert(error.message || 'Unable to update this vote right now.');
    return;
  }
  renderPage('meetings');
}

function openAddMinutes(meetingId, existing) {
  if (!canManageMeetings()) return;
  Modal.open('Add Meeting Minutes', `
    <div class="form-group"><label class="form-label">Minutes</label>
      <textarea id="min-text" class="form-textarea" style="min-height:200px;">${existing || ''}</textarea></div>
    <p id="minutes-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    hideErr('minutes-err');
    const { error } = await DB.client
      .from('meetings')
      .update({ minutes: document.getElementById('min-text')?.value.trim() || null, status: 'completed' })
      .eq('id', meetingId);

    if (error) {
      showErr('minutes-err', error.message);
      return;
    }

    Modal.close();
    renderPage('meetings');
  }}]);
}

Router.register('meetings', renderMeetings);
