import { useRef, useState } from 'react'
import { cropAsset, getAsset } from '../lib/assets'
import { uprightSize } from '../lib/geometry'
import type { ImageAnnotation } from '../lib/model'
import { useActiveTab, useApp, type AnnotationRef } from '../store/useApp'

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-label={props.title} onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

function findAnnotation(ref: AnnotationRef) {
  const s = useApp.getState()
  const tab = s.tabs.find((t) => t.id === s.activeId)
  return tab?.history.present.pages.find((p) => p.id === ref.pageId)?.annotations?.find((a) => a.id === ref.id)
}

/** Copy a stamp/annotation onto other pages: all, even, odd, or a range. */
function ApplyPagesDialog({ ref }: { ref: AnnotationRef }) {
  const t = useApp((s) => s.t)
  const tab = useActiveTab()
  const { applyAnnotationToPages, openDialog } = useApp.getState()
  const total = tab?.history.present.pages.length ?? 1
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(total)
  const close = () => openDialog(null)
  const apply = (scope: Parameters<typeof applyAnnotationToPages>[2]) => {
    applyAnnotationToPages(ref.pageId, ref.id, scope)
    close()
  }
  return (
    <Modal title={t('applyPagesTitle')} onClose={close}>
      <div className="apply-grid">
        <button type="button" onClick={() => apply('all')}>
          {t('applyAllPages')}
        </button>
        <button type="button" onClick={() => apply('even')}>
          {t('applyEven')}
        </button>
        <button type="button" onClick={() => apply('odd')}>
          {t('applyOdd')}
        </button>
      </div>
      <div className="range-row">
        <label>
          {t('fromPage')}
          <input type="number" min={1} max={total} value={from} onChange={(e) => setFrom(Math.min(total, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <label>
          {t('toPage')}
          <input type="number" min={1} max={total} value={to} onChange={(e) => setTo(Math.min(total, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <div className="modal-actions">
        <button type="button" onClick={close}>
          {t('cancel')}
        </button>
        <button type="button" className="primary" onClick={() => apply({ from: Math.min(from, to), to: Math.max(from, to) })}>
          {t('applyRange')}
        </button>
      </div>
    </Modal>
  )
}

/** Crop a stamp/image annotation by dragging a rectangle over its preview. */
function CropDialog({ ref }: { ref: AnnotationRef }) {
  const t = useApp((s) => s.t)
  const { updateAnnotation, openDialog } = useApp.getState()
  const annotation = findAnnotation(ref) as ImageAnnotation | undefined
  const asset = annotation ? getAsset(annotation.assetId) : undefined
  const box = useRef<HTMLDivElement>(null)
  // Crop rectangle in 0..1 fractions of the image.
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const close = () => openDialog(null)
  if (!annotation || !asset) return null

  const frac = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)) }
  }

  const confirm = async (): Promise<void> => {
    const cropped = await cropAsset(annotation.assetId, rect)
    if (!cropped) return close()
    // Keep the on-page height stable; adjust width to the new aspect ratio.
    const upright = uprightSize(annotation)
    const newUprightW = (cropped.width / cropped.height) * upright.height
    const quarter = annotation.angle % 180 !== 0
    const newRect = quarter
      ? { ...annotation.rect, height: newUprightW }
      : { ...annotation.rect, width: newUprightW }
    updateAnnotation(ref.pageId, { ...annotation, assetId: cropped.id, rect: newRect })
    close()
  }

  return (
    <Modal title={t('cropTitle')} onClose={close}>
      <p className="muted">{t('cropHint')}</p>
      <div
        ref={box}
        className="crop-area"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = frac(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const p = frac(e.clientX, e.clientY)
          const x = Math.min(drag.current.x, p.x)
          const y = Math.min(drag.current.y, p.y)
          setRect({ x, y, w: Math.abs(p.x - drag.current.x), h: Math.abs(p.y - drag.current.y) })
        }}
        onPointerUp={() => {
          if (rect.w < 0.02 || rect.h < 0.02) setRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
          drag.current = null
        }}
      >
        <img src={asset.url} alt="" draggable={false} />
        <div className="crop-dim" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.y * 100}%, ${(rect.x + rect.w) * 100}% ${rect.y * 100}%, ${(rect.x + rect.w) * 100}% ${(rect.y + rect.h) * 100}%, ${rect.x * 100}% ${(rect.y + rect.h) * 100}%, ${rect.x * 100}% ${rect.y * 100}%, 0 ${rect.y * 100}%)` }} />
        <div className="crop-rect" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
      </div>
      <div className="modal-actions">
        <button type="button" onClick={close}>
          {t('cancel')}
        </button>
        <button type="button" className="primary" onClick={() => void confirm()}>
          {t('crop')}
        </button>
      </div>
    </Modal>
  )
}

export function ImageDialogs(): React.JSX.Element | null {
  const dialog = useApp((s) => s.dialog)
  if (dialog?.kind === 'applyPages') return <ApplyPagesDialog ref={dialog.ref} />
  if (dialog?.kind === 'crop') return <CropDialog ref={dialog.ref} />
  return null
}
