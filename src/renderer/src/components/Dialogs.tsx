import { Eraser, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { assetFromDataUrl } from '../lib/assets'
import type { LabelRange, LabelStyle } from '../lib/model'
import { pageLabel } from '../lib/pageLabels'
import { chunk, parseRanges, splitBefore } from '../lib/pageOps'
import * as platform from '../lib/platform'
import { drawTypedSignature, removeWhiteBackground, trimCanvas } from '../lib/render'
import { useActiveTab, useApp, type Tab } from '../store/useApp'
import { ExportDialog } from './ExportDialog'
import { ImageDialogs } from './ImageDialogs'

function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        className={`modal${props.wide ? ' wide' : ''}`}
        role="dialog"
        aria-label={props.title}
        onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
      >
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

function SplitDialog({ tab }: { tab: Tab }) {
  const t = useApp((s) => s.t)
  const { split, openDialog } = useApp.getState()
  const pages = tab.history.present.pages
  const selectedIndices = pages.flatMap((p, i) => (tab.selection.includes(p.id) ? [i] : []))
  const [mode, setMode] = useState<'every' | 'ranges' | 'selection'>(selectedIndices.length ? 'selection' : 'every')
  const [every, setEvery] = useState(1)
  const [ranges, setRanges] = useState('')

  const groups = useMemo(() => {
    if (mode === 'every') return every >= 1 ? chunk(pages.length, every) : null
    if (mode === 'ranges') return parseRanges(ranges, pages.length)
    return selectedIndices.length ? splitBefore(pages.length, selectedIndices) : null
  }, [mode, every, ranges, pages.length, selectedIndices])

  const close = (): void => openDialog(null)
  return (
    <Modal title={t('splitTitle')} onClose={close}>
      <label className="option">
        <input type="radio" checked={mode === 'every'} onChange={() => setMode('every')} />
        {t('splitEvery')}
        <input
          type="number"
          min={1}
          max={pages.length}
          value={every}
          onFocus={() => setMode('every')}
          onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
          className="small-input"
        />
        {t('splitEveryUnit')}
      </label>
      <label className="option">
        <input type="radio" checked={mode === 'ranges'} onChange={() => setMode('ranges')} />
        {t('splitRanges')}
        <input
          dir="ltr"
          placeholder={t('splitRangesHint')}
          value={ranges}
          onFocus={() => setMode('ranges')}
          onChange={(e) => setRanges(e.target.value)}
        />
      </label>
      <label className={`option${selectedIndices.length ? '' : ' disabled'}`}>
        <input
          type="radio"
          checked={mode === 'selection'}
          disabled={!selectedIndices.length}
          onChange={() => setMode('selection')}
        />
        {t('splitSelection')} ({selectedIndices.length})
      </label>
      <p className={groups ? 'muted' : 'error-text'}>
        {groups ? `${t('partsPreview')} ${groups.length}` : t('splitInvalid')}
      </p>
      <div className="modal-actions">
        <button type="button" onClick={close}>
          {t('cancel')}
        </button>
        <button type="button" disabled={!groups} onClick={() => groups && void split({ groups, output: 'tabs' })}>
          {t('splitToTabs')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={!groups}
          onClick={() => groups && void split({ groups, output: 'downloads' })}
        >
          {t('splitToDownloads')}
        </button>
      </div>
    </Modal>
  )
}

const STYLES: { value: LabelStyle; key: Parameters<ReturnType<typeof useApp.getState>['t']>[0] }[] = [
  { value: 'D', key: 'styleDecimal' },
  { value: 'r', key: 'styleRomanLower' },
  { value: 'R', key: 'styleRomanUpper' },
  { value: 'a', key: 'styleLettersLower' },
  { value: 'A', key: 'styleLettersUpper' },
  { value: 'none', key: 'styleNone' }
]

function LabelsDialog({ tab }: { tab: Tab }) {
  const t = useApp((s) => s.t)
  const { setLabels, openDialog } = useApp.getState()
  const count = tab.history.present.pages.length
  const [ranges, setRanges] = useState<LabelRange[]>(
    tab.history.present.labels ?? [{ startIndex: 0, style: 'D', prefix: '', start: 1 }]
  )
  const update = (i: number, patch: Partial<LabelRange>): void =>
    setRanges((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const preview = Array.from({ length: Math.min(count, 12) }, (_, i) => pageLabel(i, [...ranges].sort((a, b) => a.startIndex - b.startIndex)))
  const close = (): void => openDialog(null)

  return (
    <Modal title={t('labelsTitle')} onClose={close} wide>
      <p className="muted">{t('labelsHint')}</p>
      <table className="labels-table">
        <thead>
          <tr>
            <th>{t('labelFrom')}</th>
            <th>{t('labelStyle')}</th>
            <th>{t('labelPrefix')}</th>
            <th>{t('labelStart')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranges.map((range, i) => (
            <tr key={i}>
              <td>
                <input
                  type="number"
                  min={1}
                  max={count}
                  value={range.startIndex + 1}
                  onChange={(e) => update(i, { startIndex: Math.min(count, Math.max(1, Number(e.target.value) || 1)) - 1 })}
                />
              </td>
              <td>
                <select value={range.style} onChange={(e) => update(i, { style: e.target.value as LabelStyle })}>
                  {STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.key)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input value={range.prefix} onChange={(e) => update(i, { prefix: e.target.value })} />
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  value={range.start}
                  onChange={(e) => update(i, { start: Math.max(1, Number(e.target.value) || 1) })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('remove')}
                  disabled={ranges.length === 1}
                  onClick={() => setRanges((rs) => rs.filter((_, k) => k !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="link-button"
        onClick={() =>
          setRanges((rs) => [...rs, { startIndex: Math.min(count - 1, (rs.at(-1)?.startIndex ?? 0) + 1), style: 'D', prefix: '', start: 1 }])
        }
      >
        <Plus size={16} /> {t('addRange')}
      </button>
      <p className="label-preview" dir="ltr">
        {preview.join(' · ')}
        {count > preview.length ? ' …' : ''}
      </p>
      <div className="modal-actions">
        <button type="button" onClick={() => setLabels(null)}>
          {t('resetLabels')}
        </button>
        <button type="button" onClick={close}>
          {t('cancel')}
        </button>
        <button type="button" className="primary" onClick={() => setLabels(ranges)}>
          {t('apply')}
        </button>
      </div>
    </Modal>
  )
}

const INK_COLORS = ['#111111', '#0d47a1', '#1b5e20']

/** Draw, type or upload a signature; it is saved to the library and placed with the next click. */
function SignatureDialog() {
  const t = useApp((s) => s.t)
  const userName = useApp((s) => s.userName)
  const { openDialog, addToLibrary, startPlacement } = useApp.getState()
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [color, setColor] = useState(INK_COLORS[0])
  const [typed, setTyped] = useState(userName)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const pad = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const close = (): void => openDialog(null)

  useEffect(() => {
    const canvas = pad.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * ratio * 2
    canvas.height = canvas.clientHeight * ratio * 2
  }, [mode])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - box.left) / box.width) * e.currentTarget.width, y: ((e.clientY - box.top) / box.height) * e.currentTarget.height }
  }

  const stroke = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!last.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const p = point(e)
    ctx.strokeStyle = color
    ctx.lineWidth = e.currentTarget.width / 160
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    setHasInk(true)
  }

  const result = (): string | null => {
    if (mode === 'draw') return hasInk && pad.current ? trimCanvas(pad.current, 12).toDataURL('image/png') : null
    if (mode === 'type') return typed.trim() ? drawTypedSignature(typed.trim(), color).toDataURL('image/png') : null
    return uploaded
  }

  const use = async (): Promise<void> => {
    const dataUrl = result()
    if (!dataUrl) return
    addToLibrary('signatures', dataUrl)
    const asset = await assetFromDataUrl(dataUrl)
    close()
    startPlacement({ assetId: asset.id, kind: 'signature', width: 150, height: (asset.height / asset.width) * 150 })
  }

  return (
    <Modal title={t('newSignature')} onClose={close} wide>
      <div className="segmented">
        {(['draw', 'type', 'upload'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(m === 'draw' ? 'signDraw' : m === 'type' ? 'signType' : 'signUpload')}
          </button>
        ))}
      </div>
      {mode !== 'upload' && (
        <div className="ink-colors">
          {INK_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      )}
      {mode === 'draw' && (
        <div className="signature-pad-wrap">
          <canvas
            ref={pad}
            className="signature-pad"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              last.current = point(e)
            }}
            onPointerMove={stroke}
            onPointerUp={() => (last.current = null)}
          />
          <span className="pad-hint">{t('signHere')}</span>
          <button
            type="button"
            className="icon-button pad-clear"
            aria-label={t('clear')}
            onClick={() => {
              const canvas = pad.current!
              canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
              setHasInk(false)
            }}
          >
            <Eraser size={16} />
          </button>
        </div>
      )}
      {mode === 'type' && (
        <>
          <input className="typed-signature-input" dir="auto" value={typed} placeholder={t('yourName')} onChange={(e) => setTyped(e.target.value)} />
          {typed.trim() && <img className="signature-preview" src={drawTypedSignature(typed.trim(), color).toDataURL()} alt="" />}
        </>
      )}
      {mode === 'upload' && (
        <div className="upload-area">
          {uploaded ? <img className="signature-preview" src={uploaded} alt="" /> : <p className="muted">{t('uploadHint')}</p>}
          <button
            type="button"
            onClick={async () => {
              const [file] = (await platform.openDialog()).filter((f) => platform.isImageName(f.name))
              if (file) setUploaded((await removeWhiteBackground(new Blob([file.data as BlobPart]))).toDataURL('image/png'))
            }}
          >
            {t('chooseImage')}
          </button>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" onClick={close}>
          {t('cancel')}
        </button>
        <button type="button" className="primary" onClick={() => void use()}>
          {t('useSignature')}
        </button>
      </div>
    </Modal>
  )
}

export function Dialogs(): React.JSX.Element | null {
  const dialog = useApp((s) => s.dialog)
  const tab = useActiveTab()
  if (!dialog) return null
  if (dialog.kind === 'signature') return <SignatureDialog />
  if (dialog.kind === 'applyPages' || dialog.kind === 'crop') return <ImageDialogs />
  if (!tab) return null
  if (dialog.kind === 'export') return <ExportDialog key={tab.id} />
  if (dialog.kind === 'split') return <SplitDialog key={tab.id} tab={tab} />
  return <LabelsDialog key={tab.id} tab={tab} />
}
