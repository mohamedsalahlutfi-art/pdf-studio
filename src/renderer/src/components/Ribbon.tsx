import {
  Combine, Copy, FileDown, FileInput, FileOutput, FilePlus, Files, ListOrdered, MessageSquareText, RotateCcw, RotateCw,
  Scissors, Trash2
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useActiveTab, useApp, type StringKeyLike } from '../store/useApp'
import { AnnotateTools } from './AnnotateTools'

/**
 * Vertical tool rail down the left edge (Acrobat-style "all tools" rail): pick a
 * tool group, then its tools appear in the contextual strip above the document.
 */
export function ToolRail(): React.JSX.Element {
  const t = useApp((s) => s.t)
  const ribbon = useApp((s) => s.ribbon)
  const tab = useActiveTab()
  const s = useApp.getState()
  const groups: { id: 'pages' | 'annotate'; label: StringKeyLike; icon: ReactNode }[] = [
    { id: 'pages', label: 'pages', icon: <Files size={22} /> },
    { id: 'annotate', label: 'annotate', icon: <MessageSquareText size={22} /> }
  ]
  return (
    <nav className="tool-rail" role="tablist" aria-label={t('tools')}>
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          role="tab"
          aria-selected={ribbon === group.id}
          className="rail-item"
          disabled={!tab}
          title={t(group.label)}
          onClick={() => s.setRibbon(group.id)}
        >
          {group.icon}
          <span>{t(group.label)}</span>
        </button>
      ))}
      <span className="rail-spacer" />
      <button
        type="button"
        className="rail-item"
        disabled={!tab}
        title={t('tipExport')}
        onClick={() => s.openDialog({ kind: 'export' })}
      >
        <FileDown size={22} />
        <span>{t('exportShort')}</span>
      </button>
    </nav>
  )
}

function Tool(props: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; tip?: string }) {
  return (
    <button
      type="button"
      className={`ribbon-tool${props.danger ? ' danger' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.tip ?? props.label}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

/** Contextual tool strip above the document, showing the active group's tools. */
export function ToolStrip(): React.JSX.Element | null {
  const tab = useActiveTab()
  const ribbon = useApp((s) => s.ribbon)
  const t = useApp((s) => s.t)
  if (!tab) return null
  return (
    <div className="ribbon" role="toolbar" aria-label={t(ribbon === 'pages' ? 'pages' : 'annotate')}>
      <span className="ribbon-group-name">{t(ribbon === 'pages' ? 'pages' : 'annotate')}</span>
      <span className="divider" />
      {ribbon === 'pages' ? <PageTools /> : <AnnotateTools />}
    </div>
  )
}

/** Labelled page tools. They act on the selected thumbnails, or the current page when nothing is selected. */
function PageTools(): React.JSX.Element | null {
  const tab = useActiveTab()
  const t = useApp((s) => s.t)
  const tabCount = useApp((s) => s.tabs.length)
  if (!tab) return null
  const s = useApp.getState()
  const total = tab.history.present.pages.length
  const count = tab.selection.length

  return (
    <>
      <Tool label={t('insertFileShort')} icon={<FileInput size={18} />} tip={t('tipInsertFile')} onClick={() => void s.insertFromDialog()} />
      <Tool label={t('insertBlank')} icon={<FilePlus size={18} />} tip={t('tipInsertBlank')} onClick={() => void s.insertBlank()} />
      <span className="divider" />
      <Tool label={t('rotateLeftShort')} icon={<RotateCcw size={18} />} tip={t('tipRotateLeft')} onClick={() => s.rotatePages(-90)} />
      <Tool label={t('rotateRightShort')} icon={<RotateCw size={18} />} tip={t('tipRotateRight')} onClick={() => s.rotatePages(90)} />
      <Tool label={t('duplicate')} icon={<Copy size={18} />} tip={t('tipDuplicate')} onClick={s.duplicatePages} />
      <Tool label={t('deletePages')} icon={<Trash2 size={18} />} tip={t('tipDelete')} onClick={s.deletePages} danger disabled={count >= total} />
      <span className="divider" />
      <Tool label={t('extract')} icon={<FileOutput size={18} />} tip={t('tipExtract')} onClick={s.extractPages} />
      <Tool label={t('split')} icon={<Scissors size={18} />} tip={t('tipSplit')} onClick={() => s.openDialog({ kind: 'split' })} disabled={total < 2} />
      <Tool label={t('mergeAll')} icon={<Combine size={18} />} tip={t('tipMergeAll')} onClick={s.mergeAll} disabled={tabCount < 2} />
      <Tool label={t('labels')} icon={<ListOrdered size={18} />} tip={t('tipLabels')} onClick={() => s.openDialog({ kind: 'labels' })} />
      {count > 0 && (
        <span className="selection-count">
          {count} {t('selected')}
        </span>
      )}
    </>
  )
}
