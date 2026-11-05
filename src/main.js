const { app, Tray, BrowserWindow, Menu, nativeImage, Notification, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const install = require('./install');
const usage = require('./usage');
const alerts = require('./alerts');
const anchor = require('./anchor');
const endpoint = require('./sources/endpoint');
const { ringPng } = require('./icon');
const { DATA_DIR, USAGE_FILE } = require('./paths');

let tray = null;
let popup = null;
let snapshot = null;
let alertMem = {};
let endpointData = null;
let endpointError = null;
let anchorFired = [];
let lastAnchor = null;
let lastIconKey = '';

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
  return fh.pct == null ? `~${left}` : `${Math.round(fh.pct)}% · ${left}`;
}

function refresh() {
  const cfg = config.load();
  snapshot = usage.collect({ endpoint: endpointData });
  snapshot.connected = install.isConnected();
  snapshot.endpointError = endpointError;
  snapshot.lastAnchor = lastAnchor;
  snapshot.config = config.publicView(cfg);

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
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widget.loadFile(path.join(__dirname, 'ui', 'widget.html'));
  widget.once('ready-to-show', () => widget.showInactive());
  widget.on('moved', () => { const [x, y] = widget.getPosition(); config.update({ widgetPosition: { x, y } }); });
  widget.on('closed', () => { widget = null; });
}

async function pollEndpoint() {
  if (!config.load().pollEndpoint) { endpointData = null; endpointError = null; return; }
  try { endpointData = await endpoint.fetchUsage(); endpointError = null; }
  catch (e) { endpointError = e.message; }
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
  if ('pollEndpoint' in clean) pollEndpoint();
  if ('showWidget' in clean) syncWidget();
  refresh();
  return snapshot;
});
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
  refresh();
  pollEndpoint();
  // Status line file changes -> update immediately.
  try { fs.watch(DATA_DIR, (_ev, f) => { if (f === path.basename(USAGE_FILE)) refresh(); }); } catch {}
  setInterval(refresh, 30 * 1000);
  setInterval(pollEndpoint, 3 * 60 * 1000);
  setInterval(checkAnchors, 30 * 1000);
});

app.on('window-all-closed', (e) => e.preventDefault());
