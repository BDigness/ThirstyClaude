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

// ── Vessels: the container grows with the amount ─────────────────────────────
// clip: inside of the vessel; bottom/top: y of zero and of full capacity;
// drip: where drops start; tilt: tips over when emptied.
const VESSELS = {
  tube: {
    clip: 'M66 16 L66 196 A13 13 0 0 0 92 196 L92 16 Z',
    bottom: 208,
    top: 34,
    ticks: { x: 66, label: 60 },
    drip: [79, 2],
    tilt: true,
    behind: '<path d="M66 16 L66 196 A13 13 0 0 0 92 196 L92 16 Z" fill="url(#glassGrad)"/>',
    front: `<path class="glass" d="M61 11 Q64 12 65 16 L65 196 A14 14 0 0 0 93 196 L93 16 Q94 12 97 11"/>
      <ellipse class="glass" cx="79" cy="11.5" rx="18" ry="1.8" stroke-width="1.1"/>
      <rect x="87.5" y="24" width="1.8" height="160" rx="0.9" fill="#fff" opacity="0.13"/>
      <rect class="solid" x="58" y="213" width="42" height="12" rx="3"/>
      <path class="solid" d="M44 225 H114 L119 231 H39 Z" stroke-width="1.1"/>`,
  },
  cylinder: {
    clip: 'M58.5 12 H99.5 V206 Q99.5 208 97.5 208 H60.5 Q58.5 208 58.5 206 Z',
    bottom: 206,
    top: 30,
    ticks: { x: 58, label: 52 },
    drip: [79, 2],
    tilt: true,
    behind: '<rect x="58" y="12" width="42" height="197" fill="url(#glassGrad)"/>',
    front: `<path class="glass" d="M51 9 Q56 10 57 15 L57 206 Q57 209 60 209 L98 209 Q101 209 101 206 L101 15 Q101 11 105 9"/>
      <ellipse class="glass" cx="78" cy="9.5" rx="27" ry="2.4" stroke-width="1.1"/>
      <rect x="94" y="22" width="2.2" height="170" rx="1.1" fill="#fff" opacity="0.13"/>
      <rect class="solid" x="60" y="209" width="38" height="9"/>
      <path class="solid" d="M40 218 H118 L127 231 H31 Z" stroke-width="1.1"/>`,
  },
  tub: {
    clip: 'M17 124 C17 166 27 190 50 192 L88 192 C111 190 121 166 121 124 Z',
    bottom: 190,
    top: 128,
    drip: [30, 84],
    tilt: false,
    behind: '<path d="M17 124 C17 166 27 190 50 192 L88 192 C111 190 121 166 121 124 Z" fill="#fff" fill-opacity="0.05"/>',
    front: `<path class="glass" d="M12 122 C12 170 25 197 50 199 L88 199 C113 197 126 170 126 122" stroke-width="1.6"/>
      <rect class="solid" x="7" y="117" width="124" height="7" rx="3.5"/>
      <path class="solid" d="M33 197 Q31 206 26 210 Q32 213 39 209 Q38 202 41 198 Z"/>
      <path class="solid" d="M105 197 Q107 206 112 210 Q106 213 99 209 Q100 202 97 198 Z"/>
      <path class="glass" d="M4 56 H23 Q30 56 30 63 V79" stroke-width="3.2"/>
      <path class="glass" d="M10 52 V56" stroke-width="2"/>
      <rect class="solid" x="5" y="47" width="10" height="5" rx="2.5"/>`,
  },
  pool: {
    clip: 'M8 104 L8 150 Q8 154 12 154 L58 158 L80 198 Q82 202 86 202 L126 202 Q130 202 130 198 L130 104 Z',
    bottom: 202,
    top: 110,
    drip: [70, 32],
    tilt: false,
    behind: `<path d="M2 104 H136 V214 H2 Z" fill="#fff" fill-opacity="0.035"/>
      <path d="M8 104 L8 150 Q8 154 12 154 L58 158 L80 198 Q82 202 86 202 L126 202 Q130 202 130 198 L130 104 Z" fill="#7cc4ff" fill-opacity="0.06"/>`,
    front: `<path class="glass" d="M8 104 L8 150 Q8 154 12 154 L58 158 L80 198 Q82 202 86 202 L126 202 Q130 202 130 198 L130 104" stroke-width="1.6"/>
      <path class="glass" d="M0 104 H8 M130 104 H138" stroke-width="2.4"/>
      <rect class="solid" x="2" y="97" width="32" height="3" rx="1.5"/>
      <rect class="solid" x="4" y="100" width="5" height="4"/>
      <path class="glass" d="M117 150 V94 Q117 89 121 89 M124 150 V94 Q124 89 128 89" stroke-width="1.4"/>
      <path class="glass" d="M117 108 H124 M117 120 H124 M117 132 H124 M117 144 H124" stroke-width="1"/>
      <path d="M58 30 Q52 30 52 24 Q52 18 59 18 Q61 10 70 10 Q78 10 80 17 Q88 16 88 23 Q88 30 81 30 Z" fill="rgba(214,230,255,0.28)"/>`,
  },
};

