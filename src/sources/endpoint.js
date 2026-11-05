// OPT-IN: poll the usage endpoint Claude Code itself uses for /usage.
// It's undocumented and may change, so it's off by default. It reuses the login Claude Code
// already stored — macOS Keychain ("Claude Code-credentials"), or ~/.claude/.credentials.json
// on Windows/Linux. The token is only ever sent to api.anthropic.com.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const { CLAUDE_DIR } = require('../paths');

/** Pull { token, expiresAt } out of Claude Code's stored credentials JSON, or null. */
function parseCredentials(json) {
  const o = json && json.claudeAiOauth;
  if (!o || typeof o.accessToken !== 'string' || !o.accessToken) return null;
  return { token: o.accessToken, expiresAt: Number.isFinite(o.expiresAt) ? o.expiresAt : null };
}

function readLogin() {
  return new Promise((resolve) => {
    const fromFile = () => {
      try { resolve(parseCredentials(JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, '.credentials.json'), 'utf8')))); }
      catch { resolve(null); }
    };
    if (process.platform !== 'darwin') return fromFile();
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], (err, stdout) => {
      if (err) return fromFile();
      try { resolve(parseCredentials(JSON.parse(stdout.trim())) || null); } catch { fromFile(); }
    });
  });
}

function loginError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json', 'User-Agent': 'fivehour' },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
        if (body.length > 256 * 1024) req.destroy(new Error('response too large'));
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const err = new Error(res.statusCode === 429 ? 'rate limited' : `HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          err.retryAfter = retryAfterMs(res.headers['retry-after']);
          return reject(err);
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Retry-After header (seconds or an HTTP date) -> ms from now, or null. */
function retryAfterMs(h, now = Date.now()) {
  if (h == null || h === '') return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return secs >= 0 ? secs * 1000 : null;
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/** How long to wait before the next poll. Backs off on errors, hardest on 429. */
function nextDelay(err, failures) {
  const BASE = 5 * 60e3, MAX = 60 * 60e3;
  if (!err) return BASE;
  const backoff = Math.min(MAX, BASE * 2 ** Math.max(0, failures - 1));
  if (err.code === 'expired' || err.code === 'no-login') return 30 * 60e3; // waits on the user, check now and then
  if (err.status === 429) return Math.min(MAX, Math.max(backoff, err.retryAfter || 0, 10 * 60e3));
  return backoff;
}

// Response shape: { five_hour: { utilization: 0-100, resets_at: ISO }, seven_day: {...} }
function normalize(w) {
  if (!w || typeof w.utilization !== 'number') return null;
  const resets = Date.parse(w.resets_at);
  if (!Number.isFinite(resets)) return null;
  return { used_percentage: w.utilization, resets_at: Math.floor(resets / 1000) };
}

async function fetchUsage(now = Date.now()) {
  const login = await readLogin();
  if (!login) throw loginError('no-login', 'No Claude Code login found');
  // Claude Code refreshes this login while it runs in a terminal. If it has expired, asking
  // Anthropic would only get a 401, so don't.
  if (login.expiresAt && login.expiresAt <= now) throw loginError('expired', 'Claude Code login expired');
  let d;
  try { d = await getJson('https://api.anthropic.com/api/oauth/usage', login.token); }
  catch (e) {
    if (e.status === 401 || e.status === 403) throw Object.assign(loginError('expired', 'Claude Code login not accepted'), { status: e.status });
    throw e;
  }
  return { source: 'endpoint', updated_at: Math.floor(Date.now() / 1000), five_hour: normalize(d.five_hour), seven_day: normalize(d.seven_day) };
}

module.exports = { fetchUsage, normalize, retryAfterMs, nextDelay, parseCredentials };
