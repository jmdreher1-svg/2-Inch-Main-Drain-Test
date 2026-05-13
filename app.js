// 2-inch Main Drain Flow Analysis
// Implements method from AXA XL PRC.14.1.2.2

const FITTINGS = [
  { key: 'angle',  label: 'Angle valve',      ft: 29 },
  { key: 'globe',  label: 'Globe valve',      ft: 58 },
  { key: 'gate',   label: 'Gate valve',       ft: 1  },
  { key: 'ell90',  label: '90° elbow',   ft: 5  },
  { key: 'ell45',  label: '45° elbow',   ft: 2  },
  { key: 'tee',    label: 'Tee (flow turns)', ft: 10 },
  { key: 'cross',  label: 'Cross (flow turns)', ft: 10 },
];

// Hydraulics constants
const C_DISCHARGE = 0.85;   // conservative outlet coefficient
const D_OUTLET    = 2.0;    // nominal 2" outlet, in
const D_PIPE      = 2.067;  // Schedule 40 2" pipe actual ID, in
const HW_C        = 120;    // Hazen-Williams roughness coefficient
const HW_EXP      = 1.852;

// Hazen-Williams friction loss in psi per ft:
//   p_f = 4.52 * Q^1.852 / (C^1.852 * d^4.87)
const D_PIPE_4_87 = Math.pow(D_PIPE, 4.87);
const HW_C_EXP    = Math.pow(HW_C,   HW_EXP);
const FRICTION_K  = 4.52 / (HW_C_EXP * D_PIPE_4_87); // psi/ft per Q^1.852

// Outlet pressure: P = (Q / (29.84 * c * d^2))^2
const OUTLET_DENOM = 29.84 * C_DISCHARGE * D_OUTLET * D_OUTLET;

function pressureAtRiser(Q, eqLen) {
  if (Q <= 0) return 0;
  const pOutlet   = Math.pow(Q / OUTLET_DENOM, 2);
  const pFriction = FRICTION_K * eqLen * Math.pow(Q, HW_EXP);
  return pOutlet + pFriction;
}

