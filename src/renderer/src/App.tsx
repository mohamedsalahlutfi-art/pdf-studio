import { useEffect, useState } from 'react'
import type { MenuCommand } from '../../shared/types'
import { hasFiles } from './lib/dnd'
import * as platform from './lib/platform'
import { isDirty, useActiveTab, useApp } from './store/useApp'
import { ContextMenu } from './components/ContextMenu'
import { Dialogs } from './components/Dialogs'
import { PasswordDialog, Toasts, Welcome } from './components/Overlays'
import { ToolRail, ToolStrip } from './components/Ribbon'
import { TabBar } from './components/TabBar'
import { Thumbnails } from './components/Thumbnails'
import { Toolbar } from './components/Toolbar'
import { Viewer } from './components/Viewer'

const isTyping = (): boolean => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}

function runCommand(command: MenuCommand): void {
  const s = useApp.getState()
  const hasTab = Boolean(s.activeId)
  const actions: Record<MenuCommand, () => void> = {
    open: () => void s.openFilesFromDialog(),
    save: () => void s.save(),
    'save-as': () => void s.saveAs(),
    'close-tab': () => s.activeId && s.closeTab(s.activeId),
    undo: () => (isTyping() ? document.execCommand('undo') : s.undo()),
    redo: () => (isTyping() ? document.execCommand('redo') : s.redo()),
    'zoom-in': () => s.zoomBy(1.25),
    'zoom-out': () => s.zoomBy(1 / 1.25),
    'zoom-reset': () => s.setZoom(1),
    'fit-width': s.setFitWidth,
    'toggle-sidebar': s.toggleSidebar,
    'toggle-theme': s.toggleTheme,
    'toggle-invert': s.toggleInvert,
    'rotate-cw': () => s.rotatePages(90),
    'rotate-ccw': () => s.rotatePages(-90),
    'delete-pages': s.deletePages,
    'duplicate-pages': s.duplicatePages,
    'extract-pages': s.extractPages,
    'insert-file': () => hasTab && void s.insertFromDialog(),
    'insert-blank': () => hasTab && void s.insertBlank(),
    split: () => hasTab && s.openDialog({ kind: 'split' }),
    'merge-all': s.mergeAll,
    'page-labels': () => hasTab && s.openDialog({ kind: 'labels' }),
    'export-compress': () => hasTab && s.openDialog({ kind: 'export' }),
    'select-all': () => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select()
      else s.selectAll()
    }
  }
  actions[command]()
}

/** Shortcuts for the browser build; in Electron the application menu owns them. */
function shortcutFor(e: KeyboardEvent): MenuCommand | null {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (!mod) return key === 'f4' ? 'toggle-sidebar' : null
  const map: Record<string, MenuCommand> = {
    o: 'open', z: 'undo', y: 'redo', '=': 'zoom-in', '+': 'zoom-in', '-': 'zoom-out', '0': 'zoom-reset',
    r: 'rotate-cw', d: 'duplicate-pages', e: 'extract-pages', i: 'insert-file', m: 'merge-all', a: 'select-all'
  }
  if (key === 's') return e.shiftKey ? 'save-as' : 'save'
  if (key === 'z' && e.shiftKey) return 'redo'
  if (key === 'r' && e.shiftKey) return 'rotate-ccw'
  return map[key] ?? null
}

export function App(): React.JSX.Element {
  const tab = useActiveTab()
  const theme = useApp((s) => s.theme)
  const language = useApp((s) => s.language)
  const sidebarOpen = useApp((s) => s.sidebarOpen)
  const anyDirty = useApp((s) => s.tabs.some(isDirty))
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    platform.setLanguage(language)
  }, [language])

  useEffect(() => platform.setDirty(anyDirty), [anyDirty])

  useEffect(() => {
    const s = useApp.getState()
    if (!s.userName) void platform.userName().then((name) => name && s.setPreference('userName', name))
  }, [])

  useEffect(() => {
    document.title = tab ? `${isDirty(tab) ? '• ' : ''}${tab.title} — Salah PDF` : 'Salah PDF'
  }, [tab])

  useEffect(() => {
    const offMenu = platform.onMenu(runCommand)
    const offFiles = platform.onFilesOpened((files) => void useApp.getState().openFiles(files))
    return () => {
      offMenu()
      offFiles()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!platform.isDesktop) {
        const command = shortcutFor(e)
        if (command && !(isTyping() && ['select-all', 'undo', 'redo'].includes(command))) {
          e.preventDefault()
          runCommand(command)
          return
        }
      }
      if (isTyping()) return
      const s = useApp.getState()
      const active = s.tabs.find((t) => t.id === s.activeId)
      if (!active) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Delete' && s.selectedAnnotation) s.removeAnnotation(s.selectedAnnotation.pageId, s.selectedAnnotation.id)
      else if (e.key === 'Delete') s.deletePages()
      else if (e.key === 'Escape' && (s.tool !== 'select' || s.selectedAnnotation)) s.setTool('select')
      else if (e.key === 'Escape') useApp.setState({ tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, selection: [] } : t)) })
      else if (e.key === 'Home' && mod) s.goToPage(0)
      else if (e.key === 'End' && mod) s.goToPage(active.history.present.pages.length - 1)
      else if (e.key === 'PageDown' && e.altKey) s.goToPage(active.currentPage + 1)
      else if (e.key === 'PageUp' && e.altKey) s.goToPage(active.currentPage - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="app"
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!e.dataTransfer.files.length) return
        void platform.openDropped([...e.dataTransfer.files]).then((files) => useApp.getState().openFiles(files))
      }}
    >
      <TabBar />
      <Toolbar />
      <main className="workspace">
        <ToolRail />
        {tab && sidebarOpen && <Thumbnails key={`thumbs-${tab.id}`} tab={tab} />}
        <section className="doc-area">
          {tab ? (
            <>
              <ToolStrip />
              <Viewer key={`viewer-${tab.id}`} tab={tab} />
            </>
          ) : (
            <Welcome />
          )}
        </section>
      </main>
      {dragging && <div className="drop-overlay" />}
      <ContextMenu />
      <Dialogs />
      <PasswordDialog />
      <Toasts />
    </div>
  )
}
