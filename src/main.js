const { app, Tray, BrowserWindow, Menu, nativeImage, Notification, ipcMain, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const install = require('./install');
const usage = require('./usage');
const alerts = require('./alerts');
const anchor = require('./anchor');
const endpoint = require('./sources/endpoint');
const update = require('./update');
const { ringPng } = require('./icon');
const { DATA_DIR, USAGE_FILE, LIVE_FILE } = require('./paths');

let tray = null;
let popup = null;
let snapshot = null;
let alertMem = {};
let endpointData = null;
let endpointError = null;
let endpointFailures = 0;
let endpointTimer = null;
let endpointNextAt = 0; // don't poll before this (rate-limit backoff)
let endpointLimited = false; // last attempt got a 429
let anchorFired = [];
let lastAnchor = null;
let lastIconKey = '';
let updateInfo = null; // { version, url } when a newer release exists

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
if (process.platform === 'darwin' && app.dock) app.dock.hide();

const WEB_PREFS = {
  preload: path.join(__dirname, 'ui', 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
};

// Our windows only ever show local files: block navigation, pop-ups and permission requests.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (ev) => ev.preventDefault());
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
});

function trayIcon(pct, warnAt) {
  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 1, buffer: ringPng(16, pct, warnAt) });
  img.addRepresentation({ scaleFactor: 2, buffer: ringPng(32, pct, warnAt) });
  return img;
}

function trayText(s) {
  const fh = s.fiveHour;
  if (!fh) return 'no data';
  if (!fh.active) return 'ready';
  const left = usage.fmtDuration(fh.resetsAt - Date.now()).replace(' ', '');
  if (fh.pct == null) return `~${left}`;
  return `${fh.pctEstimated ? '~' : ''}${Math.round(fh.pct)}% · ${fh.estimated ? '~' : ''}${left}`;
}

function refresh() {
  const cfg = config.load();
  snapshot = usage.collect({ endpoint: endpointData, calibration: cfg.tokensPer100 });
  // Learn tokens-per-100% whenever an exact reading lines up with the local logs,
  // so later estimates are closer. Only saved when it moves by more than 5%.
  const cal = usage.calibrate(snapshot);
  if (cal && (!cfg.tokensPer100 || Math.abs(cal - cfg.tokensPer100) / cfg.tokensPer100 > 0.05)) config.update({ tokensPer100: cal });
  snapshot.connected = install.isConnected();
  snapshot.endpointError = endpointError;
  snapshot.endpointWaiting = !!endpointError && endpointLimited;
  snapshot.lastAnchor = lastAnchor;
  snapshot.config = config.publicView(cfg);
  snapshot.appVersion = app.getVersion();
  snapshot.update = updateInfo ? { version: updateInfo.version } : null;
  snapshot.loginItemSupported = process.platform !== 'linux';
  snapshot.openAtLogin = snapshot.loginItemSupported && app.getLoginItemSettings().openAtLogin;

  if (tray) {
    const pct = snapshot.fiveHour && snapshot.fiveHour.active ? snapshot.fiveHour.pct : null;
    const key = `${pct == null ? 'x' : Math.round(pct)}:${cfg.warnAtPercent}`;
    if (key !== lastIconKey) { tray.setImage(trayIcon(pct, cfg.warnAtPercent)); lastIconKey = key; }
    const text = trayText(snapshot);
    if (process.platform === 'darwin') tray.setTitle(` ${text}`, { fontType: 'monospacedDigit' });
    const wk = snapshot.sevenDay ? ` | week ${Math.round(snapshot.sevenDay.pct)}%` : '';
    tray.setToolTip(`Claude 5h: ${text}${wk}`);
  }

  const res = alerts.evaluate(snapshot, cfg, alertMem);
  alertMem = res.mem;
  for (const a of res.alerts) {
    if (Notification.isSupported()) new Notification({ title: a.title, body: a.body, silent: false }).show();
  }

  if (popup && !popup.isDestroyed()) popup.webContents.send('snapshot', snapshot);
  if (widget && !widget.isDestroyed()) widget.webContents.send('snapshot', snapshot);
}

let widget = null;

