// ── CO₂ scenes ───────────────────────────────────────────────────────────────
// In CO₂ mode the widget draws the comparison itself instead of a vessel: a
// phone charging, a cigarette burning down, a car idling, a car driving, a tire
// fire, or a small forest. The main object shows progress towards the next
// whole one, and finished ones pile up: charged batteries, butts in the
// ashtray (and empty packs), hours on the clock, tires on the fire, trees.
// Each response sends up a puff, tinted by model.
//
// Loaded before renderer.js and uses its helpers ($, el, mixHex, dropColor…)
// only when called, after both files have loaded.

const SCENE_LADDER = ['phone', 'cigarette', 'idle', 'tire', 'tree']; // automatic order
const SCENE_NAMES = { phone: 'Phone charges', cigarette: 'Cigarettes', idle: 'Car idling', km: 'Driving', tire: 'Tire fire', tree: 'Trees' };
const EQUIV_DEFAULT = { phoneKg: 0.0075, cigaretteKg: 0.014, idleKgPerHour: 1.42, carKgPerKm: 0.244, tireKg: 30.09, treeKgPerYear: 60 };
const SMOKE = '#c3c8cf';
const SOOT = '#5f656e';
const GROUND_Y = 222;

// Repeating puffs, wisps and sparks: n copies of one shape, evenly staggered.
// The motion comes from the .sc-puff keyframes, steered by CSS variables
// (vars can be a function of the copy's index, so a plume can waver).
function loops(n, dur, shape, vars = '') {
  let s = '';
  for (let i = 0; i < n; i++) {
    const v = typeof vars === 'function' ? vars(i) : vars;
    s += shape.replace('/>', ` class="sc-puff" style="--dur:${dur}s;animation-delay:${(-(i * dur) / n).toFixed(2)}s;${v}"/>`);
  }
  return s;
}

// A soft-edged fill in any colour, for the puffs that responses send up.
function softFill(color) {
  const id = `soft${color.slice(1)}`;
  if (!document.getElementById(id)) {
    const g = el('radialGradient', { id });
    [[0, 0.95], [0.55, 0.6], [1, 0]].forEach(([o, a]) => g.appendChild(el('stop', { offset: o, 'stop-color': color, 'stop-opacity': a })));
    document.querySelector('.stage > svg defs').appendChild(g);
  }
  return `url(#${id})`;
}

// One puff for a response: grows (or shrinks), drifts and fades.
function scenePuff(x, y, { color = SMOKE, r = 5, dx = 0, dy = -40, dur = 2200, s = 1, grow = 2.6 } = {}) {
  const p = el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (r * s).toFixed(2), fill: softFill(color) });
  $('sceneFx').appendChild(p);
  p.style.transformBox = 'fill-box';
  p.style.transformOrigin = 'center';
  p.animate(
    [
      { transform: 'translate(0, 0) scale(.4)', opacity: 0 },
      { transform: `translate(${dx * 0.15}px, ${dy * 0.15}px) scale(1)`, opacity: 0.9, offset: 0.15 },
      { transform: `translate(${dx}px, ${dy}px) scale(${grow})`, opacity: 0 },
    ],
    { duration: dur, easing: 'ease-out', fill: 'both' }
  ).onfinish = () => p.remove();
}

const tint = (fam, base = SMOKE) => mixHex(dropColor(fam), base, 0.5);

// ── Tallies: finished ones in centred rows, or one icon and "× N" ───────────
function tally(g, count, o, prev) {
  g.textContent = '';
  if (count <= 0) return;
  const items = [];
  const add = (x, y) => {
    const w = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
    const inner = el('g', {});
    inner.innerHTML = o.icon;
    w.appendChild(inner);
    g.appendChild(w);
    items.push(inner);
  };
  if (count > o.cap) {
    add(o.cx - 12, o.y);
    const t = el('text', { class: 'sc-badge', x: o.cx - 4, y: o.y + 3.5 });
    t.textContent = `× ${fmtCount(count)}`;
    g.appendChild(t);
    return;
  }
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / o.perRow);
    const inRow = Math.min(o.perRow, count - row * o.perRow);
    add(o.cx + ((i % o.perRow) - (inRow - 1) / 2) * o.dx, o.y + row * o.dy);
  }
  if (prev >= 0 && count > prev) items.slice(prev).forEach(popIn);
}

function popIn(n) {
  if (REDUCED_MOTION) return;
  n.style.transformBox = 'fill-box';
  n.style.transformOrigin = 'center';
  n.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 650, easing: 'ease-out' });
}

