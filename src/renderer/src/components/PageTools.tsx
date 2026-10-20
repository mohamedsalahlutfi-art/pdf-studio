import { Combine, Copy, FileInput, FileOutput, FilePlus, ListOrdered, RotateCcw, RotateCw, Scissors, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useActiveTab, useApp } from '../store/useApp'

function Tool(props: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`ribbon-tool${props.danger ? ' danger' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

/** Labelled page tools. They act on the selected thumbnails, or the current page when nothing is selected. */
export function PageTools(): React.JSX.Element | null {
  const tab = useActiveTab()
  const t = useApp((s) => s.t)
  const tabCount = useApp((s) => s.tabs.length)
  if (!tab) return null
  const s = useApp.getState()
  const total = tab.history.present.pages.length
  const count = tab.selection.length

  return (
    <div className="ribbon" role="toolbar" aria-label={t('pages')}>
      <Tool label={t('insertFileShort')} icon={<FileInput size={18} />} onClick={() => void s.insertFromDialog()} />
      <Tool label={t('insertBlank')} icon={<FilePlus size={18} />} onClick={() => void s.insertBlank()} />
      <span className="divider" />
      <Tool label={t('rotateLeftShort')} icon={<RotateCcw size={18} />} onClick={() => s.rotatePages(-90)} />
      <Tool label={t('rotateRightShort')} icon={<RotateCw size={18} />} onClick={() => s.rotatePages(90)} />
      <Tool label={t('duplicate')} icon={<Copy size={18} />} onClick={s.duplicatePages} />
      <Tool label={t('deletePages')} icon={<Trash2 size={18} />} onClick={s.deletePages} danger disabled={count >= total} />
      <span className="divider" />
      <Tool label={t('extract')} icon={<FileOutput size={18} />} onClick={s.extractPages} />
      <Tool label={t('split')} icon={<Scissors size={18} />} onClick={() => s.openDialog({ kind: 'split' })} disabled={total < 2} />
      <Tool label={t('mergeAll')} icon={<Combine size={18} />} onClick={s.mergeAll} disabled={tabCount < 2} />
      <Tool label={t('labels')} icon={<ListOrdered size={18} />} onClick={() => s.openDialog({ kind: 'labels' })} />
      {count > 0 && (
        <span className="selection-count">
          {count} {t('selected')}
        </span>
      )}
    </div>
  )
}
