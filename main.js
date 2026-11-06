const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { estimate, collect, snapshot: tareSnapshot, familyOf, dayKey, addDays, zero, addTok } = require('./model');

// --empty        empties the cylinder (also works while ThirstyClaude is already running)
// --demo         shows made-up numbers instead of reading your logs
// --snapshot=f   renders once, saves f (PNG) and a JSON summary next to it, then exits
const arg = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const DEMO = Boolean(arg('demo'));
const EMPTY_ON_START = Boolean(arg('empty'));
const SNAPSHOT = (arg('snapshot') || '').split('=').slice(1).join('=') || null;
// --period=today|week|month|all   start on that period (handy with --demo)
const PERIOD_ARG = (arg('period') || '').split('=')[1] || null;
// --size=tiny|small|medium|large|xl|huge   --vessel=auto|tube|cylinder|tub|pool
const SIZE_ARG = (arg('size') || '').split('=')[1] || null;
const VESSEL_ARG = (arg('vessel') || '').split('=')[1] || null;

// Local-only app: keep Chromium's background networking off.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

const BASE = { w: 160, h: 334 };
// Project layers and "Other" (validated categorical palette for the dark card).
const LAYER_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const OTHER_COLOR = '#6b7280';
const RATE_WINDOW_MS = 10 * 60 * 1000;
const SIZES = { tiny: 0.6, small: 0.8, medium: 1, large: 1.3, xl: 1.6, huge: 2 };
const SIZE_LABELS = { tiny: 'Tiny', small: 'Small', medium: 'Medium', large: 'Large', xl: 'Extra large', huge: 'Huge' };
const VESSELS = [
  ['auto', 'Automatic (grows with the amount)'],
  ['tube', 'Test tube'],
  ['glass', 'Drinking glass'],
  ['cylinder', 'Graduated cylinder'],
  ['bucket', 'Bucket'],
  ['barrel', 'Rain barrel'],
  ['tub', 'Bathtub'],
  ['hottub', 'Hot tub'],
  ['pool', 'Swimming pool'],
];
const PERIODS = [
  ['today', 'Today'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['all', 'All time'],
  ['since', 'Since emptied'],
];
const DEFAULTS = {
  period: 'all',
  mode: 'allIn',
  size: 'medium',
  alwaysOnTop: true,
  visible: true,
  x: null,
  y: null,
  vessel: 'auto', // or a fixed one: tube, cylinder, tub, pool
  method: 'tc', // 'tc' = ThirstyClaude estimate, 'eco' = EcoLogits
  includeCodex: true,
  colors: {}, // project name -> layer colour slot, so colours follow the project
  tare: null, // all-time totals at the moment the cylinder was last emptied
  emptiedAt: null,
};
const LOGIN_LABEL = process.platform === 'darwin' ? 'Open at login' : 'Start with Windows';

let win = null;
let tray = null;
let worker = null;
let settings = { ...DEFAULTS };
let days = {};
let scanning = true;
let progress = { done: 0, total: 0 };
let quitting = false;
let pendingEmpty = EMPTY_ON_START;
let recent = []; // responses from the last hour, for the flow rate
let vessel = 'cylinder'; // what the widget currently shows (reported by the page)
const EMPTY_LABELS = {
  tube: 'Empty test tube',
  glass: 'Empty glass',
  cylinder: 'Empty cylinder',
  bucket: 'Empty bucket',
  barrel: 'Drain rain barrel',
  tub: 'Drain bathtub',
  hottub: 'Drain hot tub',
  pool: 'Drain pool',
};

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const stateFile = () => path.join(app.getPath('userData'), 'state.json');

// Where Claude Code and Codex keep their session logs.
function claudeRoots() {
  const roots = [path.join(os.homedir(), '.claude', 'projects'), path.join(os.homedir(), '.config', 'claude', 'projects')];
  for (const dir of (process.env.CLAUDE_CONFIG_DIR || '').split(',')) {
    if (dir.trim()) roots.push(path.join(dir.trim(), 'projects'));
  }
  return [...new Set(roots)];
}

function codexRoots() {
  const homes = [path.join(os.homedir(), '.codex')];
  if (process.env.CODEX_HOME) homes.unshift(process.env.CODEX_HOME);
  const roots = [];
  for (const h of homes) roots.push(path.join(h, 'sessions'), path.join(h, 'archived_sessions'));
  return [...new Set(roots)];
}

function loadSettings() {
  let s;
  try {
    s = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    s = { ...DEFAULTS };
  }
  if (s.tare && s.tare.v !== 2) {
    // Snapshot from an older version: it can't be subtracted from the new totals.
    s.tare = null;
    s.emptiedAt = null;
    if (s.period === 'since') s.period = 'all';
  }
  s.colors = s.colors || {};
  return s;
}

function saveSettings() {
  if (SNAPSHOT || DEMO) return;
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch {}
}

function set(patch) {
  Object.assign(settings, patch);
  saveSettings();
  push();
}

// ── Totals ──────────────────────────────────────────────────────────────────
// Everything the widget shows for the current period, method and water mode.
function view(period = settings.period) {
  const c = collect(days, { period, tare: settings.tare && settings.tare.data, codex: settings.includeCodex });
  const est = estimate(c.total, settings.method, settings.mode);
  const projects = Object.keys(c.projects)
    .map((name) => ({ name, liters: estimate(c.projects[name], settings.method, settings.mode).l.mid }))
    .filter((p) => p.liters > 0)
    .sort((a, b) => b.liters - a.liters);
  const top = projects.slice(0, LAYER_COLORS.length);
  const rest = projects.slice(LAYER_COLORS.length);

  // Colour follows the project: keep its slot unless a larger project already holds it.
  // While the logs are still loading the ranking keeps shifting, so nothing is kept yet.
  const keep = !scanning;
  const used = new Set();
  let assigned = false;
  for (const p of top) {
    const slot = keep ? settings.colors[p.name] : null;
    if (slot != null && slot < LAYER_COLORS.length && !used.has(slot)) {
      p.slot = slot;
      used.add(slot);
    }
  }
  for (const p of top) {
    if (p.slot != null) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    p.slot = slot;
    used.add(slot);
    if (keep) {
      settings.colors[p.name] = slot;
      assigned = true;
    }
  }
  if (assigned) saveSettings();
  const layers = top.map((p) => ({ name: p.name, liters: p.liters, color: LAYER_COLORS[p.slot] }));
  if (rest.length) {
    layers.push({ name: `Other (${rest.length})`, liters: rest.reduce((s, p) => s + p.liters, 0), color: OTHER_COLOR, other: true });
  }

  // Flow rate: the last 10 minutes, scaled to an hour.
  const cutoff = Date.now() - RATE_WINDOW_MS;
  const fresh = {};
  for (const r of recent) {
    if (r.t < cutoff || (!settings.includeCodex && r.src === 'codex')) continue;
    addTok(fresh[r.fam] || (fresh[r.fam] = zero()), { ...r.tok, req: 1 });
  }
  const rate = estimate(fresh, settings.method, settings.mode).l.mid * (3600000 / RATE_WINDOW_MS);
  return { est, layers, rate };
}

// Empties the cylinder: the view restarts from zero, the real totals keep counting.
function empty() {
  if (scanning) {
    pendingEmpty = true; // wait until the logs are read, or the snapshot would be partial
    return;
  }
  pendingEmpty = false;
  set({ tare: { v: 2, data: tareSnapshot(days) }, emptiedAt: Date.now(), period: 'since' });
}

function sinceText(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return dayKey(d) === dayKey(new Date()) ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function periodLabels() {
  if (settings.period === 'since' && settings.emptiedAt) {
    const when = sinceText(settings.emptiedAt);
    return { label: `Since ${when}`, text: `since ${when}` };
  }
  const label = PERIODS.find(([id]) => id === settings.period)[1];
  return { label, text: label.toLowerCase() };
}

function fmtLiters(l) {
  if (l < 1) return `${Math.round(l * 1000)} mL`;
  if (l < 10) return `${l.toFixed(1)} L`;
  return `${Math.round(l).toLocaleString('en-US')} L`;
}

function push(events = []) {
  const { est, layers, rate } = view();
  const { label, text } = periodLabels();
  if (tray) tray.setToolTip(`ThirstyClaude: ${fmtLiters(est.l.mid)} (${text})`);
  if (win && !win.isDestroyed()) {
    win.webContents.send('update', {
      liters: est.l,
      kwh: { lo: est.wh.lo / 1000, mid: est.wh.mid / 1000, hi: est.wh.hi / 1000 },
      tokens: est.tokens,
      layers,
      rate,
      period: settings.period,
      periodLabel: label,
      periodText: text,
      emptiedAt: settings.emptiedAt,
      mode: settings.mode,
      method: settings.method,
      vessel: settings.vessel,
      scanning,
      progress,
      events: events.filter((e) => settings.includeCodex || e.src !== 'codex'),
    });
  }
}

// ── Demo (made-up projects and usage, used for the README screenshot) ───────
const DEMO_PROJECTS = [
  ['web-app', 1],
  ['api', 0.6],
  ['ml-pipeline', 0.4],
  ['docs', 0.22],
  ['scripts', 0.12],
  ['infra', 0.07],
  ['blog', 0.05],
];
const DEMO_MIX = [
  ['claude', 'claude-opus-5-5', 0.62],
  ['claude', 'claude-sonnet-5-5', 0.22],
  ['claude', 'claude-haiku-5-5', 0.08],
  ['codex', 'gpt-5.4', 0.08],
];

// Tokens that come to about `wh` Wh for an Opus-class model.
function demoTokens(wh) {
  return { in: Math.round(wh * 40), out: Math.round(wh * 180), cw: Math.round(wh * 1300), cr: Math.round(wh * 80000), req: Math.max(1, Math.round(wh / 3.6)) };
}

function demoAdd(t, src, project, model, tok) {
  const k = dayKey(t);
  const day = days[k] || (days[k] = {});
  const sp = `${src}|${project}`;
  const byFam = day[sp] || (day[sp] = {});
  addTok(byFam[familyOf(model)] || (byFam[familyOf(model)] = zero()), tok);
}

function demoDays() {
  days = {};
  const now = new Date();
  for (let i = 0; i < 45; i++) {
    const dayWh = 2500 + 2000 * Math.abs(Math.sin(i * 1.7));
    for (const [project, weight] of DEMO_PROJECTS) {
      for (const [src, model, share] of DEMO_MIX) {
        const wh = (dayWh * weight * share) / 2.5;
        if (wh > 1) demoAdd(addDays(now, -i), src, project, model, demoTokens(wh));
      }
    }
  }
  return days;
}

function pick(items) {
  let r = Math.random() * items.reduce((s, x) => s + x[x.length - 1], 0);
  for (const x of items) if ((r -= x[x.length - 1]) <= 0) return x;
  return items[0];
}

// ── Window ──────────────────────────────────────────────────────────────────
function position(w, h) {
  const { x, y } = settings;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const wa = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
    const visible = x + w > wa.x + 20 && x < wa.x + wa.width - 20 && y + h > wa.y + 20 && y < wa.y + wa.height - 20;
    if (visible) return { x, y };
  }
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - w - 24, y: wa.y + wa.height - h - 24 };
}

