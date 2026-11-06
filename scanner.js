// Worker thread: reads Claude Code transcripts (<config dir>/projects/**/*.jsonl),
// counts each API response once, and keeps per-day totals in a local state file.
// After the first pass it only reads bytes appended since last time.
// It only reads files; it never makes network requests.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { energyWh, dayKey } = require('./model');

const { roots, stateFile } = workerData;
const CHUNK = 8 * 1024 * 1024;
const KEEP_KEYS_DAYS = 120; // remember response ids this long (guards against resumed-session copies)
const POLL_MS = 5000;
const RELIST_EVERY = 6; // polls between directory re-listings

let state = load();
let dirty = false;
let lastSave = 0;

function blank() {
  return { v: 1, files: {}, keys: {}, days: {} };
}

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (s && s.v === 1 && s.files && s.keys && s.days) return s;
  } catch {}
  return blank();
}

function save(force) {
  if (!dirty) return;
  const now = Date.now();
  if (!force && now - lastSave < 60000) return;
  const cutoff = Math.floor(now / 864e5) - KEEP_KEYS_DAYS;
  for (const k in state.keys) if (state.keys[k] < cutoff) delete state.keys[k];
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tmp = stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, stateFile);
  dirty = false;
  lastSave = now;
}

function listFiles(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function allFiles() {
  const out = [];
  for (const r of roots) listFiles(r, out);
  return out;
}

function handleLine(line) {
  if (line.indexOf('"usage"') === -1) return false;
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return false;
  }
  if (j.type !== 'assistant') return false;
  const m = j.message;
  const u = m && m.usage;
  if (!u || !m.id) return false;
  const model = String(m.model || '');
  if (!model.startsWith('claude')) return false;

  // One response spans several lines with identical usage: count it once.
  const key = m.id + ':' + (j.requestId || '');
  if (key in state.keys) return false;
  const t = new Date(j.timestamp);
  if (isNaN(t)) return false;
  state.keys[key] = Math.floor(t.getTime() / 864e5);

  const tok = {
    in: u.input_tokens || 0,
    out: u.output_tokens || 0,
    cw: u.cache_creation_input_tokens || 0,
    cr: u.cache_read_input_tokens || 0,
  };
  const k = dayKey(t);
  const d = state.days[k] || (state.days[k] = { in: 0, out: 0, cw: 0, cr: 0, req: 0, wh: 0 });
  d.in += tok.in;
  d.out += tok.out;
  d.cw += tok.cw;
  d.cr += tok.cr;
  d.req += 1;
  d.wh += energyWh(model, tok);
  return true;
}

// Reads new complete lines from a file; returns true if any totals changed.
function processFile(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  const rec = state.files[file] || (state.files[file] = { offset: 0 });
  if (st.size < rec.offset) rec.offset = 0; // file was rewritten; ids already counted are skipped
  if (st.size === rec.offset) return false;

  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return false;
  }
  let changed = false;
  let pos = rec.offset;
  let carry = Buffer.alloc(0);
  try {
    while (pos < st.size) {
      const len = Math.min(CHUNK, st.size - pos);
      const buf = Buffer.allocUnsafe(len);
      const n = fs.readSync(fd, buf, 0, len, pos);
      if (n <= 0) break;
      pos += n;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n);
      const nl = data.lastIndexOf(10);
      if (nl === -1) {
        carry = Buffer.from(data);
        continue;
      }
      const text = data.toString('utf8', 0, nl);
      for (const line of text.split('\n')) if (handleLine(line)) changed = true;
      carry = Buffer.from(data.subarray(nl + 1));
      const next = pos - carry.length;
      if (next !== rec.offset) {
        rec.offset = next;
        dirty = true;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return changed;
}

function post(scanning, progress) {
  parentPort.postMessage({ type: 'days', days: state.days, scanning, progress });
}

const tick = () => new Promise((r) => setImmediate(r));

async function run() {
  let files = allFiles();
  const total = files.length;
  let last = 0;
  for (let i = 0; i < files.length; i++) {
    processFile(files[i]);
    const now = Date.now();
    if (now - last > 400) {
      post(true, { done: i + 1, total });
      last = now;
    }
    await tick();
  }
  post(false, { done: total, total });
  save(true);

  let polls = 0;
  setInterval(() => {
    polls++;
    if (polls % RELIST_EVERY === 0) files = allFiles();
    let changed = false;
    for (const f of files) if (processFile(f)) changed = true;
    if (changed) post(false, null);
    try {
      save(false);
    } catch {}
  }, POLL_MS);
}

parentPort.on('message', (m) => {
  if (m && m.type === 'flush') {
    try {
      save(true);
    } catch {}
    parentPort.postMessage({ type: 'flushed' });
  }
});

run();
