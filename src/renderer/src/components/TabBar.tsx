import { X } from 'lucide-react'
import { useState } from 'react'
import { hasFiles, hasType, TAB_MIME } from '../lib/dnd'
import * as platform from '../lib/platform'
import { isDirty, useApp } from '../store/useApp'
import { tabMenuItems } from './menus'

/** Document tabs. Drag a tab onto another tab (or onto the thumbnails) to merge it; drop files on a tab to append them. */
export function TabBar(): React.JSX.Element | null {
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const t = useApp((s) => s.t)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  if (!tabs.length) return null
  const s = useApp.getState()

  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tab${tab.id === activeId ? ' active' : ''}${dropTarget === tab.id ? ' drop-target' : ''}`}
          title={tab.outputPath ?? tab.originalPath ?? tab.title}
          draggable
          onClick={() => s.setActive(tab.id)}
          onAuxClick={(e) => e.button === 1 && s.closeTab(tab.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            s.openContextMenu(e.clientX, e.clientY, tabMenuItems(tab))
          }}
          onDragStart={(e) => {
            e.dataTransfer.setData(TAB_MIME, tab.id)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          onDragOver={(e) => {
            if (!hasType(e, TAB_MIME) && !hasFiles(e)) return
            e.preventDefault()
            e.stopPropagation()
            setDropTarget(tab.id)
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDropTarget(null)
            const source = e.dataTransfer.getData(TAB_MIME)
            if (source) s.mergeTabInto(source, tab.id)
            else if (e.dataTransfer.files.length) {
              void platform.openDropped([...e.dataTransfer.files]).then((files) => s.insertFiles(files, undefined, tab.id))
            }
          }}
        >
          {isDirty(tab) && <span className="dirty-dot" title={t('unsaved')} />}
          <span className="tab-title">{tab.title}</span>
          <button
            type="button"
            className="tab-close"
            aria-label={t('closeTab')}
            onClick={(e) => {
              e.stopPropagation()
              s.closeTab(tab.id)
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
