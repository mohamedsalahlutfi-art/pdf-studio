import { StickyNote } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { assetFromCanvas, getAsset } from '../lib/assets'
import {
  annotationBounds, arrowHead, displayMatrix, fromDisplay, inkPathData, isResizable, NOTE_SIZE, rectFromPoints,
  toDisplay, translateAnnotation, uprightSize, vectorFromDisplay, type Frame
} from '../lib/geometry'
import { newId, type Annotation, type ImageAnnotation, type PageRef, type Point, type Rect, type Rotation } from '../lib/model'
import { drawText, RASTER_SCALE } from '../lib/render'
import { useApp, type Tool } from '../store/useApp'

const MARKUP_TOOLS: Tool[] = ['highlight', 'underline', 'strikeout']
const DRAG_TOOLS: Tool[] = ['rect', 'ellipse', 'line', 'arrow', 'ink']
const TEXT_BOX_WIDTH = 220

/** Display rect (scale 1) → unrotated rect. */
function rectFromDisplay(r: Rect, frame: Frame): Rect {
  return rectFromPoints(fromDisplay({ x: r.x, y: r.y }, frame), fromDisplay({ x: r.x + r.width, y: r.y + r.height }, frame))
}

/** Unrotated rect → display rect (scale 1). */
function rectToDisplay(r: Rect, frame: Frame): Rect {
  return rectFromPoints(toDisplay({ x: r.x, y: r.y }, frame), toDisplay({ x: r.x + r.width, y: r.y + r.height }, frame))
}

/** Joins selection rectangles that sit on the same text line. */
function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Rect[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    const overlap = last ? Math.min(last.y + last.height, r.y + r.height) - Math.max(last.y, r.y) : 0
    if (last && overlap > Math.min(last.height, r.height) * 0.5 && r.x <= last.x + last.width + 3) {
      const x = Math.min(last.x, r.x)
      const y = Math.min(last.y, r.y)
      out[out.length - 1] = {
        x,
        y,
        width: Math.max(last.x + last.width, r.x + r.width) - x,
        height: Math.max(last.y + last.height, r.y + r.height) - y
      }
    } else out.push(r)
  }
  return out
}

/** Text boxes are stored as images; this (re)draws one from its text. */
export async function rasterizeText(annotation: ImageAnnotation, value: string): Promise<ImageAnnotation> {
  const upright = uprightSize(annotation)
  const spec = { value, fontSize: annotation.text?.fontSize ?? 14 }
  const canvas = drawText(spec, annotation.color, upright.width)
  const asset = await assetFromCanvas(canvas)
  const height = canvas.height / RASTER_SCALE
  const quarter = annotation.angle % 180 !== 0
  // Grow downwards in the reader's view, whatever the page rotation.
  const rect: Rect = quarter
    ? { ...annotation.rect, width: height, x: annotation.angle === 270 ? annotation.rect.x + annotation.rect.width - height : annotation.rect.x }
    : { ...annotation.rect, height, y: annotation.angle === 180 ? annotation.rect.y + annotation.rect.height - height : annotation.rect.y }
  return { ...annotation, assetId: asset.id, rect, text: spec }
}

