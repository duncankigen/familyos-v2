/**
 * js/pages/ai.js
 * ─────────────────────────────────────────────────────
 * AI Advisor: calls the Supabase Edge Function first,
 * then automatically falls back to local analysis if
 * the AI service fails.
 */

function canGenerateAIInsights() {
  return State.currentProfile?.role === 'admin';
}

function aiFunctionConfigured() {
  return !!window.RuntimeConfig?.aiEdgeFunctionUrl;
}

const AIPage = {
  insightsBusy: false,
  notice: '',
};

function insightTypeColor(insightType) {
  const typeMap = {
    task_warning: 'red',
    school_fees: 'amber',
    planning_tip: 'blue',
    finance_alert: 'amber',
    goal_update: 'green',
    farming_advice: 'green',
  };
  return typeMap[insightType] || 'blue';
}

function insightAccent(insightType) {
  const color = insightTypeColor(insightType);
  return color === 'amber'
    ? 'warning'
    : color === 'red'
      ? 'danger'
      : color === 'green'
        ? 'success'
        : 'accent';
}

function isInsightExpired(insight) {
  return !!(insight?.expires_at && new Date(insight.expires_at).getTime() <= Date.now());
}

function buildInsightExpiry(type) {
  const hoursByType = {
    task_warning: 24,
    school_fees: 48,
    finance_alert: 48,
    farming_advice: 72,
    goal_update: 72,
    planning_tip: 72,
  };
  const hours = hoursByType[type] || 72;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function clipText(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function normalizeInsightDraft(insight) {
  if (!insight?.title || !insight?.message) return null;
  const allowedTypes = new Set(['finance_alert', 'task_warning', 'farming_advice', 'planning_tip', 'goal_update', 'school_fees']);
  const allowedSeverity = new Set(['info', 'warning', 'alert', 'success']);
  const insightType = allowedTypes.has(insight.insight_type) ? insight.insight_type : 'planning_tip';
  const severity = allowedSeverity.has(insight.severity) ? insight.severity : 'info';

  return {
    insight_type: insightType,
    title: clipText(insight.title, 60),
    message: clipText(insight.message, 260),
    severity,
    expires_at: buildInsightExpiry(insightType),
  };
}

function normalizeInsightDrafts(items) {
  const seen = new Set();
  return (items || [])
    .map(normalizeInsightDraft)
    .filter(Boolean)
    .filter((item) => {
      const key = `${item.insight_type}:${item.title}:${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

async function dismissAIInsight(insightId) {
  if (!canGenerateAIInsights() || !insightId) return;
  const { error } = await DB.client
    .from('ai_insights')
    .update({ is_read: true })
    .eq('id', insightId)
    .eq('family_id', State.fid);

  if (error) {
    alert(error.message || 'Unable to dismiss this insight right now.');
    return;
  }

  renderPage('ai');
}

async function replaceExistingInsights(insightTypes) {
  const uniqueTypes = [...new Set((insightTypes || []).filter(Boolean))];
  if (!uniqueTypes.length || !canGenerateAIInsights()) return;
  const { error } = await DB.client
    .from('ai_insights')
    .update({ is_read: true })
    .eq('family_id', State.fid)
    .eq('is_read', false)
    .in('insight_type', uniqueTypes);

  if (error) {
    console.warn('[AI] Failed to retire previous insights:', error);
  }
}

async function loadAIServiceResponse(payload) {
  if (!aiFunctionConfigured()) return null;
  const res = await fetch(window.RuntimeConfig.aiEdgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: window.RuntimeConfig?.supabaseAnonKey || '',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || data?.message || `AI service error (${res.status})`);
    error.status = res.status;
    error.retryAfterSeconds = Number(data?.retry_after_seconds || res.headers.get('Retry-After') || 0);
    error.rateLimited = res.status === 429;
    throw error;
  }
  return data;
}

function isAIRateLimitError(error) {
  return Boolean(error?.rateLimited || error?.status === 429);
}

function aiCooldownMessage(error, subject = 'AI service') {
  const seconds = Math.max(1, Number(error?.retryAfterSeconds || 0));
  return seconds
    ? `${subject} is cooling down. Try again in about ${seconds} second${seconds === 1 ? '' : 's'}.`
    : `${subject} is cooling down. Please wait a moment before trying again.`;
}

function setAIInsightsBusy(isBusy) {
  AIPage.insightsBusy = !!isBusy;
  const btn = document.getElementById('ai-generate-btn');
  if (!btn) return;
  btn.disabled = AIPage.insightsBusy;
  btn.innerHTML = AIPage.insightsBusy
    ? '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;display:inline-block;vertical-align:middle;"></span>Generating...'
    : 'Generate Fresh Insights';
}

async function renderAI() {
  setTopbar('AI Advisor');
  const { data: insights } = await DB.client
    .from('ai_insights')
    .select('*')
    .eq('family_id', State.fid)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20);
  const visibleInsights = (insights || []).filter((insight) => !isInsightExpired(insight));

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g2">

        ${AIPage.notice ? `
          <div class="ai-card ai-amber" style="grid-column:1 / -1;">
            <div class="ai-tag" style="color:var(--warning);">AI Service Notice</div>
            <div class="ai-msg">${escapeHtml(AIPage.notice)}</div>
          </div>
        ` : ''}

        <div>
          <div class="card-title mb12">Saved Insights</div>
          ${visibleInsights.map((insight) => `
            <div class="ai-card ai-${insightTypeColor(insight.insight_type)}">
              <div class="flex-between" style="align-items:flex-start;gap:8px;">
                <div class="ai-tag" style="color:var(--${insightAccent(insight.insight_type)});">
                  ${escapeHtml(insight.title)}
                </div>
                ${canGenerateAIInsights() ? `<button class="btn btn-sm" style="padding:4px 8px;min-width:auto;" onclick="dismissAIInsight('${insight.id}')">X</button>` : ''}
              </div>
              <div class="ai-msg" style="white-space:pre-line;">${escapeHtml(insight.message)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:6px;">
                ${ago(insight.created_at)}${insight.expires_at ? ` · expires ${fmtDate(insight.expires_at)}` : ''}
              </div>
            </div>`).join('')}
          ${!visibleInsights.length
            ? `<div class="ai-card ai-blue">
                <div class="ai-msg">
                  Ask the advisor a question or generate fresh insights to build a practical family advice feed. Old insights fade out automatically instead of piling up forever.
                </div>
              </div>`
            : ''}
          ${canGenerateAIInsights() ? `<button id="ai-generate-btn" class="btn btn-sm" onclick="generateInsights()">Generate Fresh Insights</button>` : ''}
        </div>

        <div>
          <div class="card-title mb12">Ask the AI Advisor</div>
          <div class="card mb16">
            <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">
              ${aiFunctionConfigured()
                ? 'Questions will be sent through your configured AI service first using the richest family context available. If it is unavailable, local analysis will run automatically.'
                : 'Edge Function is not configured here, so only local analysis is available.'}
            </div>
            <div class="form-group">
              <label class="form-label">Your question</label>
              <textarea id="ai-q" class="form-textarea" style="min-height:100px;"
                placeholder="How are we tracking towards our goals?&#10;What should we act on this week?&#10;Which area needs attention most?"></textarea>
            </div>
            <button class="btn btn-primary" onclick="askAI()">Ask AI Advisor</button>
            <div id="ai-response" style="margin-top:14px;"></div>
          </div>

          <div class="card-title mb12">Quick Questions</div>
          <div class="flex-col mb16">
            ${[
              'How are we tracking towards our goals?',
              'Who contributed the most this year?',
              'What tasks are overdue and urgent?',
              'How can we grow our income?',
              'What is our biggest expense category?',
            ].map((question) => `<button class="btn" style="text-align:left;" onclick="document.getElementById('ai-q').value='${question}';askAI()">${question}</button>`).join('')}
          </div>
        </div>

      </div>
    </div>`;

  Sidebar.markSectionSeen('ai').catch((error) => {
    console.warn('[AI] Failed to mark AI insights as seen:', error);
  });
}

async function askAI() {
  const question = document.getElementById('ai-q')?.value?.trim();
  if (!question) return;
  const responseEl = document.getElementById('ai-response');
  if (responseEl) responseEl.innerHTML = `<div class="loading-screen"><div class="spinner"></div>Thinking...</div>`;
  const context = await _buildContext();
  let providerCooldownNote = '';

  if (aiFunctionConfigured()) {
    try {
      const data = await loadAIServiceResponse({ mode: 'answer', question, familyContext: context });
      if (!data?.answer) {
        throw new Error(data?.error || data?.message || 'AI service returned no answer.');
      }
      const answer = data.answer;
      if (responseEl) {
        responseEl.innerHTML = `
          <div class="ai-card ai-blue">
            <div class="ai-tag" style="color:var(--accent);">AI Advisor Response</div>
            <div class="ai-msg" style="white-space:pre-line;">${escapeHtml(answer)}</div>
          </div>`;
      }
      return;
    } catch (error) {
      console.error('[AI] Edge Function failed:', error);
      if (isAIRateLimitError(error)) {
        providerCooldownNote = aiCooldownMessage(error, 'AI advisor');
      }
    }
  }

  const answer = await buildLocalAIAnswer(question, context);
  if (responseEl) {
    responseEl.innerHTML = `
      <div class="ai-card ai-blue">
        <div class="ai-tag" style="color:var(--accent);">AI Response (Local)</div>
        <div class="ai-msg" style="white-space:pre-line;">${escapeHtml(answer)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px;">
          ${escapeHtml(providerCooldownNote || 'Local analysis was used because the AI service is unavailable or not configured.')}
        </div>
      </div>`;
  }
}

async function buildLocalAIAnswer(question, context) {
  const data = context || await _buildContext();
  const ql = question.toLowerCase();
  const sections = ['Situation'];

  sections.push(`Family balance is KES ${fmt(data.finances.netBalance)} from KES ${fmt(data.finances.totalContributions)} in contributions and KES ${fmt(data.finances.totalExpenses)} in expenses.`);

  if (ql.includes('income') || ql.includes('grow') || ql.includes('earn')) {
    sections.push('Recommended Actions');
    sections.push([
      data.assets.monthlyIncome > 0 ? `- Scale income-generating assets already bringing in about KES ${fmt(data.assets.monthlyIncome)} monthly.` : '- Identify at least one income-generating asset or side business because no monthly asset income is recorded yet.',
      data.farming.salesValue > 0 ? `- Grow farm sales beyond the current KES ${fmt(data.farming.salesValue)} by increasing sold output and reducing farm operational costs now at KES ${fmt(data.farming.operationalCost)}.` : '- Review farming projects for produce that can be sold because recorded farm sales are still low.',
      data.vendors.topVendors[0] ? `- Negotiate margins and better terms around heavy vendor spend, starting with ${data.vendors.topVendors[0].name}.` : '- Build clearer vendor and procurement tracking so spending can be optimized.',
      data.projects.activeCount > 0 ? `- Focus on projects already active (${data.projects.activeCount}) before opening new ones so existing investments start paying back faster.` : '- Tie new income ideas to clear owners and deadlines because no active projects are carrying growth right now.',
    ].filter(Boolean).join('\n'));
  } else if (ql.includes('goal') || ql.includes('track')) {
    const topGoal = data.goals.topGoals[0];
    sections.push('Recommended Actions');
    sections.push(topGoal
      ? `- Top active goal is "${topGoal.title}" at ${topGoal.progressPct}% funded.\n- Remaining amount is KES ${fmt(topGoal.remaining)}.\n- Link upcoming contributions and any surplus from assets or farming to this goal first.`
      : '- No active goal is currently being funded, so define a priority goal before tracking progress.');
  } else if (ql.includes('contribut') || ql.includes('who')) {
    sections.push('Recommended Actions');
    sections.push(data.finances.topContributors.length
      ? `- Top contributors right now: ${data.finances.topContributors.map((item) => `${item.name} (KES ${fmt(item.amount)})`).join(', ')}.\n- Use this to guide appreciation, but also identify members whose contribution trend has dropped.`
      : '- No contribution pattern is available yet because contributions have not been recorded.');
  } else if (ql.includes('task') || ql.includes('urgent') || ql.includes('overdue')) {
    sections.push('Recommended Actions');
    sections.push(`- Pending tasks: ${data.tasks.pendingCount}.\n- Overdue tasks: ${data.tasks.overdueCount}.\n- Highest-pressure tasks: ${data.tasks.overdueTitles.length ? data.tasks.overdueTitles.join(', ') : 'none overdue right now'}.\n- Reassign or close low-movement tasks before adding more work.`);
  } else if (ql.includes('expense') || ql.includes('spend') || ql.includes('cost')) {
    const topCategory = data.finances.topExpenseCategories[0];
    sections.push('Recommended Actions');
    sections.push(`- Largest expense area is ${topCategory ? `${topCategory.category} at KES ${fmt(topCategory.amount)}` : 'not yet clear from recorded data'}.\n- Vendor-linked spend stands at KES ${fmt(data.vendors.totalPaid)}.\n- Farm operational cost is KES ${fmt(data.farming.operationalCost)} and farm cash spend is KES ${fmt(data.farming.cashSpend)}.`);
  } else if (ql.includes('meeting')) {
    sections.push('Recommended Actions');
    sections.push(data.meetings.nextMeeting
      ? `- Next scheduled meeting is "${data.meetings.nextMeeting.title}" on ${fmtDate(data.meetings.nextMeeting.meeting_date)}.\n- Prepare updates around overdue tasks, active goals, and income opportunities before that meeting.`
      : '- No scheduled meeting is on record, so create one if key decisions are pending.');
  } else {
    sections.push('Recommended Actions');
    sections.push([
      `- Protect the current balance of KES ${fmt(data.finances.netBalance)} by watching ${data.tasks.overdueCount} overdue task(s) and KES ${fmt(data.schoolFees.outstandingTotal)} in school fee pressure.`,
      data.assets.monthlyIncome > 0 ? `- Reinvest part of the monthly asset income of KES ${fmt(data.assets.monthlyIncome)} into the strongest active goal or income project.` : '- Add at least one dependable monthly income stream because no meaningful asset income is recorded yet.',
      data.farming.salesValue > 0 ? `- Compare farm sales of KES ${fmt(data.farming.salesValue)} against farm operational cost of KES ${fmt(data.farming.operationalCost)} and improve the margin.` : '- Track outputs sold versus costs more closely so farming decisions improve.',
    ].filter(Boolean).join('\n'));
  }

  sections.push('Watch-outs');
  sections.push(`- Outstanding school fees: KES ${fmt(data.schoolFees.outstandingTotal)}.\n- Scheduled meetings: ${data.meetings.scheduledCount}.\n- Active goals still needing more funding: ${data.goals.topGoals.filter((goal) => goal.remaining > 0).length}.`);

  return sections.join('\n\n');
}

async function generateInsights() {
  if (!canGenerateAIInsights()) return;
  const sb = DB.client;
  const fid = State.fid;
  setAIInsightsBusy(true);
  AIPage.notice = '';

  try {
    const context = await _buildContext();
    let drafts = [];

    if (aiFunctionConfigured()) {
      try {
        const data = await loadAIServiceResponse({
          mode: 'insights',
          question: 'Generate fresh family insights',
          familyContext: context,
        });
        drafts = normalizeInsightDrafts(data?.insights || []);
      } catch (error) {
        console.warn('[AI] Provider-backed insight generation failed, using local fallback:', error);
        if (isAIRateLimitError(error)) {
          AIPage.notice = `${aiCooldownMessage(error, 'AI insight generation')} Local insight fallback was used instead.`;
        }
      }
    }

    if (!drafts.length) {
      drafts = buildLocalInsights(context);
    }

    if (!drafts.length) {
      alert('No new insights to generate based on current data.');
      return;
    }

    await replaceExistingInsights(drafts.map((item) => item.insight_type));
    const { error } = await sb.from('ai_insights').insert(drafts.map((item) => ({
      family_id: fid,
      ...item,
    })));
    if (error) {
      alert(error.message || 'Unable to save AI insights right now.');
      return;
    }
    renderPage('ai');
  } finally {
    setAIInsightsBusy(false);
  }
}

function buildLocalInsights(context) {
  const insights = [];

  if (context.tasks.overdueCount > 0) {
    insights.push({
      insight_type: 'task_warning',
      title: `${context.tasks.overdueCount} overdue task${context.tasks.overdueCount > 1 ? 's' : ''}`,
      message: `Critical tasks are overdue: ${context.tasks.overdueTitles.join(', ') || 'review the Tasks page now'}. Close blockers before new work slips further.`,
      severity: 'alert',
    });
  }

  if (context.schoolFees.outstandingTotal > 0) {
    insights.push({
      insight_type: 'school_fees',
      title: 'Outstanding School Fees',
      message: `${context.schoolFees.unpaidStudents} student(s) still have unpaid balances totalling KES ${fmt(context.schoolFees.outstandingTotal)}. Prioritize a payment plan before the next term pressure builds.`,
      severity: 'warning',
    });
  }

  if (context.goals.topGoals[0]) {
    const topGoal = context.goals.topGoals[0];
    insights.push({
      insight_type: 'goal_update',
      title: `Goal focus: ${topGoal.title}`,
      message: `"${topGoal.title}" is ${topGoal.progressPct}% funded with KES ${fmt(topGoal.remaining)} still needed. Channel the next surplus into this goal to keep momentum.`,
      severity: topGoal.progressPct >= 75 ? 'success' : 'info',
    });
  }

  if (context.farming.projectCount > 0) {
    insights.push({
      insight_type: 'farming_advice',
      title: 'Farm margin check',
      message: `Farm sales stand at KES ${fmt(context.farming.salesValue)} against operational cost of KES ${fmt(context.farming.operationalCost)} and cash spend of KES ${fmt(context.farming.cashSpend)}. Review the sold, stored, and consumed mix before the next cycle.`,
      severity: context.farming.salesValue >= context.farming.operationalCost ? 'success' : 'warning',
    });
  } else if (context.finances.netBalance > 0) {
    insights.push({
      insight_type: 'planning_tip',
      title: 'Use your surplus intentionally',
      message: `You still hold a net balance of KES ${fmt(context.finances.netBalance)}. Split it between the top family goal, overdue obligations, and one income-growing activity instead of leaving it unassigned.`,
      severity: 'info',
    });
  }

  return normalizeInsightDrafts(insights);
}

async function _buildContext() {
  const sb = DB.client;
  const fid = State.fid;
  const [{ data: contrib }, { data: exp }, { data: tasks }, { data: goals }, { data: meetings }, { data: docs }, { data: projects }, { data: vendors }, { data: assets }, { data: fees }, { data: members }, { data: announcements }, { data: comments }] = await Promise.all([
    sb.from('contributions').select('amount,contribution_type,created_at,user_id').eq('family_id', fid),
    sb.from('expenses').select('amount,category,created_at,project_id,vendor_id').eq('family_id', fid),
    sb.from('tasks').select('title,status,deadline,priority,created_at').eq('family_id', fid).neq('status', 'completed').order('deadline', { ascending: true }).limit(20),
    sb.from('family_goals').select('title,target_amount,current_amount,status').eq('family_id', fid),
    sb.from('meetings').select('title,status,meeting_date').eq('family_id', fid),
    sb.from('documents').select('id,category,access_level').eq('family_id', fid),
    sb.from('projects').select('id,name,status,budget,project_type,start_date,end_date').eq('family_id', fid),
    sb.from('vendors').select('id,name').eq('family_id', fid),
    sb.from('assets').select('id,name,asset_type,status,estimated_value,monthly_income').eq('family_id', fid),
    sb.from('school_fees').select('student_id,total_fee,paid_amount').eq('family_id', fid),
    sb.from('users').select('id,full_name,role').eq('family_id', fid).eq('is_active', true),
    sb.from('announcements').select('title,created_at,is_pinned').eq('family_id', fid).eq('is_archived', false).order('created_at', { ascending: false }).limit(5),
    sb.from('task_comments').select('task_id,created_at,user_id').eq('family_id', fid).order('created_at', { ascending: false }).limit(20),
  ]);
  const farmingProjectIds = (projects || []).filter((project) => project.project_type === 'farming').map((project) => project.id);
  const [{ data: farmOutputs }, { data: farmInputs }, { data: activities }, { data: livestock }] = await Promise.all([
    farmingProjectIds.length
      ? sb.from('farm_outputs').select('project_id,usage_type,total_value,quantity,output_category').in('project_id', farmingProjectIds)
      : Promise.resolve({ data: [] }),
    farmingProjectIds.length
      ? sb.from('farm_inputs').select('project_id,quantity,cost_per_unit,name').in('project_id', farmingProjectIds)
      : Promise.resolve({ data: [] }),
    farmingProjectIds.length
      ? sb.from('project_activities').select('project_id,cost,description').in('project_id', farmingProjectIds)
      : Promise.resolve({ data: [] }),
    farmingProjectIds.length
      ? sb.from('livestock').select('id,project_id,count,animal_type').in('project_id', farmingProjectIds)
      : Promise.resolve({ data: [] }),
  ]);
  const livestockIds = (livestock || []).map((item) => item.id).filter(Boolean);
  const { data: livestockEventsRaw } = livestockIds.length
    ? await sb.from('livestock_events').select('livestock_id,cost').in('livestock_id', livestockIds)
    : { data: [] };
  const livestockProjectById = Object.fromEntries((livestock || []).map((item) => [item.id, item.project_id]));
  const livestockEvents = (livestockEventsRaw || []).map((event) => ({
    ...event,
    project_id: livestockProjectById[event.livestock_id] || null,
  }));

  const membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));
  const cashSummary = FinanceCore.buildCashSummary(contrib || [], exp || []);
  const totalContributions = cashSummary.total_contributions;
  const totalExpenses = cashSummary.total_expenses;
  const expenseByCategory = {};
  (exp || []).forEach((item) => {
    const key = item.category || 'Other';
    expenseByCategory[key] = (expenseByCategory[key] || 0) + Number(item.amount || 0);
  });
  const contributorTotals = {};
  (contrib || []).forEach((item) => {
    const name = membersById[item.user_id]?.full_name || 'Unknown';
    contributorTotals[name] = (contributorTotals[name] || 0) + Number(item.amount || 0);
  });
  const overdueTasks = (tasks || []).filter((task) => task.deadline && new Date(task.deadline) < new Date());
  const priorityCounts = {};
  (tasks || []).forEach((task) => {
    const priority = task.priority || 'medium';
    priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
  });
  const nextMeeting = (meetings || [])
    .filter((meeting) => meeting.status === 'scheduled' && meeting.meeting_date)
    .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))[0] || null;
  const activeGoals = (goals || []).filter((goal) => goal.status === 'active');
  const topGoals = activeGoals
    .map((goal) => {
      const target = Number(goal.target_amount || 0);
      const current = Number(goal.current_amount || 0);
      return {
        title: goal.title,
        target,
        current,
        remaining: Math.max(0, target - current),
        progressPct: target ? Math.round((current / target) * 100) : 0,
      };
    })
    .sort((a, b) => b.target - a.target)
    .slice(0, 3);
  const activeAssets = (assets || []).filter((asset) => (asset.status || 'active') === 'active');
  const vendorLedger = FinanceCore.buildVendorLedger(vendors || [], exp || [], tasks || []);
  const farmSummary = FinanceCore.buildFarmSummary(
    projects || [],
    farmOutputs || [],
    farmInputs || [],
    activities || [],
    livestockEvents || [],
    exp || [],
  );
  const outstandingTotal = (fees || []).reduce((sum, fee) => sum + Math.max(0, Number(fee.total_fee || 0) - Number(fee.paid_amount || 0)), 0);

  return {
    generatedAt: new Date().toISOString(),
    totalContributions,
    totalExpenses,
    pendingTasks: (tasks || []).length,
    overdueTasks: overdueTasks.length,
    finances: {
      totalContributions,
      totalExpenses,
      netBalance: cashSummary.balance,
      topContributors: Object.entries(contributorTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, amount]) => ({ name, amount })),
      topExpenseCategories: Object.entries(expenseByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount })),
    },
    tasks: {
      pendingCount: (tasks || []).length,
      overdueCount: overdueTasks.length,
      overdueTitles: overdueTasks.slice(0, 5).map((task) => task.title),
      priorityCounts,
      upcoming: (tasks || []).slice(0, 5).map((task) => ({
        title: task.title,
        priority: task.priority || 'medium',
        deadline: task.deadline,
      })),
    },
    goals: {
      activeCount: activeGoals.length,
      totalCount: (goals || []).length,
      topGoals,
    },
    meetings: {
      scheduledCount: (meetings || []).filter((meeting) => meeting.status === 'scheduled').length,
      nextMeeting,
      recent: (meetings || []).slice(0, 5),
    },
    documents: {
      total: (docs || []).length,
      byCategory: (docs || []).reduce((acc, doc) => {
        acc[doc.category] = (acc[doc.category] || 0) + 1;
        return acc;
      }, {}),
      restricted: (docs || []).filter((doc) => doc.access_level === 'admins').length,
    },
    members: {
      totalCount: (members || []).length,
      byRole: (members || []).reduce((acc, member) => {
        acc[member.role] = (acc[member.role] || 0) + 1;
        return acc;
      }, {}),
      topContributors: Object.entries(contributorTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, amount]) => ({ name, amount })),
    },
    announcements: {
      totalRecent: (announcements || []).length,
      pinnedCount: (announcements || []).filter((item) => item.is_pinned).length,
      recent: announcements || [],
    },
    projects: {
      totalCount: (projects || []).length,
      activeCount: (projects || []).filter((project) => project.status === 'active').length,
      pausedCount: (projects || []).filter((project) => project.status === 'paused').length,
      farmingCount: farmingProjectIds.length,
      topBudgetProjects: (projects || [])
        .map((project) => ({
          name: project.name,
          project_type: project.project_type,
          budget: Number(project.budget || 0),
          status: project.status,
        }))
        .sort((a, b) => b.budget - a.budget)
        .slice(0, 5),
    },
    vendors: {
      trackedCount: (vendors || []).length,
      totalPaid: vendorLedger.totalPaid,
      topVendors: vendorLedger.topVendors
        .map((vendor) => ({
          name: vendor.name,
          totalPaid: Number(vendor.ledger_total_paid || 0),
          totalJobs: Number(vendor.ledger_total_jobs || 0),
          expenseRecords: Number(vendor.expense_record_count || 0),
        })),
    },
    assets: {
      activeCount: activeAssets.length,
      archivedCount: (assets || []).filter((asset) => (asset.status || 'active') === 'archived').length,
      totalValue: activeAssets.reduce((sum, asset) => sum + Number(asset.estimated_value || 0), 0),
      monthlyIncome: activeAssets.reduce((sum, asset) => sum + Number(asset.monthly_income || 0), 0),
      topAssets: activeAssets
        .map((asset) => ({
          name: asset.name,
          asset_type: asset.asset_type,
          estimated_value: Number(asset.estimated_value || 0),
          monthly_income: Number(asset.monthly_income || 0),
        }))
        .sort((a, b) => (b.monthly_income || b.estimated_value) - (a.monthly_income || a.estimated_value))
        .slice(0, 5),
    },
    farming: {
      projectCount: farmingProjectIds.length,
      salesValue: farmSummary.salesValue,
      storedQuantity: farmSummary.storedQuantity,
      consumedQuantity: farmSummary.consumedQuantity,
      operationalCost: farmSummary.operationalCost,
      cashSpend: farmSummary.cashSpend,
      livestockHeads: (livestock || []).reduce((sum, item) => sum + Number(item.count || 0), 0),
      topOutputs: farmSummary.topOutputs,
    },
    schoolFees: {
      outstandingTotal,
      unpaidStudents: (fees || []).filter((fee) => Number(fee.total_fee || 0) > Number(fee.paid_amount || 0)).length,
    },
    comments: {
      recentCount: (comments || []).length,
      activeTaskIds: [...new Set((comments || []).map((comment) => comment.task_id).filter(Boolean))].length,
    },
  };
}

Router.register('ai', renderAI);
