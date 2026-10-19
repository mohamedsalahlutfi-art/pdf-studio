import { create } from 'zustand'
import type { Language, OpenedFile } from '../../../shared/types'
import { exportDocument, EncryptedExportError } from '../lib/exportDocument'
import { commit, createHistory, redo, undo, type History } from '../lib/history'
import { translate, type StringKey } from '../lib/i18n'
import { newId, rotate, type DocState } from '../lib/model'
import { PasswordCancelledError } from '../lib/pdfjs'
import * as platform from '../lib/platform'
import { addSource, releaseSource } from '../lib/sources'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export interface Tab {
  id: string
  title: string
  filePath: string | null
  sourceIds: string[]
  history: History<DocState>
  /** The state last written to disk; the tab is dirty when `history.present` differs. */
  savedState: DocState
  zoom: number
  fitWidth: boolean
  /** Zero-based index of the page at the centre of the viewport. */
  currentPage: number
  /** Set to ask the viewer to scroll; the nonce lets the same page be requested twice. */
  scrollTarget: { page: number; nonce: number } | null
}

export interface Toast {
  id: string
  kind: 'info' | 'error'
  message: string
}

export interface PasswordPrompt {
  fileName: string
  reason: 'need' | 'incorrect'
  resolve: (password: string | null) => void
}

type Theme = 'light' | 'dark'

interface Preferences {
  theme: Theme
  language: Language
  invertPages: boolean
  sidebarOpen: boolean
}

interface AppState extends Preferences {
  tabs: Tab[]
  activeId: string | null
  /** Bumped when background page measurement changes page sizes. */
  layoutVersion: number
  toasts: Toast[]
  passwordPrompt: PasswordPrompt | null
  busy: StringKey | null

  t: (key: StringKey) => string
  openFiles: (files: OpenedFile[]) => Promise<void>
  openFilesFromDialog: () => Promise<void>
  closeTab: (id: string) => void
  setActive: (id: string) => void
  editDoc: (update: (state: DocState, tab: Tab) => DocState) => void
  undo: () => void
  redo: () => void
  setZoom: (zoom: number) => void
  zoomBy: (factor: number) => void
  setFitWidth: () => void
  reportScale: (tabId: string, zoom: number) => void
  setCurrentPage: (tabId: string, page: number) => void
  goToPage: (page: number) => void
  rotatePage: (delta: number) => void
  save: (as: boolean) => Promise<void>
  toggleTheme: () => void
  toggleInvert: () => void
  toggleSidebar: () => void
  toggleLanguage: () => void
  notify: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: string) => void
}

const PREFS_KEY = 'pdf-studio:prefs'

