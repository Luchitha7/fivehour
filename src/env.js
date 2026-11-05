// Finding command-line tools from a GUI app.
// Apps started from Finder / the Start menu don't get your terminal's PATH, so we add the
// places Node.js and Claude Code usually install to.
const fs = require('fs');
const os = require('os');
const path = require('path');

function extraDirs(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    return [
      env.NVM_SYMLINK,
      env.ProgramFiles && path.win32.join(env.ProgramFiles, 'nodejs'),
      env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs', 'nodejs'),
      env.APPDATA && path.win32.join(env.APPDATA, 'npm'),
      path.win32.join(home, '.local', 'bin'),
    ].filter(Boolean);
  }
  return [
    env.NVM_BIN,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.posix.join(home, '.local', 'bin'),
    path.posix.join(home, '.claude', 'local'),
    path.posix.join(home, '.npm-global', 'bin'),
    path.posix.join(home, '.volta', 'bin'),
  ].filter(Boolean);
}

function augmentedPath(platform = process.platform, env = process.env) {
  const delim = platform === 'win32' ? ';' : ':';
  return [...extraDirs(platform, env), env.PATH || env.Path || ''].join(delim);
}

/** Full path to an executable on the (augmented) PATH, or null. */
function findExecutable(name, { platform = process.platform, env = process.env, searchPath } = {}) {
  const delim = platform === 'win32' ? ';' : ':';
  const dirs = (searchPath != null ? searchPath : augmentedPath(platform, env)).split(delim);
  const exts = platform === 'win32'
    ? ['', ...(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())]
    : [''];
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, name + ext);
      try {
        const st = fs.statSync(p);
        if (st.isFile()) {
          if (platform === 'win32') return p;
          try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
        }
      } catch {}
    }
  }
  return null;
}

module.exports = { augmentedPath, findExecutable, extraDirs };