function syncWidget() {
  const cfg = config.load();
  if (!cfg.showWidget) { if (widget && !widget.isDestroyed()) widget.close(); widget = null; return; }
  if (widget && !widget.isDestroyed()) return;
  const W = 230, H = 46;
  const wa = screen.getPrimaryDisplay().workArea;
  let pos = cfg.widgetPosition;
  const onScreen = pos && screen.getAllDisplays().some((d) => {
    const b = d.workArea; return pos.x >= b.x && pos.y >= b.y && pos.x + W <= b.x + b.width && pos.y + H <= b.y + b.height;
  });
  if (!onScreen) pos = { x: wa.x + wa.width - W - 16, y: wa.y + 12 };
  widget = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y, frame: false, transparent: true, resizable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, show: false,
    webPreferences: WEB_PREFS,
  });
  widget.setAlwaysOnTop(true, 'floating');
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  widget.loadFile(path.join(__dirname, 'ui', 'widget.html'));
  widget.once('ready-to-show', () => widget.showInactive());
  widget.on('moved', () => { const [x, y] = widget.getPosition(); config.update({ widgetPosition: { x, y } }); });
  widget.on('closed', () => { widget = null; });
}

function openUpdatePage() {
  // Only ever open this repo's release pages (validated in update.parseRelease).
  if (updateInfo && updateInfo.url.startsWith(update.RELEASES_PREFIX)) shell.openExternal(updateInfo.url);
}

async function checkUpdates() {
  if (!config.load().checkUpdates) { updateInfo = null; refresh(); return; }
  try {
    updateInfo = await update.checkForUpdate(app.getVersion());
  } catch {
    return; // offline or rate-limited: try again next time
  }
  if (updateInfo && config.load().notifiedUpdate !== updateInfo.version && Notification.isSupported()) {
    config.update({ notifiedUpdate: updateInfo.version });
    const n = new Notification({ title: `fivehour ${updateInfo.version} is available`, body: 'Click to download the new version.' });
    n.on('click', openUpdatePage);
    n.show();
  }
  refresh();
}

function loadLiveCache() {
  try {
    const d = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    if (d && d.source === 'endpoint' && Number.isFinite(d.updated_at)) endpointData = d;
  } catch {}
}

