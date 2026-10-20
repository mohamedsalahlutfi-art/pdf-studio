import { create } from 'zustand'
import type { Language, OpenedFile } from '../../../shared/types'
import type { ImageInput } from '../lib/buildPdf'
import { compressReport, type CompressReportState } from '../lib/compressState'
import type { CompressOptions, CompressReport } from '../lib/compress'
import { encryptBytes, EncryptedExportError, exportDocument, runPdfTask, runPdfTaskFull } from '../lib/exportDocument'
import type { EncryptOptions, Permissions } from '../lib/security'
import { buildTiff, encodeImage, renderPageBitmap, type ImageFormat, type RasterOptions } from '../lib/exportImages'
import { commit, createHistory, redo, undo, type History } from '../lib/history'
import { translate, type StringKey } from '../lib/i18n'

export type StringKeyLike = StringKey
import { displaySize } from '../lib/layout'
import { translateAnnotation } from '../lib/geometry'
import { loadLibrary, saveLibrary, type Library } from '../lib/library'
import { newId, type Annotation, type DocState, type ImageAnnotation, type LabelRange, type PageRef } from '../lib/model'
import * as ops from '../lib/pageOps'
import { normalizeLabels } from '../lib/pageLabels'
import { PasswordCancelledError } from '../lib/pdfjs'
import * as platform from '../lib/platform'
import { addSource, getSource, releaseSource } from '../lib/sources'

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 8

export interface Tab {
  id: string
  title: string
  /** File the tab was opened from, if any. Never written unless the user asks to. */
  originalPath: string | null
  /** Where Ctrl+S writes. Set by the first save (Downloads) or by Save As. */
  outputPath: string | null
  sourceIds: string[]
  history: History<DocState>
  /** The state last written to disk; the tab is dirty when `history.present` differs. */
  savedState: DocState
  zoom: number
  /** Auto-fit mode: fit page width, fit whole page, or a fixed zoom. */
  fitMode: 'none' | 'width' | 'page'
  /** Zero-based index of the page at the centre of the viewport. */
  currentPage: number
  /** Set to ask the viewer to scroll; the nonce lets the same page be requested twice. */
  scrollTarget: { page: number; nonce: number } | null
  /** Selected page ids (thumbnails). Not part of undo history. */
  selection: string[]
  anchorId: string | null
}

export interface Toast {
  id: string
  kind: 'info' | 'error'
  message: string
  action?: { label: string; run: () => void }
}

export interface PasswordPrompt {
  fileName: string
  reason: 'need' | 'incorrect'
  resolve: (password: string | null) => void
}

export interface MenuItem {
  label?: string
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  /** Renders a separator when true. */
  divider?: boolean
  /** Renders a non-clickable section title. */
  heading?: boolean
  onClick?: () => void
}

export type Dialog =
  | { kind: 'split' }
  | { kind: 'labels' }
  | { kind: 'signature' }
  | { kind: 'export' }
  | { kind: 'applyPages'; ref: AnnotationRef }
  | { kind: 'crop'; ref: AnnotationRef }
  | { kind: 'about' }
  | { kind: 'protect' }
  | null

export type Tool =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'text'
  | 'note'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'ink'
  | 'eraser'
  | 'place'

/** An image waiting to be placed with a click (stamp, signature or picture). */
export interface Placement {
  assetId: string
  /** Default upright size in points. */
  width: number
  height: number
  kind: ImageAnnotation['kind']
}

export interface AnnotationRef {
  pageId: string
  id: string
}

export type PageScope = 'all' | 'even' | 'odd' | { from: number; to: number }

export interface SplitRequest {
  groups: number[][]
  output: 'downloads' | 'tabs'
}

type Theme = 'light' | 'dark'

interface Preferences {
  theme: Theme
  language: Language
  invertPages: boolean
  sidebarOpen: boolean
  userName: string
  rightPanel: 'none' | 'comments' | 'properties'
  toolColor: string
  strokeWidth: number
  fontSize: number
  dynamicStamps: boolean
}

interface AppState extends Preferences {
  tabs: Tab[]
  activeId: string | null
  /** Bumped when background page measurement changes page sizes. */
  layoutVersion: number
  toasts: Toast[]
  passwordPrompt: PasswordPrompt | null
  busy: StringKey | null
  contextMenu: { x: number; y: number; items: MenuItem[] } | null
  dialog: Dialog
  ribbon: 'pages' | 'annotate'
  tool: Tool
  placing: Placement | null
  selectedAnnotation: AnnotationRef | null
  editing: AnnotationRef | null
  library: Library
  /** Last compression report, shown after a compress-and-save. */
  lastCompression: CompressReportState | null