// Given riser residual pressure and equivalent length, solve for Q (gpm)
function flowFromResidual(pResidual, eqLen) {
  if (pResidual <= 0 || eqLen <= 0) return 0;
  let lo = 0, hi = 2000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (pressureAtRiser(mid, eqLen) < pResidual) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// -------- State --------
let drains = [];
let scenarios = [];
let nextDrainId = 1;
let nextScenarioId = 1;
let chartInstance = null;

function makeDrain(name) {
  const fittings = {};
  FITTINGS.forEach(f => fittings[f.key] = 0);
  return {
    id: nextDrainId++,
    name: name || ('Riser ' + String.fromCharCode(64 + nextDrainId - 1)),
    pipeLen: 0,
    fittings,
  };
}

function makeScenario(name) {
  return {
    id: nextScenarioId++,
    name: name || ('Scenario ' + nextScenarioId),
    drainReadings: {}, // drainId -> { flowing: bool, residual: number, isRef: bool }
  };
}

function equivalentLength(drain) {
  let total = Number(drain.pipeLen) || 0;
  FITTINGS.forEach(f => {
    total += (Number(drain.fittings[f.key]) || 0) * f.ft;
  });
  return total;
}

// -------- Drain UI --------
function renderDrains() {
  const container = document.getElementById('drains');
  container.innerHTML = '';
  drains.forEach(drain => {
    const div = document.createElement('div');
    div.className = 'drain';
    div.innerHTML = `
      <div class="drain-head">
        <input type="text" value="${escapeHtml(drain.name)}" data-id="${drain.id}" class="drain-name">
        <button class="btn-danger" data-id="${drain.id}" data-action="remove-drain">Remove</button>
      </div>
      <div class="row">
        <label>2&#8243; pipe length
          <div class="input-suffix">
            <input type="number" min="0" step="0.1" value="${drain.pipeLen}" data-id="${drain.id}" data-field="pipeLen">
            <span>ft</span>
          </div>
        </label>
      </div>
      <div class="fittings-grid">
        ${FITTINGS.map(f => `
          <label>${f.label} (${f.ft} ft)
            <input type="number" min="0" step="1" value="${drain.fittings[f.key]}" data-id="${drain.id}" data-fitting="${f.key}">
          </label>
        `).join('')}
      </div>
      <div class="eq-len-display">
        Equivalent length: <strong>${equivalentLength(drain).toFixed(1)} ft</strong>
        <span class="muted small">(pipe + fittings)</span>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderScenarios() {
  const container = document.getElementById('scenarios');
  container.innerHTML = '';
  if (drains.length === 0) {
    container.innerHTML = '<p class="muted small">Add at least one drain in section 3 before adding test scenarios.</p>';
    return;
  }
  scenarios.forEach(scenario => {
    const div = document.createElement('div');
    div.className = 'scenario';
    div.innerHTML = `
      <div class="scenario-head">
        <input type="text" value="${escapeHtml(scenario.name)}" data-id="${scenario.id}" class="scenario-name">
        <button class="btn-danger" data-id="${scenario.id}" data-action="remove-scenario">Remove</button>
      </div>
      <div class="scenario-drains">
        ${drains.map(drain => {
          const r = scenario.drainReadings[drain.id] || { flowing: true, residual: '', isRef: false };
          return `
            <div class="scenario-drain-row">
              <label>
                <input type="checkbox" data-sid="${scenario.id}" data-did="${drain.id}" data-field="flowing" ${r.flowing ? 'checked' : ''}>
                Flowing
              </label>
              <span>${escapeHtml(drain.name)} (eq. len ${equivalentLength(drain).toFixed(1)} ft)</span>
              <label class="muted small">Residual at this riser
                <div class="input-suffix">
                  <input type="number" min="0" step="0.1" value="${r.residual}" data-sid="${scenario.id}" data-did="${drain.id}" data-field="residual">
                  <span>psi</span>
                </div>
              </label>
              <label class="muted small">
                <input type="radio" name="ref-${scenario.id}" data-sid="${scenario.id}" data-did="${drain.id}" data-field="isRef" ${r.isRef ? 'checked' : ''}>
                Supply-curve reference
              </label>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// -------- Event wiring --------
document.getElementById('add-drain-btn').addEventListener('click', () => {
  drains.push(makeDrain());
  // Initialize scenario readings for new drain
  scenarios.forEach(s => {
    s.drainReadings[drains[drains.length - 1].id] = { flowing: true, residual: '', isRef: false };
  });
  renderDrains();
  renderScenarios();
});

document.getElementById('add-scenario-btn').addEventListener('click', () => {
  if (drains.length === 0) {
    alert('Add at least one drain first.');
    return;
  }
  const s = makeScenario();
  drains.forEach((d, i) => {
    s.drainReadings[d.id] = { flowing: true, residual: '', isRef: i === 0 };
  });
  scenarios.push(s);
  renderScenarios();
});

document.getElementById('drains').addEventListener('input', e => {
  const id = Number(e.target.dataset.id);
  const drain = drains.find(d => d.id === id);
  if (!drain) return;
  if (e.target.classList.contains('drain-name')) {
    drain.name = e.target.value;
    renderScenarios();
  } else if (e.target.dataset.field === 'pipeLen') {
    drain.pipeLen = Number(e.target.value) || 0;
    updateEqLen(drain);
    refreshScenarioEqLenLabels();
  } else if (e.target.dataset.fitting) {
    drain.fittings[e.target.dataset.fitting] = Number(e.target.value) || 0;
    updateEqLen(drain);
    refreshScenarioEqLenLabels();
  }
});

document.getElementById('drains').addEventListener('click', e => {
  if (e.target.dataset.action === 'remove-drain') {
    const id = Number(e.target.dataset.id);
    drains = drains.filter(d => d.id !== id);
    scenarios.forEach(s => delete s.drainReadings[id]);
    renderDrains();
    renderScenarios();
  }
});

document.getElementById('scenarios').addEventListener('input', e => {
  const sid = Number(e.target.dataset.sid);
  const did = Number(e.target.dataset.did);
  const field = e.target.dataset.field;
  const scenario = scenarios.find(s => s.id === sid);
  if (!scenario) return;
  if (e.target.classList.contains('scenario-name')) {
    scenario.name = e.target.value;
    return;
  }
  if (!scenario.drainReadings[did]) {
    scenario.drainReadings[did] = { flowing: false, residual: '', isRef: false };
  }
  const r = scenario.drainReadings[did];
  if (field === 'flowing') {
    r.flowing = e.target.checked;
  } else if (field === 'residual') {
    r.residual = e.target.value;
  } else if (field === 'isRef') {
    Object.values(scenario.drainReadings).forEach(rr => rr.isRef = false);
    r.isRef = true;
  }
});

document.getElementById('scenarios').addEventListener('click', e => {
  if (e.target.dataset.action === 'remove-scenario') {
    const id = Number(e.target.dataset.id);
    scenarios = scenarios.filter(s => s.id !== id);
    renderScenarios();
  }
});

document.querySelectorAll('.precheck').forEach(cb => {
  cb.addEventListener('change', updatePrecheckStatus);
});

function updatePrecheckStatus() {
  const boxes = document.querySelectorAll('.precheck');
  const done = Array.from(boxes).filter(b => b.checked).length;
  const total = boxes.length;
  const el = document.getElementById('precheck-status');
  if (done === total) {
    el.textContent = 'All pre-test conditions confirmed.';
    el.style.color = 'var(--good)';
  } else {
    el.textContent = `${done} of ${total} pre-test conditions confirmed.`;
    el.style.color = '';
  }
}
updatePrecheckStatus();

function updateEqLen(drain) {
  // re-render just the affected eq-len display
  const container = document.getElementById('drains');
  const drainDivs = container.querySelectorAll('.drain');
  drainDivs.forEach(div => {
    const nameInput = div.querySelector('.drain-name');
    if (nameInput && Number(nameInput.dataset.id) === drain.id) {
      const disp = div.querySelector('.eq-len-display');
      disp.innerHTML = `Equivalent length: <strong>${equivalentLength(drain).toFixed(1)} ft</strong> <span class="muted small">(pipe + fittings)</span>`;
    }
  });
}

function refreshScenarioEqLenLabels() {
  // Update the eq-len text inside each scenario row without rebuilding the inputs
  scenarios.forEach(scenario => {
    drains.forEach(drain => {
      const sel = `[data-sid="${scenario.id}"][data-did="${drain.id}"][data-field="residual"]`;
      const node = document.querySelector(sel);
      if (!node) return;
      const labelSpan = node.closest('.scenario-drain-row').querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = `${drain.name} (eq. len ${equivalentLength(drain).toFixed(1)} ft)`;
      }
    });
  });
}

// -------- Calculation --------
document.getElementById('calc-btn').addEventListener('click', calculate);

function calculate() {
  const resultsEl = document.getElementById('results');
  const curveInfoEl = document.getElementById('curve-info');
  resultsEl.innerHTML = '';
  curveInfoEl.textContent = '';

  const staticP = Number(document.getElementById('static').value);
  const errors = [];

  if (!(staticP > 0)) errors.push('Enter a positive static pressure.');
  if (drains.length === 0) errors.push('Add at least one drain.');
  if (scenarios.length === 0) errors.push('Add at least one test scenario.');

  if (errors.length) {
    resultsEl.innerHTML = `<div class="error-banner">${errors.map(escapeHtml).join('<br>')}</div>`;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  const scenarioResults = [];

  scenarios.forEach(scenario => {
    let totalFlow = 0;
    const drainRows = [];
    let refDrainId = null;
    let refResidual = null;

    drains.forEach(drain => {
      const r = scenario.drainReadings[drain.id];
      if (!r || !r.flowing) return;
      const residual = Number(r.residual);
      if (!(residual > 0)) {
        drainRows.push({ drain, residual: NaN, flow: NaN, eqLen: equivalentLength(drain), invalid: true });
        return;
      }
      const eqLen = equivalentLength(drain);
      const flow = flowFromResidual(residual, eqLen);
      totalFlow += flow;
      drainRows.push({ drain, residual, flow, eqLen, invalid: false });
      if (r.isRef) {
        refDrainId = drain.id;
        refResidual = residual;
      }
    });

    if (refResidual === null && drainRows.length > 0) {
      // fallback: use first flowing reading as reference
      const first = drainRows.find(d => !d.invalid);
      if (first) {
        refDrainId = first.drain.id;
        refResidual = first.residual;
      }
    }

    scenarioResults.push({ scenario, drainRows, totalFlow, refDrainId, refResidual });
  });

  // Render results table
  let html = '<table class="result-table"><thead><tr>' +
    '<th>Scenario</th><th>Drain</th><th>Eq. length (ft)</th><th>Residual (psi)</th><th>Flow (gpm)</th>' +
    '</tr></thead><tbody>';

  scenarioResults.forEach(res => {
    const rows = res.drainRows;
    if (rows.length === 0) {
      html += `<tr><td>${escapeHtml(res.scenario.name)}</td><td colspan="4" class="muted">No flowing drain readings</td></tr>`;
      return;
    }
    rows.forEach((row, idx) => {
      const refMark = (row.drain.id === res.refDrainId) ? ' ★' : '';
      html += '<tr>';
      if (idx === 0) html += `<td rowspan="${rows.length + 1}">${escapeHtml(res.scenario.name)}</td>`;
      html += `<td>${escapeHtml(row.drain.name)}${refMark}</td>`;
      html += `<td>${row.eqLen.toFixed(1)}</td>`;
      html += `<td>${isFinite(row.residual) ? row.residual.toFixed(1) : '&mdash;'}</td>`;
      html += `<td>${isFinite(row.flow) ? row.flow.toFixed(0) : '&mdash;'}</td>`;
      html += '</tr>';
    });
    html += `<tr style="background:#f4f8fc"><td colspan="4" style="text-align:right"><strong>Total flow / supply-curve point:</strong></td>` +
      `<td><strong>${res.totalFlow.toFixed(0)} gpm @ ${res.refResidual !== null ? res.refResidual.toFixed(1) : '?'} psi</strong></td></tr>`;
  });
  html += '</tbody></table>';
  html += '<p class="muted small">★ = reference riser whose residual pressure is paired with the total flow to form the supply-curve point.</p>';
  resultsEl.innerHTML = html;

  // Build supply-curve points
  const pts = [];
  scenarioResults.forEach(res => {
    if (res.totalFlow > 0 && res.refResidual !== null && res.refResidual > 0 && res.refResidual < staticP) {
      pts.push({ q: res.totalFlow, p: res.refResidual, name: res.scenario.name });
    }
  });

  if (pts.length === 0) {
    curveInfoEl.textContent = 'No valid (flow, residual) points to plot. Check that residual pressures are entered and less than the static pressure.';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  // Best-fit k in N^1.85 paper: P = S - k * Q^1.85
  // k_i = (S - P_i) / Q_i^1.85, average over points
  const ks = pts.map(pt => (staticP - pt.p) / Math.pow(pt.q, HW_EXP));
  const kAvg = ks.reduce((a, b) => a + b, 0) / ks.length;

  // Compute Q where P = 20 psi (residual at 20 psi is a common reference for available water)
  const q20 = (staticP > 20) ? Math.pow((staticP - 20) / kAvg, 1 / HW_EXP) : 0;

  curveInfoEl.innerHTML = `Supply-curve best fit: <strong>P = ${staticP.toFixed(1)} &minus; ${kAvg.toExponential(3)} · Q<sup>1.85</sup></strong>. ` +
    `Available flow at 20 psi residual &asymp; <strong>${q20.toFixed(0)} gpm</strong>.`;

  drawChart(staticP, pts, kAvg);
}

// -------- Chart --------
function drawChart(staticP, pts, kAvg) {
  const ctx = document.getElementById('chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  // x-axis: Q^1.85 transformed; we plot raw (Q^1.85, P) and customize tick labels back to Q.
  const xTransform = q => Math.pow(q, HW_EXP);
  const xInverse   = x => Math.pow(Math.max(x, 0), 1 / HW_EXP);

  const qMax = Math.max(...pts.map(p => p.q), 500) * 1.4;

  // Best-fit line points
  const lineData = [];
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const q = (qMax * i) / steps;
    const p = staticP - kAvg * Math.pow(q, HW_EXP);
    if (p < 0) break;
    lineData.push({ x: xTransform(q), y: p });
  }

  const staticPoint = [{ x: 0, y: staticP }];
  const dataPoints  = pts.map(p => ({ x: xTransform(p.q), y: p.p, _label: p.name, _q: p.q }));

  // Nice Q ticks
  const niceQs = [0, 100, 200, 300, 400, 500, 600, 700, 800, 1000, 1250, 1500, 1750, 2000, 2500, 3000];
  const xMax = xTransform(qMax);
  const tickValues = niceQs.filter(q => xTransform(q) <= xMax * 1.05);

  chartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Supply curve (fit)',
          data: lineData,
          showLine: true,
          borderColor: '#00558c',
          backgroundColor: '#00558c',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0,
        },
        {
          label: 'Static pressure',
          data: staticPoint,
          backgroundColor: '#2e7d32',
          borderColor: '#2e7d32',
          pointRadius: 6,
          pointStyle: 'triangle',
        },
        {
          label: 'Test points',
          data: dataPoints,
          backgroundColor: '#c62828',
          borderColor: '#c62828',
          pointRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: xMax,
          title: { display: true, text: 'Flow (gpm) — N^1.85 scale' },
          ticks: {
            callback: function(value) {
              const q = xInverse(value);
              return Math.round(q).toString();
            },
            autoSkip: false,
          },
          afterBuildTicks: axis => {
            axis.ticks = tickValues.map(q => ({ value: xTransform(q) }));
          },
        },
        y: {
          min: 0,
          suggestedMax: Math.ceil(staticP * 1.1 / 10) * 10,
          title: { display: true, text: 'Riser pressure (psi)' },
        },
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const ds = ctx.dataset.label;
              if (ds === 'Test points') {
                const pt = ctx.raw;
                return `${pt._label}: ${Math.round(pt._q)} gpm @ ${ctx.parsed.y.toFixed(1)} psi`;
              }
              if (ds === 'Static pressure') {
                return `Static: ${ctx.parsed.y.toFixed(1)} psi @ 0 gpm`;
              }
              const q = xInverse(ctx.parsed.x);
              return `${Math.round(q)} gpm @ ${ctx.parsed.y.toFixed(1)} psi`;
            },
          },
        },
      },
    },
  });
}

// -------- Init with example from PRC.14.1.2.2 --------
function loadExample() {
  // Riser A: 8 ft pipe, 1 angle, 1 90-ell, 1 45-ell  -> 8 + 29 + 5 + 2 = 44 ft
  // Riser B: 22 ft pipe, 1 angle, 3 90-ells, 1 45-ell -> 22 + 29 + 15 + 2 = 68 ft
  const a = makeDrain('Riser A');
  a.pipeLen = 8;
  a.fittings.angle = 1; a.fittings.ell90 = 1; a.fittings.ell45 = 1;
  const b = makeDrain('Riser B');
  b.pipeLen = 22;
  b.fittings.angle = 1; b.fittings.ell90 = 3; b.fittings.ell45 = 1;
  drains = [a, b];

  // Scenario 1: A alone, A residual = 86 psi
  const s1 = makeScenario('Riser A alone');
  s1.drainReadings[a.id] = { flowing: true,  residual: 86, isRef: true  };
  s1.drainReadings[b.id] = { flowing: false, residual: '', isRef: false };

  // Scenario 2: A + B simultaneously, A residual = 64 psi, B residual = 70 psi, reference at A
  const s2 = makeScenario('Riser A + B simultaneous');
  s2.drainReadings[a.id] = { flowing: true, residual: 64, isRef: true  };
  s2.drainReadings[b.id] = { flowing: true, residual: 70, isRef: false };

  scenarios = [s1, s2];

  renderDrains();
  renderScenarios();
}

// Add a small "Load example" link to drain section
(function addExampleLink() {
  const btn = document.getElementById('add-drain-btn');
  const link = document.createElement('button');
  link.className = 'btn-secondary';
  link.style.marginLeft = '0.5rem';
  link.textContent = 'Load PRC.14.1.2.2 example';
  link.addEventListener('click', () => {
    if (drains.length || scenarios.length) {
      if (!confirm('Replace current drain/scenario data with the document example?')) return;
    }
    nextDrainId = 1; nextScenarioId = 1;
    loadExample();
  });
  btn.parentNode.insertBefore(link, btn.nextSibling);
})();

// Start with one empty drain
drains.push(makeDrain('Riser A'));
renderDrains();
renderScenarios();
