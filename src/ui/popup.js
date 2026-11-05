'use strict';

const $ = (id) => document.getElementById(id);
let snap = null;
const C = 2 * Math.PI * 44;

function fmt(ms) {
  if (ms == null || ms <= 0) return '0m';
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
}
function ago(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
function color(pct, warnAt) {
  if (pct == null) return 'var(--muted)';
  return pct >= 95 ? 'var(--bad)' : warnAt > 0 && pct >= warnAt ? 'var(--warn)' : 'var(--ok)';
}
function fmtTokens(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n); }
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function tick() {
  if (!snap) return;
  const fh = snap.fiveHour;
  if (fh && fh.active && fh.resetsAt) $('left').textContent = (fh.estimated ? '~' : '') + fmt(fh.resetsAt - Date.now());
}

function render(s) {
  snap = s;
  if (!s) return;
  const cfg = s.config, fh = s.fiveHour;
  const names = { statusline: 'Claude Code', endpoint: 'live', 'local-logs': 'estimate', none: 'no data' };
  $('source').textContent = names[s.source] || s.source;
  $('setup').hidden = s.connected;
  $('disconnectRow').hidden = !s.connected;

  // tick on the ring at the "notify at" %
  const ang = cfg.warnAtPercent / 100 * 2 * Math.PI;
  const t = $('warnTick');
  t.setAttribute('x1', 52 + 38 * Math.cos(ang)); t.setAttribute('y1', 52 + 38 * Math.sin(ang));
  t.setAttribute('x2', 52 + 50 * Math.cos(ang)); t.setAttribute('y2', 52 + 50 * Math.sin(ang));
  t.style.display = cfg.warnAtPercent ? '' : 'none';

  const pct = fh && fh.active ? fh.pct : fh ? 0 : null;
  $('pct').textContent = pct == null ? '–' : Math.round(pct) + '%';
  $('arc').setAttribute('stroke-dasharray', `${((pct || 0) / 100) * C} ${C}`);
  $('arc').setAttribute('stroke', color(pct, cfg.warnAtPercent));

  if (!fh) {
    $('leftLabel').textContent = 'No data yet';
    $('left').textContent = '–';
    $('at').textContent = '';
    $('fhNote').textContent = s.connected ? 'Send any message in Claude Code to load your usage.' : 'Connect Claude Code above to see your exact usage.';
  } else if (!fh.active) {
    $('leftLabel').textContent = 'Window';
    $('left').textContent = 'Ready';
    $('at').textContent = 'Fresh limit available';
    $('fhNote').textContent = 'Your next message starts a new 5-hour window.';
  } else {
    $('leftLabel').textContent = 'Resets in';
    $('at').textContent = 'at ' + time(fh.resetsAt);
    $('fhNote').textContent = fh.estimated ? 'Estimated from local Claude Code logs. Connect Claude Code for exact numbers.' : '';
  }

  if (s.sevenDay) {
    $('weekCard').hidden = false;
    const w = s.sevenDay.pct;
    $('weekPct').textContent = Math.round(w) + '%';
    $('weekBar').style.width = Math.min(100, w) + '%';
    $('weekBar').style.background = color(w, 0);
    $('weekReset').textContent = s.sevenDay.resetsAt ? 'Resets ' + day(s.sevenDay.resetsAt) : '';
  } else $('weekCard').hidden = true;

  if (s.local) {
    $('localCard').hidden = false;
    $('localTokens').textContent = fmtTokens(s.local.tokens) + ' tokens';
    $('localMsgs').textContent = `${s.local.messages} replies · +${fmtTokens(s.local.cacheRead)} cached`;
  } else $('localCard').hidden = true;

  $('warnAt').value = String(cfg.warnAtPercent);
  $('remindBefore').value = String(cfg.remindBeforeResetMinutes);
  $('warnAt').disabled = $('remindBefore').disabled = !cfg.notifications;
  $('notifications').checked = cfg.notifications;
  $('showWidget').checked = cfg.showWidget;
  $('loginRow').hidden = !s.loginItemSupported;
  $('openAtLogin').checked = !!s.openAtLogin;
  $('anchorEnabled').checked = cfg.anchorEnabled;
  if (document.activeElement !== $('anchors')) $('anchors').value = cfg.anchors.join(', ');
  $('pollEndpoint').checked = cfg.pollEndpoint;
  $('endpointError').textContent = cfg.pollEndpoint && s.endpointError ? 'Polling failed: ' + s.endpointError : '';
  $('anchorStatus').textContent = s.lastAnchor ? `${time(s.lastAnchor.at)}: ${s.lastAnchor.result}` : '';
  $('updated').textContent = 'Updated ' + ago(s.updatedAt);
  tick();
}

const set = (patch) => window.timer.setConfig(patch).then(render);
$('warnAt').addEventListener('change', (e) => set({ warnAtPercent: +e.target.value }));
$('remindBefore').addEventListener('change', (e) => set({ remindBeforeResetMinutes: +e.target.value }));
$('notifications').addEventListener('change', (e) => set({ notifications: e.target.checked }));
$('showWidget').addEventListener('change', (e) => set({ showWidget: e.target.checked }));
$('openAtLogin').addEventListener('change', (e) => window.timer.setOpenAtLogin(e.target.checked).then(render));
$('anchorEnabled').addEventListener('change', (e) => set({ anchorEnabled: e.target.checked }));
$('anchors').addEventListener('change', (e) => set({ anchors: e.target.value.split(/[,\s]+/).filter((a) => /^\d{1,2}:\d{2}$/.test(a)) }));
$('pollEndpoint').addEventListener('change', (e) => set({ pollEndpoint: e.target.checked }));
async function runInstall(action) {
  const r = await window.timer[action]();
  $('setupError').textContent = r && r.ok === false ? r.error : '';
  render(await window.timer.getSnapshot());
}
$('connect').addEventListener('click', () => runInstall('connect'));
$('disconnect').addEventListener('click', () => runInstall('disconnect'));
$('anchorNow').addEventListener('click', async (e) => { e.target.disabled = true; e.target.textContent = 'Starting…'; await window.timer.anchorNow(); e.target.disabled = false; e.target.textContent = 'Start window now'; render(await window.timer.getSnapshot()); });
$('quit').addEventListener('click', () => window.timer.quit());

window.timer.onSnapshot(render);
window.timer.getSnapshot().then(render);
setInterval(tick, 1000);
