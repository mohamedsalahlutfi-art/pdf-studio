import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { Language, MenuCommand, OpenedFile } from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api = {
  openDialog: (): Promise<OpenedFile[]> => ipcRenderer.invoke('dialog:open'),
  openPaths: (paths: string[]): Promise<OpenedFile[]> => ipcRenderer.invoke('file:openPaths', paths),
  save: (path: string, data: Uint8Array): Promise<void> => ipcRenderer.invoke('file:save', path, data),
  saveAs: (defaultName: string, data: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveAs', defaultName, data),
  pathForFile: (file: File): string | null => webUtils.getPathForFile(file) || null,
  setDirty: (dirty: boolean): void => ipcRenderer.send('app:setDirty', dirty),
  setLanguage: (language: Language): void => ipcRenderer.send('app:setLanguage', language),
  onMenu: (callback: (command: MenuCommand) => void) => subscribe('menu', callback),
  onFilesOpened: (callback: (files: OpenedFile[]) => void) => subscribe('files:opened', callback)
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('api', api)
