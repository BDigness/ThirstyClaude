const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const waterEl = $('water');
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Drop colours by model family: a validated categorical set kept apart from the
// project-layer colours so the two meanings don't collide.
const DROPS = [
  ['opus', 'Opus', '#9085e9'],
  ['sonnet', 'Sonnet', '#e66767'],
  ['haiku', 'Haiku', '#008300'],
  ['fable', 'Fable', '#d55181'],
  ['gpt', 'Codex', '#c98500'],
];
const dropColor = (fam) => (fam.startsWith('gpt') ? '#c98500' : (DROPS.find((d) => d[0] === fam) || DROPS[0])[2]);

const mixHex = (a, b, t) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const LADDER = ['tube', 'glass', 'cylinder', 'bucket', 'barrel', 'tub', 'hottub', 'pool'];
const VESSEL_NAMES = { tube: 'Test tube', glass: 'Glass', cylinder: 'Cylinder', bucket: 'Bucket', barrel: 'Rain barrel', tub: 'Bathtub', hottub: 'Hot tub', pool: 'Swimming pool' };

// ── Vessels: the container grows with the amount ─────────────────────────────
// clip: inside of the vessel; bottom/top: y of zero and of full capacity;
// drip: where drops start; tilt: tips over when emptied.
const VESSELS = {
  tube: {
    clip: 'M66 50 L66 196 A13 13 0 0 0 92 196 L92 50 Z',
    bottom: 208,
    top: 68,
    ticks: { x: 66, label: 60 },
    drip: [79, 39],
    hit: [66, 92],
    tilt: true,
    // A dropper.
    source: `<rect class="solid" x="73" y="2" width="12" height="14" rx="5.5"/>
      <rect class="solid" x="74.5" y="15" width="9" height="3.5" rx="1"/>
      <path d="M76.5 18.5 V30 L78.6 37 H79.4 L81.5 30 V18.5 Z" fill="#7cc4ff" fill-opacity="0.18"/>
      <path class="glass" d="M76.5 18.5 V30 L78.6 37 H79.4 L81.5 30 V18.5" stroke-width="1.1"/>`,
    behind: '<path d="M66 50 L66 196 A13 13 0 0 0 92 196 L92 50 Z" fill="url(#glassGrad)"/>',
    front: `<path class="glass" d="M61 45 Q64 46 65 50 L65 196 A14 14 0 0 0 93 196 L93 50 Q94 46 97 45"/>
      <ellipse class="glass" cx="79" cy="45.5" rx="18" ry="1.8" stroke-width="1.1"/>
      <rect x="87.5" y="58" width="1.8" height="126" rx="0.9" fill="#fff" opacity="0.13"/>
      <rect class="solid" x="58" y="213" width="42" height="12" rx="3"/>
      <path class="solid" d="M44 225 H114 L119 231 H39 Z" stroke-width="1.1"/>`,
  },
  glass: {
    clip: 'M57 62 L65 198 Q65 201 68 201 L90 201 Q93 201 93 198 L101 62 Z',
    bottom: 200,
    top: 72,
    drip: [79, 34],
    hit: [60, 98],
    tilt: true,
    // A tap.
    source: `<path class="glass" d="M0 14 H67 Q79 14 79 26 V29" stroke-width="3.4"/>
      <rect class="solid" x="74.5" y="28.5" width="9" height="3" rx="1"/>
      <path class="glass" d="M44 14 V7" stroke-width="2"/>
      <rect class="solid" x="37" y="3.5" width="14" height="3.6" rx="1.8"/>`,
    behind: '<path d="M57 62 L65 198 Q65 201 68 201 L90 201 Q93 201 93 198 L101 62 Z" fill="url(#glassGrad)"/>',
    front: `<path class="glass" d="M54 57 L63 204 Q63.5 210 69 210 L89 210 Q94.5 210 95 204 L104 57"/>
      <ellipse class="glass" cx="79" cy="57.5" rx="25" ry="2.2" stroke-width="1.1"/>
      <path class="glass" d="M64 201.5 H94" stroke-width="1" opacity="0.6"/>
      <path d="M94 70 L89 190" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.13"/>
      <ellipse class="solid" cx="79" cy="214" rx="30" ry="3"/>`,
  },
  cylinder: {
    clip: 'M58.5 46 H99.5 V206 Q99.5 208 97.5 208 H60.5 Q58.5 208 58.5 206 Z',
    bottom: 206,
    top: 64,
    ticks: { x: 58, label: 52 },
    drip: [79, 40],
    hit: [58.5, 99.5],
    tilt: true,
    // A burette with its stopcock.
    source: `<rect x="76.5" y="3" width="5" height="23" fill="#7cc4ff" fill-opacity="0.22"/>
      <path class="glass" d="M76 0 V26 M82 0 V26" stroke-width="1.1"/>
      <path class="glass" d="M76 6 H78.5 M76 11 H78.5 M76 16 H78.5 M76 21 H78.5" stroke-width="0.7" opacity="0.6"/>
      <rect class="solid" x="71" y="26" width="16" height="3.4" rx="1.7"/>
      <circle class="solid" cx="79" cy="27.7" r="2.8"/>
      <path class="glass" d="M77 30.5 L78.6 38 H79.4 L81 30.5" stroke-width="1.1"/>`,
    behind: '<rect x="58" y="46" width="42" height="163" fill="url(#glassGrad)"/>',
    front: `<path class="glass" d="M51 43 Q56 44 57 49 L57 206 Q57 209 60 209 L98 209 Q101 209 101 206 L101 49 Q101 45 105 43"/>
      <ellipse class="glass" cx="78" cy="43.5" rx="27" ry="2.4" stroke-width="1.1"/>
      <rect x="94" y="56" width="2.2" height="136" rx="1.1" fill="#fff" opacity="0.13"/>
      <rect class="solid" x="60" y="209" width="38" height="9"/>
      <path class="solid" d="M40 218 H118 L127 231 H31 Z" stroke-width="1.1"/>`,
  },
  bucket: {
    clip: 'M37 112 L48 202 Q48 205 51 205 L107 205 Q110 205 110 202 L121 112 Z',
    bottom: 204,
    top: 118,
    drip: [79, 57],
    hit: [40, 118],
    tilt: false,
    // A garden spigot.
    source: `<path class="glass" d="M48 0 V36 Q48 44 56 44 H72 Q79 44 79 50 V52" stroke-width="3.4"/>
      <rect class="solid" x="74.5" y="51.5" width="9" height="3" rx="1"/>
      <path class="glass" d="M66 44 V37.5" stroke-width="2"/>
      <circle class="glass" cx="66" cy="33.5" r="4" stroke-width="1.6"/>
      <path class="glass" d="M62 33.5 H70 M66 29.5 V37.5" stroke-width="1"/>`,
    behind: '<path d="M37 112 L48 202 Q48 205 51 205 L107 205 Q110 205 110 202 L121 112 Z" fill="#fff" fill-opacity="0.05"/>',
    front: `<path class="glass" d="M34 108 Q79 166 124 108" stroke-width="1.4"/>
      <rect class="solid" x="72" y="134.5" width="14" height="5" rx="2.5"/>
      <path class="glass" d="M34 108 L45.5 205 Q46 209 50 209 L108 209 Q112 209 112.5 205 L124 108" stroke-width="1.6"/>
      <rect class="solid" x="30" y="104" width="98" height="6" rx="3"/>
      <path class="glass" d="M39 144 H119 M43 178 H115" stroke-width="1" opacity="0.45"/>
      <circle class="solid" cx="34" cy="108" r="2.6"/>
      <circle class="solid" cx="124" cy="108" r="2.6"/>`,
  },
  barrel: {
    clip: 'M39 100 Q34 155 39 208 L119 208 Q124 155 119 100 Z',
    bottom: 206,
    top: 108,
    drip: [62, 84],
    hit: [38, 120],
    tilt: false,
    behind: '<path d="M39 100 Q34 155 39 208 L119 208 Q124 155 119 100 Z" fill="#fff" fill-opacity="0.05"/>',
    // A downspout.
    source: '<path class="glass" d="M40 0 V64 Q40 76 52 76 H64" stroke-width="4"/>',
    front: `<path class="glass" d="M36 97 Q30 155 36 212 L122 212 Q128 155 122 97" stroke-width="1.6"/>
      <ellipse class="glass" cx="79" cy="97.5" rx="43" ry="3" stroke-width="1.2"/>
      <path class="glass" d="M33 124 Q79 128 125 124 M32 184 Q79 188 126 184" stroke-width="2.2" opacity="0.55"/>
      <path class="glass" d="M35 198 H26 V203" stroke-width="2.4"/>
      <rect class="solid" x="30" y="212" width="98" height="5" rx="2"/>`,
  },
  tub: {
    clip: 'M17 124 C17 166 27 190 50 192 L88 192 C111 190 121 166 121 124 Z',
    bottom: 190,
    top: 128,
    drip: [30, 84],
    hit: [17, 121],
    tilt: false,
    behind: '<path d="M17 124 C17 166 27 190 50 192 L88 192 C111 190 121 166 121 124 Z" fill="#fff" fill-opacity="0.05"/>',
    front: `<path class="glass" d="M12 122 C12 170 25 197 50 199 L88 199 C113 197 126 170 126 122" stroke-width="1.6"/>
      <rect class="solid" x="7" y="117" width="124" height="7" rx="3.5"/>
      <path class="solid" d="M33 197 Q31 206 26 210 Q32 213 39 209 Q38 202 41 198 Z"/>
      <path class="solid" d="M105 197 Q107 206 112 210 Q106 213 99 209 Q100 202 97 198 Z"/>`,
    // A tap.
    source: `<path class="glass" d="M4 56 H23 Q30 56 30 63 V79" stroke-width="3.2"/>
      <path class="glass" d="M10 52 V56" stroke-width="2"/>
      <rect class="solid" x="5" y="47" width="10" height="5" rx="2.5"/>`,
  },
  hottub: {
    clip: 'M14 126 V166 H27 V204 H111 V166 H124 V126 Z',
    bottom: 203,
    top: 132,
    drip: [69, 45],
    hit: [14, 124],
    tilt: false,
    // A garden hose.
    source: `<path class="glass" d="M140 26 C120 18 98 10 84 18 Q71 25 69 34" stroke-width="3.2"/>
      <path class="solid" d="M66.2 33.5 L71.8 33.5 L71 42 H67 Z"/>`,
    behind: `<rect x="6" y="120" width="126" height="94" rx="5" fill="#fff" fill-opacity="0.04"/>
      <path d="M14 126 V166 H27 V204 H111 V166 H124 V126 Z" fill="#7cc4ff" fill-opacity="0.07"/>`,
    front: `<path class="glass" d="M14 124 V166 H27 V204 H111 V166 H124 V124" stroke-width="1.4"/>
      <rect class="solid" x="4" y="118" width="130" height="7" rx="3.5"/>
      <path class="glass" d="M8 125 V210 Q8 214 12 214 H126 Q130 214 130 210 V125" stroke-width="1.6"/>
      <path class="glass" d="M8 146 H14 M8 170 H27 M8 194 H27 M124 146 H130 M111 170 H130 M111 194 H130" stroke-width="1" opacity="0.35"/>
      <path d="M52 112 q-4 -8 0 -16 q4 -8 0 -16 M69 110 q-4 -8 0 -16 q4 -8 0 -16 M86 112 q-4 -8 0 -16 q4 -8 0 -16" fill="none" stroke="rgba(214,230,255,0.22)" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  pool: {
    clip: 'M8 104 L8 150 Q8 154 12 154 L58 158 L80 198 Q82 202 86 202 L126 202 Q130 202 130 198 L130 104 Z',
    bottom: 202,
    top: 110,
    drip: [70, 32],
    hit: [8, 130],
    tilt: false,
    behind: `<path d="M2 104 H136 V214 H2 Z" fill="#fff" fill-opacity="0.035"/>
      <path d="M8 104 L8 150 Q8 154 12 154 L58 158 L80 198 Q82 202 86 202 L126 202 Q130 202 130 198 L130 104 Z" fill="#7cc4ff" fill-opacity="0.06"/>`,
    front: `<path class="glass" d="M8 104 L8 150 Q8 154 12 154 L58 158 L80 198 Q82 202 86 202 L126 202 Q130 202 130 198 L130 104" stroke-width="1.6"/>
      <path class="glass" d="M0 104 H8 M130 104 H138" stroke-width="2.4"/>
      <rect class="solid" x="2" y="97" width="32" height="3" rx="1.5"/>
      <rect class="solid" x="4" y="100" width="5" height="4"/>
      <path class="glass" d="M117 150 V94 Q117 89 121 89 M124 150 V94 Q124 89 128 89" stroke-width="1.4"/>
      <path class="glass" d="M117 108 H124 M117 120 H124 M117 132 H124 M117 144 H124" stroke-width="1"/>`,
    // A rain cloud.
    source: '<path d="M58 30 Q52 30 52 24 Q52 18 59 18 Q61 10 70 10 Q78 10 80 17 Q88 16 88 23 Q88 30 81 30 Z" fill="rgba(214,230,255,0.28)"/>',
  },
};

// Top of each vessel's inside (spilled drops must clear it), and where the duck floats.
const RIM = { tube: 50, glass: 62, cylinder: 46, bucket: 112, barrel: 100, tub: 124, hottub: 126, pool: 104 };
const DUCK_X = { tub: 62, hottub: 52, pool: 104 };

// Automatic: each vessel covers roughly its real-world capacity.
function vesselFor(liters) {
  if (liters < 0.1) return 'tube';
  if (liters < 1) return 'glass';
  if (liters < 10) return 'cylinder';
  if (liters < 50) return 'bucket';
  if (liters < 300) return 'barrel';
  if (liters < 2000) return 'tub';
  if (liters < 20000) return 'hottub';
  return 'pool';
}

const cur = { vessel: null, cap: null, unit: null };
const card = $('card');

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function instant(els) {
  for (const e of els) e.classList.add('instant');
  requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((e) => e.classList.remove('instant'))));
}

function setVessel(name) {
  const v = VESSELS[name];
  cur.vessel = name;
  cur.cap = null;
  window.thirsty.vessel(name); // so the menu can say "Drain bathtub" etc.
  $('behind').innerHTML = v.behind;
  $('front').innerHTML = v.front;
  $('vclipPath').setAttribute('d', v.clip);
  $('ticks').textContent = '';
  drawSource();
  card.classList.toggle('ducky', name in DUCK_X);
  if (DUCK_X[name]) $('duck').setAttribute('transform', `translate(${DUCK_X[name]} 0)`);
  instant([waterEl, $('bands'), $('range')]);
}

// Wavelength matches the 24px drift animation so the loop is seamless.
function wavePath(amp, len, phase = 0, dy = 0) {
  let d = `M-10 ${dy}`;
  for (let x = -10; x <= 160; x += 2) d += ` L${x} ${(dy + amp * Math.sin((x / len) * 2 * Math.PI + phase)).toFixed(2)}`;
  return d + ' L160 6 L-10 6 Z';
}
let look = null; // true while showing CO₂ (a scene instead of the vessel; see scenes.js)
$('waveFront').setAttribute('d', wavePath(1.4, 24));
$('waveBack').setAttribute('d', wavePath(1.8, 24, Math.PI, -0.6));
function setLook(co2) {
  if (look === co2) return;
  look = co2;
  card.classList.toggle('co2', co2);
}

function drawSource() {
  const v = VESSELS[cur.vessel];
  $('source').innerHTML = v.source || '';
}

function capacityFor(v) {
  if (v <= 0) return 10;
  const target = v * 1.1;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}

function drawTicks(v, cap, unit) {
  const g = $('ticks');
  g.textContent = '';
  if (!v.ticks) return;
  const fmtTick = (x) =>
    cap >= 2e6 ? `${+(x / 1e6).toFixed(1)}M` : cap >= 2000 ? `${+(x / 1000).toFixed(1)}k` : Number.isInteger(x) ? String(x) : x.toFixed(1);
  for (let i = 1; i <= 20; i++) {
    const y = (v.bottom - ((v.bottom - v.top) * i) / 20).toFixed(1);
    const major = i % 4 === 0;
    g.appendChild(el('line', { class: 'tick', x1: v.ticks.x, x2: v.ticks.x + (major ? 11 : 5), y1: y, y2: y }));
    if (major) {
      const t = el('text', { class: 'label', x: v.ticks.label, y: (+y + 3).toFixed(1), 'text-anchor': 'end' });
      t.textContent = fmtTick((cap * i) / 20);
      g.appendChild(t);
    }
  }
  const u = el('text', { class: 'label', x: v.ticks.label, y: v.top - 12, 'text-anchor': 'end' });
  u.textContent = unit;
  g.appendChild(u);
}

// ── Formatting ──────────────────────────────────────────────────────────────
function fmtLiters(l) {
  if (l < 1) return `${Math.round(l * 1000)} mL`;
  if (l < 10) return `${l.toFixed(1)} L`;
  return `${Math.round(l).toLocaleString('en-US')} L`;
}

function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

function fmtRate(lph) {
  return lph < 1 ? `${Math.round(lph * 1000)} mL/h` : `${lph.toFixed(1)} L/h`;
}

function co2Parts(kg) {
  if (kg < 1) return [String(Math.round(kg * 1000)), 'g CO₂e'];
  if (kg < 10) return [kg.toFixed(1), 'kg CO₂e'];
  if (kg < 1000) return [String(Math.round(kg)), 'kg CO₂e'];
  return [(kg / 1000).toFixed(kg < 10000 ? 2 : 1), 't CO₂e'];
}
const fmtCo2 = (kg) => co2Parts(kg).join(' ');
function literParts(l) {
  if (l < 1) return [String(Math.round(l * 1000)), 'mL'];
  if (l < 10) return [l.toFixed(1), 'L'];
  return [Math.round(l).toLocaleString('en-US'), 'L'];
}
// "42–305 g CO₂e" rather than "42 g CO₂e – 305 g CO₂e" when the units match.
function fmtRange(parts, lo, hi) {
  const [a, ua] = parts(lo);
  const [b, ub] = parts(hi);
  return ua === ub ? `${a}–${b} ${ub}` : `${a} ${ua} – ${b} ${ub}`;
}
// Counting CO₂ in things people can picture. Factors (kg CO₂ each) come from
// model.js with each update; sources are in the README.
const fmtCount = (x) =>
  x < 0.01 ? x.toFixed(3) : x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x).toLocaleString('en-US');

function co2Units(q) {
  return {
    phone: [q.phoneKg, 'phone charge', 'phone charges'],
    cigarette: [q.cigaretteKg, 'cigarette', 'cigarettes'],
    idle: [q.idleKgPerHour],
    km: [q.carKgPerKm, 'km driven', 'km driven'],
    tire: [q.tireKg, 'tire burned', 'tires burned'],
    tree: [q.treeKgPerYear, 'tree for a year', 'trees for a year'],
  };
}

// Automatic: the comparison that gives a readable number for the amount.
function co2UnitFor(kg) {
  if (kg < 0.05) return 'phone';
  if (kg < 1) return 'cigarette';
  if (kg < 30) return 'idle';
  if (kg < 600) return 'tire';
  return 'tree';
}

function co2Say(kg, unit, q) {
  const [each, one, many] = co2Units(q)[unit];
  if (unit === 'idle') {
    const min = (kg / each) * 60;
    if (min < 90) return `${fmtCount(min)} min of car idling`;
    if (min < 2880) return `${fmtCount(min / 60)} h of car idling`;
    return `${fmtCount(min / 1440)} days of car idling`;
  }
  const x = kg / each;
  if (x < 0.001) return `< 0.001 ${many}`;
  const n = fmtCount(x);
  return `${n} ${n === '1' ? one : many}`;
}

function co2Unit(kg, pick, q) {
  return pick in co2Units(q) ? pick : co2UnitFor(kg);
}

// Units for the scale: mL or L.
function scaleFor(x) {
  return x < 1 ? ['mL', 1000] : ['L', 1];
}
const fmtRateKg = (kgph) => (kgph < 1 ? `${Math.round(kgph * 1000)} g/h` : `${kgph.toFixed(1)} kg/h`);

// The CO₂ rate in the comparison on show: "0.013 tires/h", "17 min idling/h".
const RATE_UNITS = { phone: ['charge', 'charges'], cigarette: ['cigarette', 'cigarettes'], km: ['km', 'km'], tire: ['tire', 'tires'], tree: ['tree', 'trees'] };
function co2RateSay(kgph, unit, q) {
  const x = kgph / co2Units(q)[unit][0];
  const sig = (v) => (v >= 10 ? Math.round(v).toLocaleString('en-US') : String(+v.toPrecision(2)));
  if (unit === 'idle') return x < 1 ? `${sig(x * 60)} min idling/h` : `${sig(x)} h idling/h`;
  const n = sig(x);
  const [one, many] = RATE_UNITS[unit];
  return `${n} ${n === '1' ? one : many}/h`;
}

// The caption counts in whichever vessel is showing: [litres each, singular, plural].
const VESSEL_UNITS = {
  tube: [0.02, 'test tube', 'test tubes'],
  glass: [0.25, 'glass', 'glasses'],
  cylinder: [1, 'cylinder', 'cylinders'],
  bucket: [10, 'bucket', 'buckets'],
  barrel: [200, 'rain barrel', 'rain barrels'],
  tub: [150, 'bathtub', 'bathtubs'],
  hottub: [1500, 'hot tub', 'hot tubs'],
  pool: [50000, 'swimming pool', 'swimming pools'], // backyard size
};

function caption(l, vessel) {
  const [size, one, many] = VESSEL_UNITS[vessel] || VESSEL_UNITS.tub;
  if (l <= 0) return 'empty';
  const x = l / size;
  if (x < 0.001) return `< 0.001 ${many}`;
  const n = fmtCount(x);
  return `≈ ${n} ${n === '1' ? one : many}`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ── Water level and project layers ──────────────────────────────────────────
let surfaceY = 206;
let pending = null;
let levelTimer = null;

function applyLevel(y, layers) {
  surfaceY = y;
  waterEl.style.transform = `translateY(${y.toFixed(2)}px)`;
  $('steam').style.transform = `translateY(${y.toFixed(2)}px)`;
  const v = VESSELS[cur.vessel];
  const H = Math.max(0, v.bottom - y);
  const total = layers.reduce((s, l) => s + l.v, 0);
  const g = $('bands');
  while (g.childElementCount < layers.length) g.appendChild(el('rect', { x: -10, width: 160 }));
  while (g.childElementCount > layers.length) g.lastChild.remove();
  let top = 0;
  layers.forEach((l, i) => {
    const h = total > 0 ? (H * l.v) / total : 0;
    const last = i === layers.length - 1;
    const gap = !last && h > 2.5 ? 0.9 : 0; // thin gap between layers
    const r = g.children[i];
    r.style.y = `${top}px`;
    r.style.height = `${Math.max(0, h - gap + (last ? 40 : 0))}px`;
    r.style.fill = l.color;
    top += h;
  });
  // The surface takes the top layer's colour.
  const surface = layers.length ? layers[0].color : '#3987e5';
  $('waveFront').style.fill = surface;
  $('waveBack').style.fill = surface;
  renderHits(layers, y, H, total, v);
}

// ── Layer tooltips ──────────────────────────────────────────────────────────
// One hover target per layer, sized to the layer's final position.
let hitLayers = [];

function renderHits(layers, y, H, total, v) {
  const box = $('hits');
  hitLayers = layers.map((l) => ({ ...l, share: total > 0 ? l.v / total : 0 }));
  while (box.childElementCount < layers.length) {
    const d = document.createElement('div');
    d.className = 'hit';
    d.addEventListener('mousemove', (e) => showTip(hitLayers[+d.dataset.i], e));
    d.addEventListener('mouseleave', hideTip);
    d.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      hideTip();
      window.thirsty.menu();
    });
    box.appendChild(d);
  }
  while (box.childElementCount > layers.length) box.lastChild.remove();
  let top = y;
  hitLayers.forEach((l, i) => {
    const h = H * l.share;
    const d = box.children[i];
    d.dataset.i = i;
    d.style.left = `${v.hit[0]}px`;
    d.style.width = `${v.hit[1] - v.hit[0]}px`;
    d.style.top = `${top - (i === 0 ? 3 : 0)}px`; // include the wave crest on the top layer
    d.style.height = `${Math.max(0, h + (i === 0 ? 3 : 0) + (i === hitLayers.length - 1 ? 2 : 0))}px`;
    top += h;
  });
  if (!hitLayers.length) hideTip();
}

function showTip(l, e) {
  if (!l) return;
  const pct = l.share >= 0.995 ? '100%' : l.share < 0.01 ? '<1%' : `${Math.round(l.share * 100)}%`;
  placeTip(`<i style="background:${l.color}"></i><b>${esc(l.name)}</b>${l.text} · ${pct}`, e);
}

function placeTip(html, e) {
  const tip = $('tip');
  tip.innerHTML = html;
  const r = card.getBoundingClientRect();
  const w = tip.offsetWidth;
  let x = e.clientX - r.left + 12;
  if (x + w > r.width - 4) x = e.clientX - r.left - w - 10;
  tip.style.left = `${Math.max(4, x)}px`;
  tip.style.top = `${Math.max(4, e.clientY - r.top - 26)}px`;
  tip.classList.add('on');
}

function hideTip() {
  $('tip').classList.remove('on');
}

// Moves the surface now, or after `delay` ms (so it rises when the first drop lands).
function setLevel(y, layers, delay) {
  if (delay > 0 || levelTimer) {
    pending = { y, layers };
    if (!levelTimer) {
      levelTimer = setTimeout(() => {
        levelTimer = null;
        applyLevel(pending.y, pending.layers);
        pending = null;
      }, delay);
    }
    return;
  }
  applyLevel(y, layers);
}

function setRange(show, yLo, yHi) {
  const g = $('range');
  g.style.opacity = show ? '1' : '0';
  if (!show) return;
  $('rangeFill').style.y = `${yHi}px`;
  $('rangeFill').style.height = `${Math.max(0, yLo - yHi)}px`;
  $('rangeHi').style.y = `${yHi}px`;
  $('rangeLo').style.y = `${yLo}px`;
}

// ── Drops: one per response, coloured by model, smaller for subagents ───────
const FORM_MS = 320;
const DRIP_GAP_MS = 450;
const MAX_QUEUED = 8;
let dripQueue = [];
let dripTimer = null;

const fallMs = (dist) => 520 + 680 * Math.sqrt(Math.max(dist, 10) / 190);

function cancelDrips() {
  clearTimeout(levelTimer);
  levelTimer = null;
  if (pending) applyLevel(pending.y, pending.layers);
  pending = null;
  clearTimeout(dripTimer);
  dripTimer = null;
  dripQueue = [];
}

function queueDrips(events) {
  dripQueue = dripQueue.concat(events).slice(-MAX_QUEUED);
  if (!dripTimer) nextDrip();
}

function nextDrip() {
  const e = dripQueue.shift();
  if (!e) {
    dripTimer = null;
    return;
  }
  drip(e, surfaceY);
  dripTimer = setTimeout(nextDrip, DRIP_GAP_MS);
}

function drip(e, y) {
  if (look) return sceneEvent(e); // CO₂: a puff from the scene instead
  const [x, y0] = VESSELS[cur.vessel].drip;
  const s = e.sub ? 0.65 : 1;
  const drop = el('path', { d: 'M0 -8 C2.6 -4 3.9 -1.3 0 2 C-3.9 -1.3 -2.6 -4 0 -8Z', fill: dropColor(e.fam) });
  drop.style.opacity = '0';
  $('drops').appendChild(drop);
  const fall = fallMs(y - y0);
  const total = FORM_MS + fall;
  drop.animate(
    [
      { transform: `translate(${x}px, ${y0 + 1}px) scale(${0.2 * s})`, opacity: 0, easing: 'ease-out' },
      { transform: `translate(${x}px, ${y0 + 2}px) scale(${s})`, opacity: 1, offset: FORM_MS / total, easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: `translate(${x}px, ${y - 3}px) scale(${0.85 * s}, ${1.3 * s})`, opacity: 1 },
    ],
    { duration: total, fill: 'both' }
  ).onfinish = () => {
    drop.remove();
    splash(x, y, dropColor(e.fam), s);
    sound(e.sub);
  };
}

// ── Sounds (optional): synthesised here, so there are no audio files ────────
// A water drop is a short sine "plink" whose pitch rises; CO₂ is a soft puff of
// filtered noise. Bigger vessels sound lower.
const PITCH = { tube: 1700, glass: 1500, cylinder: 1350, bucket: 1050, barrel: 900, tub: 780, hottub: 660, pool: 560 };
let actx = null;

function audioCtx() {
  if (!actx) {
    try {
      actx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}

// Builds one drop sound into any audio context (also used by the tests).
function dropSound(a, t, freq, vol, co2) {
  const g = a.createGain();
  g.connect(a.destination);
  if (co2) {
    const len = Math.floor(a.sampleRate * 0.22);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 0.7, t);
    lp.frequency.exponentialRampToValueAtTime(freq * 0.25, t + 0.2);
    src.connect(lp);
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 2.4, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    src.start(t);
    src.stop(t + 0.22);
    return;
  }
  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 1.9, t + 0.05);
  o.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  o.start(t);
  o.stop(t + 0.15);
}

function sound(sub) {
  if (!lastState || !lastState.sounds) return;
  const a = audioCtx();
  if (!a) return;
  const f = (PITCH[cur.vessel] || 1200) * (sub ? 1.3 : 1) * (0.94 + Math.random() * 0.12);
  dropSound(a, a.currentTime + 0.01, f, sub ? 0.05 : 0.09, look);
}

// Level-up: two rising notes.
function chime() {
  if (!lastState || !lastState.sounds) return;
  const a = audioCtx();
  if (!a) return;
  [[660, 0], [990, 0.13]].forEach(([f, dt]) => {
    const t = a.currentTime + 0.02 + dt;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.connect(g);
    g.connect(a.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t);
    o.stop(t + 0.4);
  });
}

// ── Level-up: the old vessel shrinks, tips and pours into the bigger one ────
let levelingUntil = 0;

function levelUp(from, to, targetY, color) {
  const svg = $('rig').ownerSVGElement;
  const ghost = $('rig').cloneNode(true);
  ghost.querySelector('#drops').textContent = '';
  ghost.querySelector('#range').remove();
  const gWater = ghost.querySelector('#water');
  // Its own clip, since the shared one changes to the new vessel.
  const old = document.getElementById('ghostClip');
  if (old) old.remove();
  const clip = el('clipPath', { id: 'ghostClip' });
  clip.appendChild(el('path', { d: VESSELS[from].clip }));
  svg.querySelector('defs').appendChild(clip);
  ghost.querySelectorAll('[clip-path]').forEach((n) => n.setAttribute('clip-path', 'url(#ghostClip)'));
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.removeAttribute('id');
  ghost.style.transformBox = 'view-box';
  ghost.style.transformOrigin = '0 0';
  svg.appendChild(ghost);

  const D = 2600;
  const P = [79, 120]; // pivot in the old vessel
  const Q = [48, 50]; // where it ends up, small, above the new one
  const SC = 0.42;
  const ROT = 108;
  const tf = (q, r, sc) => `translate(${q[0]}px, ${q[1]}px) rotate(${r}deg) scale(${sc}) translate(${-P[0]}px, ${-P[1]}px)`;
  ghost.animate(
    [
      { transform: tf(P, 0, 1), opacity: 1, easing: 'cubic-bezier(.4,0,.2,1)' },
      { transform: tf(Q, 0, SC), opacity: 1, offset: 0.26, easing: 'ease-in-out' },
      { transform: tf(Q, ROT, SC), opacity: 1, offset: 0.42 },
      { transform: tf(Q, ROT, SC), opacity: 1, offset: 0.8 },
      { transform: tf(Q, ROT, SC), opacity: 0 },
    ],
    { duration: D, fill: 'forwards' }
  ).onfinish = () => {
    ghost.remove();
    clip.remove();
  };
  // Its water drains while it pours.
  const vOld = VESSELS[from];
  const yNow = gWater.style.transform || `translateY(${vOld.bottom}px)`;
  gWater.animate(
    [{ transform: yNow }, { transform: yNow, offset: 0.44 }, { transform: `translateY(${vOld.bottom + 4}px)`, offset: 0.78 }, { transform: `translateY(${vOld.bottom + 4}px)` }],
    { duration: D, fill: 'forwards' }
  );
  // The new vessel fades in underneath.
  $('rig').animate([{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.36 }], { duration: D });

  // The stream from the old vessel's mouth to the new surface.
  const m = new DOMMatrix().translate(Q[0], Q[1]).rotate(ROT).scale(SC).translate(-P[0], -P[1]);
  const mouth = m.transformPoint(new DOMPoint(79, vOld.top - 14));
  const endY = Math.max(mouth.y + 20, targetY);
  const stream = el('path', {
    d: `M${mouth.x.toFixed(1)} ${mouth.y.toFixed(1)} Q${(mouth.x + 9).toFixed(1)} ${(mouth.y + 6).toFixed(1)} ${(mouth.x + 10).toFixed(1)} ${endY.toFixed(1)}`,
    fill: 'none',
    stroke: color,
    'stroke-width': 2.4,
    'stroke-linecap': 'round',
  });
  svg.appendChild(stream);
  const len = stream.getTotalLength();
  stream.style.strokeDasharray = `${len} ${len}`;
  stream.animate(
    [
      { strokeDashoffset: len, opacity: 0.9 },
      { strokeDashoffset: len, opacity: 0.9, offset: 0.42 },
      { strokeDashoffset: 0, opacity: 0.9, offset: 0.5 },
      { strokeDashoffset: 0, opacity: 0.9, offset: 0.74 },
      { strokeDashoffset: -len, opacity: 0.9, offset: 0.84 },
      { strokeDashoffset: -len, opacity: 0 },
    ],
    { duration: D, fill: 'forwards' }
  ).onfinish = () => stream.remove();

  // A small banner: "Bucket → Rain barrel".
  const b = $('levelup');
  b.textContent = `${VESSEL_NAMES[from]} → ${VESSEL_NAMES[to]}`;
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), D + 600);
  setTimeout(chime, D * 0.45);
  levelingUntil = Date.now() + D;
  return D * 0.48; // when the new water starts to rise
}

function splash(x, y, color, s) {
  const ripple = el('ellipse', { class: 'ripple', cx: x, cy: y, rx: 2, ry: 0.8, fill: 'none', stroke: '#c4e9ff', 'stroke-width': 0.6 });
  $('drops').appendChild(ripple);
  ripple.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: `scale(${9 * s}, ${3 * s})`, opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () =>
    ripple.remove();
  for (const dx of [-1, 1]) {
    const bead = el('circle', { r: 1.1 * s, fill: color });
    $('drops').appendChild(bead);
    bead.animate(
      [
        { transform: `translate(${x}px, ${y}px)`, opacity: 0.95, easing: 'ease-out' },
        { transform: `translate(${x + dx * 5 * s}px, ${y - 7 * s}px)`, opacity: 0.9, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${x + dx * 8 * s}px, ${y - 1}px)`, opacity: 0 },
      ],
      { duration: 520, fill: 'both' }
    ).onfinish = () => bead.remove();
  }
}

