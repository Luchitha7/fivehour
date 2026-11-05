// Merge all sources into one snapshot the UI and alerts use.
const fs = require('fs');
const { USAGE_FILE } = require('./paths');
const localLogs = require('./sources/local-logs');

function readStatuslineFile() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch { return null; }
}

// Below this the "busiest window" yardstick is too small to mean anything.
const MIN_PEAK = 100e3;

/**
 * Guess the % used from local tokens when no exact number is available.
 * 1) "calibrated": tokens-per-100% learned the last time an exact % was seen.
 * 2) "peak": this window's tokens vs the busiest window in the last 30 days. Past that
 *    record there is nothing to compare with, so no % (the UI shows tokens instead).
 * Capped at 99 so an estimate never claims you are out.
 */
function estimatePct(local, calibration) {
  if (!local || !(local.tokens >= 0)) return null;
  let full = null, basis = null;
  if (calibration > 0) { full = calibration; basis = 'calibrated'; }
  else if (local.peakTokens >= MIN_PEAK && local.tokens <= local.peakTokens) { full = local.peakTokens; basis = 'peak'; }
  if (!full) return null;
  return { pct: Math.min(99, (local.tokens / full) * 100), basis };
}

/**
 * Learn tokens-per-100% from an exact reading of the same window, or null.
 * Needs a reasonable % (>=10) so rounding doesn't wreck the ratio.
 */
function calibrate(snap) {
  const fh = snap.fiveHour, local = snap.local;
  if (!fh || fh.estimated || !fh.active || !local || !(fh.pct >= 10)) return null;
  if (Math.abs(local.end - fh.resetsAt) > 3600e3) return null; // different windows
  return Math.round(local.tokens / (fh.pct / 100));
}

/**
 * @param {object} opts
 * @param {object|null} opts.statusline  data written by the status line hook
 * @param {object|null} opts.endpoint    data from the opt-in endpoint poll
 * @param {object|null} opts.local       active block from local logs
 * @param {number|null} opts.calibration tokens that made up 100% at the last exact reading
 * @param {number} [opts.now]
 */
function buildSnapshot({ statusline, endpoint, local, calibration = null, now = Date.now() }) {
  const official = [statusline, endpoint].filter(Boolean).sort((a, b) => b.updated_at - a.updated_at)[0] || null;

  let fiveHour = null;
  const officialResets = official && official.five_hour ? official.five_hour.resets_at * 1000 : null;
  // An old exact reading whose window ended, while the local logs show a newer window running:
  // the local estimate is closer to the truth than "Ready".
  const newerLocal = officialResets != null && officialResets <= now && local && local.end > now && local.start >= officialResets - 3600e3;
  if (official && official.five_hour && !newerLocal) {
    const resetsAt = officialResets;
    fiveHour = resetsAt > now
      ? { pct: official.five_hour.used_percentage, resetsAt, active: true, estimated: false }
      // The window ended. A new one only starts with your next message.
      : { pct: 0, resetsAt: null, active: false, estimated: false };
  } else if (local) {
    const est = estimatePct(local, calibration);
    fiveHour = { pct: est ? est.pct : null, resetsAt: local.end, active: true, estimated: true, pctEstimated: !!est, basis: est ? est.basis : null };
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
    source: official && !newerLocal ? official.source : local ? 'local-logs' : 'none',
    updatedAt: official ? official.updated_at * 1000 : null,
    now,
  };
}

function collect({ endpoint = null, calibration = null } = {}) {
  let local = null;
  try { local = localLogs.activeBlock(); } catch {}
  return buildSnapshot({ statusline: readStatuslineFile(), endpoint, local, calibration });
}

function fmtDuration(ms) {
  if (ms == null || ms <= 0) return '0m';
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

module.exports = { buildSnapshot, collect, estimatePct, calibrate, readStatuslineFile, fmtDuration };
