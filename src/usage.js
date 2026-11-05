// Merge all sources into one snapshot the UI and alerts use.
const fs = require('fs');
const { USAGE_FILE } = require('./paths');
const localLogs = require('./sources/local-logs');

function readStatuslineFile() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch { return null; }
}

/**
 * @param {object} opts
 * @param {object|null} opts.statusline  data written by the status line hook
 * @param {object|null} opts.endpoint    data from the opt-in endpoint poll
 * @param {object|null} opts.local       active block from local logs
 * @param {number} [opts.now]
 */
function buildSnapshot({ statusline, endpoint, local, now = Date.now() }) {
  const official = [statusline, endpoint].filter(Boolean).sort((a, b) => b.updated_at - a.updated_at)[0] || null;

  let fiveHour = null;
  if (official && official.five_hour) {
    const resetsAt = official.five_hour.resets_at * 1000;
    fiveHour = resetsAt > now
      ? { pct: official.five_hour.used_percentage, resetsAt, active: true, estimated: false }
      // The window ended. A new one only starts with your next message.
      : { pct: 0, resetsAt: null, active: false, estimated: false };
  } else if (local) {
    fiveHour = { pct: null, resetsAt: local.end, active: true, estimated: true };
  }

  let sevenDay = null;
  if (official && official.seven_day) {
    const resetsAt = official.seven_day.resets_at * 1000;
    sevenDay = { pct: resetsAt > now ? official.seven_day.used_percentage : 0, resetsAt: resetsAt > now ? resetsAt : null };
  }

  return {
    fiveHour,
    sevenDay,
    local,
    source: official ? official.source : local ? 'local-logs' : 'none',
    updatedAt: official ? official.updated_at * 1000 : null,
    now,
  };
}

function collect({ endpoint = null } = {}) {
  let local = null;
  try { local = localLogs.activeBlock(); } catch {}
  return buildSnapshot({ statusline: readStatuslineFile(), endpoint, local });
}

function fmtDuration(ms) {
  if (ms == null || ms <= 0) return '0m';
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

module.exports = { buildSnapshot, collect, readStatuslineFile, fmtDuration };