function badge(g, text, x, y, anchor = 'start') {
  g.textContent = '';
  if (!text) return;
  const t = el('text', { class: 'sc-badge', x, y, 'text-anchor': anchor });
  t.textContent = text;
  g.appendChild(t);
}

// ── Shared pieces ───────────────────────────────────────────────────────────
// A small car, facing right, drawn with its rear wheel's ground point at 0 0.
function car(cls) {
  const wheel = (cx) => `<g transform="translate(${cx} -10)">
      <circle r="9.5" fill="#1b1f27" stroke="#323843" stroke-width="1"/>
      <circle r="4.6" fill="#9aa1ab"/>
      <path class="sc-spokes" d="M0 -4.2 V4.2 M-3.6 -2.1 L3.6 2.1 M-3.6 2.1 L3.6 -2.1" stroke="#5d636d" stroke-width="1.1"/>
      <circle r="1.3" fill="#5d636d"/></g>`;
  return `<g class="${cls}">
    <g class="sc-body">
      <path d="M6 -14 Q2 -14 2 -19 V-30 Q2 -36 8 -37 L18 -38 L30 -54 Q32 -57 36 -57 H62 Q66 -57 69 -54 L82 -38 L92 -36 Q96 -35 96 -29 V-19 Q96 -14 92 -14 Z" fill="#5f87b3"/>
      <path d="M33 -53 H47 V-39 H22 Z" fill="#cfe2f7" fill-opacity="0.55"/>
      <path d="M51 -53 H63 Q65 -53 67 -51 L78 -39 H51 Z" fill="#cfe2f7" fill-opacity="0.55"/>
      <path d="M49 -38 V-16 M2 -21.5 H96" stroke="#3f6189" stroke-width="0.8" fill="none"/>
      <path d="M53 -33 H58" stroke="#3f6189" stroke-width="1.3" stroke-linecap="round"/>
      <ellipse cx="93.6" cy="-30" rx="2.4" ry="2" fill="#ffe39a"/>
      <rect x="1.4" y="-33" width="2.6" height="5" rx="1" fill="#e05a4f"/>
      <rect x="-4" y="-17" width="7" height="3" rx="1" fill="#9aa1ab"/>
      <path d="M7 -14 A13 13 0 0 1 33 -14 Z M63 -14 A13 13 0 0 1 89 -14 Z" fill="#12161d"/>
    </g>
    ${wheel(20)}${wheel(76)}
  </g>`;
}
const CAR_AT = [40, GROUND_Y, 0.9]; // translate x, y and scale for both car scenes
const EXHAUST = [CAR_AT[0] - 4 * CAR_AT[2], CAR_AT[1] - 15.5 * CAR_AT[2]];

// Flames: three tongues in each of three colours, flickering out of step.
function flames(w, h) {
  const tongue = (dx, hh, ww, fill, cls, delay) =>
    `<path class="sc-flame ${cls}" style="animation-delay:${delay.toFixed(2)}s" d="M${(dx - ww / 2).toFixed(1)} 0 C${(dx - ww / 2).toFixed(1)} ${(-hh * 0.45).toFixed(1)} ${(dx - ww * 0.1).toFixed(1)} ${(-hh * 0.62).toFixed(1)} ${dx.toFixed(1)} ${(-hh).toFixed(1)} C${(dx + ww * 0.1).toFixed(1)} ${(-hh * 0.62).toFixed(1)} ${(dx + ww / 2).toFixed(1)} ${(-hh * 0.45).toFixed(1)} ${(dx + ww / 2).toFixed(1)} 0 Z" fill="${fill}"/>`;
  return [
    ['#ff5a1f', 1, 1, 'f1'],
    ['#ff9a2e', 0.72, 0.72, 'f2'],
    ['#ffe07a', 0.42, 0.42, 'f3'],
  ]
    .map(([fill, kh, kw, cls], li) =>
      [-0.3, 0, 0.3].map((p, i) => tongue(p * w * kw, h * kh * [0.72, 1, 0.82][i], w * kw * 0.56, fill, cls, -(i * 0.23 + li * 0.11))).join('')
    )
    .join('');
}

// The cigarette scene is drawn 1.25× about the middle of the ground.
const CIG_K = 1.25;
const CIG_T = `translate(69 ${GROUND_Y}) scale(${CIG_K}) translate(-69 ${-GROUND_Y})`;
const cigPoint = ([x, y]) => [69 + (x - 69) * CIG_K, GROUND_Y + (y - GROUND_Y) * CIG_K];

