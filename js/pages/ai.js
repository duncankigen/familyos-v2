/**
 * js/pages/ai.js
 * ─────────────────────────────────────────────────────
 * AI Advisor: tries the Supabase Edge Function first,
 * then automatically falls back to local analysis.
 */

function canGenerateAIInsights() {
  return State.currentProfile?.role === 'admin';
}

function aiFunctionConfigured() {
  return !!window.RuntimeConfig?.aiEdgeFunctionUrl;
}

async function renderAI() {
  setTopbar('AI Advisor');
  const { data: insights } = await DB.client
    .from('ai_insights')
    .select('*')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false })
    .limit(10);

  const typeMap = {
    task_warning: 'red',
    school_fees: 'amber',
    planning_tip: 'blue',
    finance_alert: 'amber',
    goal_update: 'green',
  };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g2">

        <div>
          <div class="card-title mb12">Saved Insights</div>
          ${(insights || []).map((insight) => `
            <div class="ai-card ai-${typeMap[insight.insight_type] || 'blue'}">
              <div class="ai-tag" style="color:var(--${typeMap[insight.insight_type] === 'amber' ? 'warning' : typeMap[insight.insight_type] === 'red' ? 'danger' : typeMap[insight.insight_type] === 'green' ? 'success' : 'accent'});">
                ${escapeHtml(insight.title)}
              </div>
              <div class="ai-msg">${escapeHtml(insight.message)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:6px;">${ago(insight.created_at)}</div>
            </div>`).join('')}
          ${!(insights || []).length
            ? `<div class="ai-card ai-blue">
                <div class="ai-msg">
                  Ask the advisor a question or generate a new insight to start building your family knowledge base.
                </div>
              </div>`
            : ''}
          ${canGenerateAIInsights() ? `<button class="btn btn-sm" onclick="generateInsights()">Generate New Insights</button>` : ''}
        </div>

        <div>
          <div class="card-title mb12">Ask the AI Advisor</div>
          <div class="card mb16">
            <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">
              ${aiFunctionConfigured()
                ? 'Questions will be sent through your configured AI service first. If it is unavailable, local analysis will run automatically.'
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

  if (aiFunctionConfigured()) {
    try {
      const context = await _buildContext();
      const res = await fetch(window.RuntimeConfig.aiEdgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: window.RuntimeConfig?.supabaseAnonKey || '',
        },
        body: JSON.stringify({ question, familyContext: context }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.answer) {
        throw new Error(data?.error || data?.message || `AI service error (${res.status})`);
      }
      const answer = data.answer;
      if (responseEl) {
        responseEl.innerHTML = `
          <div class="ai-card ai-blue">
            <div class="ai-tag" style="color:var(--accent);">AI Advisor Response</div>
            <div class="ai-msg">${escapeHtml(answer)}</div>
          </div>`;
      }
      await saveAIInsight(question, answer);
      return;
    } catch (error) {
      console.error('[AI] Edge Function failed:', error);
    }
  }

  const answer = await buildLocalAIAnswer(question);
  if (responseEl) {
    responseEl.innerHTML = `
      <div class="ai-card ai-blue">
        <div class="ai-tag" style="color:var(--accent);">AI Response (Local)</div>
        <div class="ai-msg" style="white-space:pre-line;">${escapeHtml(answer)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px;">
          Local analysis was used because the AI service is unavailable or not configured.
        </div>
      </div>`;
  }
}

