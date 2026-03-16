/**
 * js/pages/farming.js
 * Farm Manager: crops, activities, inputs, livestock.
 * Filters to farming-type projects only.
 */

const FarmingPage = {
  projects: [],
  projectsById: {},
  membersById: {},
  crops: [],
  livestock: [],
  livestockEvents: [],
  outputs: [],
  storageKey: 'fos_farming_project',
};

function canManageFarmingRecords() {
  return ['admin', 'project_manager'].includes(State.currentProfile?.role);
}

function canLogFarmingActivity() {
  return Boolean(State.currentProfile?.family_id || State.fid);
}

function setActiveFarmingProject(projectId = '') {
  if (!projectId) {
    localStorage.removeItem(FarmingPage.storageKey);
    return;
  }

  localStorage.setItem(FarmingPage.storageKey, projectId);
}

function getActiveFarmingProject() {
  return localStorage.getItem(FarmingPage.storageKey) || '';
}

function clearActiveFarmingProject() {
  setActiveFarmingProject('');
}

function farmingProjectName(projectId) {
  return FarmingPage.projectsById[projectId]?.name || '-';
}

function farmingCropName(cropId) {
  return FarmingPage.crops.find((crop) => crop.id === cropId)?.crop_name || 'Crop output';
}

function farmingLivestockName(livestockId) {
  const item = FarmingPage.livestock.find((row) => row.id === livestockId);
  if (!item) return 'Livestock output';
  return item.breed ? `${item.animal_type} - ${item.breed}` : item.animal_type;
}

