// Window anchoring: at times you choose, send one tiny Claude Code message so a fresh
// 5-hour window starts on YOUR schedule (e.g. 08:00 -> windows 8-13, 13-18, 18-23).
// Only fires when no window is active, so it never wastes an existing one.
const { spawn } = require('child_process');
const { augmentedPath, findExecutable } = require('./env');

function dueAnchor(anchors, now, firedToday) {
  const d = new Date(now);
  const today = d.toDateString();
  for (const a of anchors) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(a);
    if (!m) continue;
    const t = new Date(d); t.setHours(+m[1], +m[2], 0, 0);
    const key = `${today} ${a}`;
    if (now >= t.getTime() && now < t.getTime() + 10 * 60000 && !firedToday.includes(key)) return key;
  }
  return null;
}

const SAFE_ARG = /^[A-Za-z0-9._-]{1,64}$/;

function sendPing(model = 'haiku') {
  return new Promise((resolve) => {
    // On Windows `claude` is often a .cmd shim, which Node can only start through a shell.
    // Every argument is therefore a fixed, shell-safe token (no spaces or metacharacters).
    if (!SAFE_ARG.test(model)) return resolve({ ok: false, error: 'invalid model name' });
    if (!findExecutable('claude')) {
      return resolve({ ok: false, error: "Claude Code's `claude` command wasn't found. Install Claude Code, then restart fivehour." });
    }
    const child = spawn('claude', ['-p', 'ok', '--model', model], {
      env: { ...process.env, PATH: augmentedPath() },
      shell: process.platform === 'win32',
      stdio: 'ignore',
      timeout: 120000,
    });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
    child.on('exit', (code) => resolve({ ok: code === 0, error: code ? `exit ${code}` : null }));
  });
}

module.exports = { dueAnchor, sendPing };