  t: (key: StringKey) => string
  openFiles: (files: OpenedFile[]) => Promise<void>
  openFilesFromDialog: () => Promise<void>
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  setActive: (id: string) => void
  editDoc: (update: (state: DocState, tab: Tab) => DocState) => void
  undo: () => void
  redo: () => void
  setZoom: (zoom: number) => void
  zoomBy: (factor: number) => void
  setFitMode: (mode: 'width' | 'page') => void
  reportScale: (tabId: string, zoom: number) => void
  setCurrentPage: (tabId: string, page: number) => void
  goToPage: (page: number) => void

  selectPage: (id: string, mode: 'single' | 'toggle' | 'range' | 'keep') => void
  selectAll: () => void
  /** Pages the page tools act on: the selection, or the current page when nothing is selected. */
  targetIds: () => Set<string>
  rotatePages: (delta: number) => void
  deletePages: () => void
  duplicatePages: () => void
  movePages: (ids: string[], toIndex: number) => void
  extractPages: () => void
  insertBlank: (index?: number) => Promise<void>
  insertFiles: (files: OpenedFile[], index?: number, tabId?: string) => Promise<void>
  insertFromDialog: (index?: number) => Promise<void>
  mergeTabInto: (sourceTabId: string, targetTabId: string, index?: number) => void
  mergeAll: () => void
  split: (request: SplitRequest) => Promise<void>
  setLabels: (labels: LabelRange[] | null) => void

  setRibbon: (ribbon: AppState['ribbon']) => void
  setTool: (tool: Tool) => void
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  startPlacement: (placement: Placement) => void
  addAnnotation: (pageId: string, annotation: Annotation, select?: boolean) => void
  updateAnnotation: (pageId: string, annotation: Annotation) => void
  removeAnnotation: (pageId: string, id: string) => void
  selectAnnotation: (ref: AnnotationRef | null) => void
  setEditing: (ref: AnnotationRef | null) => void
  duplicateAnnotation: (pageId: string, id: string) => void
  /** Merge a patch into the selected annotation (colour/width/fill/fontSize from the properties panel). */
  patchSelectedAnnotation: (patch: Record<string, unknown>) => void
  setRightPanel: (panel: AppState['rightPanel']) => void
  toggleRightPanel: (panel: Exclude<AppState['rightPanel'], 'none'>) => void
  /** The restrictions the active document carried when opened, or null. */
  openedPermissions: () => Permissions | null
  /** Encrypts the active document with a password + permissions and saves a protected copy. */
  saveProtected: (options: EncryptOptions) => Promise<void>
  /** Copies an annotation (stamp/signature/anything) onto other pages at the same position. */
  applyAnnotationToPages: (pageId: string, id: string, scope: PageScope) => void
  addToLibrary: (kind: keyof Library, dataUrl: string) => void
  removeFromLibrary: (kind: keyof Library, dataUrl: string) => void

  /** Estimates the compressed size of the active document without saving. */
  estimateCompression: (options: CompressOptions) => Promise<CompressReport | null>
  /** Compresses the active document and saves the smaller result (never the original in place by default). */
  compressAndSave: (options: CompressOptions, as: boolean) => Promise<void>
  /** Exports pages as image files (one per page) or a single multi-page TIFF. */
  exportImages: (format: ImageFormat, options: RasterOptions, scope: 'all' | 'current' | 'selection') => Promise<void>

  save: () => Promise<void>
  saveAs: () => Promise<void>
  saveOverOriginal: () => Promise<void>
  showInFolder: (tabId: string) => void

  openContextMenu: (x: number, y: number, items: MenuItem[]) => void
  closeContextMenu: () => void
  openDialog: (dialog: Dialog) => void

  toggleTheme: () => void
  toggleInvert: () => void
  toggleSidebar: () => void
  toggleLanguage: () => void
  notify: (kind: Toast['kind'], message: string, action?: Toast['action']) => void
  dismissToast: (id: string) => void
}

const PREFS_KEY = 'salah-pdf:prefs'

