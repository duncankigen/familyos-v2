/**
 * js/pages/admin.js
 * Platform admin workspace.
 */

function adminPriorityBadge(priority) {
  const tone = {
    low: 'b-gray',
    normal: 'b-blue',
    high: 'b-amber',
    urgent: 'b-red',
  };
  return `<span class="badge ${tone[priority] || 'b-gray'}">${escapeHtml(priority || 'normal')}</span>`;
}

function adminStatusBadge(active) {
  return `<span class="badge ${active ? 'b-green' : 'b-gray'}">${active ? 'active' : 'inactive'}</span>`;
}

function adminClip(text, max = 110) {
  const value = String(text || '').trim();
  if (!value) return 'No details provided.';
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}

function adminMenuAction(label, handler, danger = false) {
  return `
    <button type="button" class="admin-menu-item ${danger ? 'admin-menu-item-danger' : ''}" onclick="${handler}">
      ${label}
    </button>`;
}

function adminRowMenu(actions) {
  return `
    <details class="admin-menu" onclick="event.stopPropagation()">
      <summary class="admin-menu-toggle" title="More actions">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.4"></circle>
          <circle cx="8" cy="8" r="1.4"></circle>
          <circle cx="13" cy="8" r="1.4"></circle>
        </svg>
      </summary>
      <div class="admin-menu-pop">
        ${actions.join('')}
      </div>
    </details>`;
}

function adminOverviewMetrics(tickets, families, users) {
  const openTickets = tickets.filter((ticket) => ['open', 'in_progress'].includes(ticket.status)).length;
  const activeUsers = users.filter((user) => user.is_active).length;
  const inactiveUsers = Math.max(0, users.length - activeUsers);
  const scholarshipFamilies = families.filter((family) => adminFamilyBillingState(family).accessSource === 'scholarship').length;

  return `
    <div class="admin-metrics">
      <div class="metric-card">
        <div class="metric-label">Families</div>
        <div class="metric-value">${families.length}</div>
        <div class="metric-sub">Visible workspaces</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Users</div>
        <div class="metric-value">${users.length}</div>
        <div class="metric-sub">${activeUsers} active · ${inactiveUsers} inactive</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Support</div>
        <div class="metric-value">${openTickets}</div>
        <div class="metric-sub">Open or in progress</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Scholarships</div>
        <div class="metric-value">${scholarshipFamilies}</div>
        <div class="metric-sub">Sponsored workspaces</div>
      </div>
    </div>`;
}

function adminFamilyBillingState(family) {
  return typeof deriveBillingState === 'function' ? deriveBillingState(family || {}) : {
    status: family?.billing_status || 'active',
    access: 'active',
    accessSource: 'billing',
    scholarshipEndsAt: family?.scholarship_ends_at || null,
  };
}

function adminFamilyAccessBadge(family) {
  const billing = adminFamilyBillingState(family);
  if (billing.accessSource === 'scholarship') {
    return `<span class="badge b-amber">scholarship</span>`;
  }

  const tone = {
    active: 'b-green',
    trialing: 'b-blue',
    expired: 'b-red',
    past_due: 'b-amber',
    cancelled: 'b-gray',
  };

  return `<span class="badge ${tone[billing.status] || 'b-gray'}">${escapeHtml(billing.status || 'active')}</span>`;
}

function scholarshipDateValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function scholarshipIsoFromDate(value, endOfDay = false) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const suffix = endOfDay ? 'T23:59:59' : 'T00:00:00';
  const date = new Date(`${trimmed}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function adminUserName(userId) {
  const user = (State.adminSnapshot?.users || []).find((item) => item.id === userId);
  return user?.full_name || 'Member';
}

function adminFamilyName(familyId) {
  const family = (State.adminSnapshot?.families || []).find((item) => item.id === familyId);
  return family?.name || 'No family linked';
}

function adminMetaLine(label, value) {
  return `
    <div class="admin-mobile-meta-line">
      <span class="admin-mobile-meta-label">${label}</span>
      <span class="admin-mobile-meta-value">${value}</span>
    </div>`;
}

function adminSupportTable(tickets) {
  if (!tickets.length) {
    return `<div class="admin-empty">No support tickets have been submitted yet.</div>`;
  }

  return `
    <div class="table-wrap admin-desktop-table">
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Reporter</th>
            <th>Family</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Updated</th>
            <th style="width:56px;"></th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((ticket) => `
            <tr>
              <td>
                <div class="admin-row-title">${escapeHtml(ticket.subject || 'Untitled ticket')}</div>
                <div class="admin-row-meta">${escapeHtml(supportCategoryLabel(ticket.category))}</div>
                <div class="admin-row-copy">${escapeHtml(adminClip(ticket.message))}</div>
              </td>
              <td>${escapeHtml(adminUserName(ticket.submitted_by))}</td>
              <td>${escapeHtml(adminFamilyName(ticket.family_id))}</td>
              <td>${supportStatusBadge(ticket.status)}</td>
              <td>${adminPriorityBadge(ticket.priority)}</td>
              <td>
                <div class="admin-row-title">${fmtDate(ticket.updated_at || ticket.created_at)}</div>
                <div class="admin-row-meta">${ago(ticket.updated_at || ticket.created_at)}</div>
              </td>
              <td class="admin-actions-cell">
                ${adminRowMenu([
                  adminMenuAction('Review ticket', `openAdminSupportTicket('${ticket.id}')`),
                  adminMenuAction('Mark in progress', `adminSetSupportTicketStatus('${ticket.id}', 'in_progress')`),
                  adminMenuAction('Resolve', `adminSetSupportTicketStatus('${ticket.id}', 'resolved')`),
                  adminMenuAction('Close', `adminSetSupportTicketStatus('${ticket.id}', 'closed')`, true),
                ])}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-mobile-list">
      ${tickets.map((ticket) => `
        <div class="admin-mobile-card">
          <div class="admin-mobile-head">
            <div>
              <div class="admin-row-title">${escapeHtml(ticket.subject || 'Untitled ticket')}</div>
              <div class="admin-row-meta">${escapeHtml(supportCategoryLabel(ticket.category))}</div>
            </div>
            ${supportStatusBadge(ticket.status)}
          </div>
          <div class="admin-row-copy">${escapeHtml(adminClip(ticket.message))}</div>
          <div class="admin-mobile-meta">
            ${adminMetaLine('Reporter', escapeHtml(adminUserName(ticket.submitted_by)))}
            ${adminMetaLine('Family', escapeHtml(adminFamilyName(ticket.family_id)))}
            ${adminMetaLine('Priority', adminPriorityBadge(ticket.priority))}
            ${adminMetaLine('Updated', `<span>${fmtDate(ticket.updated_at || ticket.created_at)}</span><span class="admin-mobile-meta-sub">${ago(ticket.updated_at || ticket.created_at)}</span>`)}
          </div>
          <div class="admin-mobile-actions">
            ${adminRowMenu([
              adminMenuAction('Review ticket', `openAdminSupportTicket('${ticket.id}')`),
              adminMenuAction('Mark in progress', `adminSetSupportTicketStatus('${ticket.id}', 'in_progress')`),
              adminMenuAction('Resolve', `adminSetSupportTicketStatus('${ticket.id}', 'resolved')`),
              adminMenuAction('Close', `adminSetSupportTicketStatus('${ticket.id}', 'closed')`, true),
            ])}
          </div>
        </div>
      `).join('')}
    </div>`;
}

function adminFamilyTable(families, users, tickets) {
  if (!families.length) {
    return `<div class="admin-empty">No families found.</div>`;
  }

  return `
    <div class="table-wrap admin-desktop-table">
      <table>
        <thead>
          <tr>
            <th>Family</th>
            <th>Access</th>
            <th>Members</th>
            <th>Open Tickets</th>
            <th>Created</th>
            <th style="width:56px;"></th>
          </tr>
        </thead>
        <tbody>
          ${families.map((family) => {
            const memberCount = users.filter((user) => user.family_id === family.id).length;
            const ticketCount = tickets.filter((ticket) => ticket.family_id === family.id && ['open', 'in_progress'].includes(ticket.status)).length;
            return `
              <tr>
                <td>
                  <div class="admin-row-title">${escapeHtml(family.name || 'Untitled family')}</div>
                  <div class="admin-row-copy">${escapeHtml(adminClip(family.description || 'No description provided.', 95))}</div>
                </td>
                <td>${adminFamilyAccessBadge(family)}</td>
                <td>${memberCount}</td>
                <td>${ticketCount}</td>
                <td>
                  <div class="admin-row-title">${fmtDate(family.created_at)}</div>
                  <div class="admin-row-meta">${ago(family.created_at)}</div>
                </td>
                <td class="admin-actions-cell">
                  ${adminRowMenu([
                    adminMenuAction('View workspace summary', `openAdminFamilySummary('${family.id}')`),
                  ])}
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-mobile-list">
      ${families.map((family) => {
        const memberCount = users.filter((user) => user.family_id === family.id).length;
        const ticketCount = tickets.filter((ticket) => ticket.family_id === family.id && ['open', 'in_progress'].includes(ticket.status)).length;
        return `
          <div class="admin-mobile-card">
            <div class="admin-mobile-head">
              <div>
                <div class="admin-row-title">${escapeHtml(family.name || 'Untitled family')}</div>
                <div class="admin-row-copy">${escapeHtml(adminClip(family.description || 'No description provided.', 95))}</div>
              </div>
              <span class="badge b-blue">${memberCount} members</span>
            </div>
            <div class="admin-mobile-meta">
              ${adminMetaLine('Access', adminFamilyAccessBadge(family))}
              ${adminMetaLine('Open tickets', String(ticketCount))}
              ${adminMetaLine('Created', `<span>${fmtDate(family.created_at)}</span><span class="admin-mobile-meta-sub">${ago(family.created_at)}</span>`)}
            </div>
            <div class="admin-mobile-actions">
              ${adminRowMenu([
                adminMenuAction('View workspace summary', `openAdminFamilySummary('${family.id}')`),
              ])}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function adminUserTable(users) {
  if (!users.length) {
    return `<div class="admin-empty">No users found.</div>`;
  }

  return `
    <div class="table-wrap admin-desktop-table">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Family</th>
            <th>Status</th>
            <th>Created</th>
            <th style="width:56px;"></th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => `
            <tr>
              <td>
                <div class="admin-row-title">${escapeHtml(user.full_name || 'Unnamed user')}</div>
                <div class="admin-row-meta">${user.id === State.uid ? 'Current signed-in platform admin' : 'FamilyOS account'}</div>
              </td>
              <td>${roleBadge(user.role || 'member')}</td>
              <td>${escapeHtml(adminFamilyName(user.family_id))}</td>
              <td>${adminStatusBadge(Boolean(user.is_active))}</td>
              <td>
                <div class="admin-row-title">${fmtDate(user.created_at)}</div>
                <div class="admin-row-meta">${ago(user.created_at)}</div>
              </td>
              <td class="admin-actions-cell">
                ${adminRowMenu([
                  adminMenuAction('Review account', `openAdminUserAccount('${user.id}')`),
                  adminMenuAction(user.is_active ? 'Deactivate account' : 'Reactivate account', `adminSetUserActive('${user.id}', ${user.is_active ? 'false' : 'true'})`, user.is_active),
                ])}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-mobile-list">
      ${users.map((user) => `
        <div class="admin-mobile-card">
          <div class="admin-mobile-head">
            <div>
              <div class="admin-row-title">${escapeHtml(user.full_name || 'Unnamed user')}</div>
              <div class="admin-row-meta">${user.id === State.uid ? 'Current signed-in platform admin' : 'FamilyOS account'}</div>
            </div>
            ${adminStatusBadge(Boolean(user.is_active))}
          </div>
          <div class="admin-mobile-meta">
            ${adminMetaLine('Role', roleBadge(user.role || 'member'))}
            ${adminMetaLine('Family', escapeHtml(adminFamilyName(user.family_id)))}
            ${adminMetaLine('Created', `<span>${fmtDate(user.created_at)}</span><span class="admin-mobile-meta-sub">${ago(user.created_at)}</span>`)}
          </div>
          <div class="admin-mobile-actions">
            ${adminRowMenu([
              adminMenuAction('Review account', `openAdminUserAccount('${user.id}')`),
              adminMenuAction(user.is_active ? 'Deactivate account' : 'Reactivate account', `adminSetUserActive('${user.id}', ${user.is_active ? 'false' : 'true'})`, user.is_active),
            ])}
          </div>
        </div>
      `).join('')}
    </div>`;
}

async function adminLoadData() {
  const [{ data: tickets, error: ticketError }, { data: families, error: familyError }, { data: users, error: userError }] = await Promise.all([
    DB.client
      .from('support_tickets')
      .select('id,family_id,submitted_by,category,subject,message,status,priority,admin_notes,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(25),
    DB.client
      .from('families')
      .select('id,name,description,created_at,billing_status,billing_plan,billing_currency,trial_ends_at,subscription_ends_at,scholarship_active,scholarship_started_at,scholarship_ends_at,scholarship_note,scholarship_granted_by')
      .order('created_at', { ascending: false })
      .limit(50),
    DB.client
      .from('users')
      .select('id,full_name,role,is_active,family_id,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (ticketError || familyError || userError) {
    throw ticketError || familyError || userError;
  }

  State.adminSnapshot = {
    tickets: tickets || [],
    families: families || [],
    users: users || [],
  };

  return State.adminSnapshot;
}

async function adminSetSupportTicketStatus(ticketId, status) {
  if (!ticketId || !isPlatformAdminUser()) return;
  const payload = {
    status,
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

  await renderAdmin();
}

async function saveAdminSupportTicket(ticketId) {
  const ticket = (State.adminSnapshot?.tickets || []).find((item) => item.id === ticketId);
  if (!ticket) return;

  const status = document.getElementById('admin-modal-ticket-status')?.value || ticket.status || 'open';
  const notes = document.getElementById('admin-modal-ticket-notes')?.value.trim() || null;
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
    alert(error.message || 'Unable to save this support ticket right now.');
    return;
  }

  Modal.close();
  await renderAdmin();
}

function openAdminSupportTicket(ticketId) {
  const ticket = (State.adminSnapshot?.tickets || []).find((item) => item.id === ticketId);
  if (!ticket) return;

  Modal.open(`Support: ${ticket.subject || 'Untitled ticket'}`, `
    <div class="admin-modal-stack">
      <div class="account-center-hero ai-amber">
        <div>
          <div class="account-center-hero-title">${escapeHtml(ticket.subject || 'Untitled ticket')}</div>
          <div class="account-center-hero-copy">
            ${escapeHtml(supportCategoryLabel(ticket.category))} · ${escapeHtml(adminUserName(ticket.submitted_by))} · ${escapeHtml(adminFamilyName(ticket.family_id))}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Reported message</div>
        <div class="account-center-copy">${escapeHtml(ticket.message || 'No message provided.').replace(/\n/g, '<br>')}</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="admin-modal-ticket-status" class="form-select">
            ${['open', 'in_progress', 'resolved', 'closed'].map((status) => `
              <option value="${status}" ${ticket.status === status ? 'selected' : ''}>${status.replace(/_/g, ' ')}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <input class="form-input" value="${escapeHtml(ticket.priority || 'normal')}" disabled />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Admin notes</label>
        <textarea id="admin-modal-ticket-notes" class="form-textarea" style="min-height:110px;">${escapeHtml(ticket.admin_notes || '')}</textarea>
      </div>
    </div>
  `, [
    { label: 'Save Ticket', cls: 'btn-primary', fn: () => saveAdminSupportTicket(ticketId) },
  ]);
}

async function adminSetUserActive(userId, nextState) {
  if (!userId || !isPlatformAdminUser()) return;
  if (userId === State.uid && nextState === false) {
    alert('Deactivate this account from another platform admin account so you do not lock yourself out.');
    return;
  }

  const { error } = await DB.client
    .from('users')
    .update({ is_active: nextState })
    .eq('id', userId);

  if (error) {
    alert(error.message || 'Unable to update this user right now.');
    return;
  }

  Modal.close();
  await renderAdmin();
}

async function saveAdminScholarship(familyId) {
  const family = (State.adminSnapshot?.families || []).find((item) => item.id === familyId);
  if (!family) return;

  const startDate = document.getElementById('admin-scholarship-start')?.value || '';
  const endDate = document.getElementById('admin-scholarship-end')?.value || '';
  const note = document.getElementById('admin-scholarship-note')?.value.trim() || null;
  const startIso = scholarshipIsoFromDate(startDate, false);
  const endIso = scholarshipIsoFromDate(endDate, true);

  if (!startIso || !endIso) {
    alert('Enter both scholarship start and end dates.');
    return;
  }

  if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
    alert('Scholarship end date must be after the start date.');
    return;
  }

  const { error } = await DB.client
    .from('families')
    .update({
      scholarship_active: true,
      scholarship_started_at: startIso,
      scholarship_ends_at: endIso,
      scholarship_note: note,
      scholarship_granted_by: State.uid,
    })
    .eq('id', familyId);

  if (error) {
    alert(error.message || 'Unable to save this scholarship right now.');
    return;
  }

  Modal.close();
  await renderAdmin();
  openAdminFamilySummary(familyId);
}

async function adminEndScholarshipNow(familyId, reopenSummary = true) {
  const family = (State.adminSnapshot?.families || []).find((item) => item.id === familyId);
  if (!family) return;

  const noteInput = document.getElementById('admin-scholarship-note');
  const note = noteInput ? (noteInput.value.trim() || family.scholarship_note || null) : (family.scholarship_note || null);

  const { error } = await DB.client
    .from('families')
    .update({
      scholarship_active: false,
      scholarship_ends_at: new Date().toISOString(),
      scholarship_note: note,
      scholarship_granted_by: State.uid,
    })
    .eq('id', familyId);

  if (error) {
    alert(error.message || 'Unable to end this scholarship right now.');
    return;
  }

  Modal.close();
  await renderAdmin();
  if (reopenSummary) openAdminFamilySummary(familyId);
}

function openAdminScholarshipModal(familyId) {
  const family = (State.adminSnapshot?.families || []).find((item) => item.id === familyId);
  if (!family) return;

  const billing = adminFamilyBillingState(family);
  const existingStart = scholarshipDateValue(family.scholarship_started_at) || scholarshipDateValue(new Date().toISOString());
  const existingEnd = scholarshipDateValue(family.scholarship_ends_at);

  Modal.open(`Scholarship: ${family.name || 'Untitled family'}`, `
    <div class="admin-modal-stack">
      <div class="account-center-hero ai-amber">
        <div>
          <div class="account-center-hero-title">${escapeHtml(family.name || 'Untitled family')}</div>
          <div class="account-center-hero-copy">
            Grant sponsored access so this workspace behaves like a paid family while the scholarship is active.
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Current Access</div>
        <div class="details-grid">
          <div><div class="details-label">Billing</div><div class="details-value">${adminFamilyAccessBadge(family)}</div></div>
          <div><div class="details-label">Scholarship Ends</div><div class="details-value">${escapeHtml(billingDateLabel(family.scholarship_ends_at) || 'Not set')}</div></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Scholarship Start</label>
          <input id="admin-scholarship-start" class="form-input" type="date" value="${escapeHtml(existingStart)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Scholarship End</label>
          <input id="admin-scholarship-end" class="form-input" type="date" value="${escapeHtml(existingEnd || existingStart)}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Reason / Note</label>
        <textarea id="admin-scholarship-note" class="form-textarea" style="min-height:110px;" placeholder="Optional note for why this family has sponsored access.">${escapeHtml(family.scholarship_note || '')}</textarea>
      </div>
    </div>
  `, [
    ...(family.scholarship_active ? [{ label: 'End Scholarship Now', cls: 'btn', fn: () => adminEndScholarshipNow(familyId) }] : []),
    { label: 'Save Scholarship', cls: 'btn-primary', fn: () => saveAdminScholarship(familyId) },
  ]);
}

function openAdminUserAccount(userId) {
  const user = (State.adminSnapshot?.users || []).find((item) => item.id === userId);
  if (!user) return;

  Modal.open(`User: ${user.full_name || 'Unnamed user'}`, `
    <div class="admin-modal-stack">
      <div class="account-center-hero ai-blue">
        <div>
          <div class="account-center-hero-title">${escapeHtml(user.full_name || 'Unnamed user')}</div>
          <div class="account-center-hero-copy">
            ${escapeHtml(adminFamilyName(user.family_id))} · ${escapeHtml(user.role || 'member')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Account summary</div>
        <div class="details-grid">
          <div>
            <div class="details-label">Status</div>
            <div class="details-value">${user.is_active ? 'Active' : 'Inactive'}</div>
          </div>
          <div>
            <div class="details-label">Created</div>
            <div class="details-value">${fmtDate(user.created_at)}</div>
          </div>
          <div>
            <div class="details-label">Family</div>
            <div class="details-value">${escapeHtml(adminFamilyName(user.family_id))}</div>
          </div>
          <div>
            <div class="details-label">Role</div>
            <div class="details-value">${escapeHtml(user.role || 'member')}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Management note</div>
        <div class="account-center-copy">
          Use activation controls carefully. Inactive users remain historically linked to records, but they should stop functioning as active workspace operators.
        </div>
      </div>
    </div>
  `, [
    {
      label: user.is_active ? 'Deactivate Account' : 'Reactivate Account',
      cls: user.is_active ? '' : 'btn-primary',
      fn: () => adminSetUserActive(userId, !user.is_active),
    },
  ]);
}

function openAdminFamilySummary(familyId) {
  const family = (State.adminSnapshot?.families || []).find((item) => item.id === familyId);
  if (!family) return;

  const users = (State.adminSnapshot?.users || []).filter((item) => item.family_id === familyId);
  const tickets = (State.adminSnapshot?.tickets || []).filter((item) => item.family_id === familyId);
  const billing = adminFamilyBillingState(family);

  Modal.open(`Family: ${family.name || 'Untitled family'}`, `
    <div class="admin-modal-stack">
      <div class="account-center-hero ai-green">
        <div>
          <div class="account-center-hero-title">${escapeHtml(family.name || 'Untitled family')}</div>
          <div class="account-center-hero-copy">${escapeHtml(family.description || 'No family description provided yet.')}</div>
        </div>
      </div>
      <div class="details-grid">
        <div class="card">
          <div class="details-label">Members</div>
          <div class="details-value">${users.length}</div>
        </div>
        <div class="card">
          <div class="details-label">Open tickets</div>
          <div class="details-value">${tickets.filter((item) => ['open', 'in_progress'].includes(item.status)).length}</div>
        </div>
        <div class="card">
          <div class="details-label">Created</div>
          <div class="details-value">${fmtDate(family.created_at)}</div>
        </div>
        <div class="card">
          <div class="details-label">Family ID</div>
          <div class="details-value">${escapeHtml(family.id)}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Billing and Scholarship</div>
        <div class="details-grid">
          <div>
            <div class="details-label">Access</div>
            <div class="details-value">${adminFamilyAccessBadge(family)}</div>
          </div>
          <div>
            <div class="details-label">Plan</div>
            <div class="details-value">${escapeHtml(billingPlanLabel(family.billing_plan || 'monthly'))}</div>
          </div>
          <div>
            <div class="details-label">Trial Ends</div>
            <div class="details-value">${escapeHtml(billingDateLabel(family.trial_ends_at) || 'Not set')}</div>
          </div>
          <div>
            <div class="details-label">Subscription Ends</div>
            <div class="details-value">${escapeHtml(billingDateLabel(family.subscription_ends_at) || 'Not set')}</div>
          </div>
          <div>
            <div class="details-label">Scholarship Ends</div>
            <div class="details-value">${escapeHtml(billingDateLabel(family.scholarship_ends_at) || 'Not set')}</div>
          </div>
          <div>
            <div class="details-label">Billing Currency</div>
            <div class="details-value">${escapeHtml((family.billing_currency || 'KES').toUpperCase())}</div>
          </div>
        </div>
        ${family.scholarship_note ? `<div class="account-center-copy" style="margin-top:12px;">${escapeHtml(family.scholarship_note)}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">Recent member snapshot</div>
        <div class="account-center-list">
          ${users.length
            ? users.slice(0, 8).map((item) => `<div>${escapeHtml(item.full_name || 'Unnamed user')} · ${escapeHtml(item.role || 'member')}</div>`).join('')
            : '<div>No users linked yet.</div>'}
        </div>
      </div>
    </div>
  `, [
    ...(family.scholarship_active ? [{ label: 'End Scholarship Now', cls: 'btn', fn: () => adminEndScholarshipNow(familyId, false) }] : []),
    { label: 'Manage Scholarship', cls: 'btn-primary', fn: () => openAdminScholarshipModal(familyId) },
  ]);
}

function adminPageActionsHtml() {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm" onclick="renderAdmin()">Refresh</button>
    </div>`;
}

async function renderAdmin() {
  setTopbar('Admin', adminPageActionsHtml());

  if (!isPlatformAdminUser()) {
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">
          <div class="card-title">Platform Admin Access Required</div>
          <div class="account-center-copy">
            This workspace is reserved for the FamilyOS platform owner or another approved platform admin.
          </div>
        </div>
      </div>`;
    return;
  }

  try {
    const { tickets, families, users } = await adminLoadData();
    document.getElementById('page-content').innerHTML = `
      <div class="content admin-page">
        <div class="card admin-hero-card">
          <div class="account-center-hero ai-red">
            <div>
              <div class="account-center-hero-title">Platform Control</div>
              <div class="account-center-hero-copy">
                Review cross-family support issues, track user account health, and inspect workspace activity from one operational console.
              </div>
            </div>
          </div>
        </div>

        ${adminOverviewMetrics(tickets, families, users)}

        <div class="admin-sections">
          <div class="card admin-list-card">
            <div class="admin-section-head">
              <div>
                <div class="card-title">Support Inbox</div>
                <div class="admin-section-sub">Recent issues across family workspaces.</div>
              </div>
              <span class="badge b-red">${tickets.filter((ticket) => ['open', 'in_progress'].includes(ticket.status)).length} active</span>
            </div>
            ${adminSupportTable(tickets)}
          </div>

          <div class="card admin-list-card">
            <div class="admin-section-head">
              <div>
                <div class="card-title">Families</div>
                <div class="admin-section-sub">Workspace-level visibility for support and operations.</div>
              </div>
              <span class="badge b-blue">${families.length} loaded</span>
            </div>
            ${adminFamilyTable(families, users, tickets)}
          </div>
        </div>

        <div class="card admin-list-card">
          <div class="admin-section-head">
            <div>
              <div class="card-title">Users</div>
              <div class="admin-section-sub">Account state, role coverage, and family placement in row view.</div>
            </div>
            <span class="badge b-green">${users.filter((user) => user.is_active).length} active</span>
          </div>
          ${adminUserTable(users)}
        </div>
      </div>`;
  } catch (error) {
    console.warn('[Admin] Failed to load platform admin data:', error);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">
          <div class="card-title">Admin data is not ready</div>
          <div class="account-center-copy">
            ${escapeHtml(error?.message || 'The admin workspace could not load right now. Confirm the platform support SQL and platform admin policies have been applied.')}
          </div>
        </div>
      </div>`;
  }
}

Router.register('admin', renderAdmin);