function vesselFor(liters) {
  if (liters < 1) return 'tube';
  if (liters < 200) return 'cylinder';
  if (liters < 20000) return 'tub';
  return 'pool';
}

const cur = { vessel: null, cap: null, unit: null };

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
  instant([waterEl, $('bands'), $('range')]);
}

// Wavelength matches the 24px drift animation so the loop is seamless.
function wavePath(amp, len, phase = 0, dy = 0) {
  let d = `M-10 ${dy}`;
  for (let x = -10; x <= 160; x += 2) d += ` L${x} ${(dy + amp * Math.sin((x / len) * 2 * Math.PI + phase)).toFixed(2)}`;
  return d + ' L160 6 L-10 6 Z';
}
$('waveFront').setAttribute('d', wavePath(1.4, 24));
$('waveBack').setAttribute('d', wavePath(1.8, 24, Math.PI, -0.6));

function capacityFor(v) {
  if (v <= 0) return 10;
  const target = v * 1.1;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function drawTicks(v, cap, unit) {
  const g = $('ticks');
  g.textContent = '';
  if (!v.ticks) return;
  const fmtTick = (x) => (cap >= 2000 ? `${+(x / 1000).toFixed(1)}k` : Number.isInteger(x) ? String(x) : x.toFixed(1));
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

function caption(l) {
  const n = (x) => (x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x).toLocaleString('en-US'));
  const say = (x, one, many) => `≈ ${n(x)} ${n(x) === '1' ? one : many}`;
  if (l < 2) return say(l / 0.25, 'glass', 'glasses');
  if (l < 150) return say(l / 10, 'bucket', 'buckets');
  if (l < 50000) return say(l / 150, 'bathtub', 'bathtubs');
  return say(l / 50000, 'backyard pool', 'backyard pools');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ── Water level and project layers ──────────────────────────────────────────
let surfaceY = 206;
let pending = null;
let levelTimer = null;

function applyLevel(y, layers) {
  surfaceY = y;
  waterEl.style.transform = `translateY(${y.toFixed(2)}px)`;
  const v = VESSELS[cur.vessel];
  const H = Math.max(0, v.bottom - y);
  const total = layers.reduce((s, l) => s + l.liters, 0);
  const g = $('bands');
  while (g.childElementCount < layers.length) g.appendChild(el('rect', { x: -10, width: 160 }));
  while (g.childElementCount > layers.length) g.lastChild.remove();
  let top = 0;
  layers.forEach((l, i) => {
    const h = total > 0 ? (H * l.liters) / total : 0;
    const last = i === layers.length - 1;
    const gap = !last && h > 2.5 ? 0.9 : 0; // thin gap between layers
    const r = g.children[i];
    r.style.y = `${top}px`;
    r.style.height = `${Math.max(0, h - gap + (last ? 40 : 0))}px`;
    r.style.fill = l.color;
    top += h;
  });
  const surface = layers.length ? layers[0].color : '#3987e5';
  $('waveFront').style.fill = surface;
  $('waveBack').style.fill = surface;
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
  };
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

// ── Hover legend ────────────────────────────────────────────────────────────
function legend(s) {
  const L = s.liters;
  const items = s.layers
    .map((l) => `<div class="lg-item"><i style="background:${l.color}"></i><span class="nm">${esc(l.name)}</span><span>${fmtLiters(l.liters)}</span></div>`)
    .join('');
  const drops = DROPS.map(([, label, c]) => `<span><b style="color:${c}">●</b>${label}</span>`).join('');
  const method = s.method === 'eco' ? 'EcoLogits estimate' : 'ThirstyClaude estimate';
  const water = s.mode === 'cooling' ? 'cooling only' : 'incl. power plants';
  $('legend').innerHTML = `
    <div class="lg-head">${esc(s.periodLabel)}</div>
    <div class="lg-big">${fmtLiters(L.mid)}</div>
    <div>Likely ${fmtLiters(L.lo)} – ${fmtLiters(L.hi)}</div>
    <div>≈ ${s.kwh.mid < 10 ? s.kwh.mid.toFixed(2) : Math.round(s.kwh.mid).toLocaleString('en-US')} kWh · ${s.tokens.req.toLocaleString('en-US')} responses</div>
    <div>${fmtTokens(s.tokens.in + s.tokens.out + s.tokens.cw + s.tokens.cr)} tokens · ${fmtTokens(s.tokens.out)} output</div>
    ${s.rate > 0 ? `<div>Now ${fmtRate(s.rate)}</div>` : ''}
    <div class="lg-sec">Projects</div>${items || '<div>None yet</div>'}
    <div class="lg-sec">Drops</div><div class="lg-drops">${drops}</div>
    <div class="lg-foot">Small drops are subagents. Band = likely range.<br>${method}, ${water}.</div>`;
}

// ── Render ──────────────────────────────────────────────────────────────────
let lastState = null;
let prevLiters = null;
let prevKey = null;
let prevReq = null;
let prevEmptied; // undefined until the first update arrives
let fadeTimer = null;

function render(s) {
  lastState = s;
  if (prevEmptied !== undefined && s.emptiedAt && s.emptiedAt !== prevEmptied) pour();
  prevEmptied = s.emptiedAt;
  const pouring = Date.now() < pouringUntil;

  const L = s.liters.mid;
  let switched = false;
  if (!pouring || !cur.vessel) {
    const name = vesselFor(L);
    if (name !== cur.vessel) {
      setVessel(name);
      switched = true;
    }
  }
  const v = VESSELS[cur.vessel];
  const unit = cur.vessel === 'tube' ? 'mL' : 'L';
  const k = unit === 'mL' ? 1000 : 1;
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

  const showRange = !s.scanning && !pouring && L > 0 && s.liters.hi > s.liters.lo;
  setRange(showRange, level(s.liters.lo * k), s.liters.hi * k > cur.cap ? v.top - 6 : level(s.liters.hi * k));

  const key = `${s.period}|${s.mode}|${s.method}|${s.emptiedAt}`;
  const rose = !s.scanning && !pouring && !switched && prevLiters !== null && key === prevKey && L > prevLiters;
  if (rose && !REDUCED_MOTION) {
    const events = s.events && s.events.length ? s.events : Array.from({ length: Math.max(1, Math.min(MAX_QUEUED, s.tokens.req - (prevReq ?? s.tokens.req))) }, () => ({ fam: 'opus', sub: false }));
    if (!dripTimer && !levelTimer) setLevel(levelY, s.layers, FORM_MS + fallMs(surfaceY - v.drip[1]));
    else setLevel(levelY, s.layers, 0);
    queueDrips(events);
  } else {
    if (pouring || switched) cancelDrips();
    setLevel(levelY, s.layers, 0);
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

  $('liters').textContent = s.scanning && L === 0 ? '…' : fmtLiters(L);
  if (s.scanning) {
    $('caption').textContent = `reading logs ${s.progress.done}/${s.progress.total}`;
    $('period').textContent = '';
  } else {
    $('caption').textContent = caption(L);
    $('period').innerHTML = esc(s.periodText) + (s.rate > 0 ? ` · <span class="rate">▲ ${fmtRate(s.rate)}</span>` : '');
  }
  legend(s);

  prevLiters = L;
  prevReq = s.tokens.req;
  prevKey = key;
}

window.thirsty.onUpdate(render);
const card = $('card');
$('info').addEventListener('mouseenter', () => card.classList.add('show-legend'));
$('info').addEventListener('mouseleave', () => card.classList.remove('show-legend'));
$('info').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.thirsty.menu();
});
