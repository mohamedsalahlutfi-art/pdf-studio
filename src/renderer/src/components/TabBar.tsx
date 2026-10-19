import { X } from 'lucide-react'
import { isDirty, useApp } from '../store/useApp'

export function TabBar(): React.JSX.Element | null {
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const { setActive, closeTab, t } = useApp.getState()
  if (!tabs.length) return null

  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tab${tab.id === activeId ? ' active' : ''}`}
          title={tab.filePath ?? tab.title}
          onClick={() => setActive(tab.id)}
          onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
        >
          {isDirty(tab) && <span className="dirty-dot" title={t('unsaved')} />}
          <span className="tab-title">{tab.title}</span>
          <button
            type="button"
            className="tab-close"
            aria-label={t('closeTab')}
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
