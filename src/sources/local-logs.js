// Estimate the current 5-hour block from Claude Code's local logs (~/.claude/projects/**/*.jsonl).
// Same idea as ccusage's `blocks` report: a block starts at the first message (floored to the
// hour) and lasts 5h; a gap of 5h+ starts a new block. This only sees Claude Code usage, so it is
// an estimate — the % from rate_limits is the source of truth.
const fs = require('fs');
const path = require('path');
const { CLAUDE_DIR } = require('../paths');

const HOUR = 3600e3;
const BLOCK = 5 * HOUR;

function listRecentFiles(dir, sinceMs, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listRecentFiles(p, sinceMs, out);
    else if (e.name.endsWith('.jsonl')) {
      try { if (fs.statSync(p).mtimeMs >= sinceMs) out.push(p); } catch {}
    }
  }
  return out;
}

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const m = d.message;
    if (!m || !m.usage || !d.timestamp) continue;
    const t = Date.parse(d.timestamp);
    if (!Number.isFinite(t)) continue;
    const u = m.usage;
    out.push({
      t,
      key: `${m.id}:${d.requestId}`,
      model: m.model,
      input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0),
      cacheRead: u.cache_read_input_tokens || 0,
      output: u.output_tokens || 0,
    });
  }
  return out;
}

// Logs are append-only, so we remember how far we read each file and only parse new bytes.
// file -> { size, entries }
const cache = new Map();

function readFileEntries(file) {
  let size;
  try { size = fs.statSync(file).size; } catch { return []; }
  const prev = cache.get(file);
  if (prev && prev.size === size) return prev.entries;
  let entries = [];
  let from = 0;
  if (prev && size > prev.size) { entries = prev.entries; from = prev.size; }
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      // Only consume complete lines; a partial last line is re-read next time.
      const text = buf.toString('utf8');
      const end = text.lastIndexOf('\n') + 1;
      entries = entries.concat(parseLines(text.slice(0, end)));
      size = from + Buffer.byteLength(text.slice(0, end));
    } finally { fs.closeSync(fd); }
  } catch { return prev ? prev.entries : []; }
  cache.set(file, { size, entries });
  return entries;
}

function readEntries(sinceMs, projectsDir = path.join(CLAUDE_DIR, 'projects')) {
  const files = listRecentFiles(projectsDir, sinceMs);
  const live = new Set(files);
  for (const f of cache.keys()) if (!live.has(f)) cache.delete(f);
  const seen = new Set();
  const entries = [];
  for (const file of files) {
    for (const e of readFileEntries(file)) {
      if (e.t < sinceMs || seen.has(e.key)) continue;
      seen.add(e.key);
      entries.push(e);
    }
  }
  return entries.sort((a, b) => a.t - b.t);
}

function computeBlocks(entries) {
  const blocks = [];
  let cur = null;
  for (const e of entries) {
    if (!cur || e.t >= cur.start + BLOCK || e.t - cur.last >= BLOCK) {
      const start = Math.floor(e.t / HOUR) * HOUR;
      cur = { start, end: start + BLOCK, last: e.t, input: 0, output: 0, cacheRead: 0, messages: 0 };
      blocks.push(cur);
    }
    cur.last = e.t;
    cur.input += e.input;
    cur.output += e.output;
    cur.cacheRead += e.cacheRead;
    cur.messages += 1;
  }
  return blocks;
}

function activeBlock(now = Date.now(), projectsDir) {
  const entries = readEntries(now - 2 * BLOCK, projectsDir);
  const blocks = computeBlocks(entries);
  const b = blocks[blocks.length - 1];
  if (!b || now >= b.end) return null;
  return { ...b, tokens: b.input + b.output };
}

module.exports = { activeBlock, computeBlocks, readEntries };