function farmingOutputCategoryLabel(value) {
  return String(value || 'output')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function farmingUsageBadge(value) {
  const map = {
    sold: 'b-green',
    stored: 'b-blue',
    consumed: 'b-amber',
    distributed: 'b-purple',
    seed: 'b-gray',
    other: 'b-gray',
  };

  return `<span class="badge ${map[value] || 'b-gray'}">${farmingOutputCategoryLabel(value)}</span>`;
}

function farmingOutputSourceName(output) {
  if (output.crop_id) return farmingCropName(output.crop_id);
  if (output.livestock_id) return farmingLivestockName(output.livestock_id);
  return `${farmingProjectName(output.project_id)} (general)`;
}

function normalizeLivestockCountChange(eventType, countChange) {
  const amount = parseInt(countChange || '0', 10) || 0;
  if (!amount) return 0;
  if (eventType === 'birth') return Math.abs(amount);
  if (eventType === 'sale' || eventType === 'death') return -Math.abs(amount);
  return amount;
}

async function getFarmingProjects() {
  const { data, error } = await DB.client
    .from('projects')
    .select('id,name,status,description,project_type,budget,start_date,end_date,created_by,created_at')
    .eq('family_id', State.fid)
    .eq('project_type', 'farming')
    .order('name');

  if (error) {
    console.error('[Farming] Failed to load farming projects:', error);
    return [];
  }

  return data || [];
}

function activeFarmingProject() {
  const activeId = getActiveFarmingProject();
  if (!activeId) return null;
  return FarmingPage.projects.find((project) => project.id === activeId) || null;
}

function farmingProjectFieldMarkup(projects, selectedId = '', lockToActive = false) {
  if (lockToActive && selectedId) {
    const project = projects.find((item) => item.id === selectedId);
    return `
      <label class="form-label">Farm Project</label>
      <input class="form-input" value="${escapeHtml(project?.name || 'Selected project')}" disabled />
      <input id="farm-project-id" type="hidden" value="${selectedId}" />`;
  }

  return `
    <label class="form-label">Farm Project</label>
    <select id="farm-project-id" class="form-select">
      <option value="">- Select -</option>
      ${projects.map((project) => `<option value="${project.id}" ${project.id === selectedId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}
    </select>`;
}

async function ensureFarmingProjects() {
  const projects = await getFarmingProjects();
  if (projects.length) return projects;

  Modal.open('Farming Project Required', `
    <div style="font-size:13px;color:var(--text2);line-height:1.6;">
      Create a farming project from the Projects page before adding crops, livestock, inputs, or activities.
    </div>
  `);
  return null;
}

function farmingContextCard(project) {
  if (!project) {
    return `
      <div class="card mb16">
        <div class="flex-between" style="gap:12px;align-items:flex-start;">
          <div>
            <div class="card-title">Farm Scope</div>
            <div style="font-size:13px;color:var(--text2);line-height:1.6;">
              Tracking all farming projects in one place. Open a farming project from Projects if you want a focused view.
            </div>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="card mb16">
      <div class="flex-between" style="gap:12px;align-items:flex-start;">
        <div>
          <div class="card-title">${escapeHtml(project.name)}</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.6;">
            Focused farm operations view for this project.
          </div>
          ${project.description ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;">${escapeHtml(project.description)}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-sm" onclick="backToProjectFromFarming()">Back to Project</button>
          <button class="btn btn-sm" onclick="showAllFarmProjects()">Show All</button>
        </div>
      </div>
    </div>`;
}

function backToProjectFromFarming() {
  const project = activeFarmingProject();
  if (!project) {
    nav('projects');
    return;
  }

  if (typeof rememberActiveProject === 'function') {
    rememberActiveProject(project.id);
  } else {
    localStorage.setItem('fos_project_detail', project.id);
  }
  nav('project-detail');
}

function showAllFarmProjects() {
  clearActiveFarmingProject();
  renderPage('farming');
}

function farmingOutputSourceOptions(projectId, sourceType) {
  if (!projectId || sourceType === 'general') return [];
  if (sourceType === 'crop') {
    return FarmingPage.crops
      .filter((crop) => crop.project_id === projectId)
      .map((crop) => ({ id: crop.id, label: crop.crop_name }));
  }

  return FarmingPage.livestock
    .filter((item) => item.project_id === projectId)
    .map((item) => ({ id: item.id, label: item.breed ? `${item.animal_type} - ${item.breed}` : item.animal_type }));
}

function farmingOutputSourceFieldMarkup(projectId, sourceType, selectedId = '') {
  if (sourceType === 'general') {
    return `
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" value="General project output" disabled />
      </div>`;
  }

  const options = farmingOutputSourceOptions(projectId, sourceType);
  const label = sourceType === 'crop' ? 'Crop' : 'Livestock';
  if (!options.length) {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <input class="form-input" value="No ${label.toLowerCase()} records yet for this project" disabled />
      </div>`;
  }

  return `
    <div class="form-group">
      <label class="form-label">${label}</label>
      <select id="farm-output-source-id" class="form-select">
        <option value="">- Select -</option>
        ${options.map((option) => `<option value="${option.id}" ${option.id === selectedId ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </div>`;
}

function refreshFarmOutputSourceField() {
  const container = document.getElementById('farm-output-source-field');
  if (!container) return;
  const projectId = document.getElementById('farm-project-id')?.value || '';
  const sourceType = document.getElementById('farm-output-source-type')?.value || 'general';
  container.innerHTML = farmingOutputSourceFieldMarkup(projectId, sourceType);
}

async function renderFarming() {
  const actions = [];
  if (canManageFarmingRecords()) {
    actions.push(`<button class="btn btn-sm" onclick="openAddCrop()">+ Crop</button>`);
    actions.push(`<button class="btn btn-sm" onclick="openAddLivestock()">+ Livestock</button>`);
    actions.push(`<button class="btn btn-sm" onclick="openAddLivestockEvent()">+ Livestock Event</button>`);
    actions.push(`<button class="btn btn-sm" onclick="openAddInput()">+ Input</button>`);
    actions.push(`<button class="btn btn-sm" onclick="openAddOutput()">+ Output</button>`);
  }
  if (canLogFarmingActivity()) {
    actions.push(`<button class="btn btn-primary btn-sm" onclick="openAddActivity()">+ Activity</button>`);
  }
  setTopbar('Farm Manager', actions.join(' '));

  const sb = DB.client;
  const [{ data: projects, error: projectError }, { data: members, error: memberError }] = await Promise.all([
    sb.from('projects').select('id,name,status,description,project_type,budget,start_date,end_date,created_by,created_at').eq('family_id', State.fid).eq('project_type', 'farming').order('created_at', { ascending: false }),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
  ]);

  if (projectError || memberError) {
    console.error('[Farming] Failed to load:', projectError || memberError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load farm records right now')}</div>
      </div>`;
    return;
  }

  FarmingPage.projects = projects || [];
  FarmingPage.projectsById = Object.fromEntries(FarmingPage.projects.map((project) => [project.id, project]));
  FarmingPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));

  const activeId = getActiveFarmingProject();
  if (activeId && !FarmingPage.projectsById[activeId]) {
    clearActiveFarmingProject();
  }

  const scopedProject = activeFarmingProject();
  const visibleProjects = scopedProject ? [scopedProject] : FarmingPage.projects;
  const projectIds = visibleProjects.map((project) => project.id);

  const cropQuery = projectIds.length
    ? sb.from('farm_crops').select('*').in('project_id', projectIds).order('planting_date', { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const activityQuery = projectIds.length
    ? sb.from('project_activities').select('*').in('project_id', projectIds).order('activity_date', { ascending: false }).limit(20)
    : Promise.resolve({ data: [], error: null });
  const inputQuery = projectIds.length
    ? sb.from('farm_inputs').select('*').in('project_id', projectIds).order('created_at', { ascending: false }).limit(20)
    : Promise.resolve({ data: [], error: null });
  const livestockQuery = projectIds.length
    ? sb.from('livestock').select('*').in('project_id', projectIds).order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const livestockEventsQuery = projectIds.length
    ? sb.from('livestock_events').select('*').order('event_date', { ascending: false }).limit(20)
    : Promise.resolve({ data: [], error: null });
  const outputQuery = projectIds.length
    ? sb.from('farm_outputs').select('*').in('project_id', projectIds).order('output_date', { ascending: false }).limit(20)
    : Promise.resolve({ data: [], error: null });
  const expenseQuery = projectIds.length
    ? sb.from('expenses').select('project_id,amount').eq('family_id', State.fid).in('project_id', projectIds)
    : Promise.resolve({ data: [], error: null });

  const [
    { data: crops, error: cropError },
    { data: activities, error: activityError },
    { data: inputs, error: inputError },
    { data: livestock, error: livestockError },
    { data: livestockEvents, error: livestockEventsError },
    { data: outputs, error: outputError },
    { data: expenses, error: expenseError },
  ] = await Promise.all([cropQuery, activityQuery, inputQuery, livestockQuery, livestockEventsQuery, outputQuery, expenseQuery]);

  if (cropError || activityError || inputError || livestockError || livestockEventsError || outputError || expenseError) {
    console.error('[Farming] Failed to load farm data:', cropError || activityError || inputError || livestockError || livestockEventsError || outputError || expenseError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load farm records right now')}</div>
      </div>`;
    return;
  }

  const farmProjects = visibleProjects;
  const farmCrops = crops || [];
  const farmActivities = activities || [];
  const farmInputs = inputs || [];
  const farmLivestock = livestock || [];
  const livestockProjectById = Object.fromEntries(farmLivestock.map((row) => [row.id, row.project_id]));
  const farmLivestockEvents = (livestockEvents || [])
    .filter((event) => Boolean(livestockProjectById[event.livestock_id]))
    .map((event) => ({
      ...event,
      project_id: livestockProjectById[event.livestock_id],
    }));
  const farmOutputs = outputs || [];
  const farmExpenses = expenses || [];

  FarmingPage.crops = farmCrops;
  FarmingPage.livestock = farmLivestock;
  FarmingPage.livestockEvents = farmLivestockEvents;
  FarmingPage.outputs = farmOutputs;

  const now = new Date();
  const thisMonthOutputs = farmOutputs.filter((item) => {
    const date = new Date(item.output_date || item.created_at);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const farmSummary = FinanceCore.buildFarmSummary(
    farmProjects,
    farmOutputs,
    farmInputs,
    farmActivities,
    farmLivestockEvents,
    farmExpenses,
  );
  const soldValue = farmSummary.salesValue;

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      ${farmingContextCard(scopedProject)}

      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Farm Projects</div>
          <div class="metric-value">${farmProjects.length}</div></div>
        <div class="metric-card"><div class="metric-label">Crops Tracked</div>
          <div class="metric-value" style="color:var(--success);">${farmCrops.length}</div></div>
        <div class="metric-card"><div class="metric-label">Livestock</div>
          <div class="metric-value" style="color:var(--warning);">${farmLivestock.reduce((sum, item) => sum + Number(item.count || 0), 0)}</div></div>
        <div class="metric-card"><div class="metric-label">Activities</div>
          <div class="metric-value">${farmActivities.length}</div></div>
      </div>

      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Output Records</div>
          <div class="metric-value">${farmOutputs.length}</div></div>
        <div class="metric-card"><div class="metric-label">This Month</div>
          <div class="metric-value" style="color:var(--accent);">${thisMonthOutputs.length}</div></div>
        <div class="metric-card"><div class="metric-label">Sold Value</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(soldValue)}</div></div>
        <div class="metric-card"><div class="metric-label">${scopedProject ? 'Operational Cost' : 'Farm Operational Cost'}</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(farmSummary.operationalCost)}</div></div>
      </div>

      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Cash Spend</div>
          <div class="metric-value">KES ${fmt(farmSummary.cashSpend)}</div></div>
        <div class="metric-card"><div class="metric-label">Sold Records</div>
          <div class="metric-value">${farmSummary.soldCount}</div></div>
        <div class="metric-card"><div class="metric-label">Stored Records</div>
          <div class="metric-value">${farmSummary.storedCount}</div></div>
        <div class="metric-card"><div class="metric-label">Consumed Records</div>
          <div class="metric-value">${farmSummary.consumedCount}</div></div>
      </div>

      ${!FarmingPage.projects.length ? `
        <div class="card mb16">
          ${empty('No farming projects yet - create one from Projects to start tracking operations')}
        </div>` : ''}

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Crops</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Crop</th><th>Farm</th><th>Area</th><th>Stage</th><th>Expected Harvest</th></tr></thead>
              <tbody>
                ${farmCrops.map((crop) => `
                  <tr>
                    <td style="font-weight:600;">${escapeHtml(crop.crop_name || '-')}</td>
                    <td style="font-size:12px;">${escapeHtml(farmingProjectName(crop.project_id))}</td>
                    <td style="font-size:12px;">${crop.acreage ? `${fmt(crop.acreage)} ac` : '-'}</td>
                    <td>${statusBadge(crop.status || 'planning')}</td>
                    <td style="font-size:12px;color:var(--text3);">${crop.expected_harvest_date ? fmtDate(crop.expected_harvest_date) : '-'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!farmCrops.length ? empty('No crops recorded') : ''}
          ${canManageFarmingRecords() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openAddCrop()">+ Add Crop</button>` : ''}
        </div>

        <div class="card">
          <div class="card-title">Livestock</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Breed</th><th>Qty</th><th>Farm</th></tr></thead>
              <tbody>
                ${farmLivestock.map((item) => `
                  <tr>
                    <td style="font-weight:600;">${escapeHtml(item.animal_type || '-')}</td>
                    <td style="font-size:12px;">${escapeHtml(item.breed || '-')}</td>
                    <td style="font-weight:600;">${fmt(item.count || 0)}</td>
                    <td style="font-size:12px;">${escapeHtml(farmingProjectName(item.project_id))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!farmLivestock.length ? empty('No livestock recorded') : ''}
          ${canManageFarmingRecords() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openAddLivestock()">+ Add Livestock</button>` : ''}
        </div>
      </div>

      <div class="card mb16">
        <div class="card-title">Livestock Events</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Event</th><th>Livestock</th><th>Date</th><th>Count Change</th><th>Cost</th></tr></thead>
            <tbody>
              ${farmLivestockEvents.map((event) => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${escapeHtml(farmingOutputCategoryLabel(event.event_type))}</div>
                    <div style="font-size:11px;color:var(--text3);">${escapeHtml(event.description || '')}</div>
                  </td>
                  <td style="font-size:12px;">${escapeHtml(farmingLivestockName(event.livestock_id))}</td>
                  <td style="font-size:12px;color:var(--text3);">${fmtDate(event.event_date)}</td>
                  <td style="font-size:12px;">${event.count_change ? fmt(event.count_change) : '-'}</td>
                  <td style="font-size:12px;">${event.cost ? `KES ${fmt(event.cost)}` : '-'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!farmLivestockEvents.length ? empty('No livestock events recorded yet') : ''}
        ${canManageFarmingRecords() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openAddLivestockEvent()">+ Add Event</button>` : ''}
      </div>

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Recent Activities</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Activity</th><th>Farm</th><th>By</th><th>Date</th><th>Cost</th></tr></thead>
              <tbody>
                ${farmActivities.map((activity) => `
                  <tr>
                    <td>
                      ${escapeHtml(activity.activity_type || '-')}
                      ${activity.description ? `<div style="font-size:11px;color:var(--text3);">${escapeHtml(activity.description)}</div>` : ''}
                    </td>
                    <td style="font-size:12px;">${escapeHtml(farmingProjectName(activity.project_id))}</td>
                    <td style="font-size:12px;">${escapeHtml(FarmingPage.membersById[activity.created_by]?.full_name || '-')}</td>
                    <td style="font-size:12px;color:var(--text3);">${activity.activity_date ? fmtDate(activity.activity_date) : '-'}</td>
                    <td style="font-size:12px;">${activity.cost ? `KES ${fmt(activity.cost)}` : '-'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!farmActivities.length ? empty('No activities recorded') : ''}
          ${canLogFarmingActivity() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openAddActivity()">+ Add Activity</button>` : ''}
        </div>

        <div class="card">
          <div class="card-title">Farm Inputs</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Input</th><th>Qty</th><th>Farm</th><th>Cost</th><th>Date</th></tr></thead>
              <tbody>
                ${farmInputs.map((input) => `
                  <tr>
                    <td>
                      ${escapeHtml(input.name || '-')}
                      ${input.notes ? `<div style="font-size:11px;color:var(--text3);">${escapeHtml(input.notes)}</div>` : ''}
                    </td>
                    <td style="font-size:12px;">${fmt(input.quantity || 0)} ${escapeHtml(input.unit || '')}</td>
                    <td style="font-size:12px;color:var(--text2);">${escapeHtml(farmingProjectName(input.project_id))}</td>
                    <td>KES ${fmt(Number(input.quantity || 0) * Number(input.cost_per_unit || 0))}</td>
                    <td style="font-size:12px;color:var(--text3);">${fmtDate(input.updated_at || input.created_at)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!farmInputs.length ? empty('No inputs recorded') : ''}
          ${canManageFarmingRecords() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openAddInput()">+ Add Input</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Outputs & Yield</div>
        <div class="tag-row" style="margin-bottom:10px;">
          <span class="badge b-green">Sold ${fmt(farmSummary.soldCount)}</span>
          <span class="badge b-blue">Stored ${fmt(farmSummary.storedCount)}</span>
          <span class="badge b-amber">Consumed ${fmt(farmSummary.consumedCount)}</span>
          ${scopedProject ? `<span class="badge b-gray">${escapeHtml(scopedProject.name)}</span>` : ''}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Output</th><th>Source</th><th>Qty</th><th>Use</th><th>Date</th><th>Value</th></tr></thead>
            <tbody>
              ${farmOutputs.map((output) => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${escapeHtml(farmingOutputCategoryLabel(output.output_category))}</div>
                    ${output.destination ? `<div style="font-size:11px;color:var(--text3);">${escapeHtml(output.destination)}</div>` : ''}
                  </td>
                  <td style="font-size:12px;">
                    ${escapeHtml(farmingOutputSourceName(output))}
                    <div style="font-size:11px;color:var(--text3);">${escapeHtml(farmingProjectName(output.project_id))}</div>
                  </td>
                  <td style="font-size:12px;">${fmt(output.quantity || 0)} ${escapeHtml(output.unit || '')}</td>
                  <td>${farmingUsageBadge(output.usage_type)}</td>
                  <td style="font-size:12px;color:var(--text3);">${output.output_date ? fmtDate(output.output_date) : '-'}</td>
                  <td>${output.total_value ? `KES ${fmt(output.total_value)}` : '-'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!farmOutputs.length ? empty('No farm outputs recorded yet') : ''}
        ${canManageFarmingRecords() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openAddOutput()">+ Record Output</button>` : ''}
      </div>
    </div>`;
}

async function openAddCrop() {
  if (!canManageFarmingRecords()) return;

  const projects = await ensureFarmingProjects();
  if (!projects) return;
  const selectedProjectId = getActiveFarmingProject();

  Modal.open('Add Crop', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Crop Name</label>
        <input id="cr-name" class="form-input" placeholder="Maize"/></div>
      <div class="form-group">${farmingProjectFieldMarkup(projects, selectedProjectId, Boolean(selectedProjectId))}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Area (acres)</label>
        <input id="cr-area" class="form-input" type="number" placeholder="2"/></div>
      <div class="form-group"><label class="form-label">Expected Yield</label>
        <input id="cr-yield" class="form-input" type="number" placeholder="1200"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Planting Date</label>
        <input id="cr-plant" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">Expected Harvest</label>
        <input id="cr-harv" class="form-input" type="date"/></div>
    </div>
    <div class="form-group"><label class="form-label">Status</label>
      <select id="cr-stage" class="form-select">
        <option value="planning">Planning</option>
        <option value="planted">Planted</option>
        <option value="growing">Growing</option>
        <option value="harvesting">Harvesting</option>
        <option value="completed">Completed</option>
      </select></div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="cr-notes" class="form-textarea" placeholder="Optional notes"></textarea></div>
    <p id="crop-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    hideErr('crop-err');
    const cropName = document.getElementById('cr-name')?.value.trim() || '';
    const projectId = document.getElementById('farm-project-id')?.value || '';

    if (!cropName) {
      showErr('crop-err', 'Crop name is required.');
      return;
    }
    if (!projectId) {
      showErr('crop-err', 'Select a farming project.');
      return;
    }

    const { error } = await DB.client.from('farm_crops').insert({
      project_id: projectId,
      crop_name: cropName,
      acreage: parseFloat(document.getElementById('cr-area')?.value || '') || null,
      expected_yield: parseFloat(document.getElementById('cr-yield')?.value || '') || null,
      planting_date: document.getElementById('cr-plant')?.value || null,
      expected_harvest_date: document.getElementById('cr-harv')?.value || null,
      status: document.getElementById('cr-stage')?.value || 'planning',
      notes: document.getElementById('cr-notes')?.value.trim() || null,
    });

    if (error) {
      showErr('crop-err', error.message);
      return;
    }

    Modal.close();
    renderPage('farming');
  }}]);
}

async function openAddActivity() {
  if (!canLogFarmingActivity()) return;

  const projects = await ensureFarmingProjects();
  if (!projects) return;
  const selectedProjectId = getActiveFarmingProject();

  Modal.open('Log Farm Activity', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Activity Type</label>
        <select id="act-type" class="form-select">
          <option value="Planting">Planting</option>
          <option value="Weeding">Weeding</option>
          <option value="Fertilizing">Fertilizing</option>
          <option value="Spraying">Spraying</option>
          <option value="Harvesting">Harvesting</option>
          <option value="Irrigation">Irrigation</option>
          <option value="Other">Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Date</label>
        <input id="act-date" class="form-input" type="date"/></div>
    </div>
    <div class="form-row">
      <div class="form-group">${farmingProjectFieldMarkup(projects, selectedProjectId, Boolean(selectedProjectId))}</div>
      <div class="form-group"><label class="form-label">Cost (KES)</label>
        <input id="act-cost" class="form-input" type="number" placeholder="0"/></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="act-desc" class="form-textarea" placeholder="What happened during this activity?"></textarea></div>
    <p id="activity-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Log', cls: 'btn-primary', fn: async () => {
    hideErr('activity-err');
    const projectId = document.getElementById('farm-project-id')?.value || '';
    const description = document.getElementById('act-desc')?.value.trim() || '';

    if (!projectId) {
      showErr('activity-err', 'Select a farming project.');
      return;
    }
    if (!description) {
      showErr('activity-err', 'Add a short description so everyone understands what happened.');
      return;
    }

    const { error } = await DB.client.from('project_activities').insert({
      project_id: projectId,
      activity_type: document.getElementById('act-type')?.value || 'Other',
      activity_date: document.getElementById('act-date')?.value || null,
      description,
      cost: parseFloat(document.getElementById('act-cost')?.value || '') || 0,
      created_by: State.uid,
    });

    if (error) {
      const message = /null value in column "description"/i.test(error.message || '')
        ? 'Add a short description so everyone understands what happened.'
        : error.message;
      showErr('activity-err', message);
      return;
    }

    Modal.close();
    renderPage('farming');
  }}]);
}

async function openAddInput() {
  if (!canManageFarmingRecords()) return;

  const projects = await ensureFarmingProjects();
  if (!projects) return;
  const selectedProjectId = getActiveFarmingProject();

  Modal.open('Record Farm Input', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Input Name</label>
        <input id="in-name" class="form-input" placeholder="DAP Fertilizer"/></div>
      <div class="form-group">${farmingProjectFieldMarkup(projects, selectedProjectId, Boolean(selectedProjectId))}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Quantity</label>
        <input id="in-qty" class="form-input" type="number" placeholder="50"/></div>
      <div class="form-group"><label class="form-label">Unit</label>
        <input id="in-unit" class="form-input" placeholder="kg"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cost Per Unit (KES)</label>
        <input id="in-cost" class="form-input" type="number" placeholder="4500"/></div>
      <div class="form-group"><label class="form-label">Notes</label>
        <input id="in-notes" class="form-input" placeholder="Optional notes"/></div>
    </div>
    <p id="input-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    hideErr('input-err');
    const name = document.getElementById('in-name')?.value.trim() || '';
    const projectId = document.getElementById('farm-project-id')?.value || '';

    if (!name) {
      showErr('input-err', 'Input name is required.');
      return;
    }
    if (!projectId) {
      showErr('input-err', 'Select a farming project.');
      return;
    }

    const { error } = await DB.client.from('farm_inputs').insert({
      project_id: projectId,
      name,
      quantity: parseFloat(document.getElementById('in-qty')?.value || '') || 0,
      unit: document.getElementById('in-unit')?.value.trim() || null,
      cost_per_unit: parseFloat(document.getElementById('in-cost')?.value || '') || 0,
      notes: document.getElementById('in-notes')?.value.trim() || null,
    });

    if (error) {
      showErr('input-err', error.message);
      return;
    }

    Modal.close();
    renderPage('farming');
  }}]);
}

async function openAddLivestock() {
  if (!canManageFarmingRecords()) return;

  const projects = await ensureFarmingProjects();
  if (!projects) return;
  const selectedProjectId = getActiveFarmingProject();

  Modal.open('Add Livestock', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <input id="ls-type" class="form-input" placeholder="Cattle, Goat, Chicken"/></div>
      <div class="form-group"><label class="form-label">Breed</label>
        <input id="ls-breed" class="form-input" placeholder="Friesian"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Quantity</label>
        <input id="ls-qty" class="form-input" type="number" placeholder="10"/></div>
      <div class="form-group">${farmingProjectFieldMarkup(projects, selectedProjectId, Boolean(selectedProjectId))}</div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="ls-notes" class="form-textarea" placeholder="Health status, ear tags, or feed notes"></textarea></div>
    <p id="livestock-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    hideErr('livestock-err');
    const animalType = document.getElementById('ls-type')?.value.trim() || '';
    const projectId = document.getElementById('farm-project-id')?.value || '';

    if (!animalType) {
      showErr('livestock-err', 'Livestock type is required.');
      return;
    }
    if (!projectId) {
      showErr('livestock-err', 'Select a farming project.');
      return;
    }

    const { error } = await DB.client.from('livestock').insert({
      project_id: projectId,
      animal_type: animalType,
      breed: document.getElementById('ls-breed')?.value.trim() || null,
      count: parseInt(document.getElementById('ls-qty')?.value || '0', 10) || 0,
      notes: document.getElementById('ls-notes')?.value.trim() || null,
    });

    if (error) {
      showErr('livestock-err', error.message);
      return;
    }

    Modal.close();
    renderPage('farming');
  }}]);
}

async function openAddOutput() {
  if (!canManageFarmingRecords()) return;

  const projects = await ensureFarmingProjects();
  if (!projects) return;
  const selectedProjectId = getActiveFarmingProject();

  Modal.open('Record Farm Output', `
    <div class="form-row">
      <div class="form-group">${farmingProjectFieldMarkup(projects, selectedProjectId, Boolean(selectedProjectId))}</div>
      <div class="form-group">
        <label class="form-label">Source Type</label>
        <select id="farm-output-source-type" class="form-select" onchange="refreshFarmOutputSourceField()">
          <option value="general">General</option>
          <option value="crop">Crop</option>
          <option value="livestock">Livestock</option>
        </select>
      </div>
    </div>
    <div class="form-row" id="farm-output-source-field">
      ${farmingOutputSourceFieldMarkup(selectedProjectId, 'general')}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Output Category</label>
        <select id="farm-output-category" class="form-select">
          <option value="harvest">Harvest</option>
          <option value="milk">Milk</option>
          <option value="eggs">Eggs</option>
          <option value="honey">Honey</option>
          <option value="meat">Meat</option>
          <option value="animal_sale">Animal Sale</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Usage</label>
        <select id="farm-output-usage" class="form-select">
          <option value="sold">Sold</option>
          <option value="stored">Stored</option>
          <option value="consumed">Consumed</option>
          <option value="distributed">Distributed</option>
          <option value="seed">Seed</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Quantity</label>
        <input id="farm-output-qty" class="form-input" type="number" placeholder="35" />
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <input id="farm-output-unit" class="form-input" placeholder="litres, trays, bags, kg" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Output Date</label>
        <input id="farm-output-date" class="form-input" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Unit Price (KES)</label>
        <input id="farm-output-price" class="form-input" type="number" placeholder="Optional" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Destination</label>
        <input id="farm-output-destination" class="form-input" placeholder="Market, home use, buyer, school..." />
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input id="farm-output-notes" class="form-input" placeholder="Optional notes" />
      </div>
    </div>
    <p id="farm-output-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    hideErr('farm-output-err');
    const projectId = document.getElementById('farm-project-id')?.value || '';
    const sourceType = document.getElementById('farm-output-source-type')?.value || 'general';
    const sourceId = document.getElementById('farm-output-source-id')?.value || '';
    const quantity = parseFloat(document.getElementById('farm-output-qty')?.value || '');
    const unitPrice = parseFloat(document.getElementById('farm-output-price')?.value || '');

    if (!projectId) {
      showErr('farm-output-err', 'Select a farming project.');
      return;
    }
    if (!quantity || quantity <= 0) {
      showErr('farm-output-err', 'Enter a valid quantity.');
      return;
    }
    if (!document.getElementById('farm-output-unit')?.value.trim()) {
      showErr('farm-output-err', 'Unit is required.');
      return;
    }
    if ((sourceType === 'crop' || sourceType === 'livestock') && !sourceId) {
      showErr('farm-output-err', `Select a ${sourceType}.`);
      return;
    }

    const payload = {
      project_id: projectId,
      crop_id: sourceType === 'crop' ? sourceId : null,
      livestock_id: sourceType === 'livestock' ? sourceId : null,
      output_category: document.getElementById('farm-output-category')?.value || 'other',
      quantity,
      unit: document.getElementById('farm-output-unit')?.value.trim() || 'units',
      output_date: document.getElementById('farm-output-date')?.value || new Date().toISOString().slice(0, 10),
      usage_type: document.getElementById('farm-output-usage')?.value || 'other',
      unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
      total_value: Number.isFinite(unitPrice) ? unitPrice * quantity : null,
      destination: document.getElementById('farm-output-destination')?.value.trim() || null,
      notes: document.getElementById('farm-output-notes')?.value.trim() || null,
      recorded_by: State.uid,
    };

    const { error } = await DB.client.from('farm_outputs').insert(payload);
    if (error) {
      showErr('farm-output-err', error.message);
      return;
    }

    Modal.close();
    renderPage('farming');
  }}]);

  refreshFarmOutputSourceField();
}

async function openAddLivestockEvent() {
  if (!canManageFarmingRecords()) return;
  const projects = await ensureFarmingProjects();
  if (!projects) return;

  const selectedProjectId = getActiveFarmingProject();
  const livestockOptions = FarmingPage.livestock
    .filter((item) => !selectedProjectId || item.project_id === selectedProjectId)
    .map((item) => `<option value="${item.id}">${escapeHtml(item.breed ? `${item.animal_type} - ${item.breed}` : item.animal_type)}</option>`)
    .join('');

  if (!livestockOptions) {
    Modal.open('Livestock Required', `
      <div style="font-size:13px;color:var(--text2);line-height:1.6;">
        Add livestock to this farming project before recording livestock events.
      </div>
    `);
    return;
  }

  Modal.open('Record Livestock Event', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Livestock</label>
        <select id="le-livestock" class="form-select">${livestockOptions}</select></div>
      <div class="form-group"><label class="form-label">Event Type</label>
        <select id="le-type" class="form-select">
          ${['birth', 'vaccination', 'sale', 'death', 'breeding', 'treatment', 'other'].map((value) => `
            <option value="${value}">${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select></div>
    </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date</label>
        <input id="le-date" class="form-input" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
      <div class="form-group"><label class="form-label">Count Change</label>
        <input id="le-count" class="form-input" type="number" placeholder="Optional"/>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">Births add stock. Sales and deaths reduce stock.</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cost (KES)</label>
        <input id="le-cost" class="form-input" type="number" placeholder="Optional"/></div>
      <div class="form-group"><label class="form-label">Description</label>
        <input id="le-desc" class="form-input" placeholder="Vaccinated 5 calves, sold 2 goats..." /></div>
    </div>
    <p id="livestock-event-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => {
      hideErr('livestock-event-err');
      const description = document.getElementById('le-desc')?.value.trim() || '';
      if (!description) {
        showErr('livestock-event-err', 'Description is required.');
        return;
      }

      const { error } = await DB.client.from('livestock_events').insert({
        livestock_id: document.getElementById('le-livestock')?.value || null,
        event_type: document.getElementById('le-type')?.value || 'other',
        description,
        event_date: document.getElementById('le-date')?.value || new Date().toISOString().slice(0, 10),
        cost: parseFloat(document.getElementById('le-cost')?.value || '') || 0,
        count_change: normalizeLivestockCountChange(
          document.getElementById('le-type')?.value || 'other',
          document.getElementById('le-count')?.value || '0'
        ),
      });

      if (error) {
        showErr('livestock-event-err', error.message);
        return;
      }

      Modal.close();
      renderPage('farming');
    },
  }]);
}

Router.register('farming', renderFarming);