async function buildLocalAIAnswer(question) {
  const sb = DB.client;
  const fid = State.fid;
  const [{ data: contrib }, { data: exp }, { data: tasks }, { data: goals }, { data: meetings }] = await Promise.all([
    sb.from('contributions').select('amount,users(full_name)').eq('family_id', fid),
    sb.from('expenses').select('amount,category').eq('family_id', fid),
    sb.from('tasks').select('title,status,deadline').eq('family_id', fid).neq('status', 'completed'),
    sb.from('family_goals').select('*').eq('family_id', fid),
    sb.from('meetings').select('title,status,meeting_date').eq('family_id', fid),
  ]);

  const totalContributions = (contrib || []).reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = (exp || []).reduce((sum, item) => sum + Number(item.amount), 0);
  const overdueTasks = (tasks || []).filter((task) => task.deadline && new Date(task.deadline) < new Date()).length;
  const topGoal = (goals || []).sort((a, b) => Number(b.target_amount || 0) - Number(a.target_amount || 0))[0];
  const upcomingMeeting = (meetings || [])
    .filter((meeting) => meeting.status === 'scheduled' && meeting.meeting_date)
    .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))[0];
  const ql = question.toLowerCase();

  let answer = 'Based on your family data:\n\n';

  if (ql.includes('goal') || ql.includes('track')) {
    answer += topGoal
      ? `Your top goal "${topGoal.title}" is ${Math.round(Number(topGoal.current_amount || 0) / Number(topGoal.target_amount || 1) * 100)}% funded (KES ${fmt(topGoal.current_amount)} of KES ${fmt(topGoal.target_amount)}).`
      : 'No goals are active right now.';
  } else if (ql.includes('contribut') || ql.includes('who')) {
    const memberTotals = {};
    (contrib || []).forEach((item) => {
      const name = item.users?.full_name || 'Unknown';
      memberTotals[name] = (memberTotals[name] || 0) + Number(item.amount);
    });
    const top = Object.entries(memberTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);
    answer += top.length
      ? `Top contributors: ${top.map(([name, amount]) => `${name} (KES ${fmt(amount)})`).join(', ')}.`
      : 'No contributions recorded yet.';
  } else if (ql.includes('task') || ql.includes('urgent') || ql.includes('overdue')) {
    answer += `You have ${(tasks || []).length} pending tasks. ${overdueTasks} are overdue.`;
    if (overdueTasks) {
      answer += ` Overdue tasks include ${(tasks || []).filter((task) => task.deadline && new Date(task.deadline) < new Date()).slice(0, 3).map((task) => task.title).join(', ')}.`;
    }
  } else if (ql.includes('expense') || ql.includes('spend')) {
    const categoryTotals = {};
    (exp || []).forEach((item) => {
      categoryTotals[item.category] = (categoryTotals[item.category] || 0) + Number(item.amount);
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    answer += `Total expenses: KES ${fmt(totalExpenses)}.${topCategory ? ` Largest category: ${topCategory[0]} at KES ${fmt(topCategory[1])}.` : ''}`;
  } else if (ql.includes('meeting')) {
    answer += upcomingMeeting
      ? `Your next scheduled meeting is "${upcomingMeeting.title}" on ${fmtDate(upcomingMeeting.meeting_date)}.`
      : 'There is no upcoming scheduled meeting right now.';
  } else {
    answer += `Family balance: KES ${fmt(totalContributions - totalExpenses)}. Contributions: KES ${fmt(totalContributions)}. Expenses: KES ${fmt(totalExpenses)}. ${overdueTasks} overdue tasks.${upcomingMeeting ? ` Next meeting: ${upcomingMeeting.title} on ${fmtDate(upcomingMeeting.meeting_date)}.` : ''}`;
  }

  return answer;
}

async function saveAIInsight(question, answer) {
  if (!canGenerateAIInsights()) return;
  const { error } = await DB.client.from('ai_insights').insert({
    family_id: State.fid,
    insight_type: 'planning_tip',
    title: question.substring(0, 50),
    message: answer.substring(0, 500),
    severity: 'info',
  });

  if (error) {
    console.warn('[AI] Failed to save AI insight:', error);
  }
}

async function generateInsights() {
  if (!canGenerateAIInsights()) return;
  const sb = DB.client;
  const fid = State.fid;

  const [{ data: tasks }, { data: goals }, { data: fees }, { data: meetings }] = await Promise.all([
    sb.from('tasks').select('*').eq('family_id', fid).neq('status', 'completed'),
    sb.from('family_goals').select('*').eq('family_id', fid).eq('status', 'active'),
    sb.from('school_fees').select('*,students(name)').eq('family_id', fid),
    sb.from('meetings').select('*').eq('family_id', fid).eq('status', 'scheduled'),
  ]);

  const insightsToInsert = [];
  const now = new Date();

  const overdue = (tasks || []).filter((task) => task.deadline && new Date(task.deadline) < now);
  if (overdue.length > 0) {
    insightsToInsert.push({
      family_id: fid,
      insight_type: 'task_warning',
      title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
      message: `You have ${overdue.length} overdue task(s): ${overdue.slice(0, 3).map((task) => task.title).join(', ')}. Address these immediately to avoid delays.`,
      severity: 'alert',
    });
  }

  const unpaidFees = (fees || []).filter((fee) => Number(fee.total_fee || 0) > Number(fee.paid_amount || 0));
  if (unpaidFees.length > 0) {
    const total = unpaidFees.reduce((sum, fee) => sum + (Number(fee.total_fee || 0) - Number(fee.paid_amount || 0)), 0);
    insightsToInsert.push({
      family_id: fid,
      insight_type: 'school_fees',
      title: 'Outstanding School Fees',
      message: `${unpaidFees.length} student(s) have outstanding fees totalling KES ${fmt(total)}. Review the School Fees section.`,
      severity: 'warning',
    });
  }

  const topGoal = (goals || []).sort((a, b) => Number(b.target_amount || 0) - Number(a.target_amount || 0))[0];
  if (topGoal) {
    const pct = Math.round(Number(topGoal.current_amount || 0) / Number(topGoal.target_amount || 1) * 100);
    insightsToInsert.push({
      family_id: fid,
      insight_type: 'goal_update',
      title: `Goal: ${topGoal.title}`,
      message: `You are ${pct}% towards "${topGoal.title}". KES ${fmt(Number(topGoal.target_amount || 0) - Number(topGoal.current_amount || 0))} remaining.`,
      severity: 'info',
    });
  }

  const nextMeeting = (meetings || []).sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))[0];
  if (nextMeeting) {
    insightsToInsert.push({
      family_id: fid,
      insight_type: 'planning_tip',
      title: 'Upcoming Meeting',
      message: `The next scheduled meeting is "${nextMeeting.title}" on ${fmtDate(nextMeeting.meeting_date)}. Prepare updates ahead of time.`,
      severity: 'info',
    });
  }

  if (insightsToInsert.length > 0) {
    const { error } = await sb.from('ai_insights').insert(insightsToInsert);
    if (error) {
      alert(error.message || 'Unable to save AI insights right now.');
      return;
    }
    renderPage('ai');
  } else {
    alert('No new insights to generate based on current data.');
  }
}

