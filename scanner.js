// Worker thread: reads Claude Code and Codex session logs, counts each API
// response once, and keeps per-day token totals by project and model family in
// a local state file. After the first pass it only reads what changed.
// It only reads files; it never makes network requests.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { familyOf, dayKey, zero, addTok } = require('./model');
const { readLines, claudeUsage } = require('./logread');

let fzstd = null; // decompresses finished Codex sessions (.jsonl.zst)
try {
  fzstd = require('fzstd');
} catch {}

const { claudeRoots, codexRoots, stateFile } = workerData;
const VERSION = 2;
const KEEP_KEYS_DAYS = 120; // remember response ids this long (guards against resumed-session copies)
const POLL_MS = 5000;
const RELIST_EVERY = 6; // polls between directory re-listings
const RECENT_MS = 60 * 60 * 1000; // responses kept for the flow rate
const EVENT_MS = 2 * 60 * 1000; // responses this fresh become drops
const KEEP_SESSIONS_MS = 30 * 864e5; // per-session totals kept this long
const BACKFILL_MS = 3 * 864e5; // on upgrade, rebuild sessions from logs this recent

let state = load();
let dirty = false;
let lastSave = 0;
let scanning = true;
let recent = []; // { t, src, project, fam, tok }
let events = []; // { src, fam, sub, sid }
let bf = null; // while backfilling sessions: { seen, totals }

function blank() {
  return { v: VERSION, files: {}, keys: {}, codex: {}, days: {}, sessions: {} };
}

let needBackfill = false;

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (s && s.v === VERSION && s.files && s.keys && s.codex && s.days) {
      if (!s.sessions) {
        s.sessions = {}; // added in 2.4: rebuilt from recent logs on first run
        needBackfill = true;
      }
      return s;
    }
  } catch {}
  return blank(); // older format: rebuild from the logs
}

function save(force) {
  if (!dirty) return;
  const now = Date.now();
  if (!force && now - lastSave < 60000) return;
  const cutoff = Math.floor(now / 864e5) - KEEP_KEYS_DAYS;
  for (const k in state.keys) if (state.keys[k] < cutoff) delete state.keys[k];
  for (const id in state.sessions) if (state.sessions[id].last < now - KEEP_SESSIONS_MS) delete state.sessions[id];
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tmp = stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, stateFile);
  dirty = false;
  lastSave = now;
}

const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';

// Project folder name. A subagent's throwaway worktree
// (<repo>/.claude/worktrees/agent-1a2b3c…) counts as its repo; named worktrees keep their name.
function projectOf(cwd) {
  const parts = String(cwd || '').split(/[\\/]/).filter(Boolean);
  const n = parts.length;
  if (n >= 4 && parts[n - 2] === 'worktrees' && parts[n - 3] === '.claude' && /^agent-[0-9a-f]{6,}$/.test(parts[n - 1])) return parts[n - 4];
  return parts.pop() || '';
}

// Per-session totals, for the "This session" period and the context-size hint.
// ctx is the context size of a main-thread response (null for subagents).
function addSession(sid, t, src, project, fam, tok, ctx) {
  if (!sid) return;
  const ms = t.getTime();
  const s = state.sessions[sid] || (state.sessions[sid] = { src, project, start: ms, last: ms, fams: {} });
  if (ms < s.start) s.start = ms;
  if (ms > s.last) s.last = ms;
  if (!s.main && (!s.project || s.project === 'unknown')) s.project = project;
  addTok(s.fams[fam] || (s.fams[fam] = zero()), { ...tok, req: 1 });
  if (ctx != null && ms >= (s.ctxAt || 0)) {
    s.ctx = ctx;
    s.ctxAt = ms;
    s.project = project; // named after where the main conversation is now, not a subagent
    s.main = true;
  }
}

// Records one API response.
function add(t, src, project, model, tok, sub, sid, ctx) {
  const fam = familyOf(model);
  addSession(sid, t, src, project || 'unknown', fam, tok, ctx);
  dirty = true;
  if (bf) return; // backfilling sessions only: days already counted
  const day = state.days[dayKey(t)] || (state.days[dayKey(t)] = {});
  const sp = `${src}|${project || 'unknown'}`;
  const byFam = day[sp] || (day[sp] = {});
  const a = byFam[fam] || (byFam[fam] = { in: 0, out: 0, cw: 0, cr: 0, req: 0 });
  a.in += tok.in;
  a.out += tok.out;
  a.cw += tok.cw;
  a.cr += tok.cr;
  a.req += 1;
  dirty = true;
  const age = Date.now() - t.getTime();
  if (age < RECENT_MS) recent.push({ t: t.getTime(), src, project, fam, tok, sid });
  if (!scanning && age < EVENT_MS) events.push({ src, fam, sub: Boolean(sub), sid });
}