// ── The scenes ──────────────────────────────────────────────────────────────
// svg: drawn once when the scene appears. init: finds the parts that change.
// update(n): n is how many (charges, cigarettes, hours, km, tires, trees).
// event(e): a response arrived. emit: where its puff starts.
const SCENES = {
  // A phone on a stand, charging from a little power plant.
  phone: {
    zzz: [74, 60],
    svg: `
      <g class="sc-tally"></g>
      <rect class="solid" x="117" y="164" width="8" height="40"/>
      <path class="solid" d="M96 222 V196 L105 190 V196 L114 190 V196 L123 190 V222 Z"/>
      <rect x="100" y="203" width="5" height="5" rx="1" fill="#f6d65b" fill-opacity="0.5"/>
      <rect x="109" y="203" width="5" height="5" rx="1" fill="#f6d65b" fill-opacity="0.5"/>
      <g transform="translate(121 162)"><g class="sc-live"><g class="sc-lean">${loops(12, 4.2, '<circle r="4.6" fill="url(#scPuff)"/>', (i) => `--dx:${-6 - (i % 3) * 4}px;--dy:-58px;--grow:3;--op:.8`)}</g></g></g>
      <path d="M96 216 C86 216 82 220 70 220" fill="none" stroke="#c9ced6" stroke-width="1.6" stroke-linecap="round"/>
      <ellipse class="solid" cx="50" cy="220" rx="24" ry="2.6"/>
      <rect class="solid" x="45.5" y="160" width="9" height="60" rx="2"/>
      <rect x="28" y="64" width="44" height="94" rx="7" fill="#262c35" stroke="var(--glass)" stroke-width="1.2"/>
      <rect x="31.5" y="72" width="37" height="80" rx="3" fill="#0f141b"/>
      <rect x="44" y="67.4" width="12" height="1.6" rx="0.8" fill="var(--glass)" opacity="0.6"/>
      <rect class="solid" x="26" y="155" width="48" height="7" rx="2.5"/>
      <rect x="46" y="86" width="8" height="3" rx="1" fill="#dfe6ee"/>
      <rect x="41" y="89" width="18" height="36" rx="3" fill="none" stroke="#dfe6ee" stroke-width="1.4"/>
      <rect class="sc-batt" x="43.5" y="91.5" width="13" height="31" rx="1.5" fill="#5cc27a"/>
      <g class="sc-live"><path class="sc-bolt" d="M51.6 96 L45.2 108.4 H49.6 L48.2 119.5 L54.8 106.6 H50.4 Z" fill="#fff"/></g>
      <text class="sc-pct" x="50" y="140" text-anchor="middle">0%</text>`,
    init(a, r) {
      r.tally = a.querySelector('.sc-tally');
      r.batt = a.querySelector('.sc-batt');
      r.pct = a.querySelector('.sc-pct');
    },
    update(n, r, prev) {
      const whole = Math.floor(n);
      const frac = n - whole;
      r.batt.style.transform = `scaleY(${frac.toFixed(3)})`;
      r.pct.textContent = `${Math.floor(frac * 100)}%`;
      if (whole !== r.whole) {
        tally(r.tally, whole, { cx: 50, y: 26, dx: 11, dy: 19, perRow: 5, cap: 10, icon: BATTERY_ICON }, prev ? r.whole : -1);
        r.whole = whole;
      }
    },
    event(e, s) {
      scenePuff(121, 160, { color: tint(e.fam), s, dx: -8, dy: -44 });
      const zap = el('path', { d: 'M96 216 C86 216 82 220 70 220 H50 V122', fill: 'none', stroke: '#ffe27a', 'stroke-width': 2.2 * s, 'stroke-linecap': 'round' });
      $('sceneFx').appendChild(zap);
      const len = zap.getTotalLength();
      zap.style.strokeDasharray = `6 ${len}`;
      zap.animate([{ strokeDashoffset: 6 }, { strokeDashoffset: -len }], { duration: 750, easing: 'ease-in' }).onfinish = () => zap.remove();
    },
  },

  // A cigarette burning down on a glass ashtray; butts pile up, every 20 make an empty pack.
  cigarette: {
    zzz: [104, 150],
    svg: `
      <g class="sc-tally"></g>
      <g transform="${CIG_T}">
      <ellipse class="solid" cx="69" cy="198" rx="50" ry="8"/>
      <ellipse cx="69" cy="198.6" rx="40" ry="5" fill="#0b0e13" fill-opacity="0.6"/>
      <g class="sc-butts"></g>
      <path class="solid" d="M19 198 A50 8 0 0 0 119 198 L116 210 Q115 214 110 214 H28 Q23 214 22 210 Z"/>
      <path class="solid" d="M19 198 A50 8 0 0 0 119 198 L109 198.6 A40 5 0 0 1 29 198.6 Z"/>
      <g transform="translate(121 193) rotate(5)">
        <rect class="sc-paper" x="-80" y="-3" width="60.5" height="6" fill="#eceff3"/>
        <rect x="-20" y="-3" width="20" height="6" rx="1.2" fill="#d39a54"/>
        <rect x="-21" y="-3" width="1.6" height="6" fill="#e2c38f"/>
        <circle cx="-15" cy="-1" r="0.5" fill="#a8743a"/><circle cx="-9" cy="1.2" r="0.5" fill="#a8743a"/><circle cx="-4" cy="-0.8" r="0.5" fill="#a8743a"/>
        <g class="sc-tip">
          <rect x="-4.6" y="-2.8" width="5" height="5.6" rx="1.6" fill="#8f949b"/>
          <rect class="sc-ember" x="-0.4" y="-3" width="1.8" height="6" rx="0.6" fill="#ff6a2b"/>
          <g class="sc-live"><circle class="sc-glow" cx="0" cy="0" r="7.5" fill="url(#scGlow)"/></g>
        </g>
      </g>
      <g class="sc-wisps"><g class="sc-live"><g class="sc-lean"><path d="M0 0 c-1.6 -4 1.6 -7 0 -12 c-1.6 -4 1.6 -7 0 -12" fill="none" stroke="#dde1e6" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/>${loops(5, 5, '<path d="M0 0 c-3 -6 3 -10 0 -16 c-3 -6 3 -10 0 -16 c-3 -6 3 -10 0 -16" fill="none" stroke="#dde1e6" stroke-width="1.2" stroke-linecap="round"/>', (i) => `--dx:${3 + (i % 2) * 4}px;--dy:-62px;--grow:1.45;--op:.85;--s0:.75;--origin:50% 100%`)}</g></g></g>
      </g>`,
    init(a, r) {
      r.tally = a.querySelector('.sc-tally');
      r.butts = a.querySelector('.sc-butts');
      r.paper = a.querySelector('.sc-paper');
      r.tip = a.querySelector('.sc-tip');
      r.wisps = a.querySelector('.sc-wisps');
    },
    update(n, r, prev) {
      const whole = Math.floor(n);
      const P = 60 * (1 - (n - whole)); // paper left
      r.paper.style.x = `${-20 - P}px`;
      r.paper.style.width = `${P + 0.5}px`;
      r.tip.style.transform = `translateX(${(-20 - P).toFixed(2)}px)`;
      // The smoke rises straight up from wherever the tip is.
      const d = 20 + P + 2;
      const a = (5 * Math.PI) / 180;
      r.emit = [121 - d * Math.cos(a), 193 - d * Math.sin(a) - 2];
      r.wisps.style.transform = `translate(${r.emit[0].toFixed(2)}px, ${r.emit[1].toFixed(2)}px)`;
      if (whole !== r.whole) {
        const old = r.whole >= 0 && prev ? r.whole % 20 : -1;
        const butts = whole % 20;
        r.butts.textContent = '';
        BUTTS.slice(0, butts).forEach(([x, y, rot], i) => {
          const g = el('g', { transform: `translate(${69 + x} ${199 + y}) rotate(${rot})` });
          const inner = el('g', {});
          inner.innerHTML = BUTT_ICON;
          g.appendChild(inner);
          r.butts.appendChild(g);
          if (old >= 0 && i >= old && butts > old) popIn(inner);
        });
        tally(r.tally, Math.floor(whole / 20), { cx: 69, y: 34, dx: 17, dy: 22, perRow: 6, cap: 6, icon: PACK_ICON }, prev && r.whole >= 0 ? Math.floor(r.whole / 20) : -1);
        r.whole = whole;
      }
    },
    event(e, s, r) {
      const [x, y] = cigPoint(r.emit || [65, 186]);
      scenePuff(x, y - 2, { color: tint(e.fam), s, dx: 6, dy: -48, dur: 2600 });
      const glow = $('sceneArt').querySelector('.sc-glow');
      if (glow) glow.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-out' });
    },
  },

  // A car idling, puffing exhaust; the clock fills with each hour, full hours above it.
  idle: {
    zzz: [118, 150],
    svg: `
      <g class="sc-tally"></g>
      <g transform="translate(69 100)">
        <circle r="27" class="solid"/>
        <circle class="sc-wedge" r="10.5" fill="none" stroke="#e8a33d" stroke-opacity="0.5" stroke-width="21" transform="rotate(-90)" stroke-dasharray="0 66"/>
        ${Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          const r0 = i % 3 ? 22 : 19.5;
          return `<line x1="${(r0 * Math.sin(a)).toFixed(2)}" y1="${(-r0 * Math.cos(a)).toFixed(2)}" x2="${(24.5 * Math.sin(a)).toFixed(2)}" y2="${(-24.5 * Math.cos(a)).toFixed(2)}" stroke="var(--glass)" stroke-width="${i % 3 ? 0.8 : 1.3}"/>`;
        }).join('')}
        <line class="sc-hand" x1="0" y1="0" x2="0" y2="-19" stroke="#eaf1fb" stroke-width="1.6" stroke-linecap="round"/>
        <circle r="2" fill="#eaf1fb"/>
      </g>
      <g transform="translate(${CAR_AT[0]} ${CAR_AT[1]}) scale(${CAR_AT[2]})">${car('sc-idle')}</g>
      <g transform="translate(${EXHAUST[0]} ${EXHAUST[1]})"><g class="sc-live"><g class="sc-lean">${loops(10, 2.8, '<circle r="4" fill="url(#scPuff)"/>', (i) => `--dx:${-18 - (i % 3) * 5}px;--dy:${-26 - (i % 2) * 8}px;--grow:2.8;--op:.85`)}</g></g></g>`,
    init(a, r) {
      r.tally = a.querySelector('.sc-tally');
      r.wedge = a.querySelector('.sc-wedge');
      r.hand = a.querySelector('.sc-hand');
    },
    update(n, r, prev) {
      const whole = Math.floor(n);
      const frac = n - whole;
      const C = 2 * Math.PI * 10.5;
      r.wedge.style.strokeDasharray = `${(C * frac).toFixed(2)} ${C.toFixed(2)}`;
      // Turn forwards only: past the hour, carry on round instead of winding back.
      const deg = whole * 360 + frac * 360;
      r.hand.style.transform = `rotate(${deg.toFixed(1)}deg)`;
      if (whole !== r.whole) {
        tally(r.tally, whole, { cx: 69, y: 26, dx: 9.6, dy: 11, perRow: 12, cap: 24, icon: CLOCK_ICON }, prev ? r.whole : -1);
        r.whole = whole;
      }
    },
    event(e, s) {
      scenePuff(EXHAUST[0] - 1, EXHAUST[1], { color: tint(e.fam), s: s * 1.2, dx: -24, dy: -34 });
      const body = $('sceneArt').querySelector('.sc-body');
      if (body) body.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1.4px)' }, { transform: 'translateY(0)' }], { duration: 260 });
    },
  },

  // A car driving down the road; the odometer counts the km.
  km: {
    zzz: [118, 150],
    svg: `
      <g transform="translate(69 98)">
        <rect x="-45" y="-14" width="90" height="28" rx="5" fill="#0f141b" stroke="var(--glass)" stroke-width="1"/>
        ${Array.from({ length: 6 }, (_, i) => {
          const tenth = i === 5;
          const digits = Array.from({ length: 10 }, (_, d) => `<text x="6" y="${13.5 + d * 18}" text-anchor="middle">${d}</text>`).join('');
          return `<svg x="${-41 + i * 13.6}" y="-9" width="12" height="18" overflow="hidden"><rect width="12" height="18" rx="1.5" fill="${tenth ? '#e9ecef' : '#1d232c'}"/><g class="sc-roll${tenth ? ' tenth' : ''}">${digits}</g></svg>`;
        }).join('')}
        <text class="sc-unit" x="0" y="27" text-anchor="middle">km</text>
      </g>
      <rect x="-2" y="222" width="142" height="9" fill="#262b33"/>
      <path class="sc-road" d="M-2 226.5 H140" stroke="#c9ced6" stroke-opacity="0.7" stroke-width="1.1" stroke-dasharray="8 8"/>
      <g class="sc-live sc-speed"><path d="M12 178 H26"/><path d="M6 190 H22" style="animation-delay:-.2s"/><path d="M14 200 H28" style="animation-delay:-.4s"/></g>
      <g transform="translate(${CAR_AT[0]} ${CAR_AT[1]}) scale(${CAR_AT[2]})">${car('sc-drive')}</g>
      <g transform="translate(${EXHAUST[0]} ${EXHAUST[1]})"><g class="sc-live">${loops(8, 1.3, '<circle r="3.6" fill="url(#scPuff)"/>', (i) => `--dx:-38px;--dy:${-4 - (i % 3) * 3}px;--grow:2.4;--op:.8`)}</g></g>`,
    init(a, r) {
      r.rolls = [...a.querySelectorAll('.sc-roll')];
    },
    update(n, r) {
      const tenths = Math.min(Math.floor(n * 10), 999999);
      const digits = String(tenths).padStart(6, '0').split('');
      r.rolls.forEach((g, i) => (g.style.transform = `translateY(${-18 * +digits[i]}px)`));
    },
    event(e, s) {
      scenePuff(EXHAUST[0] - 1, EXHAUST[1], { color: tint(e.fam), s: s * 1.2, dx: -40, dy: -10, dur: 1500 });
    },
  },

  // Tires stacked on a fire, with black smoke; more tires, more stacks.
  tire: {
    zzz: [108, 120],
    svg: `
      <g class="sc-live"><ellipse cx="69" cy="222" rx="62" ry="6" fill="url(#scGlow)" opacity="0.45"/></g>
      <g class="sc-stacks"></g>
      <g class="sc-more"></g>`,
    init(a, r) {
      r.stacks = a.querySelector('.sc-stacks');
      r.more = a.querySelector('.sc-more');
    },
    update(n, r) {
      const N = Math.max(1, Math.round(n));
      const shown = Math.min(N, 21);
      const small = n < 1 ? 0.35 + 0.65 * n : 1; // under one tire: a smaller fire
      const key = `${shown}|${small.toFixed(2)}`;
      if (key === r.key) return;
      r.key = key;
      const k = shown <= 7 ? 1 : shown <= 14 ? 2 : 3;
      const w = k === 1 ? 58 : k === 2 ? 46 : 40;
      const xs = k === 1 ? [69] : k === 2 ? [44, 94] : [24, 69, 114];
      const per = xs.map((_, i) => Math.floor(shown / k) + (i < shown % k ? 1 : 0));
      if (k === 3) per.sort((a, b) => b - a).splice(1, 0, per.shift()); // tallest in the middle
      r.emits = [];
      r.stacks.innerHTML = xs.map((cx, i) => tireStack(cx, per[i], w, (26 + 3 * per[i]) * small, r)).join('');
      badge(r.more, N > 21 ? `+${fmtCount(N - 21)} more` : '', 6, 14);
    },
    event(e, s, r) {
      const [x, y] = (r.emits || [[69, 150]])[Math.floor(Math.random() * (r.emits || [0]).length)];
      scenePuff(x, y, { color: tint(e.fam, SOOT), s: s * 1.4, dx: 10, dy: -Math.max(30, y - 20), dur: 2800 });
    },
  },

  // Trees soaking up CO₂ in the sun; one more sapling grows towards each next tree.
  tree: {
    zzz: [112, 70],
    svg: `
      <g class="sc-live"><circle cx="112" cy="36" r="16" fill="url(#scGlow)" opacity="0.8"/></g>
      <circle cx="112" cy="36" r="8.5" fill="#f6c445"/>
      <g class="sc-live">${Array.from({ length: 7 }, (_, i) => `<g transform="translate(${14 + ((i * 53) % 104)} ${18 + ((i * 29) % 40)})">${loops(1, 6, '<circle r="1.8" fill="#d5d9df"/>', `--dx:${(i % 3) * 4 - 4}px;--dy:110px;--grow:.5;--op:.9;--s0:1;animation-delay:${(-i * 0.86).toFixed(2)}s`)}</g>`).join('')}</g>
      <path d="M4 222.5 H134" stroke="#4c9a57" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round"/>
      <g class="sc-forest"></g>
      <g class="sc-more"></g>`,
    init(a, r) {
      r.forest = a.querySelector('.sc-forest');
      r.more = a.querySelector('.sc-more');
    },
    update(n, r) {
      const whole = Math.floor(n);
      const shown = Math.min(whole, TREE_SLOTS.length);
      const grow = shown < TREE_SLOTS.length ? n - whole : 0;
      if (shown !== r.shown) {
        r.shown = shown;
        const slots = TREE_SLOTS.map((p, i) => [...p, i]).slice(0, shown + 1);
        slots.sort((a, b) => a[1] - b[1]); // back rows first
        r.forest.innerHTML = slots
          .map(([x, y, k, i]) =>
            i < shown
              ? `<g transform="translate(${x} ${y}) scale(${k})">${treeSvg(i)}</g>`
              : `<g transform="translate(${x} ${y}) scale(${k})"><g class="sc-sapling">${treeSvg(i, true)}</g></g>`
          )
          .join('');
        r.crowns = TREE_SLOTS.slice(0, shown).map(([x, y, k]) => [x, y - 28 * k]);
        badge(r.more, whole > TREE_SLOTS.length ? `+${fmtCount(whole - TREE_SLOTS.length)} more` : '', 6, 14);
      }
      const sap = r.forest.querySelector('.sc-sapling');
      if (sap) sap.style.transform = `scale(${(0.15 + 0.85 * grow).toFixed(3)})`;
    },
    event(e, s, r) {
      const crowns = r.crowns && r.crowns.length ? r.crowns : [[69, 190]];
      const [x, y] = crowns[Math.floor(Math.random() * crowns.length)];
      const x0 = 14 + Math.random() * 100;
      scenePuff(x0, 12, { color: tint(e.fam), s: s * 1.3, dx: x - x0, dy: y - 12, dur: 2600, grow: 0.3 });
    },
  },
};

