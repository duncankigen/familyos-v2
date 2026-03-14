/**
 * js/pages/farming.js
 * Farm Manager: crops, activities, inputs, livestock.
 * Filters to farming-type projects only.
 */

const FarmingPage = {
  projects: [],
  projectsById: {},
  membersById: {},
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

async function renderFarming() {
  const actions = [];
  if (canManageFarmingRecords()) {
    actions.push(`<button class="btn btn-sm" onclick="openAddCrop()">+ Crop</button>`);
    actions.push(`<button class="btn btn-sm" onclick="openAddLivestock()">+ Livestock</button>`);
    actions.push(`<button class="btn btn-sm" onclick="openAddInput()">+ Input</button>`);
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

  const [
    { data: crops, error: cropError },
    { data: activities, error: activityError },
    { data: inputs, error: inputError },
    { data: livestock, error: livestockError },
  ] = await Promise.all([cropQuery, activityQuery, inputQuery, livestockQuery]);

  if (cropError || activityError || inputError || livestockError) {
    console.error('[Farming] Failed to load farm data:', cropError || activityError || inputError || livestockError);
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

      <div class="g2">
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

    if (!projectId) {
      showErr('activity-err', 'Select a farming project.');
      return;
    }

    const { error } = await DB.client.from('project_activities').insert({
      project_id: projectId,
      activity_type: document.getElementById('act-type')?.value || 'Other',
      activity_date: document.getElementById('act-date')?.value || null,
      description: document.getElementById('act-desc')?.value.trim() || null,
      cost: parseFloat(document.getElementById('act-cost')?.value || '') || 0,
      created_by: State.uid,
    });

    if (error) {
      showErr('activity-err', error.message);
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

Router.register('farming', renderFarming);
