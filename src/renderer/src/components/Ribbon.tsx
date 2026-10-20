import { Combine, Copy, FileInput, FileOutput, FilePlus, ListOrdered, RotateCcw, RotateCw, Scissors, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useActiveTab, useApp } from '../store/useApp'
import { AnnotateTools } from './AnnotateTools'

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

/** Ribbon with two tool sets: page organisation, and comments/stamps/signatures. */
export function Ribbon(): React.JSX.Element | null {
  const tab = useActiveTab()
  const t = useApp((s) => s.t)
  const ribbon = useApp((s) => s.ribbon)
  if (!tab) return null
  const { setRibbon } = useApp.getState()
  return (
    <div className="ribbon" role="toolbar">
      <div className="ribbon-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={ribbon === 'pages'} onClick={() => setRibbon('pages')}>
          {t('pages')}
        </button>
        <button type="button" role="tab" aria-selected={ribbon === 'annotate'} onClick={() => setRibbon('annotate')}>
          {t('annotate')}
        </button>
      </div>
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
    </>
  )
}
