/**
 * js/pages/reports.js
 * ─────────────────────────────────────────────────────
 * Financial reports with Chart.js visualisations and
 * export actions for family summary data.
 */

let _chartBar = null;
let _chartDonate = null;

const ReportsPage = {
  summaryRows: [],
  contributionRows: [],
  expenseRows: [],
};

function reportActionsHtml() {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm" onclick="downloadReportsSummaryCsv()">Summary CSV</button>
      <button class="btn btn-sm" onclick="downloadReportsContributionsCsv()">Contributions CSV</button>
      <button class="btn btn-sm" onclick="downloadReportsExpensesCsv()">Expenses CSV</button>
      <button class="btn btn-sm" onclick="printReportsView()">Print</button>
    </div>`;
}

function buildMonthlySeries(items, accessor) {
  const months = [];
  const values = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = monthDate.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();

    months.push(label);
    values.push((items || [])
      .filter((item) => {
        const date = new Date(item.created_at);
        return date.getMonth() === month && date.getFullYear() === year;
      })
      .reduce((sum, item) => sum + Number(accessor(item) || 0), 0));
  }

  return { months, values };
}

function downloadReportsSummaryCsv() {
  if (!downloadCsv(`familyos-reports-summary-${exportDateStamp()}.csv`, ReportsPage.summaryRows)) {
    alert('There is no summary data to export yet.');
  }
}

function downloadReportsContributionsCsv() {
  if (!downloadCsv(`familyos-contributions-report-${exportDateStamp()}.csv`, ReportsPage.contributionRows)) {
    alert('There are no contributions to export yet.');
  }
}

function downloadReportsExpensesCsv() {
  if (!downloadCsv(`familyos-expenses-report-${exportDateStamp()}.csv`, ReportsPage.expenseRows)) {
    alert('There are no expenses to export yet.');
  }
}

function printReportsView() {
  const content = document.getElementById('page-content');
  if (!content) return;
  openPrintDocument('FamilyOS Reports', content.innerHTML);
}

async function renderReports() {
  setTopbar('Reports', reportActionsHtml());
  const sb = DB.client;
  const fid = State.fid;
  const now = new Date();
  const { data: projects } = await sb.from('projects').select('id,project_type').eq('family_id', fid);
  const farmingProjectIds = (projects || []).filter((project) => project.project_type === 'farming').map((project) => project.id);
  const { data: farmOutputs } = farmingProjectIds.length
    ? await sb.from('farm_outputs').select('project_id,usage_type,total_value,quantity,output_category,created_at').in('project_id', farmingProjectIds)
    : { data: [] };
  const { data: farmInputs } = farmingProjectIds.length
    ? await sb.from('farm_inputs').select('project_id,quantity,cost_per_unit').in('project_id', farmingProjectIds)
    : { data: [] };
  const { data: activities } = farmingProjectIds.length
    ? await sb.from('project_activities').select('project_id,cost').in('project_id', farmingProjectIds)
    : { data: [] };
  const { data: livestock } = farmingProjectIds.length
    ? await sb.from('livestock').select('id,project_id').in('project_id', farmingProjectIds)
    : { data: [] };
  const livestockIds = (livestock || []).map((item) => item.id);
  const { data: livestockEventsRaw } = livestockIds.length
    ? await sb.from('livestock_events').select('livestock_id,cost').in('livestock_id', livestockIds)
    : { data: [] };
  const livestockProjectById = Object.fromEntries((livestock || []).map((item) => [item.id, item.project_id]));
  const livestockEvents = (livestockEventsRaw || []).map((event) => ({
    ...event,
    project_id: livestockProjectById[event.livestock_id] || null,
  }));

  const [
    { data: contrib },
    { data: exp },
    { data: members },
    { data: vendors },
    { data: assets },
    { data: tasks },
    { data: meetings },
    { data: goals },
    { data: documents },
    { data: insights },
  ] = await Promise.all([
    sb.from('contributions').select('amount,created_at,user_id,contribution_type').eq('family_id', fid).order('created_at', { ascending: false }),
    sb.from('expenses').select('amount,created_at,category,description,project_id,vendor_id').eq('family_id', fid).order('created_at', { ascending: false }),
    sb.from('users').select('id,full_name').eq('family_id', fid),
    sb.from('vendors').select('id,name').eq('family_id', fid),
    sb.from('assets').select('id,name,asset_type,status,estimated_value,monthly_income').eq('family_id', fid),
    sb.from('tasks').select('assigned_vendor').eq('family_id', fid),
    sb.from('meetings').select('id,status').eq('family_id', fid),
    sb.from('family_goals').select('id,status').eq('family_id', fid),
    sb.from('documents').select('id,access_level').eq('family_id', fid),
    sb.from('ai_insights').select('id,is_read,expires_at').eq('family_id', fid),
  ]);

  const membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));
  const cashSummary = FinanceCore.buildCashSummary(contrib || [], exp || []);
  const totalContributions = cashSummary.total_contributions;
  const totalExpenses = cashSummary.total_expenses;
  const netBalance = cashSummary.balance;

  const contributionSeries = buildMonthlySeries(contrib || [], (item) => item.amount);
  const expenseSeries = buildMonthlySeries(exp || [], (item) => item.amount);

  const categoryTotals = {};
  (exp || []).forEach((item) => {
    const key = item.category || 'other';
    categoryTotals[key] = (categoryTotals[key] || 0) + Number(item.amount || 0);
  });

  const memberTotals = {};
  (contrib || []).forEach((item) => {
    const name = membersById[item.user_id]?.full_name || 'Unknown';
    memberTotals[name] = (memberTotals[name] || 0) + Number(item.amount || 0);
  });

  const topContributors = Object.entries(memberTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const vendorLedger = FinanceCore.buildVendorLedger(vendors || [], exp || [], tasks || []);
  const vendorSpend = vendorLedger.topVendors;

  const activeAssets = (assets || []).filter((asset) => (asset.status || 'active') === 'active');
  const archivedAssets = (assets || []).filter((asset) => (asset.status || 'active') === 'archived').length;
  const assetValue = activeAssets.reduce((sum, asset) => sum + Number(asset.estimated_value || 0), 0);
  const assetIncome = activeAssets.reduce((sum, asset) => sum + Number(asset.monthly_income || 0), 0);

  const farmSummary = FinanceCore.buildFarmSummary(
    projects || [],
    farmOutputs || [],
    farmInputs || [],
    activities || [],
    livestockEvents || [],
    exp || [],
  );
  const farmSales = farmSummary.salesValue;

  const scheduledMeetings = (meetings || []).filter((meeting) => meeting.status === 'scheduled').length;
  const activeGoals = (goals || []).filter((goal) => goal.status === 'active').length;
  const unreadInsights = (insights || []).filter((insight) => !insight.is_read && (!insight.expires_at || new Date(insight.expires_at) > now)).length;
  const contributorsCount = Object.keys(memberTotals).length;
  const totalVendorSpend = vendorLedger.totalPaid;

  ReportsPage.summaryRows = [
    { metric: 'Generated On', value: fmtDate(now.toISOString()) },
    { metric: 'Total Contributions', value: totalContributions },
    { metric: 'Total Expenses', value: totalExpenses },
    { metric: 'Net Balance', value: netBalance },
    { metric: 'Contributors', value: contributorsCount },
    { metric: 'Scheduled Meetings', value: scheduledMeetings },
    { metric: 'Active Goals', value: activeGoals },
    { metric: 'Vault Documents', value: (documents || []).length },
    { metric: 'Unread AI Insights', value: unreadInsights },
    { metric: 'Tracked Vendors', value: (vendors || []).length },
    { metric: 'Vendor Spend', value: totalVendorSpend },
    { metric: 'Active Asset Value', value: assetValue },
    { metric: 'Asset Monthly Income', value: assetIncome },
    { metric: 'Sold Farm Output Value', value: farmSales },
    { metric: 'Farm Operational Cost', value: farmSummary.operationalCost },
    { metric: 'Farm Cash Spend', value: farmSummary.cashSpend },
  ];

  ReportsPage.contributionRows = (contrib || []).map((item) => ({
    date: fmtDate(item.created_at),
    member: membersById[item.user_id]?.full_name || 'Unknown',
    contribution_type: item.contribution_type || 'general',
    amount_kes: Number(item.amount || 0),
  }));

  ReportsPage.expenseRows = (exp || []).map((item) => ({
    date: fmtDate(item.created_at),
    category: item.category || 'other',
    description: item.description || '',
    amount_kes: Number(item.amount || 0),
  }));

  const categoryKeys = Object.keys(categoryTotals);
  const categoryValues = categoryKeys.map((key) => categoryTotals[key]);
  const categoryColors = ['#185FA5', '#639922', '#BA7517', '#A32D2D', '#534AB7', '#085041', '#633806'];

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="card mb16" style="border-left:3px solid var(--accent);">
        <div class="flex-between" style="gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div class="card-title" style="margin-bottom:4px;">Exportable Family Reports</div>
            <div style="font-size:13px;color:var(--text2);">
              Download clean CSV files for contributions, expenses, and the overall family summary, or print this view for meetings.
            </div>
          </div>
          <div style="font-size:11px;color:var(--text3);">Generated ${fmtDate(now.toISOString())}</div>
        </div>
      </div>

      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Contributions</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(totalContributions)}</div></div>
        <div class="metric-card"><div class="metric-label">Total Expenses</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(totalExpenses)}</div></div>
        <div class="metric-card"><div class="metric-label">Net Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(netBalance)}</div></div>
        <div class="metric-card"><div class="metric-label">Contributors</div>
          <div class="metric-value">${contributorsCount}</div></div>
      </div>

      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Scheduled Meetings</div>
          <div class="metric-value">${scheduledMeetings}</div></div>
        <div class="metric-card"><div class="metric-label">Active Goals</div>
          <div class="metric-value">${activeGoals}</div></div>
        <div class="metric-card"><div class="metric-label">Vault Documents</div>
          <div class="metric-value">${(documents || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Unread AI Insights</div>
          <div class="metric-value">${unreadInsights}</div></div>
      </div>

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

      <div class="card">
        <div class="flex-between mb8" style="gap:8px;flex-wrap:wrap;">
          <div class="card-title" style="margin-bottom:0;">Top Contributors</div>
          <button class="btn btn-sm" onclick="downloadReportsContributionsCsv()">Download Contributions CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Total Contributed</th><th>Share</th></tr></thead>
            <tbody>
              ${topContributors.map(([name, amount]) => `
                <tr>
                  <td><div class="flex gap8">${avatarHtml(name, 'av-sm')} ${name}</div></td>
                  <td><strong style="color:var(--success);">KES ${fmt(amount)}</strong></td>
                  <td>
                    <div class="flex gap8" style="align-items:center;">
                      <div class="progress" style="width:80px;">
                        <div class="progress-fill" style="width:${totalContributions ? Math.round(amount / totalContributions * 100) : 0}%;background:var(--accent);"></div>
                      </div>
                      <span style="font-size:12px;">${totalContributions ? Math.round(amount / totalContributions * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!topContributors.length ? empty('No contribution history to report yet') : ''}
      </div>

      <div class="g3" style="margin-top:16px;">
        <div class="card">
          <div class="flex-between mb8" style="gap:8px;flex-wrap:wrap;">
            <div class="card-title" style="margin-bottom:0;">Vendor Analytics</div>
            <button class="btn btn-sm" onclick="downloadReportsExpensesCsv()">Download Expenses CSV</button>
          </div>
          <div class="g2 mb12">
            <div class="metric-card">
              <div class="metric-label">Tracked Vendors</div>
              <div class="metric-value">${(vendors || []).length}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Vendor Spend</div>
              <div class="metric-value" style="color:var(--warning);">KES ${fmt(totalVendorSpend)}</div>
            </div>
          </div>
          ${vendorSpend.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Vendor</th><th>Paid</th><th>Tasks</th><th>Expense Records</th></tr></thead>
                <tbody>
                  ${vendorSpend.map((vendor) => `
                    <tr>
                      <td>${escapeHtml(vendor.name)}</td>
                      <td>KES ${fmt(vendor.ledger_total_paid)}</td>
                      <td>${fmt(vendor.ledger_total_jobs)}</td>
                      <td>${fmt(vendor.expense_record_count)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : empty('No vendor analytics yet')}
        </div>

        <div class="card">
          <div class="card-title">Asset Analytics</div>
          <div class="g2 mb12">
            <div class="metric-card">
              <div class="metric-label">Active Asset Value</div>
              <div class="metric-value" style="color:var(--accent);">KES ${fmt(assetValue)}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Monthly Income</div>
              <div class="metric-value" style="color:var(--success);">KES ${fmt(assetIncome)}</div>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text2);line-height:1.7;">
            Active assets: <strong>${activeAssets.length}</strong><br/>
            Archived assets: <strong>${archivedAssets}</strong><br/>
            Income-generating assets: <strong>${activeAssets.filter((asset) => Number(asset.monthly_income || 0) > 0).length}</strong>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Farm Analytics</div>
          <div class="g2 mb12">
            <div class="metric-card">
              <div class="metric-label">Sold Output Value</div>
              <div class="metric-value" style="color:var(--success);">KES ${fmt(farmSales)}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Operational Cost</div>
              <div class="metric-value" style="color:var(--warning);">KES ${fmt(farmSummary.operationalCost)}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Cash Spend</div>
              <div class="metric-value">KES ${fmt(farmSummary.cashSpend)}</div>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text2);line-height:1.7;">
            Sold output records: <strong>${farmSummary.soldCount}</strong><br/>
            Stored output records: <strong>${farmSummary.storedCount}</strong><br/>
            Gross operating spread: <strong>KES ${fmt(farmSales - farmSummary.operationalCost)}</strong>
          </div>
        </div>
      </div>
    </div>`;

  if (_chartBar) {
    _chartBar.destroy();
    _chartBar = null;
  }
  if (_chartDonate) {
    _chartDonate.destroy();
    _chartDonate = null;
  }

  const barCtx = document.getElementById('bar-chart')?.getContext('2d');
  if (barCtx) {
    _chartBar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: contributionSeries.months,
        datasets: [
          { label: 'Contributions', data: contributionSeries.values, backgroundColor: 'rgba(99,153,34,0.7)', borderRadius: 4 },
          { label: 'Expenses', data: expenseSeries.values, backgroundColor: 'rgba(162,45,45,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => 'K' + Math.round(value / 1000) } } },
      },
    });
  }

  const donutCtx = document.getElementById('donut-chart')?.getContext('2d');
  if (donutCtx && categoryKeys.length) {
    _chartDonate = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: categoryKeys,
        datasets: [{ data: categoryValues, backgroundColor: categoryColors }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right' } },
      },
    });
  }
}

Router.register('reports', renderReports);
