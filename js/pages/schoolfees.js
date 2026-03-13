/**
 * js/pages/schoolfees.js
 * ─────────────────────────────────────────────────────
 * Track school fees per student: total due, paid, balance.
 */

async function renderSchoolFees() {
  setTopbar('School Fees', `<button class="btn btn-primary btn-sm" onclick="openAddStudent()">+ Add Student</button>`);
  const sb = DB.client;

  const [{ data: students }, { data: fees }] = await Promise.all([
    sb.from('students').select('*').eq('family_id', State.fid),
    sb.from('school_fees').select('*').eq('family_id', State.fid).order('year', { ascending: false }),
  ]);

  const totalDue  = (fees || []).reduce((a, b) => a + Number(b.total_fee),    0);
  const totalPaid = (fees || []).reduce((a, b) => a + Number(b.paid_amount),  0);

  // Group fee records by student
  const feesMap = {};
  (fees || []).forEach(f => { feesMap[f.student_id] = [...(feesMap[f.student_id] || []), f]; });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Students</div>
          <div class="metric-value">${(students || []).length}</div></div>
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
              <tr><th>Student</th><th>School</th><th>Term</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${(students || []).flatMap(s =>
                (feesMap[s.id] || [{ id: null, term: '—', year: '', total_fee: 0, paid_amount: 0 }]).map(f => `
                  <tr>
                    <td style="font-weight:600;">${s.name}</td>
                    <td style="font-size:12px;color:var(--text2);">${s.school}</td>
                    <td style="font-size:12px;">${f.term || '—'} ${f.year || ''}</td>
                    <td>KES ${fmt(f.total_fee)}</td>
                    <td style="color:var(--success);">KES ${fmt(f.paid_amount)}</td>
                    <td style="color:${f.total_fee - f.paid_amount > 0 ? 'var(--danger)' : 'var(--success)'};">
                      ${f.total_fee - f.paid_amount > 0 ? 'KES ' + fmt(f.total_fee - f.paid_amount) : 'Cleared'}
                    </td>
                    <td>${f.total_fee <= f.paid_amount
                      ? '<span class="badge b-green">Paid</span>'
                      : '<span class="badge b-amber">Partial</span>'
                    }</td>
                    <td>${f.id ? `<button class="btn btn-sm" onclick="openAddPayment('${f.id}',${f.paid_amount})">+ Pay</button>` : ''}</td>
                  </tr>`)
              ).join('')}
            </tbody>
          </table>
        </div>
        ${!(students || []).length ? empty('No students added yet') : ''}
      </div>
    </div>`;
}

function openAddStudent() {
  Modal.open('Add Student', `
    <div class="form-group"><label class="form-label">Student Name</label>
      <input id="st-name"   class="form-input" placeholder="Brian Otieno"/></div>
    <div class="form-group"><label class="form-label">School</label>
      <input id="st-school" class="form-input" placeholder="Alliance High School"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Admission Number</label>
        <input id="st-adm"  class="form-input" placeholder="ADM-2143"/></div>
      <div class="form-group"><label class="form-label">Year of Study</label>
        <input id="st-year" class="form-input" placeholder="Form 3"/></div>
    </div>
    <hr class="divider"/>
    <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Initial Fee Record</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Term</label>
        <input id="st-term" class="form-input" placeholder="Term 1"/></div>
      <div class="form-group"><label class="form-label">Year</label>
        <input id="st-yr"   class="form-input" type="number" placeholder="2025"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Total Fee (KES)</label>
        <input id="st-fee"  class="form-input" type="number" placeholder="50000"/></div>
      <div class="form-group"><label class="form-label">Amount Paid (KES)</label>
        <input id="st-paid" class="form-input" type="number" placeholder="0"/></div>
    </div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    const { data: st } = await DB.client.from('students').insert({
      family_id:        State.fid,
      name:             document.getElementById('st-name').value,
      school:           document.getElementById('st-school').value,
      admission_number: document.getElementById('st-adm').value,
      year_of_study:    document.getElementById('st-year').value,
    }).select().single();

    if (st && document.getElementById('st-fee').value) {
      await DB.client.from('school_fees').insert({
        student_id:   st.id,
        family_id:    State.fid,
        term:         document.getElementById('st-term').value,
        year:         parseInt(document.getElementById('st-yr').value) || new Date().getFullYear(),
        total_fee:    parseFloat(document.getElementById('st-fee').value)  || 0,
        paid_amount:  parseFloat(document.getElementById('st-paid').value) || 0,
      });
    }
    Modal.close();
    renderPage('schoolfees');
  }}]);
}

function openAddPayment(feeId, currentPaid) {
  Modal.open('Record Fee Payment', `
    <div class="form-group"><label class="form-label">Additional Amount Paid (KES)</label>
      <input id="fp-amount" class="form-input" type="number" placeholder="10000"/></div>
  `, [{ label: 'Save Payment', cls: 'btn-primary', fn: async () => {
    const extra = parseFloat(document.getElementById('fp-amount').value) || 0;
    await DB.client.from('school_fees').update({ paid_amount: currentPaid + extra }).eq('id', feeId);
    Modal.close();
    renderPage('schoolfees');
  }}]);
}

Router.register('schoolfees', renderSchoolFees);
