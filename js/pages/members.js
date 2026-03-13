/**
 * js/pages/members.js
 * Family members list and invite management.
 */

async function renderMembers() {
  const isAdmin = State.currentProfile?.role === 'admin';
  setTopbar(
    'Members',
    isAdmin ? `<button class="btn btn-primary btn-sm" onclick="openAddMember()">+ Invite Member</button>` : ''
  );

  const sb = DB.client;
  const memberQuery = sb
    .from('users')
    .select('*')
    .eq('family_id', State.fid)
    .order('full_name');

  const inviteQuery = isAdmin
    ? sb.from('family_invites').select('*').eq('family_id', State.fid).order('created_at', { ascending: false }).limit(6)
    : Promise.resolve({ data: [], error: null });

  const [{ data: members }, { data: invites }] = await Promise.all([memberQuery, inviteQuery]);

  const memberIds = (members || []).map((member) => member.id);
  const { data: skillsList } = memberIds.length
    ? await sb.from('user_skills').select('user_id,skills(name)').in('user_id', memberIds)
    : { data: [] };

  const skillsMap = {};
  (skillsList || []).forEach((skill) => {
    if (!skillsMap[skill.user_id]) skillsMap[skill.user_id] = [];
    skillsMap[skill.user_id].push(skill.skills.name);
  });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total</div>
          <div class="metric-value">${(members || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Admins</div>
          <div class="metric-value">${(members || []).filter((member) => member.role === 'admin').length}</div></div>
        <div class="metric-card"><div class="metric-label">Active</div>
          <div class="metric-value" style="color:var(--success);">${(members || []).filter((member) => member.is_active).length}</div></div>
        <div class="metric-card"><div class="metric-label">Pending Invites</div>
          <div class="metric-value">${(invites || []).filter((invite) => invite.status === 'pending').length}</div></div>
      </div>

      ${(isAdmin && invites?.length) ? `
        <div class="card mb16">
          <div class="card-title">Pending Invites</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th>Code</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                ${invites.map((invite) => `
                  <tr>
                    <td>${invite.email || '<span style="color:var(--text3);font-size:12px;">Any email</span>'}</td>
                    <td>${roleBadge(invite.role)}</td>
                    <td><code>${invite.invite_code}</code></td>
                    <td>${fmtDate(invite.expires_at)}</td>
                    <td>${statusBadge(invite.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Role</th><th>Skills</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              ${(members || []).map((member) => `
                <tr>
                  <td><div class="flex gap8">${avatarHtml(member.full_name, 'av-sm')} ${member.full_name}</div></td>
                  <td>${roleBadge(member.role)}</td>
                  <td>
                    <div class="tag-row">
                      ${(skillsMap[member.id] || []).slice(0, 3).map((skill) => `<span class="badge b-gray">${skill}</span>`).join('')}
                      ${!(skillsMap[member.id] || []).length ? '<span style="color:var(--text3);font-size:12px;">None</span>' : ''}
                    </div>
                  </td>
                  <td style="color:var(--text2);font-size:12px;">${member.phone || '-'}</td>
                  <td>${member.is_active
                    ? '<span class="badge b-green">Active</span>'
                    : '<span class="badge b-gray">Inactive</span>'
                  }</td>
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
  const expiresAt = invite?.expires_at || null;

  Modal.open('Invite Created', `
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">
      Share this code with the new member. After they sign up or sign in, they
      should choose <strong>Join Family</strong> and enter the code below.
    </p>
    <div class="card" style="padding:16px;background:var(--bg3);margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Invite Code</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:.08em;margin-top:4px;">${inviteCode}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:8px;">Expires: ${fmtDate(expiresAt)}</div>
    </div>
    <p style="font-size:12px;color:var(--text3);margin:0;">
      ${email ? `This invite only works for ${email}.` : 'This invite can be used by any email address.'}
    </p>
  `, [{
    label: 'Copy Code',
    cls: 'btn-primary',
    fn: async () => {
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteCode);
      } catch (_err) {
        // Ignore clipboard failures and still let the user see the code.
      }
      Modal.close();
      renderPage('members');
    },
  }]);
}

Router.register('members', renderMembers);
