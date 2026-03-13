/**
 * js/pages/farming.js
 * ─────────────────────────────────────────────────────
 * Farm Manager: crops, activities, inputs, livestock.
 * Filters to farming-type projects only.
 */

async function renderFarming() {
  setTopbar('Farm Manager', `
    <button class="btn btn-sm" onclick="openAddCrop()">+ Crop</button>
    <button class="btn btn-sm" onclick="openAddLivestock()">+ Livestock</button>
    <button class="btn btn-primary btn-sm" onclick="openAddActivity()">+ Activity</button>
  `);
  const sb = DB.client;

  const [{ data: projects }, { data: crops }, { data: activities }, { data: inputs }, { data: livestock }] = await Promise.all([
    sb.from('projects').select('*').eq('family_id', State.fid).eq('project_type', 'farming'),
    sb.from('farm_crops').select('*,projects(name)').eq('family_id', State.fid),
    sb.from('project_activities').select('*,projects(name),users(full_name)').eq('family_id', State.fid).order('activity_date', { ascending: false }).limit(20),
    sb.from('farm_inputs').select('*,projects(name)').eq('family_id', State.fid).order('purchased_date', { ascending: false }).limit(20),
    sb.from('livestock').select('*,projects(name)').eq('family_id', State.fid),
  ]);

  document.getElementById('page-content').innerHTML = `
    <div class="content">

      <!-- Metrics -->
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Farm Projects</div>
          <div class="metric-value">${(projects || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Crops Tracked</div>
          <div class="metric-value" style="color:var(--success);">${(crops || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Livestock</div>
          <div class="metric-value" style="color:var(--warning);">${(livestock || []).reduce((a, b) => a + Number(b.quantity || 0), 0)}</div></div>
        <div class="metric-card"><div class="metric-label">Activities</div>
          <div class="metric-value">${(activities || []).length}</div></div>
      </div>

      <!-- Crops + Livestock -->
      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Crops</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Crop</th><th>Farm</th><th>Area</th><th>Stage</th><th>Expected Harvest</th></tr></thead>
              <tbody>
                ${(crops || []).map(c => `
                  <tr>
                    <td style="font-weight:600;">${c.crop_name}</td>
                    <td style="font-size:12px;">${c.projects?.name || '—'}</td>
                    <td style="font-size:12px;">${c.area_acres ? c.area_acres + ' ac' : '—'}</td>
                    <td>${statusBadge(c.growth_stage || 'planning')}</td>
                    <td style="font-size:12px;color:var(--text3);">${fmtDate(c.expected_harvest_date)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!(crops || []).length ? empty('No crops recorded') : ''}
          <button class="btn btn-sm" style="margin-top:10px;" onclick="openAddCrop()">+ Add Crop</button>
        </div>

        <div class="card">
          <div class="card-title">Livestock</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Breed</th><th>Qty</th><th>Farm</th></tr></thead>
              <tbody>
                ${(livestock || []).map(l => `
                  <tr>
                    <td style="font-weight:600;">${l.livestock_type}</td>
                    <td style="font-size:12px;">${l.breed || '—'}</td>
                    <td style="font-weight:600;">${l.quantity}</td>
                    <td style="font-size:12px;">${l.projects?.name || '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!(livestock || []).length ? empty('No livestock recorded') : ''}
          <button class="btn btn-sm" style="margin-top:10px;" onclick="openAddLivestock()">+ Add Livestock</button>
        </div>
      </div>

      <!-- Activities + Inputs -->
      <div class="g2">
        <div class="card">
          <div class="card-title">Recent Activities</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Activity</th><th>Farm</th><th>By</th><th>Date</th><th>Cost</th></tr></thead>
              <tbody>
                ${(activities || []).map(a => `
                  <tr>
                    <td>${a.activity_type}</td>
                    <td style="font-size:12px;">${a.projects?.name || '—'}</td>
                    <td style="font-size:12px;">${a.users?.full_name || '—'}</td>
                    <td style="font-size:12px;color:var(--text3);">${fmtDate(a.activity_date)}</td>
                    <td style="font-size:12px;">${a.cost ? 'KES ' + fmt(a.cost) : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!(activities || []).length ? empty('No activities recorded') : ''}
          <button class="btn btn-sm" style="margin-top:10px;" onclick="openAddActivity()">+ Add Activity</button>
        </div>

        <div class="card">
          <div class="card-title">Farm Inputs</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Input</th><th>Qty</th><th>Supplier</th><th>Cost</th><th>Date</th></tr></thead>
              <tbody>
                ${(inputs || []).map(i => `
                  <tr>
                    <td>${i.input_name}</td>
                    <td style="font-size:12px;">${i.quantity} ${i.unit || ''}</td>
                    <td style="font-size:12px;color:var(--text2);">${i.supplier || '—'}</td>
                    <td>KES ${fmt(i.total_cost)}</td>
                    <td style="font-size:12px;color:var(--text3);">${fmtDate(i.purchased_date)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${!(inputs || []).length ? empty('No inputs recorded') : ''}
          <button class="btn btn-sm" style="margin-top:10px;" onclick="openAddInput()">+ Add Input</button>
        </div>
      </div>

    </div>`;
}

// ── Modals ─────────────────────────────────────────

async function _farmProjectOptions() {
  const { data } = await DB.client.from('projects').select('id,name').eq('family_id', State.fid).eq('project_type', 'farming');
  return (data || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

async function openAddCrop() {
  const opts = await _farmProjectOptions();
  Modal.open('Add Crop', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Crop Name</label>
        <input id="cr-name" class="form-input" placeholder="Maize"/></div>
      <div class="form-group"><label class="form-label">Variety</label>
        <input id="cr-var"  class="form-input" placeholder="DH04"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Farm Project</label>
        <select id="cr-proj" class="form-select"><option value="">— None —</option>${opts}</select></div>
      <div class="form-group"><label class="form-label">Area (acres)</label>
        <input id="cr-area" class="form-input" type="number" placeholder="2"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Planting Date</label>
        <input id="cr-plant" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">Expected Harvest</label>
        <input id="cr-harv"  class="form-input" type="date"/></div>
    </div>
    <div class="form-group"><label class="form-label">Growth Stage</label>
      <select id="cr-stage" class="form-select">
        <option value="planning">Planning</option>
        <option value="planted">Planted</option>
        <option value="growing">Growing</option>
        <option value="harvesting">Harvesting</option>
        <option value="completed">Completed</option>
      </select></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('farm_crops').insert({
      family_id:             State.fid,
      project_id:            document.getElementById('cr-proj').value  || null,
      crop_name:             document.getElementById('cr-name').value,
      variety:               document.getElementById('cr-var').value,
      area_acres:            parseFloat(document.getElementById('cr-area').value)  || null,
      planting_date:         document.getElementById('cr-plant').value || null,
      expected_harvest_date: document.getElementById('cr-harv').value  || null,
      growth_stage:          document.getElementById('cr-stage').value,
    });
    Modal.close(); renderPage('farming');
  }}]);
}

async function openAddActivity() {
  const opts = await _farmProjectOptions();
  const { data: members } = await DB.client.from('users').select('id,full_name').eq('family_id', State.fid);
  Modal.open('Log Farm Activity', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Activity Type</label>
        <select id="act-type" class="form-select">
          <option>Planting</option><option>Weeding</option><option>Fertilizing</option>
          <option>Spraying</option><option>Harvesting</option><option>Irrigation</option><option>Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Date</label>
        <input id="act-date" class="form-input" type="date"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Farm Project</label>
        <select id="act-proj" class="form-select"><option value="">— None —</option>${opts}</select></div>
      <div class="form-group"><label class="form-label">Performed By</label>
        <select id="act-user" class="form-select">
          ${(members || []).map(m => `<option value="${m.id}">${m.full_name}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cost (KES)</label>
        <input id="act-cost" class="form-input" type="number" placeholder="0"/></div>
      <div class="form-group"><label class="form-label">Notes</label>
        <input id="act-notes" class="form-input" placeholder="Optional notes"/></div>
    </div>
  `, [{ label: 'Log', cls: 'btn-primary', fn: async () => {
    await DB.client.from('project_activities').insert({
      family_id:     State.fid,
      project_id:    document.getElementById('act-proj').value || null,
      activity_type: document.getElementById('act-type').value,
      activity_date: document.getElementById('act-date').value || null,
      performed_by:  document.getElementById('act-user').value || null,
      cost:          parseFloat(document.getElementById('act-cost').value) || 0,
      notes:         document.getElementById('act-notes').value,
    });
    Modal.close(); renderPage('farming');
  }}]);
}

async function openAddInput() {
  const opts = await _farmProjectOptions();
  Modal.open('Record Farm Input', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Input Name</label>
        <input id="in-name" class="form-input" placeholder="DAP Fertilizer"/></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select id="in-type" class="form-select">
          <option>Fertilizer</option><option>Pesticide</option><option>Herbicide</option>
          <option>Seeds</option><option>Equipment</option><option>Other</option>
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Quantity</label>
        <input id="in-qty"  class="form-input" type="number" placeholder="50"/></div>
      <div class="form-group"><label class="form-label">Unit</label>
        <input id="in-unit" class="form-input" placeholder="kg"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Total Cost (KES)</label>
        <input id="in-cost"    class="form-input" type="number" placeholder="4500"/></div>
      <div class="form-group"><label class="form-label">Supplier</label>
        <input id="in-supplier" class="form-input" placeholder="Farmer's Choice"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Farm Project</label>
        <select id="in-proj" class="form-select"><option value="">— None —</option>${opts}</select></div>
      <div class="form-group"><label class="form-label">Purchase Date</label>
        <input id="in-date" class="form-input" type="date"/></div>
    </div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('farm_inputs').insert({
      family_id:      State.fid,
      project_id:     document.getElementById('in-proj').value || null,
      input_name:     document.getElementById('in-name').value,
      input_type:     document.getElementById('in-type').value,
      quantity:       parseFloat(document.getElementById('in-qty').value)  || 0,
      unit:           document.getElementById('in-unit').value,
      total_cost:     parseFloat(document.getElementById('in-cost').value) || 0,
      supplier:       document.getElementById('in-supplier').value,
      purchased_date: document.getElementById('in-date').value || null,
    });
    Modal.close(); renderPage('farming');
  }}]);
}

async function openAddLivestock() {
  const opts = await _farmProjectOptions();
  Modal.open('Add Livestock', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <input id="ls-type"  class="form-input" placeholder="Cattle, Goat, Chicken…"/></div>
      <div class="form-group"><label class="form-label">Breed</label>
        <input id="ls-breed" class="form-input" placeholder="Friesian"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Quantity</label>
        <input id="ls-qty"   class="form-input" type="number" placeholder="10"/></div>
      <div class="form-group"><label class="form-label">Farm Project</label>
        <select id="ls-proj" class="form-select"><option value="">— None —</option>${opts}</select></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="ls-notes" class="form-textarea" placeholder="Health status, ear tags, etc."></textarea></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('livestock').insert({
      family_id:      State.fid,
      project_id:     document.getElementById('ls-proj').value || null,
      livestock_type: document.getElementById('ls-type').value,
      breed:          document.getElementById('ls-breed').value,
      quantity:       parseInt(document.getElementById('ls-qty').value) || 0,
      notes:          document.getElementById('ls-notes').value,
    });
    Modal.close(); renderPage('farming');
  }}]);
}

Router.register('farming', renderFarming);
