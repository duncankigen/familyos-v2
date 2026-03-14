/**
 * js/pages/schoolfees.js
 * ─────────────────────────────────────────────────────
 * Track school fees per student: total due, paid, balance.
 */

const SchoolFeesPage = {
  students: [],
  fees: [],
  payments: [],
  accounts: [],
  studentById: {},
  feesByStudent: {},
  paymentsByFee: {},
  accountById: {},
  expandedPaymentIds: new Set(),
};

function canManageSchoolFees() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

function schoolFeesInputValue(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function schoolFeeBalance(fee) {
  return Math.max(0, Number(fee?.total_fee || 0) - Number(fee?.paid_amount || 0));
}

function schoolFeeDateValue(dateValue) {
  return dateValue ? String(dateValue).split('T')[0] : '';
}

function schoolFeeStudent(studentId) {
  return SchoolFeesPage.studentById[studentId] || null;
}

function schoolFeeRecord(feeId) {
  return SchoolFeesPage.fees.find((fee) => fee.id === feeId) || null;
}

function schoolFeePayment(paymentId) {
  return SchoolFeesPage.payments.find((payment) => payment.id === paymentId) || null;
}

function schoolFeeAttachmentLink(payment) {
  if (!payment.attachment_url) return '';
  return `<a class="details-link" href="${payment.attachment_url}" target="_blank" rel="noopener noreferrer">${escapeHtml(payment.attachment_name || 'View attachment')}</a>`;
}

function schoolFeeAccountOptions(selectedId = '') {
  return `
    <option value="">— None —</option>
    ${SchoolFeesPage.accounts.map((account) => `
      <option value="${account.id}" ${selectedId === account.id ? 'selected' : ''}>
        ${account.name}${account.account_number ? ` · ${account.account_number}` : ''}
      </option>
    `).join('')}
  `;
}

function schoolFeeHistoryMarkup(feeId) {
  const payments = SchoolFeesPage.paymentsByFee[feeId] || [];
  if (!payments.length) {
    return `<div style="font-size:12px;color:var(--text3);">No payments recorded yet.</div>`;
  }

  return payments.map((payment) => `
    <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
      <div class="flex-between" style="align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;" onclick="toggleSchoolFeePaymentDetails('${feeId}','${payment.id}')">
          <div style="font-size:13px;font-weight:600;">KES ${fmt(payment.amount)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px;">
            ${fmtDate(payment.payment_date || payment.created_at)}
            ${payment.reference ? `· ${payment.reference}` : ''}
          </div>
          <a class="details-toggle" href="#" onclick="event.preventDefault();event.stopPropagation();toggleSchoolFeePaymentDetails('${feeId}','${payment.id}')">
            ${SchoolFeesPage.expandedPaymentIds.has(payment.id) ? 'Hide details' : 'View details'}
          </a>
        </div>
        ${canManageSchoolFees() ? `<button class="btn btn-sm" onclick="openSchoolFeePaymentModal('${feeId}','${payment.id}')">Edit</button>` : ''}
      </div>
      ${SchoolFeesPage.expandedPaymentIds.has(payment.id) ? `
        <div style="margin-top:10px;">
          <div class="details-panel">
            <div class="details-grid">
              <div>
                <div class="details-label">Payment Account</div>
                <div class="details-value">${escapeHtml(SchoolFeesPage.accountById[payment.payment_account_id]?.name || 'No linked account')}</div>
              </div>
              <div>
                <div class="details-label">Attachment</div>
                <div class="details-value">${payment.attachment_url ? schoolFeeAttachmentLink(payment) : '—'}</div>
              </div>
            </div>
            <div style="margin-top:10px;">
              <div class="details-label">Notes</div>
              <div class="details-value">${payment.notes ? escapeHtml(payment.notes) : 'No notes added.'}</div>
            </div>
          </div>
        </div>` : ''}
    </div>
  `).join('');
}

function studentFormMarkup(student = null) {
  return `
    <div class="form-group"><label class="form-label">Student Name</label>
      <input id="st-name" class="form-input" placeholder="Brian Otieno" value="${schoolFeesInputValue(student?.name)}"/></div>
    <div class="form-group"><label class="form-label">School</label>
      <input id="st-school" class="form-input" placeholder="Alliance High School" value="${schoolFeesInputValue(student?.school)}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Admission Number</label>
        <input id="st-adm" class="form-input" placeholder="ADM-2143" value="${schoolFeesInputValue(student?.admission_number)}"/></div>
      <div class="form-group"><label class="form-label">Year of Study</label>
        <input id="st-year" class="form-input" placeholder="Form 3" value="${schoolFeesInputValue(student?.year_of_study)}"/></div>
    </div>
  `;
}

function termFormMarkup(fee = null) {
  return `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Term</label>
        <input id="sf-term" class="form-input" placeholder="Term 1" value="${schoolFeesInputValue(fee?.term)}"/></div>
      <div class="form-group"><label class="form-label">Year</label>
        <input id="sf-year" class="form-input" type="number" placeholder="${new Date().getFullYear()}" value="${schoolFeesInputValue(fee?.year)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Total Fee (KES)</label>
        <input id="sf-total" class="form-input" type="number" placeholder="50000" value="${schoolFeesInputValue(fee?.total_fee)}"/></div>
      <div class="form-group"><label class="form-label">Due Date</label>
        <input id="sf-due" class="form-input" type="date" value="${schoolFeeDateValue(fee?.due_date)}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <input id="sf-notes" class="form-input" placeholder="Boarding + transport" value="${schoolFeesInputValue(fee?.notes)}"/></div>
  `;
}

function paymentFormMarkup(payment = null) {
  return `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Amount (KES)</label>
        <input id="fp-amount" class="form-input" type="number" placeholder="10000" value="${schoolFeesInputValue(payment?.amount)}"/></div>
      <div class="form-group"><label class="form-label">Payment Date</label>
        <input id="fp-date" class="form-input" type="date" value="${schoolFeeDateValue(payment?.payment_date)}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Payment Account</label>
      <select id="fp-account" class="form-select">
        ${schoolFeeAccountOptions(payment?.payment_account_id || '')}
      </select></div>
    <div class="form-group"><label class="form-label">Reference</label>
      <input id="fp-ref" class="form-input" placeholder="Bank slip / M-Pesa ref" value="${schoolFeesInputValue(payment?.reference)}"/></div>
    <div class="form-group"><label class="form-label">Notes</label>
      <input id="fp-notes" class="form-input" placeholder="Optional payment notes" value="${schoolFeesInputValue(payment?.notes)}"/></div>
    <div class="form-group"><label class="form-label">Attachment (optional)</label>
      <input id="fp-attachment" class="form-input" type="file" accept="image/*,.pdf,.doc,.docx"/>
      ${payment?.attachment_url ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;">Current: ${schoolFeeAttachmentLink(payment)}</div>` : ''}
    </div>
  `;
}

function initialPaymentMarkup() {
  return `
    <hr class="divider"/>
    <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Optional Initial Payment</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Amount Paid (KES)</label>
        <input id="sf-initial-paid" class="form-input" type="number" placeholder="0"/></div>
      <div class="form-group"><label class="form-label">Payment Date</label>
        <input id="sf-initial-date" class="form-input" type="date" value="${schoolFeeDateValue(new Date().toISOString())}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Payment Account</label>
        <select id="sf-initial-account" class="form-select">
          ${schoolFeeAccountOptions('')}
        </select></div>
      <div class="form-group"><label class="form-label">Reference</label>
        <input id="sf-initial-ref" class="form-input" placeholder="Receipt / M-Pesa ref"/></div>
    </div>
    <div class="form-group"><label class="form-label">Attachment (optional)</label>
      <input id="sf-initial-attachment" class="form-input" type="file" accept="image/*,.pdf,.doc,.docx"/></div>
  `;
}

function toggleSchoolFeePaymentDetails(feeId, paymentId) {
  const fee = schoolFeeRecord(feeId);
  if (!fee) return;
  if (SchoolFeesPage.expandedPaymentIds.has(paymentId)) SchoolFeesPage.expandedPaymentIds.delete(paymentId);
  else SchoolFeesPage.expandedPaymentIds.add(paymentId);
  openManageSchoolFee(fee.student_id, feeId);
}

async function renderSchoolFees() {
  setTopbar(
    'School Fees',
    canManageSchoolFees() ? `<button class="btn btn-primary btn-sm" onclick="openAddStudent()">+ Add Student</button>` : ''
  );

  const sb = DB.client;
  const [{ data: students, error: studentsError }, { data: fees, error: feesError }, { data: payments, error: paymentsError }, { data: accounts, error: accountsError }] = await Promise.all([
    sb.from('students').select('*').eq('family_id', State.fid).order('name'),
    sb.from('school_fees').select('*').eq('family_id', State.fid).order('year', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('school_fee_payments').select('*').eq('family_id', State.fid).order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('payment_accounts').select('id,name,account_number,account_type,reference_note').eq('family_id', State.fid).order('name'),
  ]);

  if (studentsError || feesError || paymentsError || accountsError) {
    console.error('[SchoolFees] Failed to load:', studentsError || feesError || paymentsError || accountsError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load school fees right now')}</div>
      </div>`;
    return;
  }

  SchoolFeesPage.students = students || [];
  SchoolFeesPage.fees = fees || [];
  SchoolFeesPage.payments = payments || [];
  SchoolFeesPage.accounts = accounts || [];
  SchoolFeesPage.studentById = Object.fromEntries(SchoolFeesPage.students.map((student) => [student.id, student]));
  SchoolFeesPage.accountById = Object.fromEntries(SchoolFeesPage.accounts.map((account) => [account.id, account]));
  SchoolFeesPage.feesByStudent = {};
  SchoolFeesPage.paymentsByFee = {};

  SchoolFeesPage.fees.forEach((fee) => {
    if (!SchoolFeesPage.feesByStudent[fee.student_id]) SchoolFeesPage.feesByStudent[fee.student_id] = [];
    SchoolFeesPage.feesByStudent[fee.student_id].push(fee);
  });

  SchoolFeesPage.payments.forEach((payment) => {
    if (!SchoolFeesPage.paymentsByFee[payment.school_fee_id]) SchoolFeesPage.paymentsByFee[payment.school_fee_id] = [];
    SchoolFeesPage.paymentsByFee[payment.school_fee_id].push(payment);
  });

  const totalDue = SchoolFeesPage.fees.reduce((sum, fee) => sum + Number(fee.total_fee), 0);
  const totalPaid = SchoolFeesPage.fees.reduce((sum, fee) => sum + Number(fee.paid_amount), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Students</div>
          <div class="metric-value">${SchoolFeesPage.students.length}</div></div>
        <div class="metric-card"><div class="metric-label">Total Due</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(totalDue)}</div></div>
        <div class="metric-card"><div class="metric-label">Total Paid</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(totalPaid)}</div></div>
        <div class="metric-card"><div class="metric-label">Outstanding</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(totalDue - totalPaid)}</div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Student</th><th>School</th><th>Term</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th>${canManageSchoolFees() ? '<th></th>' : ''}</tr>
            </thead>
            <tbody>
              ${SchoolFeesPage.students.flatMap((student) => {
                const studentFees = SchoolFeesPage.feesByStudent[student.id] || [null];
                return studentFees.map((fee) => `
                  <tr>
                    <td style="font-weight:600;">${student.name}</td>
                    <td style="font-size:12px;color:var(--text2);">${student.school}</td>
                    <td style="font-size:12px;">${fee ? `${fee.term || '—'} ${fee.year || ''}` : '—'}</td>
                    <td>${fee ? `KES ${fmt(fee.total_fee)}` : '<span style="color:var(--text3);">—</span>'}</td>
                    <td style="color:var(--success);">${fee ? `KES ${fmt(fee.paid_amount)}` : '<span style="color:var(--text3);">—</span>'}</td>
                    <td style="color:${fee && schoolFeeBalance(fee) > 0 ? 'var(--danger)' : 'var(--success)'};">
                      ${fee ? (schoolFeeBalance(fee) > 0 ? `KES ${fmt(schoolFeeBalance(fee))}` : 'Cleared') : '<span style="color:var(--text3);">No fee record</span>'}
                    </td>
                    <td>${fee
                      ? (schoolFeeBalance(fee) === 0
                        ? '<span class="badge b-green">Paid</span>'
                        : '<span class="badge b-amber">Partial</span>')
                      : '<span class="badge b-gray">No Record</span>'
                    }</td>
                    ${canManageSchoolFees() ? `
                      <td>
                        <div class="flex gap8">
                          <button class="btn btn-sm" onclick="${fee ? `openManageSchoolFee('${student.id}','${fee.id}')` : `openManageStudent('${student.id}')`}">Manage</button>
                          ${fee
                            ? `<button class="btn btn-sm" onclick="openSchoolFeePaymentModal('${fee.id}')">+ Pay</button>`
                            : `<button class="btn btn-sm" onclick="openSchoolFeeTermModal('${student.id}')">+ Term</button>`}
                        </div>
                      </td>` : ''}
                  </tr>`);
              }).join('')}
            </tbody>
          </table>
        </div>
        ${!SchoolFeesPage.students.length ? empty('No students added yet') : ''}
      </div>
    </div>`;
}

function openAddStudent() {
  if (!canManageSchoolFees()) return;

  Modal.open('Add Student', `
    ${studentFormMarkup()}
    <hr class="divider"/>
    <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Initial Fee Record</div>
    ${termFormMarkup()}
    ${initialPaymentMarkup()}
    <p id="student-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Save',
    cls: 'btn-primary',
    fn: saveStudentWithOptionalFee,
  }]);
}

