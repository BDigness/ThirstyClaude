// `thirstyclaude --statusline`: one line for Claude Code's status bar, such as
// "💧 85 mL this session · 1.4 L today".
//
// Claude Code runs the command with the session's details as JSON on stdin
// (session_id, transcript_path). This session's amount is read from its
// transcript, so it works without the widget; "today" comes from the widget's
// local status file when the widget is running. Local files only, no network.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { estimate, familyOf, zero, addTok, dayKey } = require('./model');
const { readLines, claudeUsage } = require('./logread');

const STATUS_FRESH_MS = 2 * 60 * 1000; // the widget rewrites its status at least every 20 s
const KEEP_MS = 2 * 864e5; // cached sessions are dropped after two idle days

function dataDir() {
  const name = 'ThirstyClaude'; // same folder as the widget's app data
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), name);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch {}
}

function readStdin(ms) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    const timer = setTimeout(() => resolve(data), ms);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Totals for one session from its transcript and its subagents' transcripts.
// Only new lines are read each time; offsets are cached in the app data folder.
function fromTranscript(sid, transcript, cache) {
  const rec = cache.s[sid] || (cache.s[sid] = { off: {}, recent: [], fams: {}, ctx: 0 });
  const files = [transcript];
  const subDir = path.join(transcript.replace(/\.jsonl$/i, ''), 'subagents');
  try {
    for (const f of fs.readdirSync(subDir)) if (f.endsWith('.jsonl')) files.push(path.join(subDir, f));
  } catch {}
  for (const f of files) {
    let st;
    try {
      st = fs.statSync(f);
    } catch {
      continue;
    }
    let off = rec.off[f] || 0;
    if (st.size < off) off = 0;
    if (st.size === off) continue;
    const sub = f !== transcript;
    rec.off[f] = readLines(f, off, st.size, (text) => {
      for (const line of text.split('\n')) {
        const r = claudeUsage(line);
        if (!r || rec.recent.includes(r.key)) continue; // one response spans several lines
        rec.recent.push(r.key);
        if (rec.recent.length > 64) rec.recent.shift();
        const fam = familyOf(r.model);
        addTok(rec.fams[fam] || (rec.fams[fam] = zero()), { ...r.tok, req: 1 });
        if (!sub && r.j.isSidechain !== true) rec.ctx = r.tok.in + r.tok.cw + r.tok.cr;
      }
    });
  }
  rec.at = Date.now();
  return rec;
}

function fmtLiters(l) {
  if (l < 1) return `${Math.round(l * 1000)} mL`;
  if (l < 10) return `${l.toFixed(1)} L`;
  return `${Math.round(l).toLocaleString('en-US')} L`;
}

function fmtCo2(kg) {
  if (kg < 1) return `${Math.round(kg * 1000)} g CO₂e`;
  if (kg < 10) return `${kg.toFixed(1)} kg CO₂e`;
  if (kg < 1000) return `${Math.round(kg)} kg CO₂e`;
  return `${(kg / 1000).toFixed(kg < 10000 ? 2 : 1)} t CO₂e`;
}

const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`);

// Builds the line from the stdin JSON. Exported for tests.
function line(input, dir = dataDir(), now = Date.now()) {
  const settings = { show: 'water', method: 'tc', mode: 'allIn', ctxHint: 400000, ...(readJson(path.join(dir, 'settings.json')) || {}) };
  const status = readJson(path.join(dir, 'status.json'));
  const live = status && status.v === 1 && now - status.at < STATUS_FRESH_MS;
  const co2 = settings.show === 'co2';
  const fmt = (x) => (co2 ? fmtCo2(x.kg) : fmtLiters(x.l));
  const parts = [];

  let sess = null;
  const sid = input && input.session_id;
  if (sid && live && status.sessions && status.sessions[sid]) {
    sess = status.sessions[sid]; // the widget's figure, so both agree
  } else if (sid && input.transcript_path) {
    const cacheFile = path.join(dir, 'statusline.json');
    const cache = readJson(cacheFile) || { v: 1, s: {} };
    if (cache.v !== 1 || !cache.s) Object.assign(cache, { v: 1, s: {} });
    const rec = fromTranscript(sid, input.transcript_path, cache);
    for (const id in cache.s) if (now - (cache.s[id].at || 0) > KEEP_MS) delete cache.s[id];
    writeJson(cacheFile, cache);
    const e = estimate(rec.fams, settings.method, settings.mode);
    sess = { l: e.l.mid, kg: e.co2.mid, ctx: rec.ctx };
  }
  if (sess) parts.push(`${fmt(sess)} this session`);
  if (live && status.today && status.day === dayKey(new Date(now))) parts.push(`${fmt(status.today)} today`);
  if (sess && settings.ctxHint && sess.ctx >= settings.ctxHint) parts.push(`\x1b[33m⚠ ${fmtTokens(sess.ctx)} context\x1b[0m`);
  const icon = co2 ? '☁️' : '💧';
  return parts.length ? `${icon} ${parts.join(' · ')}` : `${icon} ThirstyClaude: start the widget to see today's total`;
}

async function main() {
  let input = {};
  try {
    input = JSON.parse((await readStdin(400)) || '{}');
  } catch {}
  let out;
  try {
    out = line(input);
  } catch {
    out = '💧 ThirstyClaude';
  }
  process.stdout.write(out + '\n');
}

module.exports = { line, fromTranscript };
if (require.main === module || process.argv.includes('--statusline')) main();
