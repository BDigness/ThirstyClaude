// Energy and water estimates. These are estimates, not measurements: neither
// Anthropic nor OpenAI publishes per-request energy or water figures.
//
// Two methods, selectable in the menu:
//
// 1. ThirstyClaude (default): counts every token type. Wh per 1M tokens for an
//    Opus-class model, scaled by model family. Cache reads are cheap (nothing is
//    recomputed); output is the expensive part. A typical long-context Claude Code
//    request (~300K cached tokens, ~1K output tokens) comes to roughly 3–4 Wh.
//    Range: energy ×0.5–2, combined with the water-factor range.
//
// 2. EcoLogits (https://ecologits.ai): the open methodology from GenAI Impact.
//    Only output tokens count; energy scales with the model's estimated active
//    parameters and GPU count; water = IT energy × (on-site WUE + PUE × off-site
//    water intensity). Range comes from EcoLogits' own min/max parameter, PUE and
//    WUE values.

// ── Model families ──────────────────────────────────────────────────────────
function familyOf(model) {
  const m = String(model || '').toLowerCase();
  if (m.startsWith('claude')) {
    if (m.includes('fable') || m.includes('mythos')) return 'fable';
    if (m.includes('sonnet')) return 'sonnet';
    if (m.includes('haiku')) return 'haiku';
    return 'opus';
  }
  if (/mini|nano|luna/.test(m)) return 'gpt-small';
  if (/gpt-5\.5|gpt-5\.6-sol|gpt-6/.test(m)) return 'gpt-large';
  return 'gpt'; // other GPT-5.x and Codex models
}

const isCodexFamily = (fam) => fam.startsWith('gpt');

// ── Method 1: ThirstyClaude ────────────────────────────────────────────────
const WH_PER_MTOK = { in: 160, out: 800, cw: 200, cr: 8 };
const TC_FACTOR = { fable: 2, opus: 1, sonnet: 0.5, haiku: 0.1, 'gpt-large': 1.4, gpt: 0.7, 'gpt-small': 0.3 };
const TC_ENERGY_RANGE = { lo: 0.5, hi: 2 };
// Litres per kWh: data-center cooling (~0.15–1.1 across major clouds), plus water
// evaporated at power plants (~2.5–3 on an average US grid).
const TC_WATER = { allIn: { lo: 2, mid: 3, hi: 4 }, cooling: { lo: 0.15, mid: 0.5, hi: 1.1 } };
// kg CO₂ per kWh: US grid average 0.394 including line losses (EPA eGRID2022,
// as used by EPA's Greenhouse Gas Equivalencies Calculator). Cleaner regional
// grids ~0.25, dirtier ~0.45. Electricity only: no hardware manufacturing.
const GRID_CO2 = { lo: 0.25, mid: 0.394, hi: 0.45 };
// Everyday comparisons for CO₂ (kg CO₂ each).
const CO2_EQUIV = {
  phoneKg: 0.019 * GRID_CO2.mid, // charging a smartphone: 0.019 kWh (EPA) on the average grid
  cigaretteKg: 0.014, // one cigarette over its whole life cycle (Zafeiridou et al., 2018)
  // The truck: a 2007 Ford F-150, 5.4 L Triton V8, 4WD, on gasoline (8.887 kg CO₂ per gallon, EPA).
  idleKgPerHour: 0.39 * (5.4 / 4.6) * 8.887, // idling: Argonne's 4.6 L gas sedan burns 0.39 gal/h (DOE Fact #861), scaled to 5.4 L
  carKgPerKm: 8.887 / 14 / 1.609344, // driving: 14 mpg combined (EPA, fueleconomy.gov)
  tireKg: (25 / 2000) * 28 * 85.97, // burning a 25 lb passenger tire: 28 mmBtu/short ton × 85.97 kg CO₂/mmBtu (EPA, 40 CFR 98)
  treeKgPerYear: 60, // taken up by one urban tree in a year (EPA)
};

function tcEstimate(fam, t, mode) {
  const mid = ((TC_FACTOR[fam] ?? 1) * (t.in * WH_PER_MTOK.in + t.out * WH_PER_MTOK.out + t.cw * WH_PER_MTOK.cw + t.cr * WH_PER_MTOK.cr)) / 1e6;
  const w = TC_WATER[mode] || TC_WATER.allIn;
  const wh = { lo: mid * TC_ENERGY_RANGE.lo, mid, hi: mid * TC_ENERGY_RANGE.hi };
  return {
    wh,
    l: { lo: (wh.lo / 1000) * w.lo, mid: (wh.mid / 1000) * w.mid, hi: (wh.hi / 1000) * w.hi },
    co2: { lo: (wh.lo / 1000) * GRID_CO2.lo, mid: (wh.mid / 1000) * GRID_CO2.mid, hi: (wh.hi / 1000) * GRID_CO2.hi },
  };
}

// ── Method 2: EcoLogits ─────────────────────────────────────────────────────
// Parameters (billions) from EcoLogits' model data; all are estimates there too.
const ECO_MODELS = {
  fable: { provider: 'anthropic', total: 1340, active: [134, 400] },
  opus: { provider: 'anthropic', total: 670, active: [70, 200] },
  sonnet: { provider: 'anthropic', total: 293, active: [29, 88] },
  haiku: { provider: 'anthropic', dense: true, active: [10, 35] },
  'gpt-large': { provider: 'openai', total: 900, active: [90, 300] },
  gpt: { provider: 'openai', total: 450, active: [45, 150] },
  'gpt-small': { provider: 'openai', dense: true, active: [25, 70] },
};
const ECO_PROVIDER = {
  anthropic: { pue: [1.09, 1.14], wueOn: [0.13, 0.999] },
  openai: { pue: [1.2, 1.2], wueOn: [0.569, 0.569] },
};
const WUE_OFFSITE = 3.1321; // L/kWh, US electricity mix
const BATCH = 64;