function zoom() {
  return SIZES[settings.size] || 1;
}

function createWindow() {
  const z = zoom();
  const w = Math.round(BASE.w * z);
  const h = Math.round(BASE.h * z);
  const pos = position(w, h);
  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: w,
    height: h,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      zoomFactor: z,
    },
  });
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  if (SNAPSHOT) win.setIgnoreMouseEvents(true); // a hovering mouse would open the legend
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    if (settings.visible || SNAPSHOT) win.showInactive();
  });
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoom());
    push();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Window position while it's being dragged, so the water can slosh.
  win.on('move', () => {
    if (!win.isDestroyed()) win.webContents.send('pos', win.getPosition());
  });
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    settings.x = x;
    settings.y = y;
    saveSettings();
  });
  // Right-click on the draggable area arrives as a system menu request.
  win.on('system-context-menu', (e) => {
    e.preventDefault();
    buildMenu().popup({ window: win });
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function setSize(size) {
  settings.size = size;
  const z = zoom();
  const w = Math.round(BASE.w * z);
  const h = Math.round(BASE.h * z);
  // Keep the whole widget on screen when it grows.
  const [x, y] = win.getPosition();
  const wa = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  const nx = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
  const ny = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));
  win.setBounds({ x: nx, y: ny, width: w, height: h });
  win.webContents.setZoomFactor(z);
  settings.x = nx;
  settings.y = ny;
  saveSettings();
}