function AnnotationShape({ a, frame, scale }: { a: Annotation; frame: Frame; scale: number }) {
  const hit = Math.max(8 / scale, 4)
  switch (a.type) {
    case 'highlight':
      return (
        <g className="ann">
          {a.rects.map((r, i) => (
            <rect key={i} {...r} fill={a.color} opacity={0.4} style={{ mixBlendMode: 'multiply' }} />
          ))}
        </g>
      )
    case 'underline':
    case 'strikeout':
      return (
        <g className="ann">
          {a.rects.map((r, i) => {
            const y = a.type === 'underline' ? r.y + r.height * 0.94 : r.y + r.height * 0.55
            return (
              <g key={i}>
                <rect {...r} fill="transparent" />
                <line x1={r.x} x2={r.x + r.width} y1={y} y2={y} stroke={a.color} strokeWidth={Math.max(0.8, r.height * 0.07)} />
              </g>
            )
          })}
        </g>
      )
    case 'rect':
    case 'ellipse': {
      const props = { stroke: a.color, strokeWidth: a.width, fill: a.fill ?? 'transparent', fillOpacity: a.fill ? 0.35 : 1 }
      return a.type === 'rect' ? (
        <rect className="ann" {...a.rect} {...props} />
      ) : (
        <ellipse
          className="ann"
          cx={a.rect.x + a.rect.width / 2}
          cy={a.rect.y + a.rect.height / 2}
          rx={a.rect.width / 2}
          ry={a.rect.height / 2}
          {...props}
        />
      )
    }
    case 'line':
    case 'arrow': {
      const [w1, w2] = arrowHead(a.from, a.to, a.width)
      return (
        <g className="ann" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" fill="none">
          <line x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />
          {a.type === 'arrow' && <polyline points={`${w1.x},${w1.y} ${a.to.x},${a.to.y} ${w2.x},${w2.y}`} strokeLinejoin="round" />}
          <line x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} stroke="transparent" strokeWidth={a.width + hit} />
        </g>
      )
    }
    case 'ink':
      return (
        <g className="ann" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {a.paths.map((path, i) => (
            <g key={i}>
              <path d={inkPathData(path)} stroke={a.color} strokeWidth={a.width} />
              <path d={inkPathData(path)} stroke="transparent" strokeWidth={a.width + hit} />
            </g>
          ))}
        </g>
      )
    case 'note': {
      const c = { x: a.at.x + NOTE_SIZE / 2, y: a.at.y + NOTE_SIZE / 2 }
      return (
        <g className="ann note" transform={`rotate(${-frame.rotation} ${c.x} ${c.y})`}>
          <rect x={a.at.x} y={a.at.y} width={NOTE_SIZE} height={NOTE_SIZE} rx={3} fill={a.color} stroke="rgba(0,0,0,.35)" strokeWidth={0.6} />
          <path
            d={`M${a.at.x + 5} ${a.at.y + 7}h12M${a.at.x + 5} ${a.at.y + 11}h12M${a.at.x + 5} ${a.at.y + 15}h8`}
            stroke="rgba(0,0,0,.55)"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )
    }
    case 'image': {
      const asset = getAsset(a.assetId)
      const upright = uprightSize(a)
      const c = { x: a.rect.x + a.rect.width / 2, y: a.rect.y + a.rect.height / 2 }
      return (
        <g className="ann" transform={`rotate(${-a.angle} ${c.x} ${c.y})`}>
          <rect x={c.x - upright.width / 2} y={c.y - upright.height / 2} width={upright.width} height={upright.height} fill="transparent" />
          {asset && (
            <image
              href={asset.url}
              x={c.x - upright.width / 2}
              y={c.y - upright.height / 2}
              width={upright.width}
              height={upright.height}
              preserveAspectRatio="none"
            />
          )}
        </g>
      )
    }
  }
}

type Gesture =
  | { kind: 'draw'; start: Point; current: Point; points: Point[] }
  | { kind: 'move'; annotation: Annotation; startClient: Point; delta: Point }
  | { kind: 'resize'; annotation: Annotation; anchor: Point; current: Point }
  | { kind: 'markup'; startClient: Point; start: Point }

interface Props {
  page: PageRef
  frame: Frame
  scale: number
}

/**
 * Draws a page's annotations and handles creating, selecting, moving,
 * resizing and erasing them with the active tool.
 */
