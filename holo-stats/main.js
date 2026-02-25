const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { collectStats } = require('./stats-collector');

let mainWindow;
const TARGET_MONITOR = 2; // 0-indexed, matches xinerama_head = 2
const UPDATE_INTERVAL = 1000; // 1 second stats refresh

app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-gpu-compositing');

app.whenReady().then(() => {
  const { screen } = require('electron');

  ipcMain.handle('get-display-info', () => {
    const displays = screen.getAllDisplays();
    const target = displays[TARGET_MONITOR] || displays[displays.length - 1];
    return { width: target.bounds.width, height: target.bounds.height };
  });

  // Delay for compositor readiness on Linux
  setTimeout(() => {
    const displays = screen.getAllDisplays();
    const targetDisplay = displays[TARGET_MONITOR] || displays[displays.length - 1];
    const { x, y, width, height } = targetDisplay.bounds;

    mainWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setAlwaysOnTop(false);

    // Toggle mouse events from renderer (interactive elements vs transparent pass-through)
    ipcMain.on('set-ignore-mouse', (_event, ignore) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
      }
    });

    const indexPath = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);

    let statsInterval;

    async function sendStats() {
      try {
        const stats = await collectStats();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('stats-update', stats);
        }
      } catch (err) {
        console.error('Stats collection error:', err.message);
      }
    }

    mainWindow.webContents.on('did-finish-load', () => {
      sendStats();
      statsInterval = setInterval(sendStats, UPDATE_INTERVAL);
    });

    mainWindow.on('closed', () => {
      clearInterval(statsInterval);
      mainWindow = null;
    });
  }, 300);
});

app.on('window-all-closed', () => app.quit());
