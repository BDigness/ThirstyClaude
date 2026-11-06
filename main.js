const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { liters, dayKey, L_PER_KWH } = require('./model');

// --demo         shows made-up numbers instead of reading your logs
// --snapshot=f   renders once, saves f (PNG) and a JSON summary next to it, then exits
const arg = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const DEMO = Boolean(arg('demo'));
const SNAPSHOT = (arg('snapshot') || '').split('=').slice(1).join('=') || null;

// Local-only app: keep Chromium's background networking off.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

const BASE = { w: 150, h: 330 };
const SIZES = { small: 0.8, medium: 1, large: 1.3 };
const PERIODS = [
  ['today', 'Today'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['all', 'All time'],
];
const DEFAULTS = { period: 'all', mode: 'allIn', size: 'medium', alwaysOnTop: true, visible: true, x: null, y: null };
const LOGIN_LABEL = process.platform === 'darwin' ? 'Open at login' : 'Start with Windows';

let win = null;
let tray = null;
let worker = null;
let settings = { ...DEFAULTS };
let days = {};
let scanning = true;
let progress = { done: 0, total: 0 };
let quitting = false;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const stateFile = () => path.join(app.getPath('userData'), 'state.json');

// Where Claude Code keeps its session logs.
function logRoots() {
  const roots = [path.join(os.homedir(), '.claude', 'projects'), path.join(os.homedir(), '.config', 'claude', 'projects')];
  for (const dir of (process.env.CLAUDE_CONFIG_DIR || '').split(',')) {
    if (dir.trim()) roots.push(path.join(dir.trim(), 'projects'));
  }
  return [...new Set(roots)];
}

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
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
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function totals(period = settings.period) {
  const now = new Date();
  const from =
    period === 'today' ? dayKey(now)
    : period === 'week' ? dayKey(addDays(now, -6))
    : period === 'month' ? dayKey(addDays(now, -29))
    : null;
  const t = { in: 0, out: 0, cw: 0, cr: 0, req: 0, wh: 0 };
  for (const k in days) {
    if (from && k < from) continue;
    for (const f in t) t[f] += days[k][f] || 0;
  }
  return { ...t, tokens: t.in + t.out + t.cw + t.cr, liters: liters(t.wh, settings.mode) };
}

function fmtLiters(l) {
  if (l < 1) return `${Math.round(l * 1000)} mL`;
  if (l < 10) return `${l.toFixed(1)} L`;
  return `${Math.round(l).toLocaleString('en-US')} L`;
}

function push() {
  const t = totals();
  const label = PERIODS.find(([id]) => id === settings.period)[1];
  if (tray) tray.setToolTip(`ThirstyClaude: ${fmtLiters(t.liters)} (${label.toLowerCase()})`);
  if (win && !win.isDestroyed()) {
    win.webContents.send('update', {
      totals: t,
      period: settings.period,
      periodLabel: label,
      mode: settings.mode,
      lPerKwh: L_PER_KWH[settings.mode],
      scanning,
      progress,
    });
  }
}

// Made-up history for --demo (used for the README screenshot).
function demoDays() {
  const out = {};
  const now = new Date();
  for (let i = 0; i < 45; i++) {
    const wh = 2500 + 2000 * Math.abs(Math.sin(i * 1.7));
    out[dayKey(addDays(now, -i))] = {
      in: 9000,
      out: Math.round(wh * 180),
      cw: Math.round(wh * 1300),
      cr: Math.round(wh * 80000),
      req: Math.round(wh / 3.8),
      wh,
    };
  }
  return out;
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
  saveSettings();
  const z = zoom();
  win.setBounds({ width: Math.round(BASE.w * z), height: Math.round(BASE.h * z) });
  win.webContents.setZoomFactor(z);
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
    { label: 'Show cylinder', type: 'checkbox', checked: win.isVisible(), click: toggleVisible },
    { type: 'separator' },
    {
      label: 'Period',
      submenu: PERIODS.map(([id, label]) => ({
        label,
        type: 'radio',
        checked: settings.period === id,
        click: () => set({ period: id }),
      })),
    },
    {
      label: 'Water counted',
      submenu: [
        { label: 'Including power plants (~3 L/kWh)', type: 'radio', checked: settings.mode === 'allIn', click: () => set({ mode: 'allIn' }) },
        { label: 'Data-center cooling only (~0.5 L/kWh)', type: 'radio', checked: settings.mode === 'cooling', click: () => set({ mode: 'cooling' }) },
      ],
    },
    {
      label: 'Size',
      submenu: Object.keys(SIZES).map((s) => ({
        label: s[0].toUpperCase() + s.slice(1),
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
    workerData: { roots: logRoots(), stateFile: stateFile() },
  });
  worker.on('message', (m) => {
    if (m.type === 'days') {
      days = m.days;
      if (m.progress) progress = m.progress;
      const finished = scanning && !m.scanning;
      scanning = m.scanning;
      push();
      if (finished && SNAPSHOT) setTimeout(snapshot, 2500);
    } else if (m.type === 'flushed' && quitting) {
      app.exit(0);
    }
  });
  worker.on('error', (e) => console.error('scanner error:', e));
}

function startDemo() {
  days = demoDays();
  scanning = false;
  progress = { done: 1, total: 1 };
  push();
  if (SNAPSHOT) setTimeout(snapshot, 2500);
}

async function snapshot() {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(SNAPSHOT, img.toPNG());
  fs.writeFileSync(SNAPSHOT.replace(/\.png$/i, '') + '.json', JSON.stringify({ allTime: totals('all'), days: Object.keys(days).length }, null, 2));
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
  app.on('second-instance', () => {
    if (win) {
      win.showInactive();
      set({ visible: true });
    }
  });
  app.whenReady().then(() => {
    // Refuse every request that isn't a local file, and every permission prompt.
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !details.url.startsWith('file:') }));
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    settings = loadSettings();
    createWindow();
    if (!SNAPSHOT) {
      tray = new Tray(trayIcon());
      tray.on('click', toggleVisible);
      tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
    }
    ipcMain.on('menu', () => buildMenu().popup({ window: win }));
    if (DEMO) startDemo();
    else startWorker();
    setInterval(push, 60000); // keeps "Today" correct across midnight
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}
