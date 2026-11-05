const fs = require('fs');
const path = require('path');
const { DATA_DIR, CONFIG_FILE } = require('./paths');

const DEFAULTS = {
  notifications: true,
  warnAtPercent: 75,            // notify when this much of the 5h limit is used (0 = off)
  remindBeforeResetMinutes: 60, // notify this long before the 5h window resets (0 = off)
  anchors: [],                  // ["08:00", ...] times to start a fresh window
  anchorEnabled: false,
  anchorModel: 'haiku',
  pollEndpoint: false,          // opt-in: poll the (undocumented) usage endpoint
  showWidget: false,            // optional floating always-on-top widget
  widgetPosition: null,         // {x, y}
  previousStatusLine: null,     // user's status line before we installed ours (internal)
  welcomed: false,              // first-launch panel already shown (internal)
};

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MODEL = /^[A-Za-z0-9._-]{1,64}$/;
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Validators for every key the UI is allowed to change. Anything else is ignored.
const USER_KEYS = {
  notifications: (v) => typeof v === 'boolean',
  warnAtPercent: (v) => int(v, 0, 100),
  remindBeforeResetMinutes: (v) => int(v, 0, 300),
  anchors: (v) => Array.isArray(v) && v.length <= 12 && v.every((a) => typeof a === 'string' && TIME.test(a)),
  anchorEnabled: (v) => typeof v === 'boolean',
  pollEndpoint: (v) => typeof v === 'boolean',
  showWidget: (v) => typeof v === 'boolean',
};

/** Keep only allowed, valid keys from an untrusted patch (e.g. from the renderer). */
function sanitizeUserPatch(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [k, ok] of Object.entries(USER_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(patch, k) && ok(patch[k])) out[k] = patch[k];
  }
  return out;
}

/** Drop unknown/invalid values from a loaded config so bad files can't reach shell calls. */
function normalize(raw) {
  const cfg = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return cfg;
  Object.assign(cfg, sanitizeUserPatch(raw));
  if (typeof raw.anchorModel === 'string' && MODEL.test(raw.anchorModel)) cfg.anchorModel = raw.anchorModel;
  const p = raw.widgetPosition;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) cfg.widgetPosition = { x: Math.round(p.x), y: Math.round(p.y) };
  const sl = raw.previousStatusLine;
  if (sl && typeof sl === 'object' && typeof sl.command === 'string') cfg.previousStatusLine = sl;
  if (raw.welcomed === true) cfg.welcomed = true;
  return cfg;
}

function load() {
  try { return normalize(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); }
  catch { return { ...DEFAULTS }; }
}

function save(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `config.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
  return cfg;
}

/** Internal update (trusted callers only). */
function update(patch) {
  return save(normalize({ ...load(), ...patch }));
}

/** Update from the UI: only whitelisted keys with valid values. */
function updateFromUser(patch) {
  return update(sanitizeUserPatch(patch));
}

/** Config as sent to the UI (no internal fields). */
function publicView(cfg) {
  const { previousStatusLine, widgetPosition, anchorModel, welcomed, ...rest } = cfg;
  return rest;
}

module.exports = { load, save, update, updateFromUser, sanitizeUserPatch, normalize, publicView, DEFAULTS };