async function saveStudentWithOptionalFee() {
  hideErr('student-err');

  const name = document.getElementById('st-name')?.value.trim() || '';
  const school = document.getElementById('st-school')?.value.trim() || '';
  if (!name || !school) {
    showErr('student-err', 'Student name and school are required.');
    return;
  }

  const { data: student, error: studentError } = await DB.client.from('students').insert({
    family_id: State.fid,
    name,
    school,
    admission_number: document.getElementById('st-adm')?.value.trim() || null,
    year_of_study: document.getElementById('st-year')?.value.trim() || null,
    updated_at: new Date().toISOString(),
  }).select().single();

  if (studentError || !student) {
    showErr('student-err', studentError?.message || 'Unable to save student.');
    return;
  }

  const term = document.getElementById('sf-term')?.value.trim() || '';
  const totalFee = parseFloat(document.getElementById('sf-total')?.value || '');
  const hasFeeDetails = Boolean(term || document.getElementById('sf-year')?.value || document.getElementById('sf-due')?.value || document.getElementById('sf-notes')?.value || document.getElementById('sf-initial-paid')?.value);

  if (hasFeeDetails) {
    if (!term || isNaN(totalFee) || totalFee < 0) {
      showErr('student-err', 'Provide a term and total fee to create the initial fee record.');
      return;
    }

    const { data: fee, error: feeError } = await DB.client.from('school_fees').insert({
      student_id: student.id,
      family_id: State.fid,
      term,
      year: parseInt(document.getElementById('sf-year')?.value || '', 10) || new Date().getFullYear(),
      total_fee: totalFee,
      paid_amount: 0,
      due_date: document.getElementById('sf-due')?.value || null,
      notes: document.getElementById('sf-notes')?.value.trim() || null,
      updated_at: new Date().toISOString(),
    }).select().single();

    if (feeError || !fee) {
      showErr('student-err', feeError?.message || 'Unable to save the initial fee record.');
      return;
    }

    const initialPaid = parseFloat(document.getElementById('sf-initial-paid')?.value || '');
    if (!isNaN(initialPaid) && initialPaid > 0) {
      const initialAttachment = await schoolFeeAttachmentPayload('sf-initial-attachment', 'school-fees');
      if (initialAttachment.error) {
        showErr('student-err', initialAttachment.error.message || 'Unable to upload attachment.');
        return;
      }
      const { error: paymentError } = await DB.client.from('school_fee_payments').insert({
        family_id: State.fid,
        school_fee_id: fee.id,
        amount: initialPaid,
        payment_date: document.getElementById('sf-initial-date')?.value || schoolFeeDateValue(new Date().toISOString()),
        payment_account_id: document.getElementById('sf-initial-account')?.value || null,
        reference: document.getElementById('sf-initial-ref')?.value.trim() || 'Initial payment',
        recorded_by: State.uid,
        ...initialAttachment,
      });

      if (paymentError) {
        showErr('student-err', paymentError.message);
        return;
      }
    }
  }

  Modal.close();
  renderPage('schoolfees');
}