function toggleVisible() {
  if (win.isVisible()) win.hide();
  else win.showInactive();
  set({ visible: win.isVisible() });
}

// ── Tray + menu ─────────────────────────────────────────────────────────────
function loginOpts() {
  return { path: process.execPath, args: [app.getAppPath()] };
}

function buildMenu() {
  const login =
    process.platform === 'linux'
      ? []
      : [
          {
            label: LOGIN_LABEL,
            type: 'checkbox',
            checked: app.getLoginItemSettings(loginOpts()).openAtLogin,
            click: (item) => app.setLoginItemSettings({ ...loginOpts(), openAtLogin: item.checked }),
          },
        ];
  return Menu.buildFromTemplate([
    { label: 'Show widget', type: 'checkbox', checked: win.isVisible(), click: toggleVisible },
    { label: EMPTY_LABELS[vessel] || 'Empty', enabled: !scanning, click: empty },
    { type: 'separator' },
    {
      label: 'Period',
      submenu: PERIODS.filter(([id]) => id !== 'since' || settings.emptiedAt).map(([id, label]) => ({
        label,
        type: 'radio',
        checked: settings.period === id,
        click: () => set({ period: id }),
      })),
    },
    {
      label: 'Estimate',
      submenu: [
        { label: 'ThirstyClaude (all token types)', type: 'radio', checked: settings.method === 'tc', click: () => set({ method: 'tc' }) },
        { label: 'EcoLogits (output tokens)', type: 'radio', checked: settings.method === 'eco', click: () => set({ method: 'eco' }) },
      ],
    },
    {
      label: 'Water counted',
      submenu: [
        { label: 'Including power plants', type: 'radio', checked: settings.mode === 'allIn', click: () => set({ mode: 'allIn' }) },
        { label: 'Data-center cooling only', type: 'radio', checked: settings.mode === 'cooling', click: () => set({ mode: 'cooling' }) },
      ],
    },
    { label: 'Include Codex', type: 'checkbox', checked: settings.includeCodex, click: (item) => set({ includeCodex: item.checked }) },
    {
      label: 'Vessel',
      submenu: VESSELS.map(([id, label], i) => [
        { label, type: 'radio', checked: settings.vessel === id, click: () => set({ vessel: id }) },
        ...(i === 0 ? [{ type: 'separator' }] : []),
      ]).flat(),
    },
    {
      label: 'Size',
      submenu: Object.keys(SIZES).map((s) => ({
        label: `${SIZE_LABELS[s]} (${Math.round(SIZES[s] * 100)}%)`,
        type: 'radio',
        checked: settings.size === s,
        click: () => setSize(s),
      })),
    },
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => {
        set({ alwaysOnTop: item.checked });
        win.setAlwaysOnTop(item.checked, 'floating');
      },
    },
    ...login,
    { type: 'separator' },
    { label: 'Quit', click: quit },
  ]);
}