async function _buildContext() {
  const sb = DB.client;
  const fid = State.fid;
  const [{ data: contrib }, { data: exp }, { data: tasks }, { data: goals }, { data: meetings }, { data: docs }] = await Promise.all([
    sb.from('contributions').select('amount,contribution_type').eq('family_id', fid),
    sb.from('expenses').select('amount,category').eq('family_id', fid),
    sb.from('tasks').select('title,status,deadline').eq('family_id', fid).neq('status', 'completed').limit(10),
    sb.from('family_goals').select('title,target_amount,current_amount,status').eq('family_id', fid),
    sb.from('meetings').select('title,status,meeting_date').eq('family_id', fid),
    sb.from('documents').select('id,category,access_level').eq('family_id', fid),
  ]);

  return {
    totalContributions: (contrib || []).reduce((sum, item) => sum + Number(item.amount), 0),
    totalExpenses: (exp || []).reduce((sum, item) => sum + Number(item.amount), 0),
    pendingTasks: (tasks || []).length,
    overdueTasks: (tasks || []).filter((task) => task.deadline && new Date(task.deadline) < new Date()).length,
    goals: goals || [],
    meetings: meetings || [],
    documents: {
      total: (docs || []).length,
      byCategory: (docs || []).reduce((acc, doc) => {
        acc[doc.category] = (acc[doc.category] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

Router.register('ai', renderAI);