// ── Emptying: tips the glassware, or drains the tub and pool ────────────────
let pouringUntil = 0;

function pour() {
  if (look) return clearScene();
  pouringUntil = Date.now() + 1600;
  cancelDrips();
  if (!VESSELS[cur.vessel].tilt) {
    setTimeout(() => lastState && render(lastState), 1650);
    return;
  }
  $('rig').animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-10deg)', offset: 0.3 },
      { transform: 'rotate(-10deg)', offset: 0.65 },
      { transform: 'rotate(0deg)' },
    ],
    { duration: 1600, easing: 'ease-in-out' }
  );
  for (let i = 0; i < 6; i++) {
    const drop = el('path', { d: 'M0 -4 C1.4 -2 2 -0.7 0 1 C-2 -0.7 -1.4 -2 0 -4Z', fill: '#8fd6ff' });
    drop.style.opacity = '0';
    $('spill').appendChild(drop);
    const x0 = 13 + Math.random() * 4;
    const x1 = 6 + Math.random() * 10;
    drop.animate(
      [
        { transform: `translate(${x0}px, 18px)`, opacity: 0.95 },
        { transform: `translate(${x1}px, 214px)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 200, delay: 380 + i * 110, easing: 'cubic-bezier(.5,0,1,1)', fill: 'both' }
    ).onfinish = () => drop.remove();
  }
  setTimeout(() => lastState && render(lastState), 1650);
}

// CO₂: the scene fades out and comes back at zero.
function clearScene() {
  pouringUntil = Date.now() + 600;
  cancelDrips();
  const sc = $('scene');
  sc.getAnimations().forEach((a) => a.cancel());
  sc.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
  setTimeout(() => {
    if (lastState) render(lastState);
    sc.getAnimations().forEach((a) => a.cancel());
    sc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
  }, 650);
}

// ── Hover legend ────────────────────────────────────────────────────────────
function legend(s, co2) {
  const amt = co2 ? s.co2 : s.liters;
  const fmt = co2 ? fmtCo2 : fmtLiters;
  const items = s.layers
    .map(
      (l) =>
        `<div class="lg-item"><i style="background:${l.color}"></i><span class="nm">${esc(l.name)}</span><span>${co2 ? fmtCo2(l.kg) : fmtLiters(l.liters)}</span></div>`
    )
    .join('');
  const drops = DROPS.map(([, label, c]) => `<span><b style="color:${c}">●</b>${label}</span>`).join('');
  const method = s.method === 'eco' ? 'EcoLogits estimate' : 'ThirstyClaude estimate';
  const basis = co2 ? 'US grid average' : s.mode === 'cooling' ? 'cooling only' : 'incl. power plants';
  const rate = co2 ? s.rateKg : s.rate;
  const t = s.tokens;
  const head = s.since ? `${s.periodLabel} · ${s.since}` : s.periodLabel;
  const hint = s.hint
    ? `<div class="lg-hint">⚠ ${fmtTokens(s.hint.tokens)} context: ≈ ${co2 ? co2Parts(s.hint.kg)[0] + ' ' + co2Parts(s.hint.kg)[1].split(' ')[0] : fmtLiters(s.hint.liters)} a reply</div>`
    : '';
  // Two more comparisons besides the one in the caption.
  let equiv = '';
  if (co2 && amt.mid > 0 && s.equiv) {
    const shown = co2Unit(amt.mid, s.co2Unit, s.equiv);
    const other = ['km', 'cigarette'].find((u) => u !== shown);
    equiv = `<div>Also ≈ ${co2Say(amt.mid, other, s.equiv)}</div>`;
  }
  $('legend').innerHTML = `
    <div class="lg-head">${esc(head)}</div>
    <div class="lg-big">${fmt(amt.mid)}</div>
    <div>Likely ${fmtRange(co2 ? co2Parts : literParts, amt.lo, amt.hi)}</div>
    ${equiv}
    <div>≈ ${s.kwh.mid < 10 ? s.kwh.mid.toFixed(2) : Math.round(s.kwh.mid).toLocaleString('en-US')} kWh · ${t.req.toLocaleString('en-US')} responses</div>
    <div>${fmtTokens(t.in + t.out + t.cw + t.cr)} tokens · ${fmtTokens(t.out)} output</div>
    ${rate > 0 ? `<div>Now ${co2 ? fmtRateKg(rate) : fmtRate(rate)}</div>` : ''}
    ${hint}
    <div class="lg-sec">Projects</div>${items || '<div>None yet</div>'}
    <div class="lg-sec">${co2 ? 'Puffs' : 'Drops'}</div><div class="lg-drops">${drops}</div>
    <div class="lg-foot">${co2 && s.equiv ? co2Basis(co2Unit(amt.mid, s.co2Unit, s.equiv), s.equiv) + ' Small puffs are subagents.' : 'Small drops are subagents. Band = likely range.'}<br>${method}, ${basis}.</div>`;
}

// What one of each comparison is worth, for the legend.
function co2Basis(unit, q) {
  return {
    phone: `1 charge ≈ ${fmtCo2(q.phoneKg)}.`,
    cigarette: `1 cigarette ≈ ${fmtCo2(q.cigaretteKg)}; a pack holds 20.`,
    idle: `1 h idling ≈ ${fmtCo2(q.idleKgPerHour)}.`,
    km: `1 km ≈ ${fmtCo2(q.carKgPerKm)}.`,
    tire: `1 tire ≈ ${fmtCo2(q.tireKg)}.`,
    tree: `1 tree takes up ≈ ${fmtCo2(q.treeKgPerYear)} a year.`,
  }[unit] || '';
}

// ── Slosh: the water tilts and settles when the widget is dragged ───────────
// A damped spring per vessel: the surface leans against the window's
// acceleration (like water in a carried glass), overshoots, and settles.
// Narrow glassware rocks quickly; the tub and pool sway slowly.
const SLOSH = {
  tube: { hz: 2.3, max: 22, cx: 79, damping: 0.1 },
  glass: { hz: 2.0, max: 16, cx: 79, damping: 0.1 },
  cylinder: { hz: 1.9, max: 18, cx: 79, damping: 0.1 },
  bucket: { hz: 1.3, max: 11, cx: 79, damping: 0.09 },
  barrel: { hz: 1.1, max: 9, cx: 79, damping: 0.09 },
  tub: { hz: 0.95, max: 9, cx: 69, damping: 0.08 },
  hottub: { hz: 0.8, max: 7, cx: 69, damping: 0.08 },
  pool: { hz: 0.6, max: 5, cx: 69, damping: 0.07 },
};
const G = 21000; // px/s²: a brisk drag tilts the water a few degrees
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const motion = { last: null, vx: 0, vy: 0, pvx: 0, pvy: 0, lastEvent: 0, t: 0, th: 0, w: 0, b: 0, bv: 0, running: false };

function onMove([x, y]) {
  if (REDUCED_MOTION || iceLevel >= 0.6) return; // ice doesn't slosh
  const now = performance.now();
  if (!motion.last || now - motion.last.now > 200) {
    motion.vx = motion.vy = 0; // a new drag starts from rest
  } else {
    const dt = Math.max(0.008, (now - motion.last.now) / 1000);
    motion.vx += ((x - motion.last.x) / dt - motion.vx) * 0.5;
    motion.vy += ((y - motion.last.y) / dt - motion.vy) * 0.5;
  }
  motion.last = { x, y, now };
  motion.lastEvent = now;
  if (!motion.running) {
    motion.running = true;
    motion.t = now;
    motion.pvx = motion.vx;
    motion.pvy = motion.vy;
    requestAnimationFrame(sloshStep);
  }
}

function sloshStep(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - motion.t) / 1000));
  motion.t = now;
  if (now - motion.lastEvent > 60) {
    // No movement reported: the window has stopped.
    const decay = Math.exp(-dt / 0.035);
    motion.vx *= decay;
    motion.vy *= decay;
  }
  const ax = (motion.vx - motion.pvx) / dt;
  const ay = (motion.vy - motion.pvy) / dt;
  motion.pvx = motion.vx;
  motion.pvy = motion.vy;

  const s = SLOSH[cur.vessel] || SLOSH.cylinder;
  const om = 2 * Math.PI * s.hz;
  const eq = clamp((Math.atan(clamp(ax, -60000, 60000) / G) * 180) / Math.PI, -s.max, s.max);
  motion.w += (-om * om * (motion.th - eq) - 2 * s.damping * om * motion.w) * dt;
  motion.th = clamp(motion.th + motion.w * dt, -s.max * 1.3, s.max * 1.3);
  const ob = om * 1.3;
  const beq = clamp(ay * 0.00025, -4, 4);
  motion.bv += (-ob * ob * (motion.b - beq) - 2 * 0.12 * ob * motion.bv) * dt;
  motion.b = clamp(motion.b + motion.bv * dt, -6, 6);

  const chop = 1 + Math.min(2.2, Math.abs(motion.w) * 0.012 + Math.abs(motion.th - eq) * 0.06);
  $('slosh').setAttribute('transform', `translate(0 ${motion.b.toFixed(2)}) rotate(${motion.th.toFixed(2)} ${s.cx} 0)`);
  $('chopFront').setAttribute('transform', `scale(1 ${chop.toFixed(2)})`);
  $('chopBack').setAttribute('transform', `scale(1 ${chop.toFixed(2)})`);
  if (DUCK_X[cur.vessel]) $('duck').setAttribute('transform', `translate(${(DUCK_X[cur.vessel] - motion.th * 0.7).toFixed(2)} 0)`); // slides downhill
  $('scene').style.setProperty('--lean', clamp(motion.th * 1.6, -16, 16).toFixed(2)); // CO₂: flames and smoke trail behind
  spillStep(dt, s, now);

  const settled =
    now - motion.lastEvent > 400 &&
    Math.abs(motion.th) < 0.05 &&
    Math.abs(motion.w) < 0.5 &&
    Math.abs(motion.b) < 0.05 &&
    Math.abs(motion.bv) < 0.5 &&
    !spillDrops.length;
  if (settled) {
    for (const id of ['slosh', 'chopFront', 'chopBack']) $(id).removeAttribute('transform');
    if (DUCK_X[cur.vessel]) $('duck').setAttribute('transform', `translate(${DUCK_X[cur.vessel]} 0)`);
    $('scene').style.removeProperty('--lean');
    motion.th = motion.w = motion.b = motion.bv = 0;
    motion.running = false;
    return;
  }
  requestAnimationFrame(sloshStep);
}

// ── Spills: a hard swing throws water up the high wall, sometimes over the rim ──
// The wall rises at (distance from the pivot × swing speed); drops launched at
// that speed land back in, or clear the rim and splash below the vessel.
const SPILL_GRAVITY = 700; // px/s²
const SPILL_BOOST = 6.5; // splash is livelier than the wall itself
const SPILL_MIN = 70; // px/s up the wall before anything leaves the surface
const GROUND = 233;
let spillDrops = [];
let lastSpill = 0;

function spillStep(dt, s, now) {
  const v = VESSELS[cur.vessel];
  const wet = !look && waterEl.style.opacity !== '0' && surfaceY < v.bottom - 3 && iceLevel < 0.6 && Date.now() >= pouringUntil;
  const rising = Math.sign(motion.w) === Math.sign(motion.th) && Math.abs(motion.th) > 2;
  if (wet && rising && now - lastSpill > 40 && spillDrops.length < 14) {
    const left = motion.th > 0; // tilted clockwise: the left wall is the high side
    const wallX = left ? v.hit[0] + 1.5 : v.hit[1] - 1.5;
    const arm = Math.abs(wallX - s.cx);
    const up = arm * Math.abs((motion.w * Math.PI) / 180) * SPILL_BOOST;
    if (up > SPILL_MIN) {
      lastSpill = now;
      const yWall = surfaceY - arm * Math.tan(Math.abs((motion.th * Math.PI) / 180)) + motion.b;
      const color = (lastState && lastState.layers[0] && lastState.layers[0].color) || '#8fd6ff';
      const d = el('circle', { r: (1 + Math.random() * 0.6).toFixed(2), fill: color });
      $('spill').appendChild(d);
      spillDrops.push({ el: d, color, x: wallX, y: yWall, vx: (left ? -1 : 1) * (12 + Math.random() * 30), vy: -up * (0.7 + Math.random() * 0.5), x0: v.hit[0], x1: v.hit[1], rim: RIM[cur.vessel] ?? v.top, out: false });
    }
  }
  for (const p of spillDrops) {
    p.vy += SPILL_GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!p.out && (p.x < p.x0 || p.x > p.x1)) {
      if (p.y < p.rim) p.out = true; // over the lip
      else p.x = clamp(p.x, p.x0, p.x1); // still below the rim: runs up the wall
    }
    if (!p.out && p.vy > 0 && p.y > surfaceY) p.done = true; // fell back in
    if (p.out && p.y > GROUND) {
      p.done = true;
      puddle(p.x, p.color);
    }
    p.el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  }
  spillDrops = spillDrops.filter((p) => {
    if (p.done) p.el.remove();
    return !p.done;
  });
}

function puddle(x, color) {
  const p = el('ellipse', { cx: x, cy: GROUND, rx: 1.2, ry: 0.5, fill: color, 'fill-opacity': 0.75 });
  $('spill').appendChild(p);
  p.style.transformBox = 'fill-box';
  p.style.transformOrigin = 'center';
  p.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3.2, 1.6)', opacity: 0.8, offset: 0.15 }, { transform: 'scale(3.6, 1.7)', opacity: 0 }], { duration: 2600, easing: 'ease-out' }).onfinish = () =>
    p.remove();
  sound(true);
}

// ── Ice: the water freezes after a few idle hours and cracks when work resumes ──
const FREEZE_AFTER_MS = 2 * 3600e3; // starts to ice over
const FROZEN_MS = 3 * 3600e3; // solid
let iceLevel = 0;
let iceReady = false;
let thawUntil = 0;

for (let i = 0; i < 18; i++) {
  $('frost').appendChild(el('circle', { cx: ((i * 41) % 150) - 4, cy: 3 + ((i * 67) % 190), r: (0.5 + (i % 3) * 0.35).toFixed(2), fill: '#fff', 'fill-opacity': 0.55 }));
}

function freezeLevel(lastAt) {
  if (!lastAt) return 0;
  return clamp((Date.now() - lastAt - FREEZE_AFTER_MS) / (FROZEN_MS - FREEZE_AFTER_MS), 0, 1);
}

function setIce(f) {
  iceLevel = f;
  $('ice').style.opacity = f.toFixed(3);
  card.classList.toggle('frozen', f >= 0.6);
}

function updateIce(lastAt) {
  if (Date.now() < thawUntil) return;
  const f = freezeLevel(lastAt);
  if (!iceReady) {
    iceReady = true;
    instant([$('ice')]);
    setIce(f);
  } else if (iceLevel > 0.15 && f < iceLevel - 0.1 && !REDUCED_MOTION && !look) thaw();
  else setIce(f);
}

// Cracks race across the ice, a few shards pop off, and it melts away.
function thaw() {
  thawUntil = Date.now() + 2000;
  const ice = $('ice');
  const cracks = $('cracks');
  const cx = (SLOSH[cur.vessel] || SLOSH.cylinder).cx;
  cracks.textContent = '';
  const lines = [
    [0, 0, -5, 6, -2, 11, -9, 19, -6, 26],
    [0, 0, 6, 5, 4, 12, 11, 18],
    [-1, 0, -12, 4, -17, 9],
    [1, 0, 13, 3, 19, 8, 24, 7],
  ];
  for (const pts of lines) {
    let d = '';
    for (let i = 0; i < pts.length; i += 2) d += `${i ? ' L' : 'M'}${(cx + pts[i]).toFixed(1)} ${pts[i + 1]}`;
    const p = el('path', { d, fill: 'none', stroke: '#f4fbff', 'stroke-width': 0.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    cracks.appendChild(p);
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len} ${len}`;
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 260, easing: 'ease-out', fill: 'both' });
  }
  cracks.style.opacity = '1';
  crackSound();
  for (let i = 0; i < 6; i++) {
    const x = cx + (i - 2.5) * 6;
    const dx = (i - 2.5) * 4 + (Math.random() - 0.5) * 4;
    const shard = el('path', { d: 'M-2 0 L0 -2.4 L2.2 -0.4 L0.6 1.6 Z', fill: '#e8f6ff', 'fill-opacity': 0.9 });
    $('spill').appendChild(shard);
    shard.animate(
      [
        { transform: `translate(${x}px, ${surfaceY}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x + dx * 0.6}px, ${surfaceY - 9 - Math.random() * 6}px) rotate(${dx * 20}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${x + dx}px, ${surfaceY + 3}px) rotate(${dx * 40}deg)`, opacity: 0 },
      ],
      { duration: 700, delay: 180, easing: 'ease-out', fill: 'both' }
    ).onfinish = () => shard.remove();
  }
  iceLevel = 0;
  card.classList.remove('frozen');
  setTimeout(() => {
    ice.style.transition = 'opacity 1.4s ease-in';
    ice.style.opacity = '0';
    setTimeout(() => {
      ice.style.transition = '';
      cracks.style.opacity = '0';
      cracks.textContent = '';
    }, 1500);
  }, 320);
}

