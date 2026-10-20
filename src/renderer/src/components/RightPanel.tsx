import { ArrowUpRight, Circle, Highlighter, Minus, PenLine, Square, Stamp, StickyNote, Trash2, Underline, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { pageLabel } from '../lib/pageLabels'
import type { Annotation } from '../lib/model'
import { useActiveTab, useApp } from '../store/useApp'

const ICON: Record<Annotation['type'], ReactNode> = {
  highlight: <Highlighter size={15} />,
  underline: <Underline size={15} />,
  strikeout: <Minus size={15} />,
  rect: <Square size={15} />,
  ellipse: <Circle size={15} />,
  line: <Minus size={15} />,
  arrow: <ArrowUpRight size={15} />,
  ink: <PenLine size={15} />,
  note: <StickyNote size={15} />,
  image: <Stamp size={15} />
}

const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#212121', '#ffffff']

function describe(a: Annotation, t: (k: Parameters<ReturnType<typeof useApp.getState>['t']>[0]) => string): string {
  if (a.type === 'image') return t(a.kind === 'text' ? 'toolText' : a.kind === 'signature' ? 'signature' : a.kind === 'stamp' ? 'stamps' : 'insertImage')
  if (a.type === 'note') return a.text || t('toolNote')
  return t(`tool${a.type[0].toUpperCase()}${a.type.slice(1)}` as 'toolRect')
}

/** Comments panel: every annotation in the document, grouped by page, with jump + delete. */
function CommentsPanel() {
  const tab = useActiveTab()
  const t = useApp((s) => s.t)
  const selected = useApp((s) => s.selectedAnnotation)
  const s = useApp.getState()
  const pages = tab?.history.present.pages ?? []
  const items = pages.flatMap((p, i) => (p.annotations ?? []).map((a) => ({ a, pageId: p.id, pageIndex: i })))

  if (!items.length) return <div className="panel-empty">{t('noComments')}</div>
  return (
    <div className="comment-list">
      {items.map(({ a, pageId, pageIndex }) => (
        <div
          key={a.id}
          className={`comment-row${selected?.id === a.id ? ' active' : ''}`}
          onClick={() => {
            s.setRibbon('annotate')
            s.goToPage(pageIndex)
            s.selectAnnotation({ pageId, id: a.id })
          }}
        >
          <span className="comment-icon" style={{ color: a.color }}>
            {ICON[a.type]}
          </span>
          <span className="comment-text">{describe(a, t)}</span>
          <span className="comment-page">{pageLabel(pageIndex, tab?.history.present.labels ?? null)}</span>
          <button
            type="button"
            className="comment-del"
            aria-label={t('deleteAnnotation')}
            onClick={(e) => {
              e.stopPropagation()
              s.removeAnnotation(pageId, a.id)
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Properties inspector for the selected annotation: colour, stroke width, fill, font size. */
function PropertiesPanel() {
  const tab = useActiveTab()
  const t = useApp((s) => s.t)
  const ref = useApp((s) => s.selectedAnnotation)
  const s = useApp.getState()
  const annotation = ref && tab?.history.present.pages.find((p) => p.id === ref.pageId)?.annotations?.find((a) => a.id === ref.id)
  if (!annotation) return <div className="panel-empty">{t('selectToEdit')}</div>

  const hasWidth = 'width' in annotation
  const hasFill = annotation.type === 'rect' || annotation.type === 'ellipse'
  const hasFont = annotation.type === 'image' && annotation.kind === 'text'

  return (
    <div className="properties">
      <div className="prop-field">
        <span>{t('color')}</span>
        <div className="swatch-row">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              aria-pressed={annotation.color.toLowerCase() === c}
              style={{ background: c }}
              onClick={() => s.patchSelectedAnnotation({ color: c })}
            />
          ))}
        </div>
      </div>
      {hasWidth && (
        <label className="prop-field">
          <span>
            {t('thickness')} — {(annotation as { width: number }).width} pt
          </span>
          <input
            type="range"
            min={1}
            max={12}
            value={(annotation as { width: number }).width}
            onChange={(e) => s.patchSelectedAnnotation({ width: Number(e.target.value) })}
          />
        </label>
      )}
      {hasFill && (
        <div className="prop-field">
          <span>{t('fill')}</span>
          <div className="swatch-row">
            <button
              type="button"
              className="swatch none"
              aria-pressed={!annotation.fill}
              onClick={() => s.patchSelectedAnnotation({ fill: null })}
            >
              <X size={14} />
            </button>
            {COLORS.slice(0, 7).map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                aria-pressed={annotation.fill?.toLowerCase() === c}
                style={{ background: c }}
                onClick={() => s.patchSelectedAnnotation({ fill: c })}
              />
            ))}
          </div>
        </div>
      )}
      {hasFont && annotation.text && (
        <label className="prop-field">
          <span>
            {t('fontSize')} — {annotation.text.fontSize} pt
          </span>
          <input
            type="range"
            min={8}
            max={48}
            value={annotation.text.fontSize}
            onChange={(e) => s.patchSelectedAnnotation({ text: { ...annotation.text, fontSize: Number(e.target.value) } })}
          />
        </label>
      )}
      <button
        type="button"
        className="prop-delete"
        onClick={() => ref && s.removeAnnotation(ref.pageId, ref.id)}
      >
        <Trash2 size={15} /> {t('deleteAnnotation')}
      </button>
      {/* Resizing/cropping hints so people find those actions. */}
      {annotation.type === 'image' && <p className="muted small">{t('resizeHint')}</p>}
    </div>
  )
}

export function RightPanel(): React.JSX.Element | null {
  const panel = useApp((s) => s.rightPanel)
  const t = useApp((s) => s.t)
  const tab = useActiveTab()
  if (panel === 'none' || !tab) return null
  const s = useApp.getState()
  return (
    <aside className="right-panel">
      <div className="right-panel-head">
        <div className="panel-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={panel === 'comments'} onClick={() => s.setRightPanel('comments')}>
            {t('commentsPanel')}
          </button>
          <button type="button" role="tab" aria-selected={panel === 'properties'} onClick={() => s.setRightPanel('properties')}>
            {t('propertiesPanel')}
          </button>
        </div>
        <button type="button" className="panel-close" aria-label={t('cancel')} onClick={() => s.setRightPanel('none')}>
          <X size={16} />
        </button>
      </div>
      <div className="right-panel-body">{panel === 'comments' ? <CommentsPanel /> : <PropertiesPanel />}</div>
    </aside>
  )
}
