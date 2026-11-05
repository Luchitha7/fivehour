const os = require('os');
const path = require('path');

const HOME = os.homedir();
const DATA_DIR = path.join(HOME, '.fivehour');

module.exports = {
  HOME,
  DATA_DIR,
  USAGE_FILE: path.join(DATA_DIR, 'usage.json'),
  CONFIG_FILE: path.join(DATA_DIR, 'config.json'),
  HOOK_FILE: path.join(DATA_DIR, 'statusline.js'),
  CLAUDE_DIR: process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'),
};