const BATTERY_ICON = `<rect x="-1.6" y="-8.6" width="3.2" height="2" rx="0.6" fill="#dfe6ee"/><rect x="-4" y="-6.5" width="8" height="13" rx="1.6" fill="none" stroke="#dfe6ee" stroke-width="1"/><rect x="-2.5" y="-5" width="5" height="10" rx="0.8" fill="#5cc27a"/>`;
const CLOCK_ICON = `<circle r="3.7" fill="none" stroke="#dfe6ee" stroke-width="0.9"/><path d="M0 0 V-2.5 M0 0 H1.9" stroke="#dfe6ee" stroke-width="0.8" stroke-linecap="round"/>`;
const PACK_ICON = `<rect x="-6" y="-8" width="12" height="16" rx="1.2" fill="#e9ecef"/><rect x="-6" y="-1" width="12" height="5" fill="#b5524a"/><path d="M-6 -4.6 H6" stroke="#9aa1ab" stroke-width="0.7"/>`;
const BUTT_ICON = `<rect x="-5.5" y="-1.5" width="7" height="3" rx="1.2" fill="#d39a54"/><rect x="1.4" y="-1.5" width="3.2" height="3" fill="#e9ecef"/><rect x="4.4" y="-1.5" width="1.5" height="3" rx="0.6" fill="#7d8188"/>`;
// Where butts land in the ashtray (x, y offsets and angle): the pile builds up.
const BUTTS = [
  [-24, 0, -20], [20, 1, 25], [-8, 0.5, -40], [6, 0, 15], [-30, -0.5, 30], [30, -0.3, -15], [-16, -1.5, 10],
  [12, -1.8, -30], [0, -1.2, 40], [-24, -2.6, -5], [24, -2.8, 20], [-6, -3.2, -25], [16, -3.6, 5], [-14, -4.4, 35],
  [4, -4.8, -10], [-28, -3.6, 15], [28, -3.5, -35], [-2, -6, 20], [10, -6.4, -20],
];

