// Decide which notifications to show. Pure logic so it can be unit-tested.
const { fmtDuration } = require('./usage');

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * @param {object} snap   snapshot from usage.buildSnapshot
 * @param {object} cfg    config
 * @param {object} mem    persistent memory between calls ({ windowId, fired: string[] })
 * @returns {{ alerts: {title: string, body: string}[], mem: object }}
 */
function evaluate(snap, cfg, mem = {}) {
  const alerts = [];
  const fh = snap.fiveHour;
  const windowId = fh && fh.active && fh.resetsAt ? String(fh.resetsAt) : null;
  let fired = mem.windowId === windowId ? [...(mem.fired || [])] : [];

  const once = (key, title, body) => {
    if (fired.includes(key)) return;
    fired.push(key);
    alerts.push({ title, body });
  };

  // Window ended -> fresh limit available.
  if (mem.windowId && !windowId && fh && !fh.active) {
    alerts.push({ title: 'Fresh 5-hour window', body: 'Your limit has reset. The next message starts a new window.' });
  }

  if (windowId && fh.pct != null) {
    const left = fh.resetsAt - snap.now;
    // 1) Usage threshold: "You've used 75% of your 5-hour limit".
    if (cfg.warnAtPercent > 0 && fh.pct >= cfg.warnAtPercent) {
      once(`used-${cfg.warnAtPercent}`, `${Math.round(fh.pct)}% of your 5-hour limit used`,
        `Resets in ${fmtDuration(left)} (at ${clock(fh.resetsAt)}).`);
    }
    // 2) Reset reminder: "Your 5-hour window resets in 1h".
    const before = cfg.remindBeforeResetMinutes;
    if (before > 0 && left <= before * 60000) {
      once(`reset-${before}`, `5-hour window resets in ${fmtDuration(left)}`,
        `${Math.round(fh.pct)}% used, ${Math.max(0, Math.round(100 - fh.pct))}% still available until ${clock(fh.resetsAt)}.`);
    }
  }

  return { alerts: cfg.notifications ? alerts : [], mem: { windowId, fired } };
}

module.exports = { evaluate };
