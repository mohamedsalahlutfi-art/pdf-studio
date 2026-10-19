import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Language, OpenedFile } from '../shared/types'
import { buildMenu } from './menu'

const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL)
const RENDERER_DIR = join(__dirname, '../renderer')

// The production renderer is served from app://bundle/ instead of file:// so
// pdf.js can fetch its fonts, CMaps and WASM decoders like on a normal origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let mainWindow: BrowserWindow | null = null
let rendererReady = false
let hasUnsavedChanges = false
let language: Language = 'ar'
const pendingPaths: string[] = []

// The renderer may only write to PDFs the user opened or picked in a dialog.
const writablePaths = new Set<string>()

const isPdfPath = (p: string): boolean => extname(p).toLowerCase() === '.pdf'

async function readPdfFiles(paths: string[]): Promise<OpenedFile[]> {
  const files: OpenedFile[] = []
  for (const p of paths.filter(isPdfPath)) {
    const absolute = resolve(p)
    const data = await readFile(absolute)
    writablePaths.add(absolute)
    files.push({ name: basename(absolute), path: absolute, data: new Uint8Array(data) })
  }
  return files
}

async function openPathsInWindow(paths: string[]): Promise<void> {
  if (!mainWindow || !rendererReady) {
    pendingPaths.push(...paths)
    return
  }
  try {
    const files = await readPdfFiles(paths)
    if (files.length) mainWindow.webContents.send('files:opened', files)
  } catch (error) {
    dialog.showErrorBox('PDF Studio', String(error))
  }
}

const pdfArgs = (argv: string[]): string[] => argv.filter((a) => !a.startsWith('-') && isPdfPath(a))

function createWindow(): void {
  rendererReady = false
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#1d1f23',
    title: 'PDF Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  mainWindow = win

  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => {
    rendererReady = true
    if (pendingPaths.length) void openPathsInWindow(pendingPaths.splice(0))
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  win.on('close', (event) => {
    if (!hasUnsavedChanges) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: language === 'ar' ? ['إغلاق بدون حفظ', 'إلغاء'] : ['Discard and Close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: language === 'ar' ? 'توجد تعديلات غير محفوظة.' : 'You have unsaved changes.'
    })
    if (choice === 1) event.preventDefault()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  buildMenu(win, language, isDev)
  if (isDev) void win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else void win.loadURL('app://bundle/index.html')
}

function registerIpc(): void {
  ipcMain.handle('dialog:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    return result.canceled ? [] : readPdfFiles(result.filePaths)
  })

  ipcMain.handle('file:openPaths', (_event, paths: string[]) => readPdfFiles(paths))

  ipcMain.handle('file:save', async (_event, path: string, data: Uint8Array) => {
    const absolute = resolve(path)
    if (!writablePaths.has(absolute)) throw new Error(`Refusing to write ${absolute}`)
    await writeFile(absolute, data)
  })

  ipcMain.handle('dialog:saveAs', async (event, defaultName: string, data: Uint8Array) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    const target = isPdfPath(result.filePath) ? result.filePath : `${result.filePath}.pdf`
    await writeFile(target, data)
    writablePaths.add(resolve(target))
    return target
  })

  ipcMain.on('app:setDirty', (_event, dirty: boolean) => {
    hasUnsavedChanges = dirty
  })

  ipcMain.on('app:setLanguage', (event, next: Language) => {
    language = next
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) buildMenu(win, language, isDev)
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  pendingPaths.push(...pdfArgs(process.argv))

  app.on('second-instance', (_event, argv) => {
    void openPathsInWindow(pdfArgs(argv))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // macOS delivers files opened from Finder through this event, possibly before ready.
  app.on('open-file', (event, path) => {
    event.preventDefault()
    void openPathsInWindow([path])
  })

  void app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url)
      const filePath = resolve(RENDERER_DIR, decodeURIComponent(pathname).replace(/^\/+/, ''))
      if (!filePath.startsWith(RENDERER_DIR + sep)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(filePath).toString())
    })
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