function crackSound() {
  if (!lastState || !lastState.sounds) return;
  const a = audioCtx();
  if (!a) return;
  const t = a.currentTime + 0.01;
  const len = Math.floor(a.sampleRate * 0.09);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const hp = a.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const g = a.createGain();
  g.gain.value = 0.12;
  src.connect(hp);
  hp.connect(g);
  g.connect(a.destination);
  src.start(t);
}

// ── Boiling: bubbles and steam while many responses are arriving ─────────────
const BUBBLES = 12;
const bubbleAnims = [];
let bubbleKey = '';

for (let i = 0; i < BUBBLES; i++) {
  $('bubbles').appendChild(el('circle', { r: (0.7 + (i % 3) * 0.45).toFixed(2), fill: 'none', stroke: '#e6f6ff', 'stroke-width': 0.5, opacity: 0 }));
}
for (const dx of [-11, 0, 11]) {
  const g = el('g', { transform: `translate(${dx} 0)` });
  g.appendChild(el('path', { class: 'wisp', d: 'M0 -2 q-3 -5 0 -10 q3 -5 0 -10', fill: 'none', stroke: 'rgba(230,240,255,0.7)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
  $('steamX').appendChild(g);
}

// x: 0 (calm) to 1 (full boil).
function setBoil(x) {
  const v = VESSELS[cur.vessel];
  if (!v) return; // nothing drawn yet (CO₂ shows a scene instead)
  const depth = Math.max(0, v.bottom - surfaceY);
  const n = depth > 6 ? Math.round(x * BUBBLES) : 0;
  card.classList.toggle('boiling', x > 0.05);
  $('steam').style.opacity = x.toFixed(2);
  $('steamX').setAttribute('transform', `translate(${(SLOSH[cur.vessel] || SLOSH.cylinder).cx} 0)`);
  const key = `${cur.vessel}|${Math.round(depth / 8)}`; // restart when the depth changes noticeably
  const kids = $('bubbles').children;
  for (let i = 0; i < BUBBLES; i++) {
    const want = i < n;
    if (bubbleAnims[i] && (!want || key !== bubbleKey)) {
      bubbleAnims[i].cancel();
      bubbleAnims[i] = null;
    }
    if (want && !bubbleAnims[i]) {
      const bx = v.hit[0] + 3 + Math.random() * (v.hit[1] - v.hit[0] - 6);
      const dur = (500 + depth * 11) * (0.8 + Math.random() * 0.4);
      bubbleAnims[i] = kids[i].animate(
        [
          { transform: `translate(${bx}px, ${depth - 2}px) scale(.5)`, opacity: 0 },
          { opacity: 0.8, offset: 0.12 },
          { transform: `translate(${bx + 2}px, ${depth * 0.5}px) scale(.8)`, offset: 0.5 },
          { transform: `translate(${bx - 1}px, 1px) scale(1.1)`, opacity: 0.8, offset: 0.96 },
          { transform: `translate(${bx - 1}px, 0px) scale(1.4)`, opacity: 0 },
        ],
        { duration: dur, iterations: Infinity, delay: -Math.random() * dur }
      );
    }
  }
  bubbleKey = key;
}

// ── Jar shelf: one jar per day ──────────────────────────────────────────────
let shelfDays = [];

function renderShelf(shelf, co2) {
  card.classList.toggle('shelf7', Boolean(shelf) && shelf.length === 7);
  card.classList.toggle('shelf30', Boolean(shelf) && shelf.length === 30);
  shelfDays = shelf || [];
  const box = $('shelf');
  if (!shelf) {
    box.textContent = '';
    return;
  }
  if (box.childElementCount !== shelf.length) {
    box.textContent = '';
    shelf.forEach((_, i) => {
      const w = document.createElement('div');
      w.className = 'jw';
      w.innerHTML = '<div class="jar"><i></i></div><div class="jl"></div>';
      w.addEventListener('mousemove', (e) => {
        const d = shelfDays[i];
        if (d) placeTip(`<b>${esc(d.label)}</b>${look ? fmtCo2(d.kg) : fmtLiters(d.l)}`, e);
      });
      w.addEventListener('mouseleave', hideTip);
      box.appendChild(w);
    });
  }
  const vals = shelf.map((d) => (co2 ? d.kg : d.l));
  const max = Math.max(...vals);
  shelf.forEach((d, i) => {
    const w = box.children[i];
    const fill = w.querySelector('i');
    fill.style.height = `${max > 0 ? Math.max(vals[i] > 0 ? 4 : 0, (vals[i] / max) * 92) : 0}%`;
    fill.style.background = co2 ? '#9aa1ab' : '#3987e5';
    w.classList.toggle('today', i === shelf.length - 1);
    w.querySelector('.jl').textContent = shelf.length === 7 ? 'SMTWTFS'[d.dow] : '';
  });
}

// ── Render ──────────────────────────────────────────────────────────────────
let lastState = null;
let prevLiters = null;
let prevKey = null;
let prevReq = null;
let prevEmptied; // undefined until the first update arrives
let fadeTimer = null;

// The responses since the last update (or plain ones, if the list is missing).
function newEvents(s) {
  if (s.events && s.events.length) return s.events;
  return Array.from({ length: Math.max(1, Math.min(MAX_QUEUED, s.tokens.req - (prevReq ?? s.tokens.req))) }, () => ({ fam: 'opus', sub: false }));
}

// Water: pick the vessel, set the level, and drip.
function renderVessel(s, key, pouring) {
  const A = s.liters;
  const L = A.mid;
  const layers = s.layers.map((l) => ({ ...l, v: l.liters, text: fmtLiters(l.liters) }));
  let switched = false;
  let riseDelay = 0;
  if (!pouring || !cur.vessel) {
    const auto = !VESSELS[s.vessel];
    const name = auto ? vesselFor(L) : s.vessel; // a chosen vessel, or grow with the amount
    if (name !== cur.vessel) {
      const from = cur.vessel;
      const grew =
        auto && from && !s.scanning && !REDUCED_MOTION && key === prevKey && prevLiters !== null && L > prevLiters && LADDER.indexOf(name) > LADDER.indexOf(from);
      if (grew) {
        cancelDrips();
        const nv = VESSELS[name];
        const kk = scaleFor(L)[1];
        const y = nv.bottom - (nv.bottom - nv.top) * Math.min((L * kk) / capacityFor(L * kk), 1);
        riseDelay = levelUp(from, name, y, layers.length ? layers[0].color : '#8fd6ff');
      }
      setVessel(name);
      switched = true;
      if (grew) applyLevel(VESSELS[name].bottom, layers); // empty, then fills from the pour
    }
  }
  const v = VESSELS[cur.vessel];
  const [unit, k] = scaleFor(L);
  if (!pouring || !cur.cap) {
    const cap = capacityFor(L * k);
    if (cap !== cur.cap || unit !== cur.unit) {
      cur.cap = cap;
      cur.unit = unit;
      drawTicks(v, cap, unit);
    }
  }
  const level = (x) => v.bottom - (v.bottom - v.top) * Math.min(Math.max(x / cur.cap, 0), 1);
  const levelY = pouring ? v.bottom : level(L * k);

  const showRange = !s.scanning && !pouring && L > 0 && A.hi > A.lo && Date.now() >= levelingUntil;
  setRange(showRange, level(A.lo * k), A.hi * k > cur.cap ? v.top - 6 : level(A.hi * k));

  const leveling = Date.now() < levelingUntil;
  const rose = !s.scanning && !pouring && !switched && prevLiters !== null && key === prevKey && L > prevLiters;
  if (riseDelay > 0) {
    setLevel(levelY, layers, riseDelay); // rises as the old vessel pours in
  } else if (rose && leveling) {
    setLevel(levelY, layers, 0); // joins the pour already under way
  } else if (rose && !REDUCED_MOTION) {
    const events = newEvents(s);
    if (!dripTimer && !levelTimer) setLevel(levelY, layers, FORM_MS + fallMs(surfaceY - v.drip[1]));
    else setLevel(levelY, layers, 0);
    queueDrips(events);
  } else {
    if (pouring || switched) cancelDrips();
    setLevel(levelY, layers, 0);
  }

  if (L > 0 && !pouring) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
    waterEl.style.opacity = '1';
  } else if (!fadeTimer && waterEl.style.opacity !== '0') {
    // Fade only after the drain finishes, so the level can be seen dropping.
    fadeTimer = setTimeout(() => {
      waterEl.style.opacity = '0';
      fadeTimer = null;
    }, 1300);
  }

}

// CO₂: draw the comparison, and send up a puff for each new response.
function renderScene(s, key, pouring) {
  if (pouring) return; // fading out; comes back at zero
  const kg = s.co2.mid;
  const q = s.equiv || EQUIV_DEFAULT;
  const unit = co2Unit(kg, s.co2Unit, q);
  const rose = !s.scanning && prevLiters !== null && key === prevKey && kg > prevLiters;
  const grew = rose && sceneState.unit !== null && unit !== sceneState.unit && SCENE_LADDER.indexOf(unit) > SCENE_LADDER.indexOf(sceneState.unit);
  if (unit !== sceneState.unit) cancelDrips();
  // Over 20 minutes of idling an hour, the duck is knocked out.
  showScene(unit, sceneCount(kg, unit, q), { lit: kg > 0, grew, ko: (s.rateKg || 0) > q.idleKgPerHour / 3 });
  if (rose && !grew && !REDUCED_MOTION) queueDrips(newEvents(s));
}

function render(s) {
  lastState = s;
  if (prevEmptied !== undefined && s.emptiedAt && s.emptiedAt !== prevEmptied) pour();
  prevEmptied = s.emptiedAt;
  const pouring = Date.now() < pouringUntil;

  const co2 = s.show === 'co2';
  setLook(co2);
  // Litres of water, or kilograms of CO₂.
  const A = co2 ? s.co2 : s.liters;
  const L = A.mid;
  const key = `${s.period}|${s.mode}|${s.method}|${s.emptiedAt}|${s.show}|${s.since}`;
  if (co2) renderScene(s, key, pouring);
  else renderVessel(s, key, pouring);

  updateIce(s.lastAt);
  setBoil(!co2 && iceLevel < 0.05 && !s.scanning ? clamp(((s.busy || 0) - 5) / 10, 0, 1) : 0);
  renderShelf(s.shelf, co2);

  if (s.scanning && L === 0) $('liters').textContent = '…';
  else if (co2) {
    const [n, u] = co2Parts(s.co2.mid);
    $('liters').innerHTML = `${n}<small> ${u}</small>`;
  } else $('liters').textContent = fmtLiters(L);
  if (s.scanning) {
    $('caption').textContent = `reading logs ${s.progress.done}/${s.progress.total}`;
    $('period').textContent = '';
  } else {
    $('caption').textContent =
      co2 && s.equiv ? (L > 0 ? `≈ ${co2Say(L, co2Unit(L, s.co2Unit, s.equiv), s.equiv)}` : 'empty') : caption(L, cur.vessel);
    const rate = co2 ? s.rateKg : s.rate;
    const q = s.equiv || EQUIV_DEFAULT;
    const rateText = co2 ? co2RateSay(rate, co2Unit(L, s.co2Unit, q), q) : fmtRate(rate);
    $('period').innerHTML = `<span class="pt">${esc(s.periodText)}</span>` + (rate > 0 ? `<span class="rate">&nbsp;· ▲ ${rateText}</span>` : '');
  }
  $('hint').textContent = s.hint && !s.scanning ? `⚠ ${fmtTokens(s.hint.tokens)} context · /compact?` : '';
  legend(s, co2);

  prevLiters = L;
  prevReq = s.tokens.req;
  prevKey = key;
}

window.thirsty.onUpdate(render);
window.thirsty.onMove(onMove);
$('info').addEventListener('mouseenter', () => card.classList.add('show-legend'));
$('info').addEventListener('mouseleave', () => card.classList.remove('show-legend'));
$('info').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.thirsty.menu();
});
