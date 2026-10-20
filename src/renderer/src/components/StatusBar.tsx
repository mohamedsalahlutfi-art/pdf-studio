import { formatBytes } from '../lib/compressState'
import { getSource } from '../lib/sources'
import { isDirty, useActiveTab, useApp } from '../store/useApp'

/** Bottom status bar: page position, zoom, save state and document size. */
export function StatusBar(): React.JSX.Element | null {
  const tab = useActiveTab()
  const t = useApp((s) => s.t)
  const busy = useApp((s) => s.busy)
  useApp((s) => s.layoutVersion)
  if (!tab) return null
  const total = tab.history.present.pages.length
  // Rough document size: the sum of the unique sources it draws from.
  const size = [...new Set(tab.sourceIds)].reduce((sum, id) => sum + (getSource(id)?.bytes.length ?? 0), 0)
  const dirty = isDirty(tab)

  return (
    <div className="status-bar">
      <span className="status-item">
        {t('page')} {tab.currentPage + 1} / {total}
      </span>
      <span className="status-sep" />
      <span className="status-item">{Math.round(tab.zoom * 100)}%</span>
      <span className="status-spacer" />
      {busy ? (
        <span className="status-item">{t(busy)}</span>
      ) : (
        <span className={`status-item ${dirty ? 'dirty' : 'saved'}`}>{dirty ? t('unsaved') : t('saved')}</span>
      )}
      <span className="status-sep" />
      <span className="status-item">{formatBytes(size)}</span>
    </div>
  )
}
