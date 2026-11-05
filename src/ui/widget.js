'use strict';

const $ = (id) => document.getElementById(id);
const C = 2 * Math.PI * 10;
let snap = null;
function fmt(ms) {
  if (ms == null || ms <= 0) return '0m';
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
function color(p, r) { return p == null ? '#8e8e93' : p >= 95 ? '#e5484d' : r > 0 && p >= r ? '#f0a028' : '#34c778'; }
function render(s) {
  if (s) snap = s;
  if (!snap) return;
  const fh = snap.fiveHour, r = snap.config.warnAtPercent;
  let pct = null, left = 'no data yet';
  if (fh && !fh.active) { pct = 0; left = 'ready · fresh window'; }
  else if (fh) { pct = fh.pct; left = (fh.estimated ? '~' : '') + fmt(fh.resetsAt - Date.now()) + ' left'; }
  else if (!snap.connected) left = 'click ⋯ to connect';
  $('pct').textContent = pct == null ? '–' : Math.round(pct) + '%';
  $('left').textContent = left;
  $('arc').setAttribute('stroke-dasharray', `${((pct || 0) / 100) * C} ${C}`);
  $('arc').setAttribute('stroke', color(pct, r));
}
$('open').addEventListener('click', () => window.timer.openPopup());
window.timer.onSnapshot(render);
window.timer.getSnapshot().then(render);
setInterval(() => render(), 15000);