function loadPreferences(): Preferences {
  const defaults: Preferences = {
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    language: 'ar',
    invertPages: false,
    sidebarOpen: true
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

export const isDirty = (tab: Tab): boolean => tab.history.present !== tab.savedState

export const useApp = create<AppState>((set, get) => {
  const activeTab = (): Tab | undefined => get().tabs.find((t) => t.id === get().activeId)

  const updateTab = (id: string, update: (tab: Tab) => Partial<Tab>): void =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...update(t) } : t)) }))

  const updatePreferences = (patch: Partial<Preferences>): void => {
    set(patch)
    const { theme, language, invertPages, sidebarOpen } = get()
    savePreferences({ theme, language, invertPages, sidebarOpen })
  }

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

  return {
    ...loadPreferences(),
    tabs: [],
    activeId: null,
    layoutVersion: 0,
    toasts: [],
    passwordPrompt: null,
    busy: null,

    t: (key) => translate(get().language, key),

    async openFiles(files) {
      for (const file of files) {
        const existing = file.path && get().tabs.find((t) => t.filePath === file.path)
        if (existing) {
          set({ activeId: existing.id })
          continue
        }
        set({ busy: 'loading' })
        try {
          const source = await addSource(file.name, file.data, requestPassword(file.name), () =>
            set((s) => ({ layoutVersion: s.layoutVersion + 1 }))
          )
          const doc: DocState = {
            pages: Array.from({ length: source.pageCount }, (_, i) => ({
              id: newId('pg'),
              sourceId: source.id,
              sourceIndex: i,
              rotation: 0
            }))
          }
          const tab: Tab = {
            id: newId('tab'),
            title: file.name,
            filePath: file.path,
            sourceIds: [source.id],
            history: createHistory(doc),
            savedState: doc,
            zoom: 1,
            fitWidth: true,
            currentPage: 0,
            scrollTarget: null
          }
          set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
        } catch (error) {
          if (!(error instanceof PasswordCancelledError)) {
            get().notify('error', `${get().t('openFailed')}: ${file.name} (${error instanceof Error ? error.message : error})`)
          }
        } finally {
          set({ busy: null })
        }
      }
    },

    async openFilesFromDialog() {
      await get().openFiles(await platform.openDialog())
    },

    closeTab(id) {
      const { tabs, activeId, t } = get()
      const index = tabs.findIndex((tab) => tab.id === id)
      if (index < 0) return
      const tab = tabs[index]
      if (isDirty(tab) && !window.confirm(t('confirmClose'))) return
      const remaining = tabs.filter((x) => x.id !== id)
      for (const sourceId of tab.sourceIds) {
        if (!remaining.some((x) => x.sourceIds.includes(sourceId))) releaseSource(sourceId)
      }
      set({
        tabs: remaining,
        activeId: activeId === id ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null) : activeId
      })
    },

    setActive: (id) => set({ activeId: id }),

    editDoc(update) {
      const tab = activeTab()
      if (!tab) return
      updateTab(tab.id, (t) => ({ history: commit(t.history, update(t.history.present, t)) }))
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
      if (tab) updateTab(tab.id, () => ({ zoom: clampZoom(zoom), fitWidth: false }))
    },

    zoomBy(factor) {
      const tab = activeTab()
      if (tab) get().setZoom(tab.zoom * factor)
    },

    setFitWidth() {
      const tab = activeTab()
      if (tab) updateTab(tab.id, () => ({ fitWidth: true }))
    },

    reportScale(tabId, zoom) {
      updateTab(tabId, () => ({ zoom }))
    },

    setCurrentPage(tabId, page) {
      updateTab(tabId, () => ({ currentPage: page }))
    },

    goToPage(page) {
      const tab = activeTab()
      if (!tab) return
      const target = Math.min(tab.history.present.pages.length - 1, Math.max(0, page))
      updateTab(tab.id, (t) => ({
        currentPage: target,
        scrollTarget: { page: target, nonce: (t.scrollTarget?.nonce ?? 0) + 1 }
      }))
    },

    rotatePage(delta) {
      get().editDoc((state, tab) => ({
        pages: state.pages.map((p, i) => (i === tab.currentPage ? { ...p, rotation: rotate(p.rotation, delta) } : p))
      }))
    },

    async save(as) {
      const tab = activeTab()
      const { t, notify } = get()
      if (!tab || get().busy) return
      const state = tab.history.present
      set({ busy: 'saving' })
      try {
        const data = await exportDocument(state)
        if (!as && tab.filePath && platform.isDesktop) {
          await platform.save(tab.filePath, data)
          updateTab(tab.id, () => ({ savedState: state }))
        } else {
          const path = await platform.saveAs(tab.title, data)
          if (path) {
            const title = path.split(/[\\/]/).pop() ?? tab.title
            updateTab(tab.id, () => ({ savedState: state, filePath: path, title }))
          } else if (!platform.isDesktop) {
            updateTab(tab.id, () => ({ savedState: state }))
          } else {
            return
          }
        }
        notify('info', t('saved'))
      } catch (error) {
        notify(
          'error',
          error instanceof EncryptedExportError
            ? t('encryptedSave')
            : `${t('saveFailed')}: ${error instanceof Error ? error.message : error}`
        )
      } finally {
        set({ busy: null })
      }
    },

    toggleTheme: () => updatePreferences({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    toggleInvert: () => updatePreferences({ invertPages: !get().invertPages }),
    toggleSidebar: () => updatePreferences({ sidebarOpen: !get().sidebarOpen }),
    toggleLanguage: () => updatePreferences({ language: get().language === 'ar' ? 'en' : 'ar' }),

    notify(kind, message) {
      const id = newId('toast')
      set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 2500)
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
})

export const useActiveTab = (): Tab | undefined => useApp((s) => s.tabs.find((t) => t.id === s.activeId))