function tireStack(cx, count, w, h, r) {
  let s = '';
  for (let i = 0; i < count; i++) {
    s += `<g transform="translate(${cx} ${GROUND_Y - i * 10.5})">
      <rect x="${-w / 2}" y="-12" width="${w}" height="12" rx="5.5" fill="#2a2e35" stroke="#474d57" stroke-width="0.8"/>
      <path d="M${-w / 2 + 4} -6 H${w / 2 - 4}" stroke="#3b414a" stroke-width="2.6" stroke-dasharray="2.4 2"/></g>`;
  }
  const top = GROUND_Y - (count - 1) * 10.5 - 12;
  r.emits.push([cx, top - h * 0.8]);
  return `${s}
    <ellipse cx="${cx}" cy="${top}" rx="${w / 2 - 1}" ry="3.4" fill="#23272d" stroke="#474d57" stroke-width="0.8"/>
    <g class="sc-live"><ellipse cx="${cx}" cy="${top}" rx="${w / 4}" ry="1.8" fill="#ff8a2a" fill-opacity="0.6"/></g>
    <g transform="translate(${cx} ${top + 1.5})"><g class="sc-live"><g class="sc-lean">
      ${loops(16, 5, `<circle cy="${(-h * 0.8).toFixed(1)}" r="${(w / 6).toFixed(1)}" fill="url(#scSoot)"/>`, (i) => `--dx:${6 + (i % 4) * 5}px;--dy:${(-Math.max(30, top - h - 4)).toFixed(0)}px;--grow:${(2.6 + (i % 3) * 0.4).toFixed(1)};--op:.9`)}
      ${flames(w * 0.8, h)}
      ${[-6, 4, -2, 7].map((dx, i) => `<circle cy="${(-h * 0.35).toFixed(1)}" cx="${dx}" r="0.9" fill="#ffb347" class="sc-puff" style="--dur:1.7s;animation-delay:${(-i * 0.42).toFixed(2)}s;--dx:${dx}px;--dy:${(-h * 0.9).toFixed(0)}px;--grow:.5;--op:1;--s0:1"/>`).join('')}
    </g></g></g>`;
}

