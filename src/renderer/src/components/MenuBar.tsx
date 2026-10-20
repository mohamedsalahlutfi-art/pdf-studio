import { useRef } from 'react'
import * as platform from '../lib/platform'
import { useActiveTab, useApp, type MenuItem } from '../store/useApp'

/** Classic application menu bar (File / Edit / View / …) with dropdown menus. */
export function MenuBar(): React.JSX.Element {
  const t = useApp((s) => s.t)
  const tab = useActiveTab()
  const theme = useApp((s) => s.theme)
  const invert = useApp((s) => s.invertPages)
  const sidebarOpen = useApp((s) => s.sidebarOpen)
  const barRef = useRef<HTMLDivElement>(null)
  const s = useApp.getState()
  const has = Boolean(tab)
  const total = tab?.history.present.pages.length ?? 0
  const canUndo = Boolean(tab?.history.past.length)
  const canRedo = Boolean(tab?.history.future.length)

  const menus: { label: string; items: () => MenuItem[] }[] = [
    {
      label: t('menuFile'),
      items: () => [
        { label: t('open'), shortcut: 'Ctrl+O', onClick: () => void s.openFilesFromDialog() },
        { label: t('saveDownloads'), shortcut: 'Ctrl+S', disabled: !has, onClick: () => void s.save() },
        { label: t('saveAs'), shortcut: 'Ctrl+Shift+S', disabled: !has, onClick: () => void s.saveAs() },
        ...(tab?.originalPath && platform.isDesktop
          ? [{ label: t('saveOverOriginal'), disabled: !has, onClick: () => void s.saveOverOriginal() }]
          : []),
        { divider: true },
        { label: t('exportAndCompress'), shortcut: 'Ctrl+Shift+E', disabled: !has, onClick: () => s.openDialog({ kind: 'export' }) },
        { label: t('mergeAll'), shortcut: 'Ctrl+M', disabled: s.tabs.length < 2, onClick: s.mergeAll },
        { label: t('split'), disabled: total < 2, onClick: () => s.openDialog({ kind: 'split' }) },
        { divider: true },
        { label: t('closeTab'), shortcut: 'Ctrl+W', disabled: !has, onClick: () => s.activeId && s.closeTab(s.activeId) }
      ]
    },
    {
      label: t('menuEdit'),
      items: () => [
        { label: t('undo'), shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: s.undo },
        { label: t('redo'), shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: s.redo },
        { divider: true },
        { label: t('selectAll'), shortcut: 'Ctrl+A', disabled: !has, onClick: s.selectAll },
        { divider: true },
        { label: t('duplicate'), shortcut: 'Ctrl+D', disabled: !has, onClick: s.duplicatePages },
        { label: t('deletePages'), shortcut: 'Del', disabled: !has, danger: true, onClick: s.deletePages },
        { label: t('extract'), shortcut: 'Ctrl+E', disabled: !has, onClick: s.extractPages },
        { label: t('rotateRightShort'), shortcut: 'Ctrl+R', disabled: !has, onClick: () => s.rotatePages(90) },
        { label: t('rotateLeftShort'), shortcut: 'Ctrl+Shift+R', disabled: !has, onClick: () => s.rotatePages(-90) },
        { divider: true },
        { label: t('labels'), disabled: !has, onClick: () => s.openDialog({ kind: 'labels' }) }
      ]
    },
    {
      label: t('menuView'),
      items: () => [
        { label: t('zoomIn'), shortcut: 'Ctrl+=', disabled: !has, onClick: () => s.zoomBy(1.25) },
        { label: t('zoomOut'), shortcut: 'Ctrl+-', disabled: !has, onClick: () => s.zoomBy(1 / 1.25) },
        { label: t('fitWidth'), shortcut: 'Ctrl+2', disabled: !has, onClick: () => s.setFitMode('width') },
        { label: t('fitPage'), shortcut: 'Ctrl+1', disabled: !has, onClick: () => s.setFitMode('page') },
        { label: t('actualSize'), shortcut: 'Ctrl+0', disabled: !has, onClick: () => s.setZoom(1) },
        { divider: true },
        { label: t('thumbnails'), shortcut: 'F4', disabled: !has, onClick: s.toggleSidebar, icon: sidebarOpen ? check : undefined },
        { label: t('darkPages'), disabled: !has, onClick: s.toggleInvert, icon: invert ? check : undefined },
        { label: t('darkMode'), shortcut: 'Ctrl+Shift+D', onClick: s.toggleTheme, icon: theme === 'dark' ? check : undefined },
        { divider: true },
        { label: t('language'), onClick: s.toggleLanguage }
      ]
    },
    {
      label: t('menuSign'),
      items: () => [
        { label: t('annotate'), disabled: !has, onClick: () => s.setRibbon('annotate') },
        { label: t('newSignature'), disabled: !has, onClick: () => s.openDialog({ kind: 'signature' }) }
      ]
    },
    {
      label: t('menuHelp'),
      items: () => [
        { label: t('about'), onClick: () => s.openDialog({ kind: 'about' }) },
        { label: t('shortcuts'), onClick: () => s.openDialog({ kind: 'about' }) }
      ]
    }
  ]

  const openMenu = (index: number, target: HTMLElement): void => {
    const rect = target.getBoundingClientRect()
    useApp.getState().openContextMenu(rect.left, rect.bottom + 2, menus[index].items())
  }

  return (
    <div className="menu-bar" ref={barRef} role="menubar">
      <span className="menu-brand">Salah PDF</span>
      {menus.map((menu, i) => (
        <button
          key={menu.label}
          type="button"
          role="menuitem"
          className="menu-bar-item"
          onClick={(e) => openMenu(i, e.currentTarget)}
          onMouseEnter={(e) => {
            // If a menu is already open, hovering another opens it (menu-bar behaviour).
            if (useApp.getState().contextMenu) openMenu(i, e.currentTarget)
          }}
        >
          {menu.label}
        </button>
      ))}
    </div>
  )
}

const check = <span style={{ fontSize: 12 }}>✓</span>
