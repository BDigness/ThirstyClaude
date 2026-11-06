// Rough energy and water model. These are estimates, not measurements:
// Anthropic does not publish per-request energy or water figures.
//
// Energy: Wh per 1M tokens for an Opus-class model, scaled by model family.
// Cache reads are cheap (no recompute); output is the expensive part.
// With these values a typical long-context Opus request in Claude Code
// (~300K tokens of cached context, ~1K output tokens) comes to roughly 3–4 Wh,
// in line with third-party estimates of ~3 Wh per Opus request.
const WH_PER_MTOK = { in: 160, out: 800, cw: 200, cr: 8 };
const FAMILY = [['fable', 2], ['mythos', 2], ['opus', 1], ['sonnet', 0.5], ['haiku', 0.1]];

// Water per kWh: data-center cooling (~0.15–1.1 L/kWh across major clouds),
// plus water evaporated at power plants (~2.5–3 L/kWh on an average US grid).
const L_PER_KWH = { allIn: 3.0, cooling: 0.5 };

function familyFactor(model) {
  const m = model.toLowerCase();
  for (const [name, factor] of FAMILY) if (m.includes(name)) return factor;
  return 1;
}

function energyWh(model, t) {
  const wh = t.in * WH_PER_MTOK.in + t.out * WH_PER_MTOK.out + t.cw * WH_PER_MTOK.cw + t.cr * WH_PER_MTOK.cr;
  return (familyFactor(model) * wh) / 1e6;
}

function liters(wh, mode) {
  return (wh / 1000) * (L_PER_KWH[mode] || L_PER_KWH.allIn);
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { energyWh, liters, dayKey, L_PER_KWH };
