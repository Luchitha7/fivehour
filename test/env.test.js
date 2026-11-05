const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findExecutable, extraDirs, augmentedPath } = require('../src/env');

const WIN = process.platform === 'win32';

test('finds an executable in the search path, and only real ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-bin-'));
  const file = path.join(dir, WIN ? 'fakenode.cmd' : 'fakenode');
  fs.writeFileSync(file, WIN ? '@echo off\r\n' : '#!/bin/sh\n');
  if (!WIN) fs.chmodSync(file, 0o755);
  const searchPath = dir;
  assert.equal(findExecutable('fakenode', { searchPath }), file);
  assert.equal(findExecutable('not-a-real-tool-xyz', { searchPath }), null);
  assert.equal(findExecutable('fakenode', { searchPath: '' }), null);
});

test('non-executable files are ignored on macOS/Linux', { skip: WIN }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-bin-'));
  fs.writeFileSync(path.join(dir, 'plainfile'), 'x');
  assert.equal(findExecutable('plainfile', { searchPath: dir }), null);
});

test('Windows search covers the usual Node.js and npm folders', () => {
  const env = { ProgramFiles: 'C:\\Program Files', APPDATA: 'C:\\Users\\a\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', PATH: 'C:\\Windows' };
  const dirs = extraDirs('win32', env, 'C:\\Users\\a');
  assert.ok(dirs.includes('C:\\Program Files\\nodejs'));
  assert.ok(dirs.includes('C:\\Users\\a\\AppData\\Roaming\\npm'));
  assert.ok(augmentedPath('win32', env).endsWith(';C:\\Windows'));
});

test('the current Node.js is found on this machine', () => {
  assert.ok(findExecutable('node'));
});