function trayIcon() {
  const S = 32;
  const buf = Buffer.alloc(S * S * 4);
  const px = (x, y, [r, g, b]) => {
    const i = (y * S + x) * 4;
    buf[i] = b;
    buf[i + 1] = g;
    buf[i + 2] = r;
    buf[i + 3] = 255;
  };
  const glass = [226, 236, 250];
  const water = [64, 164, 255];
  const base = [170, 196, 232];
  for (let y = 12; y <= 25; y++) for (let x = 12; x <= 19; x++) px(x, y, water);
  for (let y = 3; y <= 26; y++) for (const x of [10, 11, 20, 21]) px(x, y, glass);
  for (let x = 10; x <= 21; x++) px(x, 26, glass);
  for (const x of [8, 9, 22, 23]) px(x, 3, glass);
  for (let x = 8; x <= 23; x++) px(x, 27, base);
  for (let y = 28; y <= 29; y++) for (let x = 5; x <= 26; x++) px(x, y, base);
  return nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 2 });
}

// ── Log scanner ─────────────────────────────────────────────────────────────
function startWorker() {
  worker = new Worker(path.join(__dirname, 'scanner.js'), {
    workerData: { claudeRoots: claudeRoots(), codexRoots: codexRoots(), stateFile: stateFile() },
  });
  worker.on('message', (m) => {
    if (m.type === 'days') {
      days = m.days;
      recent = m.recent || recent;
      if (m.progress) progress = m.progress;
      const finished = scanning && !m.scanning;
      scanning = m.scanning;
      push(m.events || []);
      if (finished && pendingEmpty) empty();
      if (finished && SNAPSHOT) setTimeout(snapshot, EMPTY_ON_START ? 7000 : 2500);
    } else if (m.type === 'flushed' && quitting) {
      app.exit(0);
    }
  });
  worker.on('error', (e) => console.error('scanner error:', e));
}

