/**
 * js/pages/members.js
 * Family members list and safe admin management.
 */

const MembersPage = {
  members: [],
  invites: [],
  allSkills: [],
  skillsByUser: {},
  skillIdsByUser: {},

  getMember(memberId) {
    return this.members.find((member) => member.id === memberId) || null;
  },
};

async function renderMembers() {
  const isAdmin = State.currentProfile?.role === 'admin';
  setTopbar(
    'Members',
    isAdmin ? `<button class="btn btn-primary btn-sm" onclick="openAddMember()">+ Invite Member</button>` : ''
  );

  const sb = DB.client;
  const memberQuery = sb.from('users').select('*').eq('family_id', State.fid).order('full_name');
  const inviteQuery = isAdmin
    ? sb.from('family_invites').select('*').eq('family_id', State.fid).order('created_at', { ascending: false }).limit(8)
    : Promise.resolve({ data: [] });
  const skillsMasterQuery = isAdmin
    ? sb.from('skills').select('*').order('name')
    : Promise.resolve({ data: [] });

  const [{ data: members }, { data: invites }, { data: allSkills }] = await Promise.all([
    memberQuery,
    inviteQuery,
    skillsMasterQuery,
  ]);

  const memberIds = (members || []).map((member) => member.id);
  const { data: skillsList } = memberIds.length
    ? await sb.from('user_skills').select('user_id,skill_id,skills(name)').in('user_id', memberIds)
    : { data: [] };

  MembersPage.members = members || [];
  MembersPage.invites = invites || [];
  MembersPage.allSkills = allSkills || [];
  MembersPage.skillsByUser = {};
  MembersPage.skillIdsByUser = {};

  (skillsList || []).forEach((skill) => {
    if (!MembersPage.skillsByUser[skill.user_id]) MembersPage.skillsByUser[skill.user_id] = [];
    if (!MembersPage.skillIdsByUser[skill.user_id]) MembersPage.skillIdsByUser[skill.user_id] = [];
    MembersPage.skillsByUser[skill.user_id].push(skill.skills.name);
    MembersPage.skillIdsByUser[skill.user_id].push(skill.skill_id);
  });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total</div>
          <div class="metric-value">${MembersPage.members.length}</div></div>
        <div class="metric-card"><div class="metric-label">Admins</div>
          <div class="metric-value">${MembersPage.members.filter((member) => member.role === 'admin').length}</div></div>
        <div class="metric-card"><div class="metric-label">Active</div>
          <div class="metric-value" style="color:var(--success);">${MembersPage.members.filter((member) => member.is_active).length}</div></div>
        <div class="metric-card"><div class="metric-label">Pending Invites</div>
          <div class="metric-value">${MembersPage.invites.filter((invite) => invite.status === 'pending').length}</div></div>
      </div>

      ${(isAdmin && MembersPage.invites.length) ? `
        <div class="card mb16">
          <div class="card-title">Pending Invites</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th>Code</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${MembersPage.invites.map((invite) => `
                  <tr>
                    <td>${invite.email || '<span style="color:var(--text3);font-size:12px;">Any email</span>'}</td>
                    <td>${roleBadge(invite.role)}</td>
                    <td><code>${invite.invite_code}</code></td>
                    <td>${fmtDate(invite.expires_at)}</td>
                    <td>${statusBadge(invite.status)}</td>
                    <td>
                      ${invite.status === 'pending'
                        ? `<button class="btn btn-sm" onclick="revokeInvite('${invite.id}')">Revoke</button>`
                        : '<span style="color:var(--text3);font-size:12px;">—</span>'}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Skills</th>
                <th>Phone</th>
                <th>Status</th>
                ${isAdmin ? '<th>Action</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${MembersPage.members.map((member) => `
                <tr>
                  <td><div class="flex gap8">${avatarHtml(member.full_name, 'av-sm')} ${member.full_name}</div></td>
                  <td>${roleBadge(member.role)}</td>
                  <td>
                    <div class="tag-row">
                      ${(MembersPage.skillsByUser[member.id] || []).slice(0, 3).map((skill) => `<span class="badge b-gray">${skill}</span>`).join('')}
                      ${!(MembersPage.skillsByUser[member.id] || []).length ? '<span style="color:var(--text3);font-size:12px;">None</span>' : ''}
                    </div>
                  </td>
                  <td style="color:var(--text2);font-size:12px;">${member.phone || '-'}</td>
                  <td>${member.is_active
                    ? '<span class="badge b-green">Active</span>'
                    : '<span class="badge b-gray">Inactive</span>'
                  }</td>
                  ${isAdmin ? `<td><button class="btn btn-sm" onclick="openMemberEditor('${member.id}')">Manage</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function openAddMember() {
  Modal.open('Invite Family Member', `
    <p style="font-size:13px;color:var(--text2);margin-bottom:14px;">
      Create an invite code and share it with the new member. They will sign up
      or sign in, then choose <strong>Join Family</strong> during onboarding.
    </p>
    <div class="form-group">
      <label class="form-label">Member Email (optional)</label>
      <input id="new-member-email" class="form-input" type="email" placeholder="member@email.com"/>
    </div>
    <div class="form-group">
      <label class="form-label">Role to Assign</label>
      <select id="new-member-role" class="form-select">
        <option value="member">Member</option>
        <option value="youth">Youth</option>
        <option value="treasurer">Treasurer</option>
        <option value="project_manager">Project Manager</option>
        <option value="admin">Admin</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Valid For (days)</label>
      <input id="new-member-days" class="form-input" type="number" min="1" value="14"/>
    </div>
    <p id="invite-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Create Invite', cls: 'btn-primary', fn: createFamilyInvite }]);
}

async function createFamilyInvite() {
  hideErr('invite-err');

  const email = document.getElementById('new-member-email')?.value.trim() || null;
  const role = document.getElementById('new-member-role')?.value || 'member';
  const days = Number(document.getElementById('new-member-days')?.value || 14);

  const { data, error } = await DB.client.rpc('create_family_invite', {
    p_email: email,
    p_role: role,
    p_days_valid: days,
  });

  if (error) {
    showErr('invite-err', error.message);
    return;
  }

  const invite = Array.isArray(data) ? data[0] : data;
  const inviteCode = invite?.invite_code || '';

  Modal.open('Invite Created', `
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">
      Share this code with the new member. After they sign up or sign in, they
      should choose <strong>Join Family</strong> and enter the code below.
    </p>
    <div class="card" style="padding:16px;background:var(--bg3);margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Invite Code</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:.08em;margin-top:4px;">${inviteCode}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:8px;">Expires: ${fmtDate(invite?.expires_at)}</div>
    </div>
  `, [{
    label: 'Done',
    cls: 'btn-primary',
    fn: async () => {
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteCode);
      } catch (_err) {
        // Keep UI stable even if clipboard access is blocked.
      }
      Modal.close();
      renderPage('members');
    },
  }]);
}

function openMemberEditor(memberId) {
  const member = MembersPage.getMember(memberId);
  if (!member) return;

  const isSelf = member.id === State.uid;
  const selectedSkillIds = new Set(MembersPage.skillIdsByUser[member.id] || []);

  Modal.open('Manage Member', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">First Name</label>
        <input id="member-first-name" class="form-input" value="${member.first_name || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Last Name</label>
        <input id="member-last-name" class="form-input" value="${member.last_name || ''}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input id="member-phone" class="form-input" value="${member.phone || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select id="member-role" class="form-select" ${isSelf ? 'disabled' : ''}>
          ${['admin', 'treasurer', 'project_manager', 'member', 'youth'].map((role) => `
            <option value="${role}" ${member.role === role ? 'selected' : ''}>${role}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">
        <input id="member-active" type="checkbox" ${member.is_active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}/>
        Active member
      </label>
    </div>
    <div class="form-group">
      <label class="form-label">Skills</label>
      <div class="tag-row">
        ${MembersPage.allSkills.map((skill) => `
          <label class="badge b-gray" style="display:flex;align-items:center;gap:6px;padding-right:10px;">
            <input class="member-skill" type="checkbox" value="${skill.id}" ${selectedSkillIds.has(skill.id) ? 'checked' : ''}/>
            ${skill.name}
          </label>`).join('')}
      </div>
    </div>
    ${isSelf ? `
      <div class="setup-step" style="margin-top:12px;">
        You can edit your name and phone here, but you cannot deactivate, remove, or change your own admin role from this screen.
      </div>` : `
      <div class="setup-step" style="margin-top:12px;">
        Use <strong>Deactivate</strong> or <strong>Remove from Family</strong> instead of hard delete to preserve history.
      </div>`}
    <p id="member-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [
    ...(!isSelf ? [
      { label: member.is_active ? 'Deactivate' : 'Reactivate', cls: 'btn', fn: () => toggleMemberActive(member.id, !member.is_active) },
      { label: 'Remove From Family', cls: 'btn', fn: () => removeMemberFromFamily(member.id) },
    ] : []),
    { label: 'Save Changes', cls: 'btn-primary', fn: () => saveMember(member.id) },
  ]);
}

async function saveMember(memberId) {
  hideErr('member-err');

  const member = MembersPage.getMember(memberId);
  if (!member) return;

  const firstName = document.getElementById('member-first-name')?.value.trim() || '';
  const lastName = document.getElementById('member-last-name')?.value.trim() || '';
  const phone = document.getElementById('member-phone')?.value.trim() || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || member.full_name;
  const isSelf = member.id === State.uid;

  if (!firstName || !lastName) {
    showErr('member-err', 'First and last name are required.');
    return;
  }

  const updates = {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    phone,
  };

  if (!isSelf) {
    updates.role = document.getElementById('member-role')?.value || member.role;
    updates.is_active = !!document.getElementById('member-active')?.checked;
  }

  const { error } = await DB.client.from('users').update(updates).eq('id', memberId);
  if (error) {
    showErr('member-err', error.message);
    return;
  }

  const selectedSkillIds = Array.from(document.querySelectorAll('.member-skill:checked')).map((el) => el.value);
  const existingSkillIds = MembersPage.skillIdsByUser[memberId] || [];
  const skillIdsToAdd = selectedSkillIds.filter((skillId) => !existingSkillIds.includes(skillId));
  const skillIdsToRemove = existingSkillIds.filter((skillId) => !selectedSkillIds.includes(skillId));

  if (skillIdsToAdd.length) {
    const { error: addError } = await DB.client.from('user_skills').insert(
      skillIdsToAdd.map((skillId) => ({ user_id: memberId, skill_id: skillId }))
    );
    if (addError) {
      showErr('member-err', addError.message);
      return;
    }
  }

  if (skillIdsToRemove.length) {
    const { error: removeError } = await DB.client
      .from('user_skills')
      .delete()
      .eq('user_id', memberId)
      .in('skill_id', skillIdsToRemove);
    if (removeError) {
      showErr('member-err', removeError.message);
      return;
    }
  }

  Modal.close();
  renderPage('members');
}

async function toggleMemberActive(memberId, nextState) {
  const member = MembersPage.getMember(memberId);
  if (!member || member.id === State.uid) return;

  const { error } = await DB.client
    .from('users')
    .update({ is_active: nextState })
    .eq('id', memberId);

  if (error) {
    showErr('member-err', error.message);
    return;
  }

  Modal.close();
  renderPage('members');
}

async function removeMemberFromFamily(memberId) {
  const member = MembersPage.getMember(memberId);
  if (!member || member.id === State.uid) return;

  if (!confirm(`Remove ${member.full_name} from this family workspace?`)) return;

  const { error } = await DB.client
    .from('users')
    .update({
      family_id: null,
      role: 'member',
      is_active: false,
    })
    .eq('id', memberId);

  if (error) {
    showErr('member-err', error.message);
    return;
  }

  Modal.close();
  renderPage('members');
}

async function revokeInvite(inviteId) {
  if (!confirm('Revoke this invite code?')) return;

  const { error } = await DB.client
    .from('family_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId);

  if (error) {
    alert(error.message);
    return;
  }

  renderPage('members');
}

Router.register('members', renderMembers);