// Forest slots, filled in this order: front row, then middle, back and far rows.
const TREE_SLOTS = [
  [69, 222, 1.35], [30, 222, 1.35], [108, 222, 1.35],
  [50, 205, 1.05], [88, 205, 1.05], [14, 205, 1.05], [124, 205, 1.05],
  [69, 190, 0.82], [32, 190, 0.82], [106, 190, 0.82], [50, 190, 0.82], [88, 190, 0.82],
  [60, 178, 0.64], [78, 178, 0.64], [24, 178, 0.64], [42, 178, 0.64], [96, 178, 0.64], [114, 178, 0.64], [8, 178, 0.64], [130, 178, 0.64],
];

function treeSvg(i, young) {
  const c = young ? ['#5aa765', '#6cb86f', '#8ccf8f'] : ['#3f8a4d', '#4f9d5b', '#66b36f'];
  return `<rect x="-2" y="-16" width="4" height="16.5" rx="1" fill="#8b6b4b"/>
    <g class="sc-crown" style="animation-delay:${(-i * 0.7).toFixed(1)}s">
      <circle cx="0" cy="-30" r="13" fill="${c[0]}"/>
      <circle cx="-6.5" cy="-23.5" r="8.5" fill="${c[1]}"/>
      <circle cx="6.5" cy="-24.5" r="9" fill="${c[1]}"/>
      <circle cx="-3" cy="-34" r="6" fill="${c[2]}"/>
    </g>`;
}