// ── Claude Code ─────────────────────────────────────────────────────────────
function claudeLine(line, file) {
  const r = claudeUsage(line);
  if (!r) return false;
  const { j, model, key, tok } = r;

  // One response spans several lines with identical usage: count it once.
  const t = new Date(j.timestamp);
  if (isNaN(t)) return false;
  if (bf) {
    if (bf.seen.has(key)) return false;
    bf.seen.add(key);
  } else {
    if (key in state.keys) return false;
    state.keys[key] = Math.floor(t.getTime() / 864e5);
  }

  const sub = j.isSidechain === true || file.includes(`${path.sep}subagents${path.sep}`);
  const inSub = file.includes(`${path.sep}subagents${path.sep}`);
  const sid = j.sessionId || (inSub ? baseName(path.dirname(path.dirname(file))) : path.basename(file, '.jsonl'));
  add(t, 'claude', projectOf(j.cwd) || baseName(path.dirname(file)), model, tok, sub, sid, sub ? null : tok.in + tok.cw + tok.cr);
  return true;
}

// ── Codex ───────────────────────────────────────────────────────────────────
// Each session (thread) logs running totals (token_count); every increase is one
// response. The per-response token_usage_record lines are not used: they cover
// only part of the usage that the totals include.
function codexTokens(u) {
  const cached = u.cached_input_tokens || 0;
  const cw = u.cache_write_input_tokens || 0;
  return { in: Math.max(0, (u.input_tokens || 0) - cached - cw), out: u.output_tokens || 0, cw, cr: cached };
}

function codexLine(line, ctx) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return false;
  }
  const p = j.payload || {};
  if (j.type === 'session_meta') {
    ctx.session = p.id || p.session_id || ctx.session;
    ctx.cwd = p.cwd || ctx.cwd;
    ctx.sub = Boolean(p.parent_thread_id);
    ctx.parent = p.parent_thread_id || null;
    return false;
  }
  if (j.type === 'turn_context') {
    if (p.model) ctx.model = p.model;
    if (p.cwd) ctx.cwd = p.cwd;
    return false;
  }
  const t = new Date(j.timestamp);
  if (isNaN(t)) return false;
  const sess = ctx.session || ctx.file;
  const totals = bf ? bf.totals : state.codex;
  const rec = totals[sess] || (totals[sess] = { total: null });

  if (j.type === 'event_msg' && p.type === 'token_count' && p.info && p.info.total_token_usage) {
    const cur = p.info.total_token_usage;
    const prev = rec.total;
    if (prev && (cur.total_tokens || 0) <= (prev.total_tokens || 0)) return false;
    let u = cur;
    if (prev) {
      u = {};
      for (const f of ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'total_tokens']) u[f] = (cur[f] || 0) - (prev[f] || 0);
      if (Object.values(u).some((v) => v < 0)) u = p.info.last_token_usage || {};
    }
    rec.total = cur;
    const last = p.info.last_token_usage;
    const size = !ctx.sub && last ? last.input_tokens || 0 : null;
    add(t, 'codex', baseName(ctx.cwd), ctx.model || 'gpt', codexTokens(u), ctx.sub, ctx.parent || ctx.session || ctx.file, size);
    return true;
  }
  return false;
}

// ── File reading ────────────────────────────────────────────────────────────
const isCodex = (file) => codexRoots.some((r) => file.startsWith(r));

// Codex files carry a context object (session id, model, folder); Claude files don't.
function processText(file, text, ctx) {
  let changed = false;
  if (ctx) {
    primeCodex(ctx, text);
    for (const line of text.split('\n')) if (line && codexLine(line, ctx)) changed = true;
  } else {
    for (const line of text.split('\n')) if (claudeLine(line, file)) changed = true;
  }
  return changed;
}

// Plain .jsonl: read only new complete lines since last time.
function processPlain(file, st) {
  const rec = state.files[file] || (state.files[file] = { offset: 0 });
  if (st.size < rec.offset) rec.offset = 0; // rewritten; ids already counted are skipped
  if (st.size === rec.offset) return false;
  const ctx = isCodex(file) ? rec.ctx || (rec.ctx = { file }) : null;
  let changed = false;
  const next = readLines(file, rec.offset, st.size, (text) => {
    if (processText(file, text, ctx)) changed = true;
  });
  if (next !== rec.offset) {
    rec.offset = next;
    dirty = true;
  }
  return changed;
}

// Reads the session header first, so totals are keyed by the session's own id.
function primeCodex(ctx, text) {
  if (ctx.session) return;
  const meta = text.split('\n').find((l) => l.includes('"session_meta"'));
  if (meta) codexLine(meta, ctx);
}

