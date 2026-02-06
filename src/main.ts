import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';

let mainWindow: BrowserWindow | null = null;

const formatMappingsPath = path.join(app.getPath('userData'), 'format-mappings.json');

function loadFormatMappings(): { [key: string]: string } {
  try {
    if (fs.existsSync(formatMappingsPath)) {
      return JSON.parse(fs.readFileSync(formatMappingsPath, 'utf-8'));
    }
  } catch {
    // ignore corrupt config
  }
  return {};
}

function saveFormatMappings(mappings: { [key: string]: string }): void {
  fs.writeFileSync(formatMappingsPath, JSON.stringify(mappings, null, 2), 'utf-8');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Text Editor'
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu-new')
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu-save-as')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFile(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'HTML Files', extensions: ['html', 'htm'] },
      { name: 'XML Files', extensions: ['xml', 'xaml'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'JavaScript Files', extensions: ['js', 'jsx', 'mjs'] },
      { name: 'TypeScript Files', extensions: ['ts', 'tsx'] },
      { name: 'C# Files', extensions: ['cs'] },
      { name: 'CSS Files', extensions: ['css', 'scss', 'less'] },
      { name: 'Java Files', extensions: ['java'] },
      { name: 'SQL Files', extensions: ['sql'] },
      { name: 'C/C++ Files', extensions: ['c', 'cpp', 'h', 'hpp'] },
      { name: 'Python Files', extensions: ['py'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileData = await readFileWithEncoding(filePath);
    mainWindow?.webContents.send('file-opened', fileData);
  }
}

interface FileData {
  filePath: string;
  content: string;
  encoding: string;
  language: string;
}

async function readFileWithEncoding(filePath: string): Promise<FileData> {
  const buffer = fs.readFileSync(filePath);
  const encoding = detectEncoding(buffer);
  const content = iconv.decode(buffer, encoding);

  return {
    filePath,
    content,
    encoding,
    language: getLanguageFromExtension(path.extname(filePath))
  };
}

function detectEncoding(buffer: Buffer): string {
  // Check for BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }

  // Check if valid UTF-8
  if (isValidUtf8(buffer)) {
    return 'utf-8';
  }

  return 'utf-8'; // Default
}

function isValidUtf8(buffer: Buffer): boolean {
  let i = 0;
  while (i < buffer.length) {
    const b = buffer[i];
    if (b < 0x80) {
      i++;
    } else if ((b & 0xE0) === 0xC0) {
      if (i + 1 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80) return false;
      i += 2;
    } else if ((b & 0xF0) === 0xE0) {
      if (i + 2 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80) return false;
      i += 3;
    } else if ((b & 0xF8) === 0xF0) {
      if (i + 3 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80 || (buffer[i + 3] & 0xC0) !== 0x80) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

function getLanguageFromExtension(ext: string): string {
  const map: { [key: string]: string } = {
    '.html': 'html',
    '.htm': 'html',
    '.xml': 'xml',
    '.xaml': 'xml',
    '.json': 'json',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.cs': 'csharp',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.java': 'java',
    '.sql': 'sql',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.py': 'python',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.txt': 'plaintext'
  };
  return map[ext.toLowerCase()] || 'plaintext';
}

// IPC Handlers
ipcMain.handle('open-file-dialog', async () => {
  await openFile();
});

ipcMain.handle('save-file', async (_, data: { filePath: string; content: string; encoding: string }) => {
  try {
    const buffer = iconv.encode(data.content, data.encoding);
    fs.writeFileSync(data.filePath, buffer);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('save-file-dialog', async (_, data: { content: string; encoding: string; suggestedName?: string }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: data.suggestedName || 'untitled.txt',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    try {
      const buffer = iconv.encode(data.content, data.encoding);
      fs.writeFileSync(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('reload-file', async (_, data: { filePath: string }) => {
  try {
    const fileData = await readFileWithEncoding(data.filePath);
    return fileData;
  } catch (error) {
    return null;
  }
});

ipcMain.handle('load-format-mappings', async () => {
  return loadFormatMappings();
});

ipcMain.handle('save-format-mappings', async (_, mappings: { [key: string]: string }) => {
  try {
    saveFormatMappings(mappings);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