// GPUs needed to hold the weights: 16-bit, 1.2× overhead, 80 GB cards, power of 2.
function gpuCount(paramsB) {
  const n = Math.ceil((1.2 * paramsB * 2) / 80);
  return 2 ** Math.ceil(Math.log2(Math.max(n, 1)));
}

// IT energy (kWh, before PUE) per output token.
function ecoItKwhPerToken(activeB, gpus) {
  const gpuWh = 1.1665e-6 * Math.exp(-0.011206 * BATCH) * activeB + 4.0529e-5; // per GPU
  const seconds = 6.785e-4 * activeB + 3.119e-4 * BATCH + 1.947e-2;
  const serverKwh = ((seconds / 3600) * 1.2 * (gpus / 8)) / BATCH; // 1.2 kW per 8-GPU server
  return serverKwh + (gpus * gpuWh) / 1000;
}

function ecoBound(spec, i, outTokens, mode) {
  const p = ECO_PROVIDER[spec.provider];
  const active = spec.active[i];
  const it = outTokens * ecoItKwhPerToken(active, gpuCount(spec.dense ? active : spec.total));
  const pue = p.pue[i];
  const water = mode === 'cooling' ? it * p.wueOn[i] : it * (p.wueOn[i] + pue * WUE_OFFSITE);
  return { wh: it * pue * 1000, l: water };
}

function ecoEstimate(fam, t, mode) {
  const spec = ECO_MODELS[fam] || ECO_MODELS.opus;
  const lo = ecoBound(spec, 0, t.out, mode);
  const hi = ecoBound(spec, 1, t.out, mode);
  const wh = { lo: lo.wh, mid: (lo.wh + hi.wh) / 2, hi: hi.wh };
  return {
    wh,
    l: { lo: lo.l, mid: (lo.l + hi.l) / 2, hi: hi.l },
    co2: { lo: (wh.lo / 1000) * GRID_CO2.mid, mid: (wh.mid / 1000) * GRID_CO2.mid, hi: (wh.hi / 1000) * GRID_CO2.mid },
  };
}

// ── Aggregation ─────────────────────────────────────────────────────────────
const TOKEN_FIELDS = ['in', 'out', 'cw', 'cr', 'req'];
const zero = () => ({ in: 0, out: 0, cw: 0, cr: 0, req: 0 });
const addTok = (a, b) => {
  for (const f of TOKEN_FIELDS) a[f] += b[f] || 0;
  return a;
};

// Estimate for a { family: tokens } map.
function estimate(famMap, method, mode) {
  const out = { wh: { lo: 0, mid: 0, hi: 0 }, l: { lo: 0, mid: 0, hi: 0 }, co2: { lo: 0, mid: 0, hi: 0 }, tokens: zero() };
  for (const fam in famMap) {
    const t = famMap[fam];
    const e = method === 'eco' ? ecoEstimate(fam, t, mode) : tcEstimate(fam, t, mode);
    for (const k of ['lo', 'mid', 'hi']) {
      out.wh[k] += e.wh[k];
      out.l[k] += e.l[k];
      out.co2[k] += e.co2[k];
    }
    addTok(out.tokens, t);
  }
  return out;
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// days: { 'YYYY-MM-DD': { 'source|project': { family: tokens } } }
// Returns token sums per project and in total for a period. 'since' is everything
// counted after the cylinder was emptied: all-time minus the snapshot (tare).
function collect(days, { period = 'all', tare = null, now = new Date(), codex = true } = {}) {
  const from =
    period === 'today' ? dayKey(now)
    : period === 'week' ? dayKey(addDays(now, -6))
    : period === 'month' ? dayKey(addDays(now, -29))
    : null;
  const sums = {};
  for (const k in days) {
    if (from && k < from) continue;
    for (const sp in days[k]) {
      if (!codex && sp.startsWith('codex|')) continue;
      const dst = sums[sp] || (sums[sp] = {});
      for (const fam in days[k][sp]) addTok(dst[fam] || (dst[fam] = zero()), days[k][sp][fam]);
    }
  }
  if (period === 'since' && tare) {
    for (const sp in sums) {
      for (const fam in sums[sp]) {
        const base = tare[sp] && tare[sp][fam];
        if (!base) continue;
        for (const f of TOKEN_FIELDS) sums[sp][fam][f] = Math.max(0, sums[sp][fam][f] - (base[f] || 0));
      }
    }
  }
  const projects = {};
  const total = {};
  for (const sp in sums) {
    const name = sp.slice(sp.indexOf('|') + 1);
    const p = projects[name] || (projects[name] = {});
    for (const fam in sums[sp]) {
      addTok(p[fam] || (p[fam] = zero()), sums[sp][fam]);
      addTok(total[fam] || (total[fam] = zero()), sums[sp][fam]);
    }
  }
  return { total, projects };
}

// All-time sums per source|project and family, used as the tare when emptying.
function snapshot(days) {
  const out = {};
  for (const k in days) {
    for (const sp in days[k]) {
      const dst = out[sp] || (out[sp] = {});
      for (const fam in days[k][sp]) addTok(dst[fam] || (dst[fam] = zero()), days[k][sp][fam]);
    }
  }
  return out;
}

module.exports = {
  familyOf,
  isCodexFamily,
  estimate,
  collect,
  snapshot,
  dayKey,
  addDays,
  zero,
  addTok,
  gpuCount,
  ecoItKwhPerToken,
  TC_WATER,
  GRID_CO2,
  CO2_EQUIV,
};
