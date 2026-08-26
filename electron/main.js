const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let currentZoomLevel = 0;
let isFirstLoad = true; // Flag: limpa sessão apenas no primeiro load do startup
const ZOOM_MIN = -4;
const ZOOM_MAX = 6;

// ══════════════════════════════════════════════════════════════
// PASTA COMPARTILHADA
// ══════════════════════════════════════════════════════════════

const CONFIG_FILE = path.join(app.getPath('userData'), 'nagumo-config.json');

function loadAppConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[Main] Error loading config:', e.message);
  }
  return { sharedFolder: null };
}

function saveAppConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Main] Error saving config:', e.message);
  }
}

function getSharedFolder() {
  const config = loadAppConfig();
  return config.sharedFolder;
}

function getUserDataPath() {
  const dataPath = app.getPath('userData');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
}

function getDeviceId() {
  const deviceIdPath = path.join(app.getPath('userData'), '.device_id');
  if (fs.existsSync(deviceIdPath)) {
    return fs.readFileSync(deviceIdPath, 'utf-8').trim();
  }
  const deviceId = `pc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  fs.writeFileSync(deviceIdPath, deviceId, 'utf-8');
  return deviceId;
}

// ══════════════════════════════════════════════════════════════
// JANELA
// ══════════════════════════════════════════════════════════════

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    title: 'RH Nagumo',
    show: false,
    backgroundColor: '#0b0d14',
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && !input.alt && !input.shift) {
      if (input.key === '=' || input.key === '+') {
        _handleZoomIn();
        _event.preventDefault();
      } else if (input.key === '-') {
        _handleZoomOut();
        _event.preventDefault();
      } else if (input.key === '0') {
        _handleZoomReset();
        _event.preventDefault();
      }
    }
  });
}

function _handleZoomIn() {
  if (!mainWindow) return;
  if (currentZoomLevel < ZOOM_MAX) {
    currentZoomLevel = Math.min(currentZoomLevel + 0.5, ZOOM_MAX);
    mainWindow.webContents.setZoomLevel(currentZoomLevel);
    mainWindow.webContents.send('zoom:changed', currentZoomLevel);
  }
}

function _handleZoomOut() {
  if (!mainWindow) return;
  if (currentZoomLevel > ZOOM_MIN) {
    currentZoomLevel = Math.max(currentZoomLevel - 0.5, ZOOM_MIN);
    mainWindow.webContents.setZoomLevel(currentZoomLevel);
    mainWindow.webContents.send('zoom:changed', currentZoomLevel);
  }
}

function _handleZoomReset() {
  if (!mainWindow) return;
  currentZoomLevel = 0;
  mainWindow.webContents.setZoomLevel(0);
  mainWindow.webContents.send('zoom:changed', 0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ══════════════════════════════════════════════════════════════
// IPC — Arquivos JSON
// ══════════════════════════════════════════════════════════════

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: true, data: null };
  } catch (e) {
    console.error('[Main] fs:readFile error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:writeFile', async (_event, filePath, data) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    console.error('[Main] fs:writeFile error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:exists', async (_event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('fs:readdir', async (_event, dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath);
      return { success: true, data: items };
    }
    return { success: true, data: [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:mkdir', async (_event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════
// IPC — Pasta Compartilhada
// ══════════════════════════════════════════════════════════════

ipcMain.handle('app:isFirstLoad', () => {
  if (isFirstLoad) {
    isFirstLoad = false;
    return true;
  }
  return false;
});

ipcMain.handle('app:getSharedFolder', () => {
  return getSharedFolder();
});

ipcMain.handle('app:setSharedFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecionar Pasta Compartilhada',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const folder = result.filePaths[0];
    const config = loadAppConfig();
    config.sharedFolder = folder;
    saveAppConfig(config);
    return { success: true, data: folder };
  }
  return { success: false };
});

// ══════════════════════════════════════════════════════════════
// IPC — Detecção Inteligente de Pasta
// ══════════════════════════════════════════════════════════════

ipcMain.handle('app:checkSharedFolder', async () => {
  const folder = getSharedFolder();
  if (!folder) {
    return { exists: false, hasData: false, configured: false };
  }
  
  const exists = fs.existsSync(folder);
  if (!exists) {
    return { exists: false, hasData: false, configured: true, path: folder };
  }
  
  // Verifica se tem dados (config.json ou arquivo .nagumo-marker)
  const hasConfig = fs.existsSync(path.join(folder, 'config.json'));
  const hasMarker = fs.existsSync(path.join(folder, '.nagumo-marker'));
  const hasData = hasConfig || hasMarker;
  
  return { exists: true, hasData, configured: true, path: folder };
});

ipcMain.handle('app:resolveSharedFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecionar ou Criar Pasta de Dados',
    message: 'Selecione a pasta onde os dados estão (ou onde deseja criá-los)',
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const folder = result.filePaths[0];
    const exists = fs.existsSync(folder);
    const hasConfig = exists && fs.existsSync(path.join(folder, 'config.json'));
    const hasMarker = exists && fs.existsSync(path.join(folder, '.nagumo-marker'));
    const hasData = hasConfig || hasMarker;
    
    // Salva a nova pasta
    const config = loadAppConfig();
    config.sharedFolder = folder;
    saveAppConfig(config);
    
    // Se pasta não existe, cria
    if (!exists) {
      fs.mkdirSync(folder, { recursive: true });
    }
    
    return { success: true, folder, hasData, exists: true };
  }
  
  return { success: false };
});

// ══════════════════════════════════════════════════════════════
// IPC — bcrypt
// ══════════════════════════════════════════════════════════════

ipcMain.handle('hash:bcrypt', async (_event, plainPass) => {
  return bcrypt.hashSync(plainPass, 10);
});

ipcMain.handle('hash:verify', async (_event, plainPass, hash) => {
  return bcrypt.compareSync(plainPass, hash);
});

// ══════════════════════════════════════════════════════════════
// IPC — App
// ══════════════════════════════════════════════════════════════

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('app:getDataPath', () => {
  return getUserDataPath();
});

ipcMain.handle('app:openDataFolder', async () => {
  await shell.openPath(getUserDataPath());
  return true;
});

ipcMain.handle('app:getDeviceId', () => {
  return getDeviceId();
});

// ══════════════════════════════════════════════════════════════
// IPC — Zoom
// ══════════════════════════════════════════════════════════════

ipcMain.handle('zoom:in', () => {
  if (!mainWindow) return currentZoomLevel;
  _handleZoomIn();
  return currentZoomLevel;
});

ipcMain.handle('zoom:out', () => {
  if (!mainWindow) return currentZoomLevel;
  _handleZoomOut();
  return currentZoomLevel;
});

ipcMain.handle('zoom:reset', () => {
  if (!mainWindow) return 0;
  _handleZoomReset();
  return currentZoomLevel;
});

ipcMain.handle('zoom:getLevel', () => {
  return currentZoomLevel;
});

ipcMain.handle('zoom:setLevel', (_event, level) => {
  currentZoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
  if (mainWindow) mainWindow.webContents.setZoomLevel(currentZoomLevel);
  return currentZoomLevel;
});

// ══════════════════════════════════════════════════════════════
// IPC — SQLite (migração)
// ══════════════════════════════════════════════════════════════

let db = null;
let Database = null;

// Tenta carregar better-sqlite3 (opcional — usado apenas para migração)
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.warn('[Main] better-sqlite3 not available. SQLite migration disabled.');
}

ipcMain.handle('db:query', async (_event, { sql, params }) => {
  try {
    if (!Database) {
      return { success: false, error: 'better-sqlite3 not installed' };
    }
    if (!db) {
      const dbPath = path.join(getUserDataPath(), 'rh_nagumo.db');
      if (fs.existsSync(dbPath)) {
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
      }
    }
    if (!db) return { success: true, data: [] };
    const stmt = db.prepare(sql);
    const result = params ? stmt.all(...params) : stmt.all();
    return { success: true, data: result };
  } catch (e) {
    console.error('[Main] db:query error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:run', async (_event, { sql, params }) => {
  try {
    if (!db) return { success: true, data: { changes: 0 } };
    const stmt = db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return { success: true, data: { changes: result.changes, lastInsertRowid: result.lastInsertRowid } };
  } catch (e) {
    console.error('[Main] db:run error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:exec', async (_event, { sql }) => {
  try {
    if (db) db.exec(sql);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════
// App Lifecycle
// ══════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  console.log('[Main] Creating window...');
  createWindow();
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
    console.log('[Main] Database closed');
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
