import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, parse, resolve, sep } from 'node:path'
import { userInfo } from 'node:os'
import { pathToFileURL } from 'node:url'
import type { Language, OpenedFile } from '../shared/types'
import { buildMenu } from './menu'

const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL)
const RENDERER_DIR = join(__dirname, '../renderer')

/**
 * Portable mode: keep settings and the signature library in a `data` folder
 * next to the executable, so nothing is written to the host machine and the
 * app carries its state when the folder is moved. If that location is not
 * writable (read-only USB, Program Files), fall back to the OS user-data
 * directory so saving never silently fails.
 */
function usePortableDataDir(): void {
  if (!app.isPackaged) return
  const dataDir = join(dirname(app.getPath('exe')), 'data')
  try {
    mkdirSync(dataDir, { recursive: true })
    accessSync(dataDir, constants.W_OK)
    writeFileSync(join(dataDir, '.writable'), '')
    app.setPath('userData', dataDir)
  } catch {
    // Keep the default OS user-data directory; the app still works, just not portable.
  }
}
usePortableDataDir()

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

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const isPdfPath = (p: string): boolean => extname(p).toLowerCase() === '.pdf'
const isOpenablePath = (p: string): boolean =>
  isPdfPath(p) || IMAGE_EXTENSIONS.includes(extname(p).slice(1).toLowerCase())

/** Reads PDFs and images. Only PDFs become writable: images are converted, never overwritten. */
async function readFiles(paths: string[]): Promise<OpenedFile[]> {
  const files: OpenedFile[] = []
  for (const p of paths.filter(isOpenablePath)) {
    const absolute = resolve(p)
    const data = await readFile(absolute)
    if (isPdfPath(absolute)) writablePaths.add(absolute)
    files.push({ name: basename(absolute), path: absolute, data: new Uint8Array(data) })
  }
  return files
}

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

/** Picks `name.pdf`, or `name (2).pdf`, `name (3).pdf`… if taken, in the given folder. */
async function uniquePath(folder: string, fileName: string): Promise<string> {
  const { name } = parse(fileName)
  let candidate = join(folder, `${name}.pdf`)
  for (let n = 2; await exists(candidate); n++) candidate = join(folder, `${name} (${n}).pdf`)
  return candidate
}

async function openPathsInWindow(paths: string[]): Promise<void> {
  if (!mainWindow || !rendererReady) {
    pendingPaths.push(...paths)
    return
  }
  try {
    const files = await readFiles(paths)
    if (files.length) mainWindow.webContents.send('files:opened', files)
  } catch (error) {
    dialog.showErrorBox('Salah PDF', String(error))
  }
}

const pdfArgs = (argv: string[]): string[] => argv.filter((a) => !a.startsWith('-') && isOpenablePath(a))

function createWindow(): void {
  rendererReady = false
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#1d1f23',
    title: 'Salah PDF',
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
      filters: [
        { name: 'PDF & Images', extensions: ['pdf', ...IMAGE_EXTENSIONS] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Images', extensions: IMAGE_EXTENSIONS }
      ]
    })
    return result.canceled ? [] : readFiles(result.filePaths)
  })

  ipcMain.handle('file:openPaths', (_event, paths: string[]) => readFiles(paths))

  ipcMain.handle('file:saveToDownloads', async (_event, fileName: string, data: Uint8Array) => {
    const target = await uniquePath(app.getPath('downloads'), basename(fileName))
    await writeFile(target, data)
    writablePaths.add(resolve(target))
    return target
  })

  // Writes any binary (image export) to Downloads, keeping the caller-chosen extension.
  ipcMain.handle('file:saveBytesToDownloads', async (_event, fileName: string, data: Uint8Array) => {
    const folder = app.getPath('downloads')
    const { name, ext } = parse(basename(fileName))
    let candidate = join(folder, `${name}${ext}`)
    for (let n = 2; await exists(candidate); n++) candidate = join(folder, `${name} (${n})${ext}`)
    await writeFile(candidate, data)
    writablePaths.add(resolve(candidate))
    return candidate
  })

  ipcMain.on('file:showInFolder', (_event, path: string) => {
    if (writablePaths.has(resolve(path))) shell.showItemInFolder(path)
  })

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

  ipcMain.handle('app:userName', () => {
    try {
      return userInfo().username
    } catch {
      return ''
    }
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
