const NS = 'http://www.w3.org/2000/svg';
const BOTTOM = 206; // y of the zero mark
const FULL_Y = 30; // y of the top graduation
const CENTER_X = 79;

const $ = (id) => document.getElementById(id);
const waterEl = $('water');

let curCap = null;
let curUnit = null;
let prevLiters = null;
let prevKey = null;
let prevReq = null;
let prevEmptied; // undefined until the first update arrives
let pouringUntil = 0;
let lastState = null;
let fadeTimer = null;

// Wavelength matches the 24px drift animation so the loop is seamless.
function wavePath(amp, len, phase = 0, dy = 0) {
  let d = `M30 ${dy}`;
  for (let x = 30; x <= 140; x += 2) d += ` L${x} ${(dy + amp * Math.sin((x / len) * 2 * Math.PI + phase)).toFixed(2)}`;
  return d + ' L140 6 L30 6 Z';
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

function fmtTick(x, cap) {
  if (cap >= 2000) return `${+(x / 1000).toFixed(1)}k`;
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

function drawTicks(cap, unit) {
  const g = $('ticks');
  g.textContent = '';
  for (let i = 1; i <= 20; i++) {
    const y = BOTTOM - ((BOTTOM - FULL_Y) * i) / 20;
    const major = i % 4 === 0;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('class', 'tick');
    line.setAttribute('x1', '58');
    line.setAttribute('x2', String(58 + (major ? 11 : 5)));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    g.appendChild(line);
    if (major) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'label');
      t.setAttribute('x', '52');
      t.setAttribute('y', (y + 3).toFixed(1));
      t.setAttribute('text-anchor', 'end');
      t.textContent = fmtTick((cap * i) / 20, cap);
      g.appendChild(t);
    }
  }
  const u = document.createElementNS(NS, 'text');
  u.setAttribute('class', 'label');
  u.setAttribute('x', '52');
  u.setAttribute('y', String(FULL_Y - 12));
  u.setAttribute('text-anchor', 'end');
  u.textContent = unit;
  g.appendChild(u);
  curCap = cap;
  curUnit = unit;
}

function fmtLiters(l) {
  if (l < 1) return `${Math.round(l * 1000)} mL`;
  if (l < 10) return `${l.toFixed(1)} L`;
  return `${Math.round(l).toLocaleString('en-US')} L`;
}

function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

// ── Drips: one per API response, forming at the rim, falling, then splashing ──
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FORM_MS = 320;
const DRIP_GAP_MS = 450;
const MAX_QUEUED = 8;

let surfaceY = BOTTOM; // where the water surface is drawn right now
let pendingY = null;
let levelTimer = null;
let dripsQueued = 0;
let dripTimer = null;

const fallMs = (y) => 520 + 680 * Math.sqrt(Math.max(y - 4, 10) / 190);

function applyLevel(y) {
  surfaceY = y;
  waterEl.style.transform = `translateY(${y.toFixed(2)}px)`;
}

// Moves the surface now, or after `delay` ms (so it rises when the first drop lands).
function setLevel(y, delay) {
  if (delay > 0 || levelTimer) {
    pendingY = y;
    if (!levelTimer) {
      levelTimer = setTimeout(() => {
        levelTimer = null;
        applyLevel(pendingY);
        pendingY = null;
      }, delay);
    }
    return;
  }
  applyLevel(y);
}

function cancelDrips() {
  clearTimeout(levelTimer);
  levelTimer = null;
  pendingY = null;
  clearTimeout(dripTimer);
  dripTimer = null;
  dripsQueued = 0;
}

function queueDrips(n) {
  dripsQueued = Math.min(dripsQueued + n, MAX_QUEUED);
  if (!dripTimer) nextDrip();
}

function nextDrip() {
  if (dripsQueued <= 0) {
    dripTimer = null;
    return;
  }
  dripsQueued--;
  drip(surfaceY);
  dripTimer = setTimeout(nextDrip, DRIP_GAP_MS);
}

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function drip(y) {
  const drop = el('path', { d: 'M0 -8 C2.6 -4 3.9 -1.3 0 2 C-3.9 -1.3 -2.6 -4 0 -8Z', fill: '#8fd6ff' });
  drop.style.opacity = '0';
  $('drops').appendChild(drop);
  const fall = fallMs(y);
  const total = FORM_MS + fall;
  const a = drop.animate(
    [
      { transform: `translate(${CENTER_X}px, 3px) scale(0.2)`, opacity: 0, easing: 'ease-out' },
      { transform: `translate(${CENTER_X}px, 4px) scale(1)`, opacity: 1, offset: FORM_MS / total, easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: `translate(${CENTER_X}px, ${y - 3}px) scale(0.85, 1.3)`, opacity: 1 },
    ],
    { duration: total, fill: 'both' }
  );
  a.onfinish = () => {
    drop.remove();
    splash(y);
  };
}