function openManageStudent(studentId) {
  if (!canManageSchoolFees()) return;

  const student = schoolFeeStudent(studentId);
  if (!student) return;
  const feeList = SchoolFeesPage.feesByStudent[studentId] || [];

  Modal.open('Manage Student', `
    ${studentFormMarkup(student)}
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Fee Records</div>
      ${feeList.length ? feeList.map((fee) => `
        <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
          <div class="flex-between" style="gap:8px;">
            <div>
              <div style="font-size:13px;font-weight:600;">${fee.term} ${fee.year}</div>
              <div style="font-size:12px;color:var(--text2);">Outstanding KES ${fmt(schoolFeeBalance(fee))}</div>
            </div>
            <button class="btn btn-sm" onclick="openManageSchoolFee('${studentId}','${fee.id}')">Manage</button>
          </div>
        </div>
      `).join('') : `<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">No fee records yet.</div>`}
    </div>
    <p id="student-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [
    { label: 'New Term', cls: 'btn', fn: () => openSchoolFeeTermModal(studentId) },
    { label: 'Save Changes', cls: 'btn-primary', fn: () => saveStudent(studentId) },
  ]);
}

async function saveStudent(studentId) {
  hideErr('student-err');

  const name = document.getElementById('st-name')?.value.trim() || '';
  const school = document.getElementById('st-school')?.value.trim() || '';
  if (!name || !school) {
    showErr('student-err', 'Student name and school are required.');
    return;
  }

  const { error } = await DB.client.from('students').update({
    name,
    school,
    admission_number: document.getElementById('st-adm')?.value.trim() || null,
    year_of_study: document.getElementById('st-year')?.value.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', studentId);

  if (error) {
    showErr('student-err', error.message);
    return;
  }

  Modal.close();
  renderPage('schoolfees');
}

function openSchoolFeeTermModal(studentId) {
  if (!canManageSchoolFees()) return;

  const student = schoolFeeStudent(studentId);
  if (!student) return;

  Modal.open(`New Term — ${student.name}`, `
    ${termFormMarkup()}
    ${initialPaymentMarkup()}
    <p id="term-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Save Term',
    cls: 'btn-primary',
    fn: () => saveSchoolFeeTerm(studentId),
  }]);
}

async function saveSchoolFeeTerm(studentId) {
  hideErr('term-err');

  const term = document.getElementById('sf-term')?.value.trim() || '';
  const totalFee = parseFloat(document.getElementById('sf-total')?.value || '');
  if (!term || isNaN(totalFee) || totalFee < 0) {
    showErr('term-err', 'Term and total fee are required.');
    return;
  }

  const { data: fee, error } = await DB.client.from('school_fees').insert({
    student_id: studentId,
    family_id: State.fid,
    term,
    year: parseInt(document.getElementById('sf-year')?.value || '', 10) || new Date().getFullYear(),
    total_fee: totalFee,
    paid_amount: 0,
    due_date: document.getElementById('sf-due')?.value || null,
    notes: document.getElementById('sf-notes')?.value.trim() || null,
    updated_at: new Date().toISOString(),
  }).select().single();

  if (error || !fee) {
    showErr('term-err', error?.message || 'Unable to save school fee record.');
    return;
  }

  const initialPaid = parseFloat(document.getElementById('sf-initial-paid')?.value || '');
  if (!isNaN(initialPaid) && initialPaid > 0) {
    const initialAttachment = await schoolFeeAttachmentPayload('sf-initial-attachment', 'school-fees');
    if (initialAttachment.error) {
      showErr('term-err', initialAttachment.error.message || 'Unable to upload attachment.');
      return;
    }
    const { error: paymentError } = await DB.client.from('school_fee_payments').insert({
      family_id: State.fid,
      school_fee_id: fee.id,
      amount: initialPaid,
      payment_date: document.getElementById('sf-initial-date')?.value || schoolFeeDateValue(new Date().toISOString()),
      payment_account_id: document.getElementById('sf-initial-account')?.value || null,
      reference: document.getElementById('sf-initial-ref')?.value.trim() || 'Initial payment',
      recorded_by: State.uid,
      ...initialAttachment,
    });

    if (paymentError) {
      showErr('term-err', paymentError.message);
      return;
    }
  }

  Modal.close();
  renderPage('schoolfees');
}

function openManageSchoolFee(studentId, feeId) {
  if (!canManageSchoolFees()) return;

  const student = schoolFeeStudent(studentId);
  const fee = schoolFeeRecord(feeId);
  if (!student || !fee) return;

  Modal.open(`Manage Fee — ${student.name}`, `
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">
      ${student.school}${student.year_of_study ? ` · ${student.year_of_study}` : ''}
    </div>
    ${termFormMarkup(fee)}
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
      <div class="flex-between" style="margin-bottom:10px;">
        <div style="font-size:13px;font-weight:600;">Payment History</div>
        <button class="btn btn-sm" onclick="openSchoolFeePaymentModal('${fee.id}')">+ Pay</button>
      </div>
      ${schoolFeeHistoryMarkup(fee.id)}
    </div>
    <p id="fee-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [
    { label: 'Edit Student', cls: 'btn', fn: () => openManageStudent(studentId) },
    { label: 'New Term', cls: 'btn', fn: () => openSchoolFeeTermModal(studentId) },
    { label: 'Save Changes', cls: 'btn-primary', fn: () => saveSchoolFee(feeId) },
  ]);
}

async function saveSchoolFee(feeId) {
  hideErr('fee-err');

  const term = document.getElementById('sf-term')?.value.trim() || '';
  const totalFee = parseFloat(document.getElementById('sf-total')?.value || '');
  if (!term || isNaN(totalFee) || totalFee < 0) {
    showErr('fee-err', 'Term and total fee are required.');
    return;
  }

  const { error } = await DB.client.from('school_fees').update({
    term,
    year: parseInt(document.getElementById('sf-year')?.value || '', 10) || new Date().getFullYear(),
    total_fee: totalFee,
    due_date: document.getElementById('sf-due')?.value || null,
    notes: document.getElementById('sf-notes')?.value.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', feeId);

  if (error) {
    showErr('fee-err', error.message);
    return;
  }

  Modal.close();
  renderPage('schoolfees');
}

function openSchoolFeePaymentModal(feeId, paymentId = null) {
  if (!canManageSchoolFees()) return;

  const fee = schoolFeeRecord(feeId);
  const payment = paymentId ? schoolFeePayment(paymentId) : null;
  if (!fee) return;

  Modal.open(payment ? 'Edit Fee Payment' : 'Record Fee Payment', `
    ${paymentFormMarkup(payment)}
    <p id="payment-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: payment ? 'Save Changes' : 'Save Payment',
    cls: 'btn-primary',
    fn: () => saveSchoolFeePayment(feeId, paymentId),
  }]);
}

async function saveSchoolFeePayment(feeId, paymentId = null) {
  hideErr('payment-err');

  const amount = parseFloat(document.getElementById('fp-amount')?.value || '');
  if (!amount || amount <= 0) {
    showErr('payment-err', 'Enter a valid payment amount.');
    return;
  }

  const attachmentPayload = await schoolFeeAttachmentPayload('fp-attachment', 'school-fees');
  if (attachmentPayload.error) {
    showErr('payment-err', attachmentPayload.error.message || 'Unable to upload attachment.');
    return;
  }

  const payload = {
    amount,
    payment_date: document.getElementById('fp-date')?.value || schoolFeeDateValue(new Date().toISOString()),
    payment_account_id: document.getElementById('fp-account')?.value || null,
    reference: document.getElementById('fp-ref')?.value.trim() || null,
    notes: document.getElementById('fp-notes')?.value.trim() || null,
    ...attachmentPayload,
  };

  let error = null;
  if (paymentId) {
    ({ error } = await DB.client.from('school_fee_payments').update(payload).eq('id', paymentId));
  } else {
    ({ error } = await DB.client.from('school_fee_payments').insert({
      family_id: State.fid,
      school_fee_id: feeId,
      recorded_by: State.uid,
      ...payload,
    }));
  }

  if (error) {
    showErr('payment-err', error.message);
    return;
  }

  Modal.close();
  renderPage('schoolfees');
}

async function schoolFeeAttachmentPayload(inputId, folder) {
  const file = document.getElementById(inputId)?.files?.[0] || null;
  if (!file) return {};

  const upload = await uploadFinanceAttachment(file, folder);
  if (upload.error) return { error: upload.error };

  return {
    attachment_url: upload.url,
    attachment_name: upload.name,
  };
}

Router.register('schoolfees', renderSchoolFees);
