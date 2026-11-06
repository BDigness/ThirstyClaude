// Shared by the scanner and `--statusline`: reads complete lines of a log file.
const fs = require('fs');

const CHUNK = 8 * 1024 * 1024;

// Calls onText with blocks of complete lines between two byte offsets, and
// returns the offset just after the last complete line.
function readLines(file, from, to, onText) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return from;
  }
  let pos = from;
  let done = from;
  let carry = Buffer.alloc(0);
  try {
    while (pos < to) {
      const len = Math.min(CHUNK, to - pos);
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
      onText(data.toString('utf8', 0, nl));
      carry = Buffer.from(data.subarray(nl + 1));
      done = pos - carry.length;
    }
  } finally {
    fs.closeSync(fd);
  }
  return done;
}

// Token counts from a Claude Code assistant line, or null if it has none.
function claudeUsage(line) {
  if (line.indexOf('"usage"') === -1) return null;
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j.type !== 'assistant') return null;
  const m = j.message;
  const u = m && m.usage;
  if (!u || !m.id) return null;
  const model = String(m.model || '');
  if (!model.startsWith('claude')) return null;
  return {
    j,
    model,
    key: 'c:' + m.id + ':' + (j.requestId || ''),
    tok: {
      in: u.input_tokens || 0,
      out: u.output_tokens || 0,
      cw: u.cache_creation_input_tokens || 0,
      cr: u.cache_read_input_tokens || 0,
    },
  };
}

module.exports = { readLines, claudeUsage };
