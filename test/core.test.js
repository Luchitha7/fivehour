const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildSnapshot } = require('../src/usage');
const { evaluate } = require('../src/alerts');
const { computeBlocks } = require('../src/sources/local-logs');
const { dueAnchor } = require('../src/anchor');
const { ringPng } = require('../src/icon');
const { DEFAULTS } = require('../src/config');

const NOW = Date.parse('2026-11-05T10:00:00Z');
const sec = (ms) => Math.floor(ms / 1000);
const H = 3600e3;

test('official data wins and active window is detected', () => {
  const s = buildSnapshot({
    statusline: { source: 'statusline', updated_at: sec(NOW - 60e3), five_hour: { used_percentage: 62, resets_at: sec(NOW + 2 * H) }, seven_day: { used_percentage: 30, resets_at: sec(NOW + 48 * H) } },
    endpoint: null, local: { end: NOW + 3 * H }, now: NOW,
  });
  assert.equal(s.source, 'statusline');
  assert.deepEqual(s.fiveHour, { pct: 62, resetsAt: NOW + 2 * H, active: true, estimated: false });
  assert.equal(s.sevenDay.pct, 30);
});

test('newer endpoint data beats older statusline data', () => {
  const s = buildSnapshot({
    statusline: { source: 'statusline', updated_at: sec(NOW - H), five_hour: { used_percentage: 10, resets_at: sec(NOW + H) } },
    endpoint: { source: 'endpoint', updated_at: sec(NOW), five_hour: { used_percentage: 40, resets_at: sec(NOW + H) } },
    local: null, now: NOW,
  });
  assert.equal(s.fiveHour.pct, 40);
});

test('expired window shows as ready', () => {
  const s = buildSnapshot({ statusline: { source: 'statusline', updated_at: sec(NOW - 6 * H), five_hour: { used_percentage: 80, resets_at: sec(NOW - 60e3) } }, now: NOW });
  assert.equal(s.fiveHour.active, false);
  assert.equal(s.fiveHour.pct, 0);
});

test('falls back to local estimate', () => {
  const s = buildSnapshot({ statusline: null, endpoint: null, local: { end: NOW + H, tokens: 5 }, now: NOW });
  assert.equal(s.source, 'local-logs');
  assert.equal(s.fiveHour.estimated, true);
  assert.equal(s.fiveHour.pct, null);
});

test('alerts: usage %, reset reminder, fresh window', () => {
  const cfg = { ...DEFAULTS }; // 75%, 60 min
  const snap = (pct, resetsAt, now = NOW) => ({ now, fiveHour: { pct, resetsAt, active: true } });

  let r = evaluate(snap(70, NOW + 2 * H), cfg, {});
  assert.equal(r.alerts.length, 0, 'below 75% and more than 1h left');

  r = evaluate(snap(76, NOW + 2 * H), cfg, r.mem);
  assert.deepEqual(r.alerts.map((a) => a.title), ['76% of your 5-hour limit used']);
  r = evaluate(snap(80, NOW + 2 * H), cfg, r.mem);
  assert.equal(r.alerts.length, 0, 'no repeat in same window');

  r = evaluate(snap(80, NOW + 2 * H, NOW + 61 * 60e3), cfg, r.mem); // same window, 59 min left
  assert.deepEqual(r.alerts.map((a) => a.title), ['5-hour window resets in 59m']);
  assert.match(r.alerts[0].body, /80% used, 20% still available/);

  r = evaluate(snap(10, NOW + 25 * 60e3), { ...cfg, remindBeforeResetMinutes: 30, warnAtPercent: 0 }, {});
  assert.deepEqual(r.alerts.map((a) => a.title), ['5-hour window resets in 25m'], 'custom minutes, % alert off');

  r = evaluate({ now: NOW, fiveHour: { pct: 0, resetsAt: null, active: false } }, cfg, r.mem);
  assert.deepEqual(r.alerts.map((a) => a.title), ['Fresh 5-hour window']);

  r = evaluate(snap(99, NOW + H), { ...cfg, notifications: false }, {});
  assert.equal(r.alerts.length, 0);
});

test('blocks: floor to hour, split on 5h', () => {
  const t0 = Date.parse('2026-11-05T11:20:00Z');
  const e = (t) => ({ t, input: 100, output: 10, cacheRead: 0 });
  const blocks = computeBlocks([e(t0), e(t0 + H), e(t0 + 4.5 * H), e(t0 + 5 * H)]);
  assert.equal(blocks.length, 2);
  assert.equal(new Date(blocks[0].start).toISOString(), '2026-11-05T11:00:00.000Z');
  assert.equal(blocks[0].messages, 3);
  assert.equal(blocks[0].input, 300);
});

test('anchor fires inside its 10 minute slot, once', () => {
  const d = new Date(2026, 10, 5, 8, 3);
  const key = dueAnchor(['08:00'], d.getTime(), []);
  assert.ok(key);
  assert.equal(dueAnchor(['08:00'], d.getTime(), [key]), null);
  assert.equal(dueAnchor(['08:00'], new Date(2026, 10, 5, 8, 30).getTime(), []), null);
});

test('icon is a valid PNG', () => {
  const png = ringPng(32, 55);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 32);
});

test('statusline hook saves rate limits and prints a line', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-'));
  const input = JSON.stringify({ model: { display_name: 'Opus' }, rate_limits: { five_hour: { used_percentage: 41.6, resets_at: sec(Date.now() + 90 * 60e3) }, seven_day: { used_percentage: 12, resets_at: sec(Date.now() + 99 * H) } } });
  const out = execFileSync(process.execPath, [path.join(__dirname, '../src/hook/statusline.js')], { input, env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
  assert.match(out, /Opus {2}\| {2}5h 42% · 1h(29|30)m {2}\| {2}7d 12%/);
  const saved = JSON.parse(fs.readFileSync(path.join(home, '.fivehour', 'usage.json'), 'utf8'));
  assert.equal(saved.five_hour.used_percentage, 41.6);
});

test('local logs: incremental reads pick up appended lines and skip partial ones', () => {
  const { readEntries } = require('../src/sources/local-logs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-logs-'));
  const file = path.join(dir, 'a.jsonl');
  const line = (id, t) => JSON.stringify({ timestamp: new Date(t).toISOString(), requestId: `r${id}`, message: { id: `m${id}`, model: 'x', usage: { input_tokens: 10, output_tokens: 5 } } }) + '\n';
  const now = Date.now();
  fs.writeFileSync(file, line(1, now - 60e3));
  assert.equal(readEntries(now - H, dir).length, 1);
  const partial = line(3, now - 10e3);
  fs.appendFileSync(file, line(2, now - 30e3) + partial.slice(0, 20));
  assert.equal(readEntries(now - H, dir).length, 2, 'partial line ignored');
  fs.appendFileSync(file, partial.slice(20));
  assert.equal(readEntries(now - H, dir).length, 3, 'partial line completed');
  fs.appendFileSync(file, line(3, now - 10e3));
  assert.equal(readEntries(now - H, dir).length, 3, 'duplicates removed');
});

test('endpoint response is normalized and bad dates are dropped', () => {
  const { normalize } = require('../src/sources/endpoint');
  assert.deepEqual(normalize({ utilization: 41.5, resets_at: '2026-11-05T12:00:00Z' }), { used_percentage: 41.5, resets_at: sec(Date.parse('2026-11-05T12:00:00Z')) });
  assert.equal(normalize({ utilization: 10, resets_at: 'not a date' }), null);
  assert.equal(normalize({ resets_at: '2026-11-05T12:00:00Z' }), null);
  assert.equal(normalize(null), null);
});
