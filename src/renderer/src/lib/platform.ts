import type { Language, MenuCommand, OpenedFile } from '../../../shared/types'

/**
 * Thin wrapper over the Electron preload API with browser fallbacks, so the
 * renderer can also run in a plain browser during development and tests.
 */
const api = window.api

export const isDesktop = Boolean(api)

export async function openDialog(): Promise<OpenedFile[]> {
  if (api) return api.openDialog()
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf,image/*'
    input.multiple = true
    input.onchange = async () => resolve(await readBrowserFiles([...(input.files ?? [])]))
    input.click()
  })
}

async function readBrowserFiles(files: File[]): Promise<OpenedFile[]> {
  return Promise.all(
    files.map(async (file) => ({ name: file.name, path: null, data: new Uint8Array(await file.arrayBuffer()) }))
  )
}

/** Reads files dropped onto the window. On desktop they are re-read by the main process so they can be saved in place. */
export async function openDropped(files: File[]): Promise<OpenedFile[]> {
  const usable = files.filter((f) => isPdfName(f.name) || isImageName(f.name))
  if (api) {
    const paths = usable.map((f) => api.pathForFile(f)).filter((p): p is string => Boolean(p))
    if (paths.length === usable.length) return api.openPaths(paths)
  }
  return readBrowserFiles(usable)
}

export const isPdfName = (name: string): boolean => /\.pdf$/i.test(name)
export const isImageName = (name: string): boolean => /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)

/** Writes a new file into the Downloads folder without asking, never overwriting an existing one. */
export async function saveToDownloads(fileName: string, data: Uint8Array): Promise<string | null> {
  if (api) return api.saveToDownloads(fileName, data)
  await saveAs(fileName, data)
  return null
}

export const showInFolder = (path: string): void => api?.showInFolder(path)

export async function save(path: string, data: Uint8Array): Promise<void> {
  if (!api) throw new Error('Saving in place requires the desktop app')
  await api.save(path, data)
}

export async function saveAs(defaultName: string, data: Uint8Array): Promise<string | null> {
  if (api) return api.saveAs(defaultName, data)
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = defaultName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return null
}

export const setDirty = (dirty: boolean): void => api?.setDirty(dirty)
export const setLanguage = (language: Language): void => api?.setLanguage(language)
export const onMenu = (callback: (command: MenuCommand) => void): (() => void) => api?.onMenu(callback) ?? (() => {})
export const onFilesOpened = (callback: (files: OpenedFile[]) => void): (() => void) =>
  api?.onFilesOpened(callback) ?? (() => {})
