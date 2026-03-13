/**
 * js/pages/ai.js
 * ─────────────────────────────────────────────────────
 * AI Advisor: ask questions about family data, generate
 * automatic insights, and optionally connect a Supabase
 * Edge Function backed by Claude.
 */

async function renderAI() {
  setTopbar('AI Advisor');
  const { data: insights } = await DB.client
    .from('ai_insights')
    .select('*')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false })
    .limit(10);

  const typeMap = { task_warning: 'red', school_fees: 'amber', planning_tip: 'blue', success: 'green' };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g2">

        <!-- Saved insights panel -->
        <div>
          <div class="card-title mb12">Saved Insights</div>
          ${(insights || []).map(i => `
            <div class="ai-card ai-${typeMap[i.insight_type] || 'blue'}">
              <div class="ai-tag" style="color:var(--${typeMap[i.insight_type] === 'amber' ? 'warning' : typeMap[i.insight_type] === 'red' ? 'danger' : typeMap[i.insight_type] === 'green' ? 'success' : 'accent'});">
                ${i.title}
              </div>
              <div class="ai-msg">${i.message}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:6px;">${ago(i.created_at)}</div>
            </div>`).join('')}
          ${!(insights || []).length
            ? `<div class="ai-card ai-blue">
                <div class="ai-msg">
                  Generate insights by asking the advisor a question — they'll be saved here.
                </div>
               </div>`
            : ''}
          <button class="btn btn-sm" onclick="generateInsights()">⚡ Generate New Insights</button>
        </div>

        <!-- Ask panel + setup -->
        <div>
          <div class="card-title mb12">Ask the AI Advisor</div>
          <div class="card mb16">
            <div class="form-group">
              <label class="form-label">Your question</label>
              <textarea id="ai-q" class="form-textarea" style="min-height:100px;"
                placeholder="How are we tracking towards our goals?&#10;Who contributed the most this year?&#10;What tasks are most urgent?"></textarea>
            </div>
            <button class="btn btn-primary" style="width:100%;" onclick="askAI()">Ask AI Advisor</button>
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
            ].map(q => `<button class="btn" style="text-align:left;" onclick="document.getElementById('ai-q').value='${q}';askAI()">${q}</button>`).join('')}
          </div>

          <div class="card">
            <div class="card-title">🤖 AI Setup (Powered by Claude)</div>
            <div class="setup-step"><strong>Step 1 — Supabase Edge Function</strong>
              Supabase → Edge Functions → New Function. Name it <code>ai-advisor</code>.
            </div>
            <div class="setup-step"><strong>Step 2 — Add API Key</strong>
              Supabase → Settings → Edge Function Secrets → add <code>ANTHROPIC_API_KEY</code>
              from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>.
            </div>
            <div class="setup-step"><strong>Step 3 — Deploy</strong>
              Use the function code in <code>supabase/functions/ai-advisor/index.ts</code>.
            </div>
            <div class="setup-step"><strong>Step 4 — Paste URL below</strong>
              Once deployed, save the URL and the advisor will use Claude for real answers.
            </div>
            <div class="form-group" style="margin-top:12px;">
              <label class="form-label">Edge Function URL (optional)</label>
              <input id="ai-url" class="form-input"
                placeholder="https://xxxx.supabase.co/functions/v1/ai-advisor"
                value="${window.RuntimeConfig?.aiEdgeFunctionUrl || ''}"/>
              <button class="btn btn-sm" style="margin-top:6px;"
                onclick="saveAIUrl()">
                Save URL
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>`;
}

// ── Core AI functions ──────────────────────────────

async function askAI() {
  const q  = document.getElementById('ai-q')?.value?.trim();
  if (!q) return;
  const el = document.getElementById('ai-response');
  if (el) el.innerHTML = `<div class="loading-screen"><div class="spinner"></div>Thinking…</div>`;

  const aiUrl = window.RuntimeConfig?.aiEdgeFunctionUrl || '';

  // Try Edge Function (Claude) first
  if (aiUrl) {
    try {
      const context = await _buildContext();
      const res  = await fetch(aiUrl, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (window.RuntimeConfig?.supabaseAnonKey || ''),
        },
        body:    JSON.stringify({ question: q, familyContext: context }),
      });
      const data   = await res.json();
      if (!res.ok || !data?.answer) {
        throw new Error(data?.error || data?.message || 'AI service error');
      }
      const answer = data.answer;
      if (el) el.innerHTML = `
        <div class="ai-card ai-blue">
          <div class="ai-tag" style="color:var(--accent);">Claude AI Response</div>
          <div class="ai-msg">${answer}</div>
        </div>`;
      await DB.client.from('ai_insights').insert({
        family_id:    State.fid,
        insight_type: 'planning_tip',
        title:        q.substring(0, 50),
        message:      answer.substring(0, 500),
        severity:     'info',
      });
      return;
    } catch (e) {
      console.log('[AI] Edge Function unavailable — using local fallback', e);
    }
  }

  // Local fallback: derive an answer from raw data
  const sb  = DB.client;
  const fid = State.fid;
  const [{ data: contrib }, { data: exp }, { data: tasks }, { data: goals }] = await Promise.all([
    sb.from('contributions').select('amount,users(full_name)').eq('family_id', fid),
    sb.from('expenses').select('amount,category').eq('family_id', fid),
    sb.from('tasks').select('title,status,deadline').eq('family_id', fid).neq('status', 'completed'),
    sb.from('family_goals').select('*').eq('family_id', fid),
  ]);

  const totalC  = (contrib || []).reduce((a, b) => a + Number(b.amount), 0);
  const totalE  = (exp     || []).reduce((a, b) => a + Number(b.amount), 0);
  const overdue = (tasks   || []).filter(t => t.deadline && new Date(t.deadline) < new Date()).length;
  const topGoal = (goals   || []).sort((a, b) => b.target_amount - a.target_amount)[0];
  const ql      = q.toLowerCase();

  let answer = 'Based on your family data:\n\n';

  if (ql.includes('goal') || ql.includes('track')) {
    answer += topGoal
      ? `Your top goal "${topGoal.title}" is ${Math.round(topGoal.current_amount / topGoal.target_amount * 100)}% funded (KES ${fmt(topGoal.current_amount)} of KES ${fmt(topGoal.target_amount)}).`
      : 'No goals set yet. Create goals in the Family Goals section.';
  } else if (ql.includes('contribut') || ql.includes('who')) {
    const mm = {};
    (contrib || []).forEach(c => { const n = c.users?.full_name || '?'; mm[n] = (mm[n] || 0) + Number(c.amount); });
    const top = Object.entries(mm).sort((a, b) => b[1] - a[1]).slice(0, 3);
    answer += top.length
      ? `Top contributors: ${top.map(([n, a]) => `${n} (KES ${fmt(a)})`).join(', ')}.`
      : 'No contributions recorded yet.';
  } else if (ql.includes('task') || ql.includes('urgent') || ql.includes('overdue')) {
    answer += `You have ${(tasks || []).length} pending tasks. ${overdue} are overdue.`;
    if (overdue) answer += ' Overdue: ' + (tasks || []).filter(t => t.deadline && new Date(t.deadline) < new Date()).slice(0, 3).map(t => t.title).join(', ');
  } else if (ql.includes('expense') || ql.includes('spend')) {
    const cm = {};
    (exp || []).forEach(e => { cm[e.category] = (cm[e.category] || 0) + Number(e.amount); });
    const top = Object.entries(cm).sort((a, b) => b[1] - a[1])[0];
    answer += `Total expenses: KES ${fmt(totalE)}.${top ? ' Largest category: ' + top[0] + ' at KES ' + fmt(top[1]) : ''}`;
  } else {
    answer += `Family balance: KES ${fmt(totalC - totalE)}. Contributions: KES ${fmt(totalC)}. Expenses: KES ${fmt(totalE)}. ${overdue} overdue tasks. ${(goals || []).length} active goals.\n\nConnect your Anthropic AI Advisor for deeper analysis.`;
  }

  if (el) el.innerHTML = `
    <div class="ai-card ai-blue">
      <div class="ai-tag" style="color:var(--accent);">AI Response (Local)</div>
      <div class="ai-msg" style="white-space:pre-line;">${answer}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;">
        Connect the Edge Function for full Claude-powered analysis.
      </div>
    </div>`;
}

function saveAIUrl() {
  const input = document.getElementById('ai-url');
  const url = input?.value?.trim() || '';
  localStorage.setItem('fos_ai_url', url);
  if (input) input.value = url;
  alert('Edge Function URL saved.');
}

async function generateInsights() {
  const sb  = DB.client;
  const fid = State.fid;

  const [{ data: tasks }, { data: goals }, { data: fees }] = await Promise.all([
    sb.from('tasks').select('*').eq('family_id', fid).neq('status', 'completed'),
    sb.from('family_goals').select('*').eq('family_id', fid).eq('status', 'active'),
    sb.from('school_fees').select('*,students(name)').eq('family_id', fid),
  ]);

  const insightsToInsert = [];
  const now = new Date();

  const overdue = (tasks || []).filter(t => t.deadline && new Date(t.deadline) < now);
  if (overdue.length > 0) {
    insightsToInsert.push({
      family_id:    fid,
      insight_type: 'task_warning',
      title:        `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
      message:      `You have ${overdue.length} overdue task(s): ${overdue.slice(0, 3).map(t => t.title).join(', ')}. Address these immediately to avoid delays.`,
      severity:     'alert',
    });
  }

  const unpaidFees = (fees || []).filter(f => f.total_fee > f.paid_amount);
  if (unpaidFees.length > 0) {
    const total = unpaidFees.reduce((a, b) => a + (Number(b.total_fee) - Number(b.paid_amount)), 0);
    insightsToInsert.push({
      family_id:    fid,
      insight_type: 'school_fees',
      title:        'Outstanding School Fees',
      message:      `${unpaidFees.length} student(s) have outstanding fees totalling KES ${fmt(total)}. Review the School Fees section.`,
      severity:     'warning',
    });
  }

  const topGoal = (goals || []).sort((a, b) => b.target_amount - a.target_amount)[0];
  if (topGoal) {
    const pct = Math.round(topGoal.current_amount / topGoal.target_amount * 100);
    insightsToInsert.push({
      family_id:    fid,
      insight_type: 'planning_tip',
      title:        `Goal: ${topGoal.title}`,
      message:      `You are ${pct}% towards "${topGoal.title}". KES ${fmt(topGoal.target_amount - topGoal.current_amount)} remaining.`,
      severity:     'info',
    });
  }

  if (insightsToInsert.length > 0) {
    await sb.from('ai_insights').insert(insightsToInsert);
    renderPage('ai');
  } else {
    alert('No new insights to generate based on current data.');
  }
}

// Build a compact context object for the Edge Function
async function _buildContext() {
  const sb  = DB.client;
  const fid = State.fid;
  const [{ data: contrib }, { data: exp }, { data: tasks }, { data: goals }] = await Promise.all([
    sb.from('contributions').select('amount,contribution_type').eq('family_id', fid),
    sb.from('expenses').select('amount,category').eq('family_id', fid),
    sb.from('tasks').select('title,status,deadline').eq('family_id', fid).neq('status', 'completed').limit(10),
    sb.from('family_goals').select('title,target_amount,current_amount').eq('family_id', fid),
  ]);
  return {
    totalContributions: (contrib || []).reduce((a, b) => a + Number(b.amount), 0),
    totalExpenses:      (exp     || []).reduce((a, b) => a + Number(b.amount), 0),
    pendingTasks:       (tasks   || []).length,
    overdueTasks:       (tasks   || []).filter(t => t.deadline && new Date(t.deadline) < new Date()).length,
    goals:              goals || [],
  };
}

Router.register('ai', renderAI);
