// Connect / disconnect the status line hook in Claude Code's settings.json.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, HOOK_FILE, CLAUDE_DIR } = require('./paths');
const config = require('./config');

const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const HOOK_SRC = path.join(__dirname, 'hook', 'statusline.js');
const MARKER = `${path.sep}.fivehour${path.sep}statusline.js`;
const LEGACY = /[\\/]\.claude-timer[\\/]statusline\.js/; // pre-release name of this app

function hookCommand() {
  if (/["\r\n]/.test(HOOK_FILE)) throw new Error('Unsupported characters in home directory path');
  return `node "${HOOK_FILE}"`;
}

function readSettings() {
  let text;
  try { text = fs.readFileSync(SETTINGS, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  try { return JSON.parse(text); }
  catch { throw new Error(`Can't read ${SETTINGS}: it isn't valid JSON. Fix it, then try again.`); }
}

/** Back up, then write atomically so a crash can never leave a half-written settings file. */
function writeSettings(s) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  let mode;
  if (fs.existsSync(SETTINGS)) {
    fs.copyFileSync(SETTINGS, `${SETTINGS}.fivehour.bak`);
    mode = fs.statSync(SETTINGS).mode;
  }
  const tmp = `${SETTINGS}.fivehour.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n', mode ? { mode } : undefined);
  fs.renameSync(tmp, SETTINGS);
}

function isOurs(statusLine) {
  return !!(statusLine && typeof statusLine.command === 'string' && statusLine.command.includes(MARKER));
}

function isConnected() {
  try { return isOurs(readSettings().statusLine); } catch { return false; }
}

function connect() {
  try {
    const s = readSettings();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Copy the hook to a stable location so moving/updating the app never breaks Claude Code.
    fs.copyFileSync(HOOK_SRC, HOOK_FILE);
    if (isOurs(s.statusLine)) return { ok: true, already: true };
    // Keep the user's own status line so we can chain to it, but never a pre-release copy of ours.
    const prev = s.statusLine;
    if (prev && typeof prev.command === 'string' && !LEGACY.test(prev.command)) config.update({ previousStatusLine: prev });
    s.statusLine = { type: 'command', command: hookCommand(), padding: 0 };
    writeSettings(s);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function disconnect() {
  try {
    const s = readSettings();
    if (!isOurs(s.statusLine)) return { ok: true };
    const prev = config.load().previousStatusLine;
    if (prev) s.statusLine = prev; else delete s.statusLine;
    writeSettings(s);
    config.update({ previousStatusLine: null });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Re-copy the hook (e.g. after an app update) without touching settings. */
function refreshHook() {
  if (isConnected()) { try { fs.copyFileSync(HOOK_SRC, HOOK_FILE); } catch {} }
}

module.exports = { connect, disconnect, isConnected, refreshHook, SETTINGS };
