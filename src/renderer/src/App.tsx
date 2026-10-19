import { useEffect, useState } from 'react'
import type { MenuCommand } from '../../shared/types'
import * as platform from './lib/platform'
import { isDirty, useActiveTab, useApp } from './store/useApp'
import { PasswordDialog, Toasts, Welcome } from './components/Overlays'
import { TabBar } from './components/TabBar'
import { Thumbnails } from './components/Thumbnails'
import { Toolbar } from './components/Toolbar'
import { Viewer } from './components/Viewer'

function runCommand(command: MenuCommand): void {
  const s = useApp.getState()
  const actions: Record<MenuCommand, () => void> = {
    open: () => void s.openFilesFromDialog(),
    save: () => void s.save(false),
    'save-as': () => void s.save(true),
    'close-tab': () => s.activeId && s.closeTab(s.activeId),
    undo: s.undo,
    redo: s.redo,
    'zoom-in': () => s.zoomBy(1.25),
    'zoom-out': () => s.zoomBy(1 / 1.25),
    'zoom-reset': () => s.setZoom(1),
    'fit-width': s.setFitWidth,
    'toggle-sidebar': s.toggleSidebar,
    'toggle-theme': s.toggleTheme,
    'toggle-invert': s.toggleInvert,
    'rotate-cw': () => s.rotatePage(90),
    'rotate-ccw': () => s.rotatePage(-90)
  }
  actions[command]()
}

/** Shortcuts for the browser build; in Electron the application menu owns them. */
function shortcutFor(e: KeyboardEvent): MenuCommand | null {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && key === 'o') return 'open'
  if (mod && key === 's') return e.shiftKey ? 'save-as' : 'save'
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (mod && key === 'y') return 'redo'
  if (mod && (key === '=' || key === '+')) return 'zoom-in'
  if (mod && key === '-') return 'zoom-out'
  if (mod && key === '0') return 'zoom-reset'
  if (key === 'f4') return 'toggle-sidebar'
  return null
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
    document.title = tab ? `${isDirty(tab) ? '• ' : ''}${tab.title} — PDF Studio` : 'PDF Studio'
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
    if (platform.isDesktop) return
    const onKey = (e: KeyboardEvent): void => {
      const command = shortcutFor(e)
      if (!command) return
      e.preventDefault()
      runCommand(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Page navigation keys that do not conflict with normal scrolling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      const s = useApp.getState()
      const active = s.tabs.find((t) => t.id === s.activeId)
      if (!active) return
      if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) s.goToPage(0)
      else if (e.key === 'End' && (e.ctrlKey || e.metaKey)) s.goToPage(active.history.present.pages.length - 1)
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
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void platform.openDropped([...e.dataTransfer.files]).then((files) => useApp.getState().openFiles(files))
      }}
    >
      <TabBar />
      <Toolbar />
      <main className="workspace">
        {tab ? (
          <>
            {sidebarOpen && <Thumbnails key={tab.id} tab={tab} />}
            <Viewer key={tab.id} tab={tab} />
          </>
        ) : (
          <Welcome />
        )}
      </main>
      {dragging && <div className="drop-overlay" />}
      <PasswordDialog />
      <Toasts />
    </div>
  )
}
