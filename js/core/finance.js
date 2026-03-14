/**
 * js/core/finance.js
 * ─────────────────────────────────────────────────────
 * Shared finance and operations math used across pages.
 */

const FinanceCore = {
  sum(records, accessor = (item) => item?.amount) {
    return (records || []).reduce((sum, item) => sum + Number(accessor(item) || 0), 0);
  },

  buildCashSummary(contributions, expenses, emergencyFund = null) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const totalContributions = this.sum(contributions, (item) => item.amount);
    const totalExpenses = this.sum(expenses, (item) => item.amount);
    const thisMonthContributions = this.sum(
      (contributions || []).filter((item) => {
        const date = new Date(item.created_at);
        return date.getMonth() === month && date.getFullYear() === year;
      }),
      (item) => item.amount,
    );
    const thisMonthExpenses = this.sum(
      (expenses || []).filter((item) => {
        const date = new Date(item.created_at);
        return date.getMonth() === month && date.getFullYear() === year;
      }),
      (item) => item.amount,
    );

    return {
      total_contributions: totalContributions,
      total_expenses: totalExpenses,
      balance: totalContributions - totalExpenses,
      this_month_contributions: thisMonthContributions,
      this_month_expenses: thisMonthExpenses,
      emergency_fund_balance: Number(emergencyFund?.current_amount || 0),
    };
  },

  buildSchoolFeeSummary(fees) {
    const items = fees || [];
    const outstanding = items.reduce((sum, fee) => sum + Math.max(0, Number(fee.total_fee || 0) - Number(fee.paid_amount || 0)), 0);
    const unpaidStudents = new Set(
      items
        .filter((fee) => Number(fee.total_fee || 0) > Number(fee.paid_amount || 0))
        .map((fee) => fee.student_id)
        .filter(Boolean),
    ).size;

    return {
      totalDue: this.sum(items, (fee) => fee.total_fee),
      totalPaid: this.sum(items, (fee) => fee.paid_amount),
      outstanding,
      unpaidStudents,
    };
  },

  buildVendorLedger(vendors, expenses, tasks = []) {
    const spendByVendor = {};
    const expenseCountByVendor = {};
    (expenses || []).forEach((expense) => {
      if (!expense.vendor_id) return;
      spendByVendor[expense.vendor_id] = (spendByVendor[expense.vendor_id] || 0) + Number(expense.amount || 0);
      expenseCountByVendor[expense.vendor_id] = (expenseCountByVendor[expense.vendor_id] || 0) + 1;
    });

    const taskCountByVendor = {};
    (tasks || []).forEach((task) => {
      if (!task.assigned_vendor) return;
      taskCountByVendor[task.assigned_vendor] = (taskCountByVendor[task.assigned_vendor] || 0) + 1;
    });

    const rows = (vendors || []).map((vendor) => ({
      ...vendor,
      ledger_total_paid: Number(spendByVendor[vendor.id] || 0),
      ledger_total_jobs: Number(taskCountByVendor[vendor.id] || 0),
      expense_record_count: Number(expenseCountByVendor[vendor.id] || 0),
    }));

    return {
      totalPaid: rows.reduce((sum, vendor) => sum + Number(vendor.ledger_total_paid || 0), 0),
      rows,
      topVendors: rows
        .filter((vendor) => vendor.ledger_total_paid > 0 || vendor.expense_record_count > 0 || vendor.ledger_total_jobs > 0)
        .sort((a, b) => b.ledger_total_paid - a.ledger_total_paid)
        .slice(0, 5),
      taskCountByVendor,
      expenseCountByVendor,
    };
  },

  buildFarmSummary(projects, farmOutputs, farmInputs, activities, livestockEvents, expenses = []) {
    const farmingProjectIds = new Set((projects || []).filter((project) => project.project_type === 'farming').map((project) => project.id));
    const scopedOutputs = (farmOutputs || []).filter((item) => farmingProjectIds.has(item.project_id));
    const scopedInputs = (farmInputs || []).filter((item) => farmingProjectIds.has(item.project_id));
    const scopedActivities = (activities || []).filter((item) => farmingProjectIds.has(item.project_id));
    const scopedLivestockEvents = (livestockEvents || []).filter((item) => farmingProjectIds.has(item.project_id));
    const scopedExpenses = (expenses || []).filter((item) => farmingProjectIds.has(item.project_id));

    const soldOutputs = scopedOutputs.filter((output) => output.usage_type === 'sold');
    const storedOutputs = scopedOutputs.filter((output) => output.usage_type === 'stored');
    const consumedOutputs = scopedOutputs.filter((output) => output.usage_type === 'consumed');
    const inputCost = this.sum(scopedInputs, (input) => Number(input.quantity || 0) * Number(input.cost_per_unit || 0));
    const activityCost = this.sum(scopedActivities, (activity) => activity.cost);
    const livestockEventCost = this.sum(scopedLivestockEvents, (event) => event.cost);
    const operationalCost = inputCost + activityCost + livestockEventCost;
    const cashSpend = this.sum(scopedExpenses, (expense) => expense.amount);

    return {
      projectIds: [...farmingProjectIds],
      projectCount: farmingProjectIds.size,
      salesValue: this.sum(soldOutputs, (output) => output.total_value),
      soldCount: soldOutputs.length,
      storedCount: storedOutputs.length,
      consumedCount: consumedOutputs.length,
      storedQuantity: this.sum(storedOutputs, (output) => output.quantity),
      consumedQuantity: this.sum(consumedOutputs, (output) => output.quantity),
      inputCost,
      activityCost,
      livestockEventCost,
      operationalCost,
      cashSpend,
      topOutputs: scopedOutputs.slice(0, 5).map((output) => ({
        output_name: output.output_category || output.output_name || 'Farm output',
        usage_type: output.usage_type,
        quantity: Number(output.quantity || 0),
        total_value: Number(output.total_value || 0),
      })),
    };
  },

  async fetchCashSummary(fid) {
    const [{ data: contributions }, { data: expenses }, { data: emergencyFund }] = await Promise.all([
      DB.client.from('contributions').select('amount,created_at').eq('family_id', fid),
      DB.client.from('expenses').select('amount,created_at').eq('family_id', fid),
      DB.client.from('emergency_fund').select('current_amount').eq('family_id', fid).maybeSingle(),
    ]);

    return this.buildCashSummary(contributions || [], expenses || [], emergencyFund || null);
  },
};
