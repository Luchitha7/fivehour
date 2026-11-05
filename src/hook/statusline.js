#!/usr/bin/env node
// Claude Code status line hook.
// Claude Code pipes session JSON to stdin after each response. Recent versions include
// `rate_limits.five_hour` / `rate_limits.seven_day` ({ used_percentage, resets_at }).
// We save that to ~/.fivehour/usage.json for the tray app, then print a status line.
// If the user had a status line before installing, we run it and print its output instead.
// No dependencies: this file is copied to ~/.fivehour/ and run with plain `node`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const DIR = path.join(os.homedir(), '.fivehour');

function fmtLeft(epochSec) {
  const ms = epochSec * 1000 - Date.now();
  if (ms <= 0) return 'reset';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}

  const rl = input.rate_limits;
  if (rl && (rl.five_hour || rl.seven_day)) {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      const out = { source: 'statusline', updated_at: Math.floor(Date.now() / 1000), five_hour: rl.five_hour || null, seven_day: rl.seven_day || null };
      const tmp = path.join(DIR, `usage.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(out));
      fs.renameSync(tmp, path.join(DIR, 'usage.json'));
    } catch {}
  }

  // Chain to the user's previous status line command, if any.
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8')).previousStatusLine; } catch {}
  if (prev && prev.command) {
    try {
      process.stdout.write(execSync(prev.command, { input: raw, encoding: 'utf8', timeout: 5000 }));
      return;
    } catch {}
  }

  const parts = [];
  if (input.model && input.model.display_name) parts.push(input.model.display_name);
  if (rl && rl.five_hour) parts.push(`5h ${Math.round(rl.five_hour.used_percentage)}% · ${fmtLeft(rl.five_hour.resets_at)}`);
  if (rl && rl.seven_day) parts.push(`7d ${Math.round(rl.seven_day.used_percentage)}%`);
  process.stdout.write(parts.join('  |  '));
});
