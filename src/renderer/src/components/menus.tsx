import {
  ArrowDownToLine, ArrowUpToLine, Combine, Copy, FileInput, FileOutput, FilePlus, FileText, FolderOpen, ListOrdered,
  RotateCcw, RotateCw, Save, SaveAll, Scissors, SquareCheckBig, Trash2, X
} from 'lucide-react'
import * as platform from '../lib/platform'
import { useApp, type MenuItem, type Tab } from '../store/useApp'

const ICON = 16

/** Menu for a page (thumbnail or viewer). Acts on the selection when the page is part of it. */
export function pageMenuItems(index: number): MenuItem[] {
  const s = useApp.getState()
  const { t } = s
  const tab = s.tabs.find((x) => x.id === s.activeId)
  if (!tab) return []
  const count = s.targetIds().size
  const suffix = count > 1 ? ` (${count})` : ''
  const total = tab.history.present.pages.length
  return [
    { label: t('rotateCw') + suffix, icon: <RotateCw size={ICON} />, shortcut: 'Ctrl+R', onClick: () => s.rotatePages(90) },
    { label: t('rotateCcw') + suffix, icon: <RotateCcw size={ICON} />, shortcut: 'Ctrl+Shift+R', onClick: () => s.rotatePages(-90) },
    { divider: true },
    { label: t('duplicate') + suffix, icon: <Copy size={ICON} />, shortcut: 'Ctrl+D', onClick: s.duplicatePages },
    { label: t('extractPages') + suffix, icon: <FileOutput size={ICON} />, shortcut: 'Ctrl+E', onClick: s.extractPages },
    {
      label: t('moveToStart') + suffix,
      icon: <ArrowUpToLine size={ICON} />,
      disabled: index === 0 && count <= 1,
      onClick: () => s.movePages([...s.targetIds()], 0)
    },
    {
      label: t('moveToEnd') + suffix,
      icon: <ArrowDownToLine size={ICON} />,
      disabled: index === total - 1 && count <= 1,
      onClick: () => s.movePages([...s.targetIds()], total)
    },
    { divider: true },
    { label: t('insertFileBefore'), icon: <FileInput size={ICON} />, onClick: () => void s.insertFromDialog(index) },
    { label: t('insertFileAfter'), icon: <FileInput size={ICON} />, onClick: () => void s.insertFromDialog(index + 1) },
    { label: t('insertBlankBefore'), icon: <FilePlus size={ICON} />, onClick: () => void s.insertBlank(index) },
    { label: t('insertBlankAfter'), icon: <FilePlus size={ICON} />, onClick: () => void s.insertBlank(index + 1) },
    { divider: true },
    { label: t('selectAll'), icon: <SquareCheckBig size={ICON} />, shortcut: 'Ctrl+A', onClick: s.selectAll },
    { label: t('labels'), icon: <ListOrdered size={ICON} />, onClick: () => s.openDialog({ kind: 'labels' }) },
    { divider: true },
    {
      label: t('deletePages') + suffix,
      icon: <Trash2 size={ICON} />,
      shortcut: 'Del',
      danger: true,
      disabled: count >= total,
      onClick: s.deletePages
    }
  ]
}

/** Menu for a document tab: saving, merging and closing. */
export function tabMenuItems(tab: Tab): MenuItem[] {
  const s = useApp.getState()
  const { t } = s
  const others = s.tabs.filter((x) => x.id !== tab.id)
  const activate = (run: () => void) => () => {
    s.setActive(tab.id)
    run()
  }
  return [
    { label: t('saveDownloads'), icon: <Save size={ICON} />, shortcut: 'Ctrl+S', onClick: activate(() => void s.save()) },
    { label: t('saveAs'), icon: <SaveAll size={ICON} />, shortcut: 'Ctrl+Shift+S', onClick: activate(() => void s.saveAs()) },
    ...(tab.originalPath && platform.isDesktop
      ? [{ label: t('saveOverOriginal'), icon: <FileText size={ICON} />, onClick: activate(() => void s.saveOverOriginal()) }]
      : []),
    ...(platform.isDesktop && (tab.outputPath || tab.originalPath)
      ? [{ label: t('showInFolder'), icon: <FolderOpen size={ICON} />, onClick: () => s.showInFolder(tab.id) }]
      : []),
    { divider: true },
    { label: t('insertFile'), icon: <FileInput size={ICON} />, onClick: activate(() => void s.insertFromDialog()) },
    { label: t('split'), icon: <Scissors size={ICON} />, onClick: activate(() => s.openDialog({ kind: 'split' })) },
    { label: t('mergeAll'), icon: <Combine size={ICON} />, shortcut: 'Ctrl+M', disabled: others.length === 0, onClick: s.mergeAll },
    ...(others.length
      ? [
          { divider: true },
          { heading: true, label: t('mergeInto') },
          ...others.map((other) => ({
            label: other.title,
            icon: <Combine size={ICON} />,
            onClick: () => s.mergeTabInto(tab.id, other.id)
          }))
        ]
      : []),
    { divider: true },
    { label: t('closeOthers'), icon: <X size={ICON} />, disabled: others.length === 0, onClick: () => s.closeOtherTabs(tab.id) },
    { label: t('closeTab'), icon: <X size={ICON} />, shortcut: 'Ctrl+W', onClick: () => s.closeTab(tab.id) }
  ]
}
