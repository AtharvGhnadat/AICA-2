const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

// ─── Single instance lock ────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[EMO] Another instance is already running. Quitting.');
  app.quit();
  return;
}

// ─── Chromium flags for Raspberry Pi ─────────────────────────────────────
// Allow autoplay without user gesture (fixes AudioContext issue)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// GPU acceleration on Raspberry Pi
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// Disable unnecessary features to save resources
app.commandLine.appendSwitch('disable-software-rasterizer');

// Ignore certificate errors for our local HTTPS development server
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow;

// If a second instance tries to open, focus the existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    // ── Maximized window (not fullscreen) so user can minimize ────────────
    fullscreen: false,
    frame: false,            // No native title bar — we draw our own controls
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show: false,             // Show after ready-to-show to avoid white flash
    minimizable: true,
    maximizable: true,
    resizable: true,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Allow mic/camera without permission prompt
      // (handled by session permission handler below)
    },
  });

  // Start maximized so it fills the screen but can still be minimized
  mainWindow.maximize();

  // ── Grant mic permission automatically ──────────────────────────────────
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem'];
    callback(allowed.includes(permission));
  });

  // ── Also handle permission checks (Chromium 96+) ────────────────────────
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem'];
    return allowed.includes(permission);
  });

  // ── Load the app ────────────────────────────────────────────────────────
  // In development: load from Vite dev server
  // In production: load from built files
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('https://localhost:3000');
    // Uncomment to open DevTools in dev mode:
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Show window when ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });



  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC handlers for window controls ──────────────────────────────────────
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-maximize-toggle', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
