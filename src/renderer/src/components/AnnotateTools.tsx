import {
  ArrowUpRight, Circle, Eraser, Highlighter, ImagePlus, Minus, MousePointer2, PenLine, Signature, Square, Stamp,
  StickyNote, Strikethrough, Type, Underline, Upload, X
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { assetFromCanvas, assetFromDataUrl, assetFromFile, type Asset } from '../lib/assets'
import * as platform from '../lib/platform'
import { drawStamp, RASTER_SCALE, removeWhiteBackground, STAMPS, trimCanvas, type StampDefinition } from '../lib/render'
import { useApp, type Placement, type Tool } from '../store/useApp'

const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#212121']
const HIGHLIGHT_COLORS = ['#ffeb3b', '#a5d6a7', '#81d4fa', '#f8bbd0', '#ffcc80']

function ToolToggle(props: { tool: Tool; label: string; icon: ReactNode; shortcut?: string }) {
  const active = useApp((s) => s.tool === props.tool)
  return (
    <button
      type="button"
      className="ribbon-tool"
      aria-pressed={active}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}
      onClick={() => {
        const s = useApp.getState()
        const next = active ? 'select' : props.tool
        s.setTool(next)
        // Highlights use light marker colours; other tools use the ink palette.
        const wantsMarker = next === 'highlight'
        if (wantsMarker !== HIGHLIGHT_COLORS.includes(s.toolColor) && next !== 'select' && next !== 'eraser') {
          s.setPreference('toolColor', wantsMarker ? HIGHLIGHT_COLORS[0] : COLORS[0])
        }
      }}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

const placementFor = (asset: Asset, kind: Placement['kind'], width: number): Placement => ({
  assetId: asset.id,
  kind,
  width,
  height: (asset.height / asset.width) * width
})

function dataUrlOf(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

/** Ready-made, dynamic and custom stamps. */
function StampMenu({ onClose }: { onClose: () => void }) {
  const t = useApp((s) => s.t)
  const userName = useApp((s) => s.userName)
  const dynamic = useApp((s) => s.dynamicStamps)
  const custom = useApp((s) => s.library.stamps)
  const s = useApp.getState()
  const dynamicLine = (): string | null => {
    if (!dynamic) return null
    const now = new Date()
    const date = now.toLocaleDateString('en-GB')
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return [userName, `${date} ${time}`].filter(Boolean).join(' — ')
  }
  const previews = useMemo(
    () => STAMPS.map((stamp) => ({ stamp, url: dataUrlOf(drawStamp(stamp, dynamic ? `${userName || 'Name'} — 01/01/2026 12:00` : null)) })),
    [dynamic, userName]
  )

  const place = async (stamp: StampDefinition): Promise<void> => {
    const canvas = drawStamp(stamp, dynamicLine())
    const asset = await assetFromCanvas(canvas)
    s.startPlacement(placementFor(asset, 'stamp', canvas.width / RASTER_SCALE))
    onClose()
  }

  const placeCustom = async (dataUrl: string): Promise<void> => {
    const asset = await assetFromDataUrl(dataUrl)
    s.startPlacement(placementFor(asset, 'stamp', Math.min(160, asset.width * 0.75)))
    onClose()
  }

  const upload = async (): Promise<void> => {
    const [file] = (await platform.openDialog()).filter((f) => platform.isImageName(f.name))
    if (!file) return
    const canvas = trimCanvas(await removeWhiteBackground(new Blob([file.data as BlobPart])), 4)
    const dataUrl = dataUrlOf(canvas)
    s.addToLibrary('stamps', dataUrl)
    await placeCustom(dataUrl)
  }

  return (
    <div className="popover stamp-menu" onPointerDown={(e) => e.stopPropagation()}>
      <div className="popover-row">
        <label className="check">
          <input type="checkbox" checked={dynamic} onChange={(e) => s.setPreference('dynamicStamps', e.target.checked)} />
          {t('dynamicStamp')}
        </label>
        {dynamic && (
          <input
            className="name-input"
            placeholder={t('yourName')}
            value={userName}
            onChange={(e) => s.setPreference('userName', e.target.value)}
          />
        )}
      </div>
      <div className="stamp-grid">
        {previews.map(({ stamp, url }) => (
          <button key={stamp.id} type="button" className="stamp-option" title={`${stamp.en} / ${stamp.ar}`} onClick={() => void place(stamp)}>
            <img src={url} alt={stamp.en} />
          </button>
        ))}
      </div>
      <div className="popover-heading">{t('customStamps')}</div>
      <div className="stamp-grid">
        {custom.map((url) => (
          <div key={url} className="stamp-option custom">
            <button type="button" onClick={() => void placeCustom(url)}>
              <img src={url} alt="" />
            </button>
            <button type="button" className="remove" aria-label={t('remove')} onClick={() => s.removeFromLibrary('stamps', url)}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="stamp-option upload" onClick={() => void upload()}>
          <Upload size={18} />
          <span>{t('uploadStamp')}</span>
        </button>
      </div>
    </div>
  )
}

/** Saved signatures plus "new signature". */
function SignatureMenu({ onClose }: { onClose: () => void }) {
  const t = useApp((s) => s.t)
  const signatures = useApp((s) => s.library.signatures)
  const s = useApp.getState()
  const place = async (dataUrl: string): Promise<void> => {
    const asset = await assetFromDataUrl(dataUrl)
    s.startPlacement(placementFor(asset, 'signature', 150))
    onClose()
  }
  return (
    <div className="popover signature-menu" onPointerDown={(e) => e.stopPropagation()}>
      {signatures.map((url) => (
        <div key={url} className="stamp-option custom wide">
          <button type="button" onClick={() => void place(url)}>
            <img src={url} alt="" />
          </button>
          <button type="button" className="remove" aria-label={t('remove')} onClick={() => s.removeFromLibrary('signatures', url)}>
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="primary"
        onClick={() => {
          onClose()
          s.openDialog({ kind: 'signature' })
        }}
      >
        {t('newSignature')}
      </button>
    </div>
  )
}

/** A ribbon button with a dropdown that is kept fully inside the window. */
function PopoverButton(props: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current || !layer.current) return setPosition(null)
    const anchor = ref.current.getBoundingClientRect()
    const { width } = layer.current.getBoundingClientRect()
    const rtl = document.documentElement.dir === 'rtl'
    const preferred = rtl ? anchor.right - width : anchor.left
    setPosition({ left: Math.max(8, Math.min(preferred, window.innerWidth - width - 8)), top: anchor.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="ribbon-tool" aria-expanded={open} onClick={() => setOpen(!open)}>
        {props.icon}
        <span>{props.label}</span>
      </button>
      {open && (
        <div ref={layer} className="popover-layer" style={position ?? { visibility: 'hidden', left: 0, top: 0 }}>
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Comment, draw, stamp and sign tools. */
export function AnnotateTools(): React.JSX.Element {
  const t = useApp((s) => s.t)
  const tool = useApp((s) => s.tool)
  const toolColor = useApp((s) => s.toolColor)
  const strokeWidth = useApp((s) => s.strokeWidth)
  const fontSize = useApp((s) => s.fontSize)
  const placing = useApp((s) => s.placing)
  const s = useApp.getState()
  const isMarkup = tool === 'highlight' || tool === 'underline' || tool === 'strikeout'
  const palette = tool === 'highlight' ? HIGHLIGHT_COLORS : COLORS

  const insertImage = async (): Promise<void> => {
    const [file] = (await platform.openDialog()).filter((f) => platform.isImageName(f.name))
    if (!file) return
    const asset = await assetFromFile(file.name, file.data)
    s.startPlacement(placementFor(asset, 'image', Math.min(260, asset.width * 0.75)))
  }

  return (
    <>
      <ToolToggle tool="select" label={t('toolSelect')} icon={<MousePointer2 size={18} />} shortcut="Esc" />
      <span className="divider" />
      <ToolToggle tool="highlight" label={t('toolHighlight')} icon={<Highlighter size={18} />} />
      <ToolToggle tool="underline" label={t('toolUnderline')} icon={<Underline size={18} />} />
      <ToolToggle tool="strikeout" label={t('toolStrikeout')} icon={<Strikethrough size={18} />} />
      <span className="divider" />
      <ToolToggle tool="text" label={t('toolText')} icon={<Type size={18} />} />
      <ToolToggle tool="note" label={t('toolNote')} icon={<StickyNote size={18} />} />
      <ToolToggle tool="ink" label={t('toolPen')} icon={<PenLine size={18} />} />
      <ToolToggle tool="rect" label={t('toolRect')} icon={<Square size={18} />} />
      <ToolToggle tool="ellipse" label={t('toolEllipse')} icon={<Circle size={18} />} />
      <ToolToggle tool="arrow" label={t('toolArrow')} icon={<ArrowUpRight size={18} />} />
      <ToolToggle tool="line" label={t('toolLine')} icon={<Minus size={18} />} />
      <ToolToggle tool="eraser" label={t('toolEraser')} icon={<Eraser size={18} />} />
      <span className="divider" />
      <PopoverButton label={t('stamps')} icon={<Stamp size={18} />}>
        {(close) => <StampMenu onClose={close} />}
      </PopoverButton>
      <PopoverButton label={t('signature')} icon={<Signature size={18} />}>
        {(close) => <SignatureMenu onClose={close} />}
      </PopoverButton>
      <button type="button" className="ribbon-tool" onClick={() => void insertImage()}>
        <ImagePlus size={18} />
        <span>{t('insertImage')}</span>
      </button>

      {tool !== 'select' && tool !== 'eraser' && tool !== 'place' && (
        <span className="tool-options">
          {palette.map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              aria-label={color}
              aria-pressed={toolColor === color}
              style={{ background: color }}
              onClick={() => s.setPreference('toolColor', color)}
            />
          ))}
          {(tool === 'ink' || tool === 'rect' || tool === 'ellipse' || tool === 'arrow' || tool === 'line') && (
            <select value={strokeWidth} onChange={(e) => s.setPreference('strokeWidth', Number(e.target.value))} title={t('thickness')}>
              {[1, 2, 3, 5, 8].map((w) => (
                <option key={w} value={w}>
                  {w} pt
                </option>
              ))}
            </select>
          )}
          {tool === 'text' && (
            <select value={fontSize} onChange={(e) => s.setPreference('fontSize', Number(e.target.value))} title={t('fontSize')}>
              {[10, 12, 14, 18, 24, 32, 48].map((size) => (
                <option key={size} value={size}>
                  {size} pt
                </option>
              ))}
            </select>
          )}
          {isMarkup && <span className="hint">{t('markupHint')}</span>}
        </span>
      )}
      {tool === 'place' && placing && <span className="tool-options hint">{t('placeHint')}</span>}
    </>
  )
}
