// test.js — Validation suite for 2-inch drain flow calculations.
// Run with:  node test.js
//
// Mirrors the constants and math from app.js. If you change them in
// app.js, mirror the change here.

const C_DISCHARGE  = 0.85;
const D_OUTLET     = 2.0;
const D_PIPE       = 2.067;
const HW_C         = 120;
const HW_EXP       = 1.852;
const D_PIPE_4_87  = Math.pow(D_PIPE, 4.87);
const HW_C_EXP     = Math.pow(HW_C, HW_EXP);
const FRICTION_K   = 4.52 / (HW_C_EXP * D_PIPE_4_87);
const OUTLET_DENOM = 29.84 * C_DISCHARGE * D_OUTLET * D_OUTLET;

function pressureAtRiser(Q, L) {
  if (Q <= 0) return 0;
  return Math.pow(Q / OUTLET_DENOM, 2) + FRICTION_K * L * Math.pow(Q, HW_EXP);
}

function flowFromResidual(P, L) {
  if (P <= 0 || L <= 0) return 0;
  let lo = 0, hi = 5000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pressureAtRiser(mid, L) < P) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- Test harness ----------
let passed = 0, failed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else { failed++; failures.push(`${name}  -- ${detail || ''}`); }
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padL(s, n){ s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

// ============================================================
// [1] DOCUMENT-STATED CASES from PRC.14.1.2.2 worked example
// ============================================================
console.log('\n[1] PRC.14.1.2.2 worked example (3 cases stated in document text)');
console.log('    Tolerance: within +/-5% (the accuracy the guideline itself claims)\n');
const docCases = [
  { name: 'Riser A alone',         L: 44, P: 86, expected: 450 },
  { name: 'Riser A (A+B simul.)',  L: 44, P: 64, expected: 390 },
  { name: 'Riser B (A+B simul.)',  L: 68, P: 70, expected: 335 },
];
docCases.forEach(c => {
  const got = flowFromResidual(c.P, c.L);
  const errPct = Math.abs(got - c.expected) / c.expected * 100;
  const ok = errPct <= 5;
  console.log(`    ${pad(c.name, 24)} L=${pad(c.L+' ft',6)} P=${pad(c.P+' psi',8)} -> Q=${padL(got.toFixed(0),4)} gpm   doc=${c.expected} gpm   err=${errPct.toFixed(2)}%`);
  check(c.name, ok, `error ${errPct.toFixed(2)}% > 5%`);
});

// ============================================================
// [2] ROUND-TRIP SELF-CONSISTENCY
// 100+ (Q, L) pairs:  forward -> inverse must recover Q exactly.
// This proves the bisection inverse is mathematically sound.
// ============================================================
console.log('\n[2] Round-trip self-consistency: forward(inverse(P,L)) == P, inverse(forward(Q,L)) == Q');
const Ls_rt = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120];
const Qs_rt = [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];
let rtCases = 0, rtMaxErr = 0;
for (const L of Ls_rt) {
  for (const Q of Qs_rt) {
    const P = pressureAtRiser(Q, L);
    if (P > 250) continue;
    const Qback = flowFromResidual(P, L);
    const err = Math.abs(Qback - Q);
    rtMaxErr = Math.max(rtMaxErr, err);
    rtCases++;
    check(`round-trip L=${L} Q=${Q}`, err < 0.001, `Q=${Q} -> P=${P.toFixed(4)} -> Q=${Qback.toFixed(4)}`);
  }
}
console.log(`    ${rtCases} round-trip cases   max |Q_back - Q| = ${rtMaxErr.toExponential(2)} gpm  (essentially zero)`);

// ============================================================
// [3] MONOTONICITY  (physical sanity)
// At fixed L, more pressure -> more flow.
// At fixed P, more equivalent length -> less flow.
// ============================================================
console.log('\n[3] Monotonicity (physical sanity)');
let monoCases = 0;
for (const L of [20, 40, 60, 80]) {
  let prev = 0;
  for (let P = 10; P <= 150; P += 5) {
    const Q = flowFromResidual(P, L);
    check(`L=${L} P=${P} monotone-in-P`, Q > prev, `Q dropped ${prev.toFixed(2)} -> ${Q.toFixed(2)}`);
    prev = Q; monoCases++;
  }
}
for (const P of [30, 60, 90, 120]) {
  let prev = Infinity;
  for (const L of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    const Q = flowFromResidual(P, L);
    check(`P=${P} L=${L} monotone-in-L`, Q < prev, `Q rose ${prev.toFixed(2)} -> ${Q.toFixed(2)}`);
    prev = Q; monoCases++;
  }
}
console.log(`    ${monoCases} monotonicity checks`);

// ============================================================
// [4] BOUNDARY CONDITIONS
// ============================================================
console.log('\n[4] Boundary conditions');
check('zero pressure -> zero flow',  flowFromResidual(0, 50) === 0);
check('zero length -> zero flow',    flowFromResidual(80, 0) === 0);
check('zero Q -> zero P (forward)',  pressureAtRiser(0, 50) === 0);
check('symmetric tiny case',         Math.abs(flowFromResidual(pressureAtRiser(1, 40), 40) - 1) < 1e-6);
console.log('    boundaries OK');

// ============================================================
// [5] CHART GRID — for visual comparison with PRC.14.1.2.2 Fig. 1
// Fig. 1 shows riser pressure (y) vs. flow (x) for equivalent-length
// curves of 20, 30, 40, 50, 60, 70, 80, 90 ft. Read horizontally at
// the residual pressure, find the L curve, read down to the flow.
// The table below is the same look-up done numerically.
// ============================================================
console.log('\n[5] Chart grid for visual comparison with Figure 1 of PRC.14.1.2.2');
console.log('    Each cell = drain flow (gpm) for that residual pressure and equivalent length.\n');
const Lvals = [20, 30, 40, 50, 60, 70, 80, 90];
const Pvals = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];

let header = '    P(psi) \\ L(ft) ';
Lvals.forEach(L => header += padL('L=' + L, 7));
console.log(header);
console.log('    ' + '-'.repeat(header.length - 4));
Pvals.forEach(P => {
  let row = `    ${padL(P, 14)}   `;
  Lvals.forEach(L => row += padL(flowFromResidual(P, L).toFixed(0), 7));
  console.log(row);
});

// ============================================================
// SUMMARY
// ============================================================
const total = passed + failed;
console.log('\n' + '='.repeat(60));
console.log(`SUMMARY:  ${passed} / ${total} checks passed`);
if (failed > 0) {
  console.log(`FAILED:   ${failed}`);
  failures.slice(0, 20).forEach(f => console.log('   - ' + f));
  if (failures.length > 20) console.log(`   ...and ${failures.length - 20} more`);
}
console.log('='.repeat(60));
process.exit(failed === 0 ? 0 : 1);