function saveLiveCache(d) {
  try {
    const tmp = `${LIVE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, LIVE_FILE);
  } catch {}
}

// Live data: poll every 5 min, back off on errors (at least 10 min after a 429), and keep
// showing the last good reading meanwhile. `force` is for the user turning it on by hand.
async function pollEndpoint({ force = false } = {}) {
  clearTimeout(endpointTimer);
  if (!config.load().pollEndpoint) { endpointData = null; endpointError = null; endpointFailures = 0; refresh(); return; }
  const wait = endpointNextAt - Date.now();
  // Wait out the backoff. A manual "Try again" may skip it, except after a 429.
  if (wait > 0 && (!force || endpointLimited)) { endpointTimer = setTimeout(pollEndpoint, wait); return; }
  let err = null;
  try {
    endpointData = await endpoint.fetchUsage();
    saveLiveCache(endpointData);
    endpointError = null;
    endpointFailures = 0;
    endpointLimited = false;
  } catch (e) {
    endpointLimited = e.status === 429;
    err = e;
    endpointFailures += 1;
  }
  const delay = endpoint.nextDelay(err, endpointFailures);
  endpointNextAt = Date.now() + delay;
  if (err) {
    const at = new Date(endpointNextAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    endpointError = err.code === 'expired'
      ? 'Your Claude Code login has expired. Open Terminal, run "claude auth login", then click Try again.'
      : err.code === 'no-login'
        ? 'No Claude Code login found. Open Terminal, run "claude auth login", then click Try again.'
        : err.status === 429
          ? `Anthropic is limiting requests right now. Trying again at ${at}.`
          : `${err.message}. Trying again at ${at}.`;
  }
  endpointTimer = setTimeout(pollEndpoint, delay);
  refresh();
}

async function checkAnchors() {
  const cfg = config.load();
  if (!cfg.anchorEnabled || !cfg.anchors.length) return;
  const key = anchor.dueAnchor(cfg.anchors, Date.now(), anchorFired);
  if (!key) return;
  anchorFired = [...anchorFired.slice(-20), key];
  if (snapshot && snapshot.fiveHour && snapshot.fiveHour.active) {
    lastAnchor = { at: Date.now(), result: 'skipped: a window is already running' };
    return;
  }
  const r = await anchor.sendPing(cfg.anchorModel);
  lastAnchor = { at: Date.now(), result: r.ok ? 'started a new window' : `failed: ${r.error}` };
  if (r.ok && Notification.isSupported()) new Notification({ title: 'New 5-hour window started', body: 'Anchored on your schedule.' }).show();
  setTimeout(pollEndpoint, 5000);
  refresh();
}

function createPopup() {
  popup = new BrowserWindow({
    width: 340, height: 560, show: false, frame: false, resizable: false, movable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, transparent: false,
    backgroundColor: '#00000000', vibrancy: 'popover', visualEffectState: 'active',
    webPreferences: WEB_PREFS,
  });
  // Open on whichever desktop (Space) the user is on, instead of switching back to the Space the
  // panel was first created on. skipTransformProcessType keeps the Dock icon hidden.
  if (process.platform === 'darwin') popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  popup.loadFile(path.join(__dirname, 'ui', 'popup.html'));
  popup.on('blur', () => { if (!popup.webContents.isDevToolsOpened()) popup.hide(); });
}

function togglePopup(anchorBounds) {
  if (!popup || popup.isDestroyed()) createPopup();
  if (popup.isVisible()) return popup.hide();
  const tb = anchorBounds && anchorBounds.width ? anchorBounds : tray.getBounds();
  const { width, height } = popup.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea;
  let x = Math.round(tb.x + tb.width / 2 - width / 2);
  // Taskbar at the bottom (Windows) -> open above the icon; menu bar at top (macOS) -> below.
  let y = tb.y > disp.y + disp.height / 2 ? tb.y - height - 6 : tb.y + tb.height + 6;
  if (!tb.width) { x = disp.x + disp.width - width - 12; y = disp.y + disp.height - height - 12; }
  x = Math.max(disp.x + 6, Math.min(x, disp.x + disp.width - width - 6));
  popup.setPosition(x, y, false);
  popup.show();
  popup.focus();
  refresh();
}

ipcMain.handle('get-snapshot', () => snapshot);
ipcMain.handle('set-config', (_e, patch) => {
  const clean = config.sanitizeUserPatch(patch); // never trust the renderer
  config.updateFromUser(clean);
  if ('pollEndpoint' in clean) pollEndpoint({ force: clean.pollEndpoint });
  if ('showWidget' in clean) syncWidget();
  if ('checkUpdates' in clean) checkUpdates();
  refresh();
  return snapshot;
});
ipcMain.handle('set-open-at-login', (_e, on) => {
  if (typeof on === 'boolean' && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: on });
  refresh();
  return snapshot;
});
ipcMain.handle('open-update', () => openUpdatePage());
ipcMain.handle('open-popup', () => togglePopup(widget && !widget.isDestroyed() ? widget.getBounds() : null));
ipcMain.handle('connect', () => { const r = install.connect(); refresh(); return r; });
ipcMain.handle('disconnect', () => { const r = install.disconnect(); refresh(); return r; });
ipcMain.handle('anchor-now', async () => { const r = await anchor.sendPing(config.load().anchorModel); lastAnchor = { at: Date.now(), result: r.ok ? 'started a new window' : `failed: ${r.error}` }; refresh(); return r; });
ipcMain.handle('quit', () => app.quit());

if (gotLock) app.whenReady().then(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  install.refreshHook();
  tray = new Tray(trayIcon(null, 75));
  tray.on('click', () => togglePopup());
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => togglePopup() },
    { label: 'Show floating widget', type: 'checkbox', checked: config.load().showWidget, click: (m) => { config.update({ showWidget: m.checked }); syncWidget(); } },
    { label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { type: 'separator' },
    { label: 'Quit fivehour', click: () => app.quit() },
  ])));

  syncWidget();
  if (config.load().pollEndpoint) loadLiveCache();
  refresh();
  pollEndpoint();
  // First launch: open the panel so new users see the Connect button straight away.
  if (!config.load().welcomed) {
    config.update({ welcomed: true });
    setTimeout(() => togglePopup(), 1200);
  }
  // Status line file changes -> update immediately.
  try { fs.watch(DATA_DIR, (_ev, f) => { if (f === path.basename(USAGE_FILE)) refresh(); }); } catch {}
  setInterval(refresh, 30 * 1000);
  setInterval(checkAnchors, 30 * 1000);
  setTimeout(checkUpdates, 15 * 1000);
  setInterval(checkUpdates, 24 * 60 * 60 * 1000);
});

app.on('window-all-closed', (e) => e.preventDefault());
