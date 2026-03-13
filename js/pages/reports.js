/**
 * js/pages/reports.js
 * ─────────────────────────────────────────────────────
 * Financial reports with Chart.js visualisations.
 * Monthly income vs expense bar chart + expense category
 * doughnut chart.
 */

let _chartBar    = null;
let _chartDonate = null;

async function renderReports() {
  setTopbar('Reports');
  const sb  = DB.client;
  const fid = State.fid;

  const [{ data: contrib }, { data: exp }, { data: members }] = await Promise.all([
    sb.from('contributions').select('amount,created_at,users(full_name)').eq('family_id', fid),
    sb.from('expenses').select('amount,created_at,category').eq('family_id', fid),
    sb.from('users').select('id,full_name').eq('family_id', fid),
  ]);

  // Build 12-month rolling data
  const months  = [];
  const mContrib = [];
  const mExp     = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lbl = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    months.push(lbl);
    const mo = d.getMonth(), yr = d.getFullYear();
    mContrib.push((contrib || []).filter(c => { const dd = new Date(c.created_at); return dd.getMonth() === mo && dd.getFullYear() === yr; }).reduce((a, b) => a + Number(b.amount), 0));
    mExp.push(   (exp     || []).filter(e => { const dd = new Date(e.created_at); return dd.getMonth() === mo && dd.getFullYear() === yr; }).reduce((a, b) => a + Number(b.amount), 0));
  }

  // Expense categories
  const catMap = {};
  (exp || []).forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
  const catKeys = Object.keys(catMap);
  const catVals = catKeys.map(k => catMap[k]);
  const catColors = ['#185FA5','#639922','#BA7517','#A32D2D','#534AB7','#085041','#633806'];

  // Top contributors
  const memberMap = {};
  (contrib || []).forEach(c => {
    const n = c.users?.full_name || 'Unknown';
    memberMap[n] = (memberMap[n] || 0) + Number(c.amount);
  });
  const topContrib = Object.entries(memberMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalC     = (contrib || []).reduce((a, b) => a + Number(b.amount), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Contributions</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(totalC)}</div></div>
        <div class="metric-card"><div class="metric-label">Total Expenses</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt((exp || []).reduce((a, b) => a + Number(b.amount), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Net Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(totalC - (exp || []).reduce((a, b) => a + Number(b.amount), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Contributors</div>
          <div class="metric-value">${Object.keys(memberMap).length}</div></div>
      </div>

      <!-- Charts row -->
      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Monthly Contributions vs Expenses (12 months)</div>
          <canvas id="bar-chart" height="260"></canvas>
        </div>
        <div class="card">
          <div class="card-title">Expenses by Category</div>
          <canvas id="donut-chart" height="260"></canvas>
        </div>
      </div>

      <!-- Top contributors table -->
      <div class="card">
        <div class="card-title">Top Contributors</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Total Contributed</th><th>Share</th></tr></thead>
            <tbody>
              ${topContrib.map(([name, amount]) => `
                <tr>
                  <td><div class="flex gap8">${avatarHtml(name, 'av-sm')} ${name}</div></td>
                  <td><strong style="color:var(--success);">KES ${fmt(amount)}</strong></td>
                  <td>
                    <div class="flex gap8" style="align-items:center;">
                      <div class="progress" style="width:80px;">
                        <div class="progress-fill" style="width:${totalC ? Math.round(amount / totalC * 100) : 0}%;background:var(--accent);"></div>
                      </div>
                      <span style="font-size:12px;">${totalC ? Math.round(amount / totalC * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Destroy old chart instances to prevent canvas reuse errors
  if (_chartBar)    { _chartBar.destroy();    _chartBar    = null; }
  if (_chartDonate) { _chartDonate.destroy(); _chartDonate = null; }

  // Bar chart
  const barCtx = document.getElementById('bar-chart')?.getContext('2d');
  if (barCtx) {
    _chartBar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Contributions', data: mContrib, backgroundColor: 'rgba(99,153,34,0.7)', borderRadius: 4 },
          { label: 'Expenses',      data: mExp,     backgroundColor: 'rgba(162,45,45,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'K' + Math.round(v / 1000) } } },
      },
    });
  }

  // Doughnut chart
  const donutCtx = document.getElementById('donut-chart')?.getContext('2d');
  if (donutCtx && catKeys.length) {
    _chartDonate = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels:   catKeys,
        datasets: [{ data: catVals, backgroundColor: catColors }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right' } },
      },
    });
  }
}

Router.register('reports', renderReports);