function loadPreferences(): Preferences {
  const defaults: Preferences = {
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    language: 'ar',
    invertPages: false,
    sidebarOpen: true,
    userName: '',
    rightPanel: 'none',
    toolColor: '#e53935',
    strokeWidth: 2,
    fontSize: 14,
    dynamicStamps: true
  }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
const baseName = (name: string): string => name.replace(/\.[^.\\/]+$/, '')
const fileNameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

export const isDirty = (tab: Tab): boolean => tab.history.present !== tab.savedState

const pagesOf = (sourceId: string, count: number): PageRef[] =>
  Array.from({ length: count }, (_, i) => ({ id: newId('pg'), sourceId, sourceIndex: i, rotation: 0 }))

function createTab(title: string, pages: PageRef[], sourceIds: string[], originalPath: string | null = null): Tab {
  const doc: DocState = { pages, labels: null }
  return {
    id: newId('tab'),
    title,
    originalPath,
    outputPath: null,
    sourceIds,
    history: createHistory(doc),
    // A file opened from disk starts clean; anything assembled in the app starts unsaved.
    savedState: originalPath ? doc : { pages: [], labels: null },
    zoom: 1,
    fitMode: 'width',
    currentPage: 0,
    scrollTarget: null,
    selection: [],
    anchorId: null
  }
}

/** pdf-lib embeds PNG and JPEG directly; other image formats are re-encoded to PNG first. */
async function toImageInput(file: OpenedFile): Promise<ImageInput> {
  if (/\.png$/i.test(file.name)) return { bytes: file.data, kind: 'png' }
  if (/\.jpe?g$/i.test(file.name)) return { bytes: file.data, kind: 'jpg' }
  const bitmap = await createImageBitmap(new Blob([file.data as BlobPart]))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'png' }
}