export function AnnotationLayer({ page, frame, scale }: Props): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const tool = useApp((s) => s.tool)
  const toolColor = useApp((s) => s.toolColor)
  const strokeWidth = useApp((s) => s.strokeWidth)
  const fontSize = useApp((s) => s.fontSize)
  const placing = useApp((s) => s.placing)
  const selected = useApp((s) => (s.selectedAnnotation?.pageId === page.id ? s.selectedAnnotation.id : null))
  const editing = useApp((s) => (s.editing?.pageId === page.id ? s.editing.id : null))
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [ghost, setGhost] = useState<Point | null>(null)
  const [draftText, setDraftText] = useState<ImageAnnotation | null>(null)
  const annotations = page.annotations ?? []
  const display = { width: frame.rotation % 180 ? frame.height : frame.width, height: frame.rotation % 180 ? frame.width : frame.height }
  const angle = frame.rotation as Rotation

  const toPage = (clientX: number, clientY: number): Point => {
    const box = svg.current!.getBoundingClientRect()
    return fromDisplay({ x: (clientX - box.left) / scale, y: (clientY - box.top) / scale }, frame)
  }

  // Highlight/underline/strike-out: select text in the text layer, or drag a box over scans.
  useEffect(() => {
    const host = svg.current?.parentElement
    if (!host || !MARKUP_TOOLS.includes(tool)) return
    let start: { client: Point; page: Point } | null = null
    const down = (e: PointerEvent): void => {
      if (e.button === 0) start = { client: { x: e.clientX, y: e.clientY }, page: toPage(e.clientX, e.clientY) }
    }
    const up = (e: PointerEvent): void => {
      if (!start) return
      const begin = start
      start = null
      const selection = window.getSelection()
      const box = host.getBoundingClientRect()
      const rects: Rect[] = []
      if (selection && !selection.isCollapsed) {
        for (let i = 0; i < selection.rangeCount; i++) {
          for (const r of selection.getRangeAt(i).getClientRects()) {
            const inside = r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1
            if (r.width < 1 || r.height < 1 || r.height > box.height / 3 || !inside) continue
            rects.push(
              rectFromDisplay({ x: (r.left - box.left) / scale, y: (r.top - box.top) / scale, width: r.width / scale, height: r.height / scale }, frame)
            )
          }
        }
      }
      if (!rects.length && Math.hypot(e.clientX - begin.client.x, e.clientY - begin.client.y) > 6) {
        rects.push(rectFromPoints(begin.page, toPage(e.clientX, e.clientY)))
      }
      if (!rects.length) return
      selection?.removeAllRanges()
      useApp.getState().addAnnotation(page.id, { id: newId('ann'), type: tool as 'highlight', color: toolColor, rects: mergeLineRects(rects) })
    }
    host.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      host.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  })

  const commitDraw = (g: Extract<Gesture, { kind: 'draw' }>): void => {
    const { addAnnotation } = useApp.getState()
    const id = newId('ann')
    const r = rectFromPoints(g.start, g.current)
    if (tool === 'ink') {
      if (g.points.length) addAnnotation(page.id, { id, type: 'ink', color: toolColor, width: strokeWidth, paths: [g.points] })
    } else if ((tool === 'line' || tool === 'arrow') && Math.hypot(g.current.x - g.start.x, g.current.y - g.start.y) > 3) {
      addAnnotation(page.id, { id, type: tool, color: toolColor, width: strokeWidth, from: g.start, to: g.current })
    } else if ((tool === 'rect' || tool === 'ellipse') && r.width > 3 && r.height > 3) {
      addAnnotation(page.id, { id, type: tool, color: toolColor, width: strokeWidth, fill: null, rect: r })
    }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    // Keep the browser from moving focus on mousedown, which would blur the editor we are about to open.
    e.preventDefault()
    const s = useApp.getState()
    const p = toPage(e.clientX, e.clientY)
    if (DRAG_TOOLS.includes(tool)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      setGesture({ kind: 'draw', start: p, current: p, points: [p] })
    } else if (tool === 'note') {
      const id = newId('ann')
      s.addAnnotation(page.id, {
        id,
        type: 'note',
        color: '#ffd54f',
        at: { x: p.x - NOTE_SIZE / 2, y: p.y - NOTE_SIZE / 2 },
        text: '',
        author: s.userName,
        date: new Date().toISOString()
      }, true)
      s.setTool('select')
      s.selectAnnotation({ pageId: page.id, id })
      s.setEditing({ pageId: page.id, id })
    } else if (tool === 'text') {
      const d = toDisplay(p, frame)
      const rect = rectFromDisplay({ x: d.x, y: d.y - fontSize * 0.8, width: TEXT_BOX_WIDTH, height: fontSize * 1.6 }, frame)
      setDraftText({ id: newId('ann'), type: 'image', kind: 'text', color: toolColor, rect, angle, assetId: '', text: { value: '', fontSize } })
    } else if (tool === 'place' && placing) {
      const asset = getAsset(placing.assetId)
      if (!asset) return
      const width = angle % 180 ? placing.height : placing.width
      const height = angle % 180 ? placing.width : placing.height
      const id = newId('ann')
      s.addAnnotation(page.id, {
        id,
        type: 'image',
        kind: placing.kind,
        color: '#000000',
        rect: { x: p.x - width / 2, y: p.y - height / 2, width, height },
        angle,
        assetId: placing.assetId
      }, true)
      s.setTool('select')
      s.selectAnnotation({ pageId: page.id, id })
      setGhost(null)
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (tool === 'place') setGhost(toPage(e.clientX, e.clientY))
    if (!gesture) return
    if (gesture.kind === 'draw') {
      const p = toPage(e.clientX, e.clientY)
      setGesture({ ...gesture, current: p, points: tool === 'ink' ? [...gesture.points, p] : gesture.points })
    } else if (gesture.kind === 'move') {
      const v = vectorFromDisplay({ x: (e.clientX - gesture.startClient.x) / scale, y: (e.clientY - gesture.startClient.y) / scale }, frame.rotation)
      setGesture({ ...gesture, delta: v })
    } else if (gesture.kind === 'resize') {
      setGesture({ ...gesture, current: toPage(e.clientX, e.clientY) })
    }
  }

  const resizedRect = (g: Extract<Gesture, { kind: 'resize' }>): Rect => {
    const a = g.annotation as Extract<Annotation, { rect: Rect }>
    // Work in display space so the handle follows the pointer at any rotation.
    const anchor = toDisplay(g.anchor, frame)
    const current = toDisplay(g.current, frame)
    let w = Math.max(8, current.x - anchor.x)
    let h = Math.max(8, current.y - anchor.y)
    if (a.type === 'image') {
      const shown = rectToDisplay(a.rect, frame)
      const ratio = shown.width / shown.height
      if (w / h > ratio) w = h * ratio
      else h = w / ratio
    }
    return rectFromDisplay({ x: anchor.x, y: anchor.y, width: w, height: h }, frame)
  }

  const onPointerUp = (): void => {
    if (!gesture) return
    const s = useApp.getState()
    if (gesture.kind === 'draw') commitDraw(gesture)
    else if (gesture.kind === 'move' && Math.hypot(gesture.delta.x, gesture.delta.y) > 0.5) {
      s.updateAnnotation(page.id, translateAnnotation(gesture.annotation, gesture.delta.x, gesture.delta.y))
    } else if (gesture.kind === 'resize') {
      const rect = resizedRect(gesture)
      const a = gesture.annotation as Extract<Annotation, { rect: Rect }>
      if (a.type === 'image' && a.kind === 'text' && a.text) {
        void rasterizeText({ ...a, rect }, a.text.value).then((next) => s.updateAnnotation(page.id, next))
      } else s.updateAnnotation(page.id, { ...a, rect })
    }
    setGesture(null)
  }

  const onAnnotationDown = (e: React.PointerEvent, a: Annotation): void => {
    if (e.button !== 0) return
    const s = useApp.getState()
    if (tool === 'eraser') {
      e.stopPropagation()
      s.removeAnnotation(page.id, a.id)
      return
    }
    if (tool !== 'select') return
    e.stopPropagation()
    e.preventDefault()
    s.selectAnnotation({ pageId: page.id, id: a.id })
    svg.current!.setPointerCapture(e.pointerId)
    setGesture({ kind: 'move', annotation: a, startClient: { x: e.clientX, y: e.clientY }, delta: { x: 0, y: 0 } })
  }

  const shown = annotations.map((a) => {
    if (gesture?.kind === 'move' && gesture.annotation.id === a.id) return translateAnnotation(a, gesture.delta.x, gesture.delta.y)
    if (gesture?.kind === 'resize' && gesture.annotation.id === a.id) return { ...a, rect: resizedRect(gesture) } as Annotation
    return a
  })
  const selectedAnnotation = shown.find((a) => a.id === selected)
  const selectionBox = selectedAnnotation && rectToDisplay(annotationBounds(selectedAnnotation), frame)
  const editingAnnotation = annotations.find((a) => a.id === editing)

  const drawing = gesture?.kind === 'draw' ? gesture : null
  const interactive = !['select', 'eraser', ...MARKUP_TOOLS].includes(tool)

  return (
    <>
      <svg
        ref={svg}
        className={`annotation-layer tool-${tool}${interactive ? ' capturing' : ''}`}
        viewBox={`0 0 ${display.width} ${display.height}`}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setGhost(null)}
      >
        <g transform={displayMatrix(frame)}>
          {shown.map((a) => (
            <g
              key={a.id}
              onPointerDown={(e) => onAnnotationDown(e, a)}
              onDoubleClick={() => {
                if (a.type === 'note' || (a.type === 'image' && a.kind === 'text')) useApp.getState().setEditing({ pageId: page.id, id: a.id })
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const s = useApp.getState()
                s.selectAnnotation({ pageId: page.id, id: a.id })
                s.openContextMenu(e.clientX, e.clientY, [
                  ...(a.type === 'note' || (a.type === 'image' && a.kind === 'text')
                    ? [{ label: s.t('editText'), onClick: () => s.setEditing({ pageId: page.id, id: a.id }) }]
                    : []),
                  { label: s.t('deleteAnnotation'), danger: true, shortcut: 'Del', onClick: () => s.removeAnnotation(page.id, a.id) }
                ])
              }}
            >
              <AnnotationShape a={a} frame={frame} scale={scale} />
            </g>
          ))}
          {drawing && (tool === 'rect' || tool === 'ellipse') && (
            <AnnotationShape
              a={{ id: 'draft', type: tool, color: toolColor, width: strokeWidth, fill: null, rect: rectFromPoints(drawing.start, drawing.current) }}
              frame={frame}
              scale={scale}
            />
          )}
          {drawing && (tool === 'line' || tool === 'arrow') && (
            <AnnotationShape a={{ id: 'draft', type: tool, color: toolColor, width: strokeWidth, from: drawing.start, to: drawing.current }} frame={frame} scale={scale} />
          )}
          {drawing && tool === 'ink' && (
            <AnnotationShape a={{ id: 'draft', type: 'ink', color: toolColor, width: strokeWidth, paths: [drawing.points] }} frame={frame} scale={scale} />
          )}
          {tool === 'place' && placing && ghost && (
            <g opacity={0.6} pointerEvents="none">
              <AnnotationShape
                a={{
                  id: 'ghost',
                  type: 'image',
                  kind: placing.kind,
                  color: '#000',
                  assetId: placing.assetId,
                  angle,
                  rect: {
                    x: ghost.x - (angle % 180 ? placing.height : placing.width) / 2,
                    y: ghost.y - (angle % 180 ? placing.width : placing.height) / 2,
                    width: angle % 180 ? placing.height : placing.width,
                    height: angle % 180 ? placing.width : placing.height
                  }
                }}
                frame={frame}
                scale={scale}
              />
            </g>
          )}
        </g>
        {selectionBox && tool === 'select' && (
          <g className="selection-box">
            <rect
              x={selectionBox.x - 3 / scale}
              y={selectionBox.y - 3 / scale}
              width={selectionBox.width + 6 / scale}
              height={selectionBox.height + 6 / scale}
              strokeWidth={1.5 / scale}
              strokeDasharray={`${4 / scale} ${3 / scale}`}
            />
            {isResizable(selectedAnnotation!) && (
              <rect
                className="resize-handle"
                x={selectionBox.x + selectionBox.width - 5 / scale}
                y={selectionBox.y + selectionBox.height - 5 / scale}
                width={10 / scale}
                height={10 / scale}
                strokeWidth={1.5 / scale}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  svg.current!.setPointerCapture(e.pointerId)
                  const a = selectedAnnotation!
                  setGesture({
                    kind: 'resize',
                    annotation: annotations.find((x) => x.id === a.id)!,
                    anchor: fromDisplay({ x: selectionBox.x, y: selectionBox.y }, frame),
                    current: toPage(e.clientX, e.clientY)
                  })
                }}
              />
            )}
          </g>
        )}
      </svg>
      {draftText && (
        <TextEditor
          annotation={draftText}
          frame={frame}
          scale={scale}
          onDone={async (value) => {
            setDraftText(null)
            if (!value.trim()) return
            const s = useApp.getState()
            s.addAnnotation(page.id, await rasterizeText(draftText, value), true)
            s.setTool('select')
          }}
        />
      )}
      {editingAnnotation?.type === 'image' && editingAnnotation.kind === 'text' && (
        <TextEditor
          annotation={editingAnnotation}
          frame={frame}
          scale={scale}
          onDone={async (value) => {
            const s = useApp.getState()
            s.setEditing(null)
            if (!value.trim()) s.removeAnnotation(page.id, editingAnnotation.id)
            else if (value !== editingAnnotation.text?.value) s.updateAnnotation(page.id, await rasterizeText(editingAnnotation, value))
          }}
        />
      )}
      {editingAnnotation?.type === 'note' && <NoteEditor pageId={page.id} note={editingAnnotation} frame={frame} scale={scale} />}
    </>
  )
}