function demoResponse(t) {
  const [project] = pick(DEMO_PROJECTS);
  const [src, model] = pick(DEMO_MIX);
  const tok = demoTokens(2 + Math.random() * 5);
  tok.req = 1;
  demoAdd(t, src, project, model, tok);
  recent.push({ t: t.getTime(), src, project, fam: familyOf(model), tok });
  return { src, fam: familyOf(model), sub: Math.random() < 0.3 };
}

function startDemo() {
  demoDays();
  for (let i = 0; i < 40; i++) demoResponse(new Date(Date.now() - Math.random() * RATE_WINDOW_MS));
  scanning = false;
  progress = { done: 1, total: 1 };
  push();
  if (pendingEmpty) empty();
  // Made-up responses every couple of seconds, so the drips and refill can be seen.
  setInterval(() => {
    const n = 1 + Math.floor(Math.random() * 3);
    const events = [];
    for (let i = 0; i < n; i++) events.push(demoResponse(new Date()));
    push(events);
  }, 2500);
  if (SNAPSHOT) setTimeout(snapshot, EMPTY_ON_START ? 7000 : 2500);
}

async function snapshot() {
  if (arg('legend')) {
    await win.webContents.executeJavaScript("document.getElementById('card').classList.add('show-legend')");
    await new Promise((r) => setTimeout(r, 300));
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(SNAPSHOT, img.toPNG());
  const all = view('all');
  const summary = {
    allTime: { liters: all.est.l, kwh: all.est.wh.mid / 1000, tokens: all.est.tokens },
    layers: all.layers,
    rate: all.rate,
    days: Object.keys(days).length,
    vessel,
    caption: await win.webContents.executeJavaScript("document.getElementById('caption').textContent"),
    menu: buildMenu().items.map((i) => i.label).filter(Boolean),
  };
  fs.writeFileSync(SNAPSHOT.replace(/\.png$/i, '') + '.json', JSON.stringify(summary, null, 2));
  quit();
}

function quit() {
  if (quitting) return;
  quitting = true;
  if (!worker) return app.exit(0);
  worker.postMessage({ type: 'flush' });
  setTimeout(() => app.exit(0), 4000);
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
if (!SNAPSHOT && !DEMO && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      win.showInactive();
      set({ visible: true });
    }
    if (argv.includes('--empty')) empty();
  });
  app.whenReady().then(() => {
    // Refuse every request that isn't a local file, and every permission prompt.
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !details.url.startsWith('file:') }));
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    settings = DEMO ? { ...DEFAULTS, colors: {} } : loadSettings();
    if (PERIOD_ARG && PERIODS.some(([id]) => id === PERIOD_ARG && id !== 'since')) settings.period = PERIOD_ARG;
    if (SIZE_ARG && SIZES[SIZE_ARG]) settings.size = SIZE_ARG;
    if (VESSEL_ARG && VESSELS.some(([id]) => id === VESSEL_ARG)) settings.vessel = VESSEL_ARG;
    if (!SIZES[settings.size]) settings.size = 'medium';
    if (!VESSELS.some(([id]) => id === settings.vessel)) settings.vessel = 'auto';
    createWindow();
    if (!SNAPSHOT) {
      tray = new Tray(trayIcon());
      tray.on('click', toggleVisible);
      tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
    }
    ipcMain.on('menu', () => buildMenu().popup({ window: win }));
    ipcMain.on('vessel', (_e, name) => {
      if (EMPTY_LABELS[name]) vessel = name;
    });
    if (DEMO) startDemo();
    else startWorker();
    setInterval(() => push(), 20000); // keeps the flow rate and "Today" current
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}