export const useApp = create<AppState>((set, get) => {
  const activeTab = (): Tab | undefined => get().tabs.find((t) => t.id === get().activeId)
  const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

  const updateTab = (id: string, update: (tab: Tab) => Partial<Tab>): void =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...update(t) } : t)) }))

  /** Commits a document edit to a tab's history and drops selections of pages that no longer exist. */
  const commitDoc = (tabId: string, next: DocState, patch: Partial<Tab> = {}): void =>
    updateTab(tabId, (t) => {
      const history = commit(t.history, next)
      const ids = new Set(next.pages.map((p) => p.id))
      return {
        history,
        selection: (patch.selection ?? t.selection).filter((id) => ids.has(id)),
        currentPage: Math.min(t.currentPage, Math.max(0, next.pages.length - 1)),
        ...patch
      }
    })

  const updatePreferences = (patch: Partial<Preferences>): void => {
    set(patch)
    const { theme, language, invertPages, sidebarOpen, rightPanel, userName, toolColor, strokeWidth, fontSize, dynamicStamps } = get()
    savePreferences({ theme, language, invertPages, sidebarOpen, rightPanel, userName, toolColor, strokeWidth, fontSize, dynamicStamps })
  }

  /** Replaces one page's annotation list as an undoable edit. */
  const editAnnotations = (pageId: string, update: (list: Annotation[]) => Annotation[]): void =>
    get().editDoc((state) => ({
      ...state,
      pages: state.pages.map((p) => (p.id === pageId ? { ...p, annotations: update(p.annotations ?? []) } : p))
    }))

  const requestPassword = (fileName: string) => (reason: 'need' | 'incorrect') =>
    new Promise<string | null>((resolve) =>
      set({
        passwordPrompt: {
          fileName,
          reason,
          resolve: (password) => {
            set({ passwordPrompt: null })
            resolve(password)
          }
        }
      })
    )

  const bumpLayout = (): void => set((s) => ({ layoutVersion: s.layoutVersion + 1 }))

  const loadBytes = async (name: string, bytes: Uint8Array): Promise<{ sourceId: string; pages: PageRef[] }> => {
    const source = await addSource(name, bytes, requestPassword(name), bumpLayout)
    return { sourceId: source.id, pages: pagesOf(source.id, source.pageCount) }
  }

  /**
   * Turns files into pages. Each PDF is one unit; consecutive images are
   * combined into one generated PDF so they keep their order.
   */
  const filesToUnits = async (
    files: OpenedFile[]
  ): Promise<{ name: string; path: string | null; sourceIds: string[]; pages: PageRef[] }[]> => {
    const units: { name: string; path: string | null; sourceIds: string[]; pages: PageRef[] }[] = []
    let images: OpenedFile[] = []
    const flushImages = async (): Promise<void> => {
      if (!images.length) return
      const batch = images
      images = []
      const inputs = await Promise.all(batch.map(toImageInput))
      const bytes = await runPdfTask({ type: 'images', images: inputs }, inputs.map((i) => i.bytes.buffer as ArrayBuffer))
      const name = `${baseName(batch[0].name)}.pdf`
      const { sourceId, pages } = await loadBytes(name, bytes)
      units.push({ name, path: null, sourceIds: [sourceId], pages })
    }
    for (const file of files) {
      try {
        if (platform.isImageName(file.name)) {
          images.push(file)
          continue
        }
        await flushImages()
        const { sourceId, pages } = await loadBytes(file.name, file.data)
        units.push({ name: file.name, path: file.path, sourceIds: [sourceId], pages })
      } catch (error) {
        if (!(error instanceof PasswordCancelledError)) get().notify('error', `${get().t('openFailed')}: ${file.name} (${message(error)})`)
      }
    }
    try {
      await flushImages()
    } catch (error) {
      get().notify('error', `${get().t('openFailed')}: ${message(error)}`)
    }
    return units
  }

  const withBusy = async <T,>(key: StringKey, work: () => Promise<T>): Promise<T> => {
    set({ busy: key })
    try {
      return await work()
    } finally {
      set({ busy: null })
    }
  }

  const savedToast = (path: string | null): void => {
    const { t, notify } = get()
    if (!path) return notify('info', t('saved'))
    notify('info', `${t('savedTo')} ${fileNameOf(path)}`, { label: t('showInFolder'), run: () => platform.showInFolder(path) })
  }

  const saveError = (error: unknown): void => {
    const { t, notify } = get()
    notify('error', error instanceof EncryptedExportError ? t('encryptedSave') : `${t('saveFailed')}: ${message(error)}`)
  }

  const docFromGroups = (state: DocState, groups: number[][]): DocState[] =>
    groups.map((group) => ({ pages: group.map((i) => ops.clonePage(state.pages[i])), labels: null }))

  return {
    ...loadPreferences(),
    tabs: [],
    activeId: null,
    layoutVersion: 0,
    toasts: [],
    passwordPrompt: null,
    busy: null,
    contextMenu: null,
    dialog: null,
    ribbon: 'pages',
    tool: 'select',
    placing: null,
    selectedAnnotation: null,
    editing: null,
    library: loadLibrary(),
    lastCompression: null,

    t: (key) => translate(get().language, key),

    async openFiles(files) {
      const fresh = files.filter((file) => {
        const existing = file.path && get().tabs.find((t) => t.originalPath === file.path)
        if (existing) set({ activeId: existing.id })
        return !existing
      })
      if (!fresh.length) return
      await withBusy('loading', async () => {
        for (const unit of await filesToUnits(fresh)) {
          const tab = createTab(unit.name, unit.pages, unit.sourceIds, unit.path)
          set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
        }
      })
    },

    async openFilesFromDialog() {
      await get().openFiles(await platform.openDialog())
    },

    closeTab(id) {
      const { tabs, activeId, t } = get()
      const index = tabs.findIndex((tab) => tab.id === id)
      if (index < 0) return
      const tab = tabs[index]
      if (isDirty(tab) && !window.confirm(`${tab.title}\n\n${t('confirmClose')}`)) return
      const remaining = tabs.filter((x) => x.id !== id)
      for (const sourceId of tab.sourceIds) {
        if (!remaining.some((x) => x.sourceIds.includes(sourceId))) releaseSource(sourceId)
      }
      set({
        tabs: remaining,
        activeId: activeId === id ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null) : activeId
      })
    },

    closeOtherTabs(id) {
      for (const tab of get().tabs.filter((t) => t.id !== id)) get().closeTab(tab.id)
      set({ activeId: id })
    },

    setActive: (id) => set({ activeId: id }),

    editDoc(update) {
      const tab = activeTab()
      if (tab) commitDoc(tab.id, update(tab.history.present, tab))
    },

    undo() {
      const tab = activeTab()
      if (tab) updateTab(tab.id, (t) => ({ history: undo(t.history) }))
    },

    redo() {
      const tab = activeTab()
      if (tab) updateTab(tab.id, (t) => ({ history: redo(t.history) }))
    },

    setZoom(zoom) {
      const tab = activeTab()
      if (tab) updateTab(tab.id, () => ({ zoom: clampZoom(zoom), fitMode: 'none' }))
    },

    zoomBy(factor) {
      const tab = activeTab()
      if (tab) get().setZoom(tab.zoom * factor)
    },

    setFitMode(mode) {
      const tab = activeTab()
      if (tab) updateTab(tab.id, () => ({ fitMode: mode }))
    },

    reportScale: (tabId, zoom) => updateTab(tabId, () => ({ zoom })),

    setCurrentPage: (tabId, page) => updateTab(tabId, () => ({ currentPage: page })),

    goToPage(page) {
      const tab = activeTab()
      if (!tab) return
      const target = Math.min(tab.history.present.pages.length - 1, Math.max(0, page))
      updateTab(tab.id, (t) => ({
        currentPage: target,
        scrollTarget: { page: target, nonce: (t.scrollTarget?.nonce ?? 0) + 1 }
      }))
    },

    selectPage(id, mode) {
      const tab = activeTab()
      if (!tab) return
      const pages = tab.history.present.pages
      if (mode === 'keep' && tab.selection.includes(id)) return
      if (mode === 'toggle') {
        const selection = tab.selection.includes(id) ? tab.selection.filter((x) => x !== id) : [...tab.selection, id]
        return updateTab(tab.id, () => ({ selection, anchorId: id }))
      }
      if (mode === 'range' && tab.anchorId) {
        const a = pages.findIndex((p) => p.id === tab.anchorId)
        const b = pages.findIndex((p) => p.id === id)
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a]
          return updateTab(tab.id, () => ({ selection: pages.slice(from, to + 1).map((p) => p.id) }))
        }
      }
      updateTab(tab.id, () => ({ selection: [id], anchorId: id }))
    },

    selectAll() {
      const tab = activeTab()
      if (tab) updateTab(tab.id, (t) => ({ selection: t.history.present.pages.map((p) => p.id) }))
    },

    targetIds() {
      const tab = activeTab()
      if (!tab) return new Set()
      if (tab.selection.length) return new Set(tab.selection)
      const current = tab.history.present.pages[tab.currentPage]
      return new Set(current ? [current.id] : [])
    },

    rotatePages(delta) {
      const ids = get().targetIds()
      get().editDoc((state) => ops.rotatePages(state, ids, delta))
    },

    deletePages() {
      const tab = activeTab()
      if (!tab) return
      const ids = get().targetIds()
      if (ids.size >= tab.history.present.pages.length) return get().notify('error', get().t('cannotDeleteAll'))
      commitDoc(tab.id, ops.removePages(tab.history.present, ids), { selection: [] })
    },

    duplicatePages() {
      const tab = activeTab()
      if (!tab) return
      const { state, created } = ops.duplicatePages(tab.history.present, get().targetIds())
      commitDoc(tab.id, state, { selection: created.map((p) => p.id) })
    },

    movePages(ids, toIndex) {
      const tab = activeTab()
      if (tab) commitDoc(tab.id, ops.movePages(tab.history.present, new Set(ids), toIndex))
    },

    extractPages() {
      const tab = activeTab()
      if (!tab) return
      const ids = get().targetIds()
      const pages = tab.history.present.pages.filter((p) => ids.has(p.id)).map(ops.clonePage)
      if (!pages.length) return
      const title = `${baseName(tab.title)} - ${get().t('extract')}.pdf`
      const next = createTab(title, pages, [...new Set(pages.map((p) => p.sourceId))])
      set((s) => ({ tabs: [...s.tabs, next], activeId: next.id }))
    },

    async insertBlank(index) {
      const tab = activeTab()
      if (!tab) return
      const pages = tab.history.present.pages
      const at = index ?? Math.min(pages.length, tab.currentPage + 1)
      const neighbour = pages[Math.max(0, at - 1)]
      const size = neighbour ? displaySize(neighbour) : { width: 595.28, height: 841.89 }
      const bytes = await runPdfTask({ type: 'blank', width: size.width, height: size.height })
      const { sourceId, pages: blank } = await loadBytes('blank.pdf', bytes)
      const target = get().tabs.find((t) => t.id === tab.id)!
      updateTab(tab.id, (t) => ({ sourceIds: [...t.sourceIds, sourceId] }))
      commitDoc(tab.id, ops.insertPages(target.history.present, at, blank), { selection: blank.map((p) => p.id) })
    },

    async insertFiles(files, index, tabId) {
      const id = tabId ?? get().activeId
      if (!id || !files.length) return
      await withBusy('loading', async () => {
        const units = await filesToUnits(files)
        const tab = get().tabs.find((t) => t.id === id)
        if (!tab || !units.length) return
        const pages = units.flatMap((u) => u.pages)
        const at = index ?? tab.history.present.pages.length
        updateTab(id, (t) => ({ sourceIds: [...new Set([...t.sourceIds, ...units.flatMap((u) => u.sourceIds)])] }))
        commitDoc(id, ops.insertPages(tab.history.present, at, pages), { selection: pages.map((p) => p.id) })
        set({ activeId: id })
        get().goToPage(at)
      })
    },

    async insertFromDialog(index) {
      const files = await platform.openDialog()
      if (files.length) await get().insertFiles(files, index)
    },

    mergeTabInto(sourceTabId, targetTabId, index) {
      if (sourceTabId === targetTabId) return
      const source = get().tabs.find((t) => t.id === sourceTabId)
      const target = get().tabs.find((t) => t.id === targetTabId)
      if (!source || !target) return
      const pages = source.history.present.pages.map(ops.clonePage)
      const at = index ?? target.history.present.pages.length
      updateTab(targetTabId, (t) => ({ sourceIds: [...new Set([...t.sourceIds, ...source.sourceIds])] }))
      commitDoc(targetTabId, ops.insertPages(target.history.present, at, pages), { selection: pages.map((p) => p.id) })
      // The source's pages now live in the target, so it can close without asking.
      set((s) => ({ tabs: s.tabs.filter((t) => t.id !== sourceTabId), activeId: targetTabId }))
      get().goToPage(at)
      get().notify('info', `${get().t('mergedInto')} ${target.title}`)
    },

    mergeAll() {
      const { tabs, t } = get()
      if (tabs.length < 2) return get().notify('info', t('needTwoFiles'))
      const pages = tabs.flatMap((tab) => tab.history.present.pages.map(ops.clonePage))
      const next = createTab(`${t('mergedName')}.pdf`, pages, [...new Set(tabs.flatMap((tab) => tab.sourceIds))])
      set((s) => ({ tabs: [...s.tabs, next], activeId: next.id }))
      get().notify('info', `${t('mergedCount')} ${tabs.length}`)
    },

    async split({ groups, output }) {
      const tab = activeTab()
      if (!tab || !groups.length) return
      const parts = docFromGroups(tab.history.present, groups)
      const name = baseName(tab.title)
      set({ dialog: null })
      if (output === 'tabs') {
        const created = parts.map((doc, i) =>
          createTab(`${name} - ${i + 1}.pdf`, doc.pages, [...new Set(doc.pages.map((p) => p.sourceId))])
        )
        set((s) => ({ tabs: [...s.tabs, ...created], activeId: created[0].id }))
        return
      }
      await withBusy('saving', async () => {
        try {
          let last: string | null = null
          for (const [i, doc] of parts.entries()) {
            last = await platform.saveToDownloads(`${name} - ${i + 1}.pdf`, await exportDocument(doc))
          }
          get().notify(
            'info',
            `${get().t('splitDone')} ${parts.length}`,
            last ? { label: get().t('showInFolder'), run: () => platform.showInFolder(last!) } : undefined
          )
        } catch (error) {
          saveError(error)
        }
      })
    },

    setLabels(labels) {
      const tab = activeTab()
      if (!tab) return
      const count = tab.history.present.pages.length
      const normalized = labels && normalizeLabels(labels, count)
      commitDoc(tab.id, { ...tab.history.present, labels: normalized?.length ? normalized : null })
      set({ dialog: null })
    },

    setRibbon: (ribbon) => set({ ribbon, ...(ribbon === 'pages' ? { tool: 'select' as Tool, placing: null } : {}) }),

    setTool: (tool) =>
      set({ tool, placing: tool === 'place' ? get().placing : null, selectedAnnotation: null, editing: null }),

    setPreference: (key, value) => updatePreferences({ [key]: value }),

    startPlacement: (placement) =>
      set({ tool: 'place', placing: placement, ribbon: 'annotate', selectedAnnotation: null, editing: null }),

    addAnnotation(pageId, annotation, select = false) {
      editAnnotations(pageId, (list) => [...list, annotation])
      if (select) set({ selectedAnnotation: { pageId, id: annotation.id } })
    },

    updateAnnotation(pageId, annotation) {
      editAnnotations(pageId, (list) => list.map((a) => (a.id === annotation.id ? annotation : a)))
    },

    removeAnnotation(pageId, id) {
      editAnnotations(pageId, (list) => list.filter((a) => a.id !== id))
      const { selectedAnnotation, editing } = get()
      if (selectedAnnotation?.id === id) set({ selectedAnnotation: null })
      if (editing?.id === id) set({ editing: null })
    },

    selectAnnotation: (ref) => set({ selectedAnnotation: ref }),
    setEditing: (ref) => set({ editing: ref }),

    duplicateAnnotation(pageId, id) {
      const tab = activeTab()
      const annotation = tab?.history.present.pages.find((p) => p.id === pageId)?.annotations?.find((a) => a.id === id)
      if (!annotation) return
      // Offset the copy slightly so it does not hide the original.
      const copy = { ...translateAnnotation(annotation, 12, 12), id: newId('ann') }
      editAnnotations(pageId, (list) => [...list, copy])
      set({ selectedAnnotation: { pageId, id: copy.id } })
    },

    patchSelectedAnnotation(patch) {
      const ref = get().selectedAnnotation
      if (!ref) return
      const page = activeTab()?.history.present.pages.find((p) => p.id === ref.pageId)
      const annotation = page?.annotations?.find((a) => a.id === ref.id)
      if (!annotation) return
      // Only apply keys the annotation already has, so we never add a field it cannot use.
      const next = { ...annotation }
      for (const [key, value] of Object.entries(patch)) {
        if (key in annotation) (next as Record<string, unknown>)[key] = value
      }
      get().updateAnnotation(ref.pageId, next as typeof annotation)
    },

    setRightPanel: (panel) => updatePreferences({ rightPanel: panel }),
    toggleRightPanel: (panel) => updatePreferences({ rightPanel: get().rightPanel === panel ? 'none' : panel }),

    openedPermissions() {
      const tab = activeTab()
      const first = tab && getSource(tab.sourceIds[0])
      return first?.openedPermissions ?? null
    },

    async saveProtected(options) {
      const tab = activeTab()
      if (!tab || get().busy) return
      const state = tab.history.present
      await withBusy('protecting', async () => {
        try {
          const plain = await exportDocument(state)
          const encrypted = await encryptBytes(plain, options)
          // Always Save As for a protected copy: it is a new file, and the output
          // path tracked for plain saves should not silently become encrypted.
          const path = await platform.saveAs(tab.title, encrypted)
          if (!path && platform.isDesktop) return
          set({ dialog: null })
          savedToast(path)
        } catch (error) {
          saveError(error)
        }
      })
    },

    applyAnnotationToPages(pageId, id, scope) {
      const tab = activeTab()
      if (!tab) return
      const pages = tab.history.present.pages
      const sourceIndex = pages.findIndex((p) => p.id === pageId)
      const annotation = pages[sourceIndex]?.annotations?.find((a) => a.id === id)
      if (!annotation) return
      // Which page indices receive a copy (never the source page again).
      const targets = pages
        .map((_, i) => i)
        .filter((i) => i !== sourceIndex)
        .filter((i) =>
          scope === 'all' ? true : scope === 'even' ? (i + 1) % 2 === 0 : scope === 'odd' ? (i + 1) % 2 === 1 : i >= scope.from - 1 && i <= scope.to - 1
        )
      if (!targets.length) return
      get().editDoc((state) => ({
        ...state,
        pages: state.pages.map((p, i) =>
          targets.includes(i) ? { ...p, annotations: [...(p.annotations ?? []), { ...annotation, id: newId('ann') }] } : p
        )
      }))
      get().notify('info', `${get().t('stampedOnPages')} ${targets.length}`)
    },

    addToLibrary(kind, dataUrl) {
      const library = { ...get().library, [kind]: [dataUrl, ...get().library[kind].filter((x) => x !== dataUrl)] }
      set({ library })
      if (!saveLibrary(library)) get().notify('error', get().t('libraryFull'))
    },

    removeFromLibrary(kind, dataUrl) {
      const library = { ...get().library, [kind]: get().library[kind].filter((x) => x !== dataUrl) }
      set({ library })
      saveLibrary(library)
    },

    async estimateCompression(options) {
      const tab = activeTab()
      if (!tab) return null
      const bytes = await exportDocument(tab.history.present)
      // Transfer a COPY, never the original: exportDocument may return a cached
      // source's bytes, and transferring that buffer would detach it and break
      // every later read (render, save, re-estimate).
      const copy = bytes.slice()
      const { report } = await runPdfTaskFull({ type: 'compress', bytes: copy, options }, [copy.buffer as ArrayBuffer])
      return report ?? null
    },

    async compressAndSave(options, as) {
      const tab = activeTab()
      if (!tab || get().busy) return
      const state = tab.history.present
      await withBusy('compressing', async () => {
        try {
          const source = await exportDocument(state)
          // Transfer a copy so a cached source buffer is never detached (see estimateCompression).
          const copy = source.slice()
          const { data, report } = await runPdfTaskFull({ type: 'compress', bytes: copy, options }, [copy.buffer as ArrayBuffer])
          let path: string | null
          if (as || (!tab.outputPath && !platform.isDesktop)) path = await platform.saveAs(tab.title, data)
          else if (tab.outputPath) {
            await platform.save(tab.outputPath, data)
            path = tab.outputPath
          } else path = await platform.saveToDownloads(tab.title, data)
          if (!path && platform.isDesktop && as) return
          updateTab(tab.id, () => ({ savedState: state, outputPath: path ?? tab.outputPath, title: path ? fileNameOf(path) : tab.title }))
          set({ lastCompression: report ? compressReport(report, path) : null, dialog: null })
          savedToast(path)
        } catch (error) {
          saveError(error)
        }
      })
    },

    async exportImages(format, options, scope) {
      const tab = activeTab()
      if (!tab || get().busy) return
      const all = tab.history.present.pages
      const pages =
        scope === 'current'
          ? [all[tab.currentPage]]
          : scope === 'selection' && tab.selection.length
            ? all.filter((p) => tab.selection.includes(p.id))
            : all
      if (!pages.length) return
      await withBusy('exporting', async () => {
        try {
          const rendered = []
          for (const page of pages) {
            const bitmap = await renderPageBitmap(page, options.dpi)
            if (bitmap) rendered.push(bitmap)
          }
          if (!rendered.length) return
          const base = fileNameOf(tab.title).replace(/\.[^.]+$/, '')
          let last: string | null = null
          if (format === 'tiff') {
            last = await platform.saveBytesToDownloads(`${base}.tiff`, buildTiff(rendered), 'image/tiff')
          } else {
            // One file per page; the page's own number keeps names stable across selections.
            const pad = (n: number): string => String(n).padStart(String(all.length).length, '0')
            for (const page of rendered) {
              const bytes = await encodeImage(page, format, options.quality)
              const name = rendered.length === 1 ? `${base}.${format}` : `${base}-${pad(page.index)}.${format}`
              last = await platform.saveBytesToDownloads(name, bytes, `image/${format}`)
            }
          }
          set({ dialog: null })
          get().notify(
            'info',
            `${get().t('exportedCount')} ${rendered.length}`,
            last ? { label: get().t('showInFolder'), run: () => platform.showInFolder(last!) } : undefined
          )
        } catch (error) {
          get().notify('error', `${get().t('exportFailed')}: ${message(error)}`)
        }
      })
    },

    async save() {
      const tab = activeTab()
      if (!tab || get().busy) return
      const state = tab.history.present
      await withBusy('saving', async () => {
        try {
          const data = await exportDocument(state)
          let path = tab.outputPath
          if (path) await platform.save(path, data)
          else path = await platform.saveToDownloads(tab.title, data)
          updateTab(tab.id, () => ({ savedState: state, outputPath: path ?? null }))
          savedToast(path)
        } catch (error) {
          saveError(error)
        }
      })
    },

    async saveAs() {
      const tab = activeTab()
      if (!tab || get().busy) return
      const state = tab.history.present
      await withBusy('saving', async () => {
        try {
          const path = await platform.saveAs(tab.title, await exportDocument(state))
          if (!path && platform.isDesktop) return
          updateTab(tab.id, () => ({ savedState: state, outputPath: path, title: path ? fileNameOf(path) : tab.title }))
          savedToast(path)
        } catch (error) {
          saveError(error)
        }
      })
    },

    async saveOverOriginal() {
      const tab = activeTab()
      if (!tab?.originalPath || get().busy) return
      if (!window.confirm(`${get().t('confirmOverwrite')}\n${tab.originalPath}`)) return
      const state = tab.history.present
      const path = tab.originalPath
      await withBusy('saving', async () => {
        try {
          await platform.save(path, await exportDocument(state))
          updateTab(tab.id, () => ({ savedState: state, outputPath: path }))
          savedToast(path)
        } catch (error) {
          saveError(error)
        }
      })
    },

    showInFolder(tabId) {
      const tab = get().tabs.find((t) => t.id === tabId)
      const path = tab?.outputPath ?? tab?.originalPath
      if (path) platform.showInFolder(path)
    },

    openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
    closeContextMenu: () => set({ contextMenu: null }),
    openDialog: (dialog) => set({ dialog }),

    toggleTheme: () => updatePreferences({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    toggleInvert: () => updatePreferences({ invertPages: !get().invertPages }),
    toggleSidebar: () => updatePreferences({ sidebarOpen: !get().sidebarOpen }),
    toggleLanguage: () => updatePreferences({ language: get().language === 'ar' ? 'en' : 'ar' }),

    notify(kind, text, action) {
      const id = newId('toast')
      set((s) => ({ toasts: [...s.toasts, { id, kind, message: text, action }] }))
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : action ? 6000 : 2500)
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
})

export const useActiveTab = (): Tab | undefined => useApp((s) => s.tabs.find((t) => t.id === s.activeId))