function splash(y) {
  const ripple = el('ellipse', { class: 'ripple', cx: CENTER_X, cy: y, rx: 2, ry: 0.8, fill: 'none', stroke: '#c4e9ff', 'stroke-width': 0.6 });
  $('drops').appendChild(ripple);
  ripple.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(9, 3)', opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () =>
    ripple.remove();
  for (const dx of [-1, 1]) {
    const bead = el('circle', { r: 1.1, fill: '#bfe6ff' });
    $('drops').appendChild(bead);
    bead.animate(
      [
        { transform: `translate(${CENTER_X}px, ${y}px)`, opacity: 0.95, easing: 'ease-out' },
        { transform: `translate(${CENTER_X + dx * 5}px, ${y - 7}px)`, opacity: 0.9, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${CENTER_X + dx * 8}px, ${y - 1}px)`, opacity: 0 },
      ],
      { duration: 520, fill: 'both' }
    ).onfinish = () => bead.remove();
  }
}

// Tips the cylinder and spills the water out; the level drains to zero meanwhile.
function pour() {
  pouringUntil = Date.now() + 1600;
  cancelDrips();
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
    const drop = document.createElementNS(NS, 'path');
    drop.setAttribute('d', 'M0 -4 C1.4 -2 2 -0.7 0 1 C-2 -0.7 -1.4 -2 0 -4Z');
    drop.setAttribute('fill', '#8fd6ff');
    drop.style.opacity = '0';
    $('spill').appendChild(drop);
    const x0 = 13 + Math.random() * 4;
    const x1 = 6 + Math.random() * 10;
    const a = drop.animate(
      [
        { transform: `translate(${x0}px, 18px)`, opacity: 0.95 },
        { transform: `translate(${x1}px, 214px)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 200, delay: 380 + i * 110, easing: 'cubic-bezier(.5,0,1,1)', fill: 'both' }
    );
    a.onfinish = () => drop.remove();
  }
  setTimeout(() => lastState && render(lastState), 1650);
}

function render(s) {
  lastState = s;
  if (prevEmptied !== undefined && s.emptiedAt && s.emptiedAt !== prevEmptied) pour();
  prevEmptied = s.emptiedAt;
  const pouring = Date.now() < pouringUntil;

  const L = s.totals.liters;
  const small = L < 1;
  const unit = small ? 'mL' : 'L';
  const v = small ? L * 1000 : L;
  const cap = capacityFor(v);
  // Keep the old scale while the water drains, then switch.
  if (!pouring && (cap !== curCap || unit !== curUnit)) drawTicks(cap, unit);

  const levelY = pouring ? BOTTOM : BOTTOM - (BOTTOM - FULL_Y) * Math.min(v / cap, 1);
  const key = `${s.period}|${s.mode}|${s.emptiedAt}`;
  const rose = !s.scanning && !pouring && prevLiters !== null && key === prevKey && L > prevLiters;
  if (rose && !REDUCED_MOTION) {
    // One drip per new response; the surface rises when the first drop lands.
    const responses = Math.max(1, s.totals.req - (prevReq ?? s.totals.req));
    if (!dripTimer && !levelTimer) setLevel(levelY, FORM_MS + fallMs(surfaceY));
    else setLevel(levelY, 0);
    queueDrips(responses);
  } else {
    if (pouring) cancelDrips();
    setLevel(levelY, 0);
  }
  if (v > 0 && !pouring) {
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
  $('sub').textContent = s.scanning
    ? `reading logs ${s.progress.done}/${s.progress.total}`
    : `${fmtTokens(s.totals.tokens)} tokens · ${s.periodText}`;

  const t = s.totals;
  $('info').title = [
    `${s.periodLabel}: ≈ ${(t.wh / 1000).toFixed(t.wh < 10000 ? 2 : 0)} kWh · ${t.req.toLocaleString('en-US')} requests`,
    `Output ${fmtTokens(t.out)} · Cache reads ${fmtTokens(t.cr)}`,
    `Cache writes ${fmtTokens(t.cw)} · Input ${fmtTokens(t.in)}`,
    s.mode === 'allIn'
      ? `Water incl. power plants (~${s.lPerKwh} L/kWh)`
      : `Data-center cooling only (~${s.lPerKwh} L/kWh)`,
    'Rough estimate. Right-click for options.',
  ].join('\n');

  prevLiters = L;
  prevReq = s.totals.req;
  prevKey = key;
}

window.thirsty.onUpdate(render);
$('info').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.thirsty.menu();
});