// ── Showing a scene ─────────────────────────────────────────────────────────
const sceneState = { unit: null, r: {} };

// unit: which scene; n: how many; lit: false when there's nothing yet, so
// nothing is burning; grew: the automatic choice just moved up the ladder.
function showScene(unit, n, { lit = true, grew = false } = {}) {
  const def = SCENES[unit] || SCENES.cigarette;
  const art = $('sceneArt');
  if (unit !== sceneState.unit) {
    const from = sceneState.unit;
    if (grew && from) sceneLevelUp(from, unit);
    $('sceneFx').textContent = '';
    art.innerHTML = def.svg + `<text class="sc-zzz" x="${def.zzz[0]}" y="${def.zzz[1]}">z z z</text>`;
    sceneState.unit = unit;
    sceneState.r = { whole: -1 };
    def.init(art, sceneState.r);
    def.update(Math.max(0, n), sceneState.r, false);
  } else {
    def.update(Math.max(0, n), sceneState.r, true);
  }
  art.classList.toggle('sc-off', !lit);
}

function sceneEvent(e) {
  const def = SCENES[sceneState.unit];
  if (!def || $('sceneArt').classList.contains('sc-off')) return;
  def.event(e, e.sub ? 0.65 : 1, sceneState.r);
  sound(e.sub);
}

// Moving up a step: the old scene shrinks away and the new one grows in.
function sceneLevelUp(from, to) {
  if (REDUCED_MOTION) return;
  const art = $('sceneArt');
  const ghost = art.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  ghost.style.transformOrigin = '69px 200px';
  $('scene').insertBefore(ghost, art);
  ghost.animate(
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'translate(-12px, -70px) scale(.45)', opacity: 0.5, offset: 0.6 },
      { transform: 'translate(-16px, -90px) scale(.3)', opacity: 0 },
    ],
    { duration: 1000, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }
  ).onfinish = () => ghost.remove();
  art.animate(
    [
      { transform: 'scale(.85)', opacity: 0 },
      { transform: 'scale(.85)', opacity: 0, offset: 0.35 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: 1400, easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
  const b = $('levelup');
  b.textContent = `${SCENE_NAMES[from]} → ${SCENE_NAMES[to]}`;
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), 2600);
  setTimeout(chime, 500);
}

// How many of `unit` the amount comes to (hours for idling).
function sceneCount(kg, unit, q) {
  const each = co2Units(q || EQUIV_DEFAULT)[unit][0];
  return each > 0 ? kg / each : 0;
}
