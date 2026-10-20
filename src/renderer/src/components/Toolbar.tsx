import {
  FileDown, FolderOpen, MessageSquareText, Moon, PanelLeft, Redo2, Save, ScanSearch, SlidersHorizontal, Sun, Undo2, ZoomIn, ZoomOut, Contrast, Languages,
  MoveHorizontal
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useActiveTab, useApp } from '../store/useApp'

function ToolButton(props: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="tool"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function PageInput({ current, total, onGo }: { current: number; total: number; onGo: (page: number) => void }) {
  const [value, setValue] = useState(String(current + 1))
  useEffect(() => setValue(String(current + 1)), [current])
  return (
    <input
      className="page-input"
      inputMode="numeric"
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const page = Number(value)
          if (page >= 1 && page <= total) onGo(page - 1)
          else setValue(String(current + 1))
          e.currentTarget.blur()
        }
      }}
      onBlur={() => setValue(String(current + 1))}
    />
  )
}

export function Toolbar(): React.JSX.Element {
  const tab = useActiveTab()
  const s = useApp()
  const { t } = s
  const pageCount = tab?.history.present.pages.length ?? 0

  return (
    <div className="toolbar" role="toolbar">
      <div className="tool-group">
        <ToolButton label={`${t('open')} (Ctrl+O)`} onClick={() => void s.openFilesFromDialog()}>
          <FolderOpen size={18} />
        </ToolButton>
        <ToolButton label={`${t('save')} (Ctrl+S)`} onClick={() => void s.save()} disabled={!tab || s.busy !== null}>
          <Save size={18} />
        </ToolButton>
        <ToolButton label={t('exportAndCompress')} onClick={() => s.openDialog({ kind: 'export' })} disabled={!tab}>
          <FileDown size={18} />
        </ToolButton>
        <span className="divider" />
        <ToolButton label={`${t('undo')} (Ctrl+Z)`} onClick={s.undo} disabled={!tab?.history.past.length}>
          <Undo2 size={18} />
        </ToolButton>
        <ToolButton label={`${t('redo')} (Ctrl+Y)`} onClick={s.redo} disabled={!tab?.history.future.length}>
          <Redo2 size={18} />
        </ToolButton>
        <span className="divider" />
        <ToolButton label={t('thumbnails')} onClick={s.toggleSidebar} pressed={s.sidebarOpen} disabled={!tab}>
          <PanelLeft size={18} />
        </ToolButton>
      </div>

      {tab && (
        <div className="tool-group center">
          <ToolButton label={t('zoomOut')} onClick={() => s.zoomBy(1 / 1.25)}>
            <ZoomOut size={18} />
          </ToolButton>
          <span className="zoom-value">{Math.round(tab.zoom * 100)}%</span>
          <ToolButton label={t('zoomIn')} onClick={() => s.zoomBy(1.25)}>
            <ZoomIn size={18} />
          </ToolButton>
          <ToolButton label={t('fitWidth')} onClick={() => s.setFitMode('width')} pressed={tab.fitMode === 'width'}>
            <MoveHorizontal size={18} />
          </ToolButton>
          <ToolButton label={t('fitPage')} onClick={() => s.setFitMode('page')} pressed={tab.fitMode === 'page'}>
            <ScanSearch size={18} />
          </ToolButton>
          <span className="divider" />
          <span className="page-nav">
            {t('page')} <PageInput current={tab.currentPage} total={pageCount} onGo={s.goToPage} /> {t('of')} {pageCount}
          </span>
        </div>
      )}

      <div className="tool-group end">
        <ToolButton label={t('panelComments')} onClick={() => s.toggleRightPanel('comments')} pressed={s.rightPanel === 'comments'} disabled={!tab}>
          <MessageSquareText size={18} />
        </ToolButton>
        <ToolButton label={t('panelProperties')} onClick={() => s.toggleRightPanel('properties')} pressed={s.rightPanel === 'properties'} disabled={!tab}>
          <SlidersHorizontal size={18} />
        </ToolButton>
        <span className="divider" />
        <ToolButton label={t('darkPages')} onClick={s.toggleInvert} pressed={s.invertPages}>
          <Contrast size={18} />
        </ToolButton>
        <ToolButton label={t('darkMode')} onClick={s.toggleTheme} pressed={s.theme === 'dark'}>
          {s.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </ToolButton>
        <ToolButton label={t('language')} onClick={s.toggleLanguage}>
          <Languages size={18} />
        </ToolButton>
      </div>
    </div>
  )
}