function TextEditor(props: { annotation: ImageAnnotation; frame: Frame; scale: number; onDone: (value: string) => void }) {
  const { annotation, frame, scale } = props
  const [value, setValue] = useState(annotation.text?.value ?? '')
  const done = useRef(false)
  const box = rectToDisplay(annotation.rect, frame)
  const upright = uprightSize(annotation)
  const finish = (text: string): void => {
    if (done.current) return
    done.current = true
    props.onDone(text)
  }
  return (
    <textarea
      className="text-editor"
      autoFocus
      dir="auto"
      value={value}
      placeholder="…"
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: upright.width * scale,
        minHeight: Math.max(upright.height, (annotation.text?.fontSize ?? 14) * 1.6) * scale,
        fontSize: (annotation.text?.fontSize ?? 14) * scale,
        color: annotation.color
      }}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') finish(annotation.text?.value ?? '')
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(value)
      }}
    />
  )
}

function NoteEditor(props: { pageId: string; note: Extract<Annotation, { type: 'note' }>; frame: Frame; scale: number }) {
  const { note, frame, scale } = props
  const t = useApp((s) => s.t)
  const [value, setValue] = useState(note.text)
  const at = toDisplay({ x: note.at.x + NOTE_SIZE, y: note.at.y }, frame)
  const close = (): void => {
    const s = useApp.getState()
    s.setEditing(null)
    if (value !== note.text) s.updateAnnotation(props.pageId, { ...note, text: value, date: new Date().toISOString() })
  }
  return (
    <div className="note-editor" style={{ left: at.x * scale + 6, top: at.y * scale }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="note-editor-head">
        <StickyNote size={14} /> {note.author || t('note')}
      </div>
      <textarea
        autoFocus
        dir="auto"
        value={value}
        placeholder={t('notePlaceholder')}
        onChange={(e) => setValue(e.target.value)}
        onBlur={close}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') close()
        }}
      />
    </div>
  )
}