// Compressed Codex session: re-read whole when it changes (ids/totals skip repeats).
function processZst(file, st) {
  if (!fzstd) return false;
  const rec = state.files[file] || (state.files[file] = {});
  if (rec.size === st.size && rec.mtime === st.mtimeMs) return false;
  let text;
  try {
    text = Buffer.from(fzstd.decompress(fs.readFileSync(file))).toString('utf8');
  } catch {
    return false; // still being written; try again on the next change
  }
  const changed = processText(file, text, { file });
  rec.size = st.size;
  rec.mtime = st.mtimeMs;
  dirty = true;
  return changed;
}

function processFile(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  return file.endsWith('.zst') ? processZst(file, st) : processPlain(file, st);
}

function listFiles(dir, codex, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, codex, out);
    else if (e.name.endsWith('.jsonl') || (codex && e.name.endsWith('.jsonl.zst'))) out.push(p);
  }
  return out;
}

// One-time rebuild of per-session totals from recent logs, for state saved by an
// older version. Reads only what was already counted; days are left untouched.
function backfill() {
  const since = Date.now() - BACKFILL_MS;
  const list = [];
  for (const f of files) {
    const rec = state.files[f];
    if (!rec) continue;
    try {
      const st = fs.statSync(f);
      if (st.mtimeMs >= since) list.push({ f, st, rec });
    } catch {}
  }
  list.sort((x, y) => x.st.mtimeMs - y.st.mtimeMs); // originals before resumed copies
  bf = { seen: new Set(), totals: {} };
  try {
    for (const { f, st, rec } of list) {
      if (f.endsWith('.zst')) {
        if (!fzstd || rec.size !== st.size || rec.mtime !== st.mtimeMs) continue;
        try {
          processText(f, Buffer.from(fzstd.decompress(fs.readFileSync(f))).toString('utf8'), { file: f });
        } catch {}
      } else {
        const ctx = isCodex(f) ? { file: f } : null;
        readLines(f, 0, Math.min(rec.offset || 0, st.size), (text) => processText(f, text, ctx));
      }
    }
  } finally {
    bf = null;
  }
}

let files = [];
let known = new Set();

function relist() {
  files = [];
  for (const r of claudeRoots) listFiles(r, false, files);
  for (const r of codexRoots) listFiles(r, true, files);
  known = new Set(files);
}

// ── Updates ─────────────────────────────────────────────────────────────────
function post(progress) {
  const cutoff = Date.now() - RECENT_MS;
  recent = recent.filter((r) => r.t >= cutoff);
  parentPort.postMessage({ type: 'days', days: state.days, sessions: state.sessions, scanning, progress, recent, events });
  events = [];
}

// Instant updates: watch the log folders and read a file as soon as it changes.
// The 5-second poll stays as a fallback for missed events.
const watched = new Set();
const queued = new Set();
let queueTimer = null;

function queueFile(file) {
  queued.add(file);
  if (!queueTimer) queueTimer = setTimeout(flushQueue, 120);
}

function flushQueue() {
  queueTimer = null;
  let changed = false;
  for (const f of queued) {
    if (!known.has(f)) {
      known.add(f);
      files.push(f);
    }
    if (processFile(f)) changed = true;
  }
  queued.clear();
  if (changed) post(null);
}

function watchRoots() {
  for (const r of [...claudeRoots, ...codexRoots]) {
    if (watched.has(r)) continue;
    try {
      const w = fs.watch(r, { recursive: true }, (_ev, name) => {
        if (name && /\.jsonl(\.zst)?$/.test(String(name))) queueFile(path.join(r, String(name)));
      });
      w.on('error', () => {
        w.close();
        watched.delete(r); // retried at the next re-listing
      });
      watched.add(r);
    } catch {}
  }
}

const tick = () => new Promise((r) => setImmediate(r));

async function run() {
  relist();
  if (needBackfill) {
    try {
      backfill();
    } catch {}
    needBackfill = false;
  }
  const total = files.length;
  let last = 0;
  for (let i = 0; i < files.length; i++) {
    processFile(files[i]);
    const now = Date.now();
    if (now - last > 400) {
      post({ done: i + 1, total });
      last = now;
    }
    await tick();
  }
  scanning = false;
  events = []; // no drops for the backlog
  post({ done: total, total });
  save(true);
  watchRoots();

  let polls = 0;
  setInterval(() => {
    polls++;
    if (polls % RELIST_EVERY === 0) {
      relist();
      watchRoots();
    }
    let changed = false;
    for (const f of files) if (processFile(f)) changed = true;
    if (changed) post(null);
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
