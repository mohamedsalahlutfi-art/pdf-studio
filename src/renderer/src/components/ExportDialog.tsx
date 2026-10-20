import { FileDown, Minimize2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CompressOptions } from '../lib/compress'
import { formatBytes, savingPercent } from '../lib/compressState'
import type { ImageFormat, RasterOptions } from '../lib/exportImages'
import { useApp, type StringKeyLike } from '../store/useApp'

const PRESETS: { name: string; key: StringKeyLike; hint: StringKeyLike; options: CompressOptions }[] = [
  { name: 'screen', key: 'presetScreen', hint: 'presetScreenHint', options: { maxImagePixels: 1600, imageQuality: 0.6, minSaving: 0.05, stripMetadata: true } },
  { name: 'print', key: 'presetPrint', hint: 'presetPrintHint', options: { maxImagePixels: 2600, imageQuality: 0.82, minSaving: 0.08, stripMetadata: true } },
  { name: 'archive', key: 'presetArchive', hint: 'presetArchiveHint', options: { maxImagePixels: 0, imageQuality: 0.92, minSaving: 0.12, stripMetadata: false } }
]

function CompressPanel() {
  const t = useApp((s) => s.t)
  const { estimateCompression, compressAndSave } = useApp.getState()
  const busy = useApp((s) => s.busy)
  const [preset, setPreset] = useState('screen')
  const [options, setOptions] = useState<CompressOptions>(PRESETS[0].options)
  const [estimate, setEstimate] = useState<{ before: number; after: number; recompressed: number; skipped: number } | null>(null)
  const [estimating, setEstimating] = useState(false)
  const token = useRef(0)

  // Re-estimate (debounced) whenever the options change, cancelling stale runs.
  useEffect(() => {
    const id = ++token.current
    setEstimating(true)
    const timer = setTimeout(async () => {
      const report = await estimateCompression(options)
      if (id !== token.current) return
      setEstimating(false)
      if (report) setEstimate({ before: report.bytesBefore, after: report.bytesAfter, recompressed: report.imagesRecompressed, skipped: report.imagesSkipped })
    }, 250)
    return () => clearTimeout(timer)
  }, [options, estimateCompression])

  const applyPreset = (name: string): void => {
    setPreset(name)
    setOptions(PRESETS.find((p) => p.name === name)!.options)
  }
  const patch = (p: Partial<CompressOptions>): void => {
    setPreset('custom')
    setOptions((o) => ({ ...o, ...p }))
  }

  return (
    <div className="export-panel">
      <div className="preset-list">
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className={`preset${preset === p.name ? ' active' : ''}`} onClick={() => applyPreset(p.name)}>
            <strong>{t(p.key)}</strong>
            <span>{t(p.hint)}</span>
          </button>
        ))}
      </div>

      <label className="field">
        <span>
          {t('quality')} — {Math.round(options.imageQuality * 100)}%
        </span>
        <div className="slider-row">
          <span className="slider-end">{t('smaller')}</span>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(options.imageQuality * 100)}
            onChange={(e) => patch({ imageQuality: Number(e.target.value) / 100 })}
          />
          <span className="slider-end">{t('higher')}</span>
        </div>
      </label>

      <label className="field">
        <span>{t('imageResolution')}</span>
        <select value={options.maxImagePixels} onChange={(e) => patch({ maxImagePixels: Number(e.target.value) })}>
          <option value={0}>{t('keepOriginalRes')}</option>
          {[2600, 2000, 1600, 1200, 1000, 800, 600, 480, 360].map((px) => (
            <option key={px} value={px}>
              {px} px{px <= 600 ? ` — ${t('smallest')}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="check">
        <input type="checkbox" checked={options.stripMetadata} onChange={(e) => patch({ stripMetadata: e.target.checked })} />
        {t('stripMetadata')}
      </label>
      <p className="muted small vectors-note">{t('vectorsAlwaysCrisp')}</p>

      <div className="size-preview">
        <div>
          <span className="muted">{t('originalSize')}</span>
          <strong>{estimate ? formatBytes(estimate.before) : '—'}</strong>
        </div>
        <div className="arrow">➔</div>
        <div>
          <span className="muted">{t('estimatedSize')}</span>
          <strong className="estimate">
            {estimating ? t('estimating') : estimate ? formatBytes(estimate.after) : '—'}
          </strong>
        </div>
        {estimate && !estimating && estimate.before > estimate.after && (
          <div className="saving-badge">-{savingPercent(estimate.before, estimate.after)}%</div>
        )}
      </div>
      {estimate && !estimating && (
        <p className="muted small">
          {estimate.recompressed} {t('imagesRecompressed')} · {estimate.skipped} {t('imagesSkipped')}
        </p>
      )}
      <p className="note-line">{t('compressNote')}</p>

      <div className="modal-actions">
        <button type="button" onClick={() => useApp.getState().openDialog(null)}>
          {t('cancel')}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void compressAndSave(options, true)}>
          {t('compressSaveAs')}
        </button>
        <button type="button" className="primary" disabled={busy !== null} onClick={() => void compressAndSave(options, false)}>
          {t('compressSave')}
        </button>
      </div>
    </div>
  )
}

const FORMATS: ImageFormat[] = ['png', 'webp', 'jpeg', 'tiff']

function ExportImagesPanel() {
  const t = useApp((s) => s.t)
  const busy = useApp((s) => s.busy)
  const hasSelection = useApp((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeId)
    return (tab?.selection.length ?? 0) > 0
  })
  const { exportImages } = useApp.getState()
  const [format, setFormat] = useState<ImageFormat>('png')
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(0.9)
  const [scope, setScope] = useState<'all' | 'current' | 'selection'>('all')

  const options: RasterOptions = { dpi, quality }
  const lossy = format === 'webp' || format === 'jpeg'

  return (
    <div className="export-panel">
      <label className="field">
        <span>{t('exportFormat')}</span>
        <div className="segmented wide">
          {FORMATS.map((f) => (
            <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </label>

      <label className="field">
        <span>{t('imageResolution')} — {dpi} DPI</span>
        <div className="slider-row">
          <input type="range" min={72} max={400} step={1} value={dpi} onChange={(e) => setDpi(Number(e.target.value))} />
        </div>
      </label>

      {lossy && (
        <label className="field">
          <span>
            {t('quality')} — {Math.round(quality * 100)}%
          </span>
          <div className="slider-row">
            <input type="range" min={30} max={100} value={Math.round(quality * 100)} onChange={(e) => setQuality(Number(e.target.value) / 100)} />
          </div>
        </label>
      )}

      <label className="field">
        <span>{t('exportScope')}</span>
        <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="all">{t('scopeAll')}</option>
          <option value="current">{t('scopeCurrent')}</option>
          {hasSelection && <option value="selection">{t('scopeSelection')}</option>}
        </select>
      </label>

      {format === 'tiff' && <p className="muted small">{t('scopeAll')} → TIFF</p>}

      <div className="modal-actions">
        <button type="button" onClick={() => useApp.getState().openDialog(null)}>
          {t('cancel')}
        </button>
        <button type="button" className="primary" disabled={busy !== null} onClick={() => void exportImages(format, options, scope)}>
          {t('exportDo')}
        </button>
      </div>
    </div>
  )
}

export function ExportDialog(): React.JSX.Element {
  const t = useApp((s) => s.t)
  const [tab, setTab] = useState<'compress' | 'images'>('compress')
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && useApp.getState().openDialog(null)}>
      <div className="modal wide export-modal" role="dialog" aria-label={t('exportAndCompress')} onKeyDown={(e) => e.key === 'Escape' && useApp.getState().openDialog(null)}>
        <h2>{t('exportAndCompress')}</h2>
        <div className="segmented">
          <button type="button" aria-pressed={tab === 'compress'} onClick={() => setTab('compress')}>
            <Minimize2 size={15} /> {t('compressTab')}
          </button>
          <button type="button" aria-pressed={tab === 'images'} onClick={() => setTab('images')}>
            <FileDown size={15} /> {t('exportImagesTab')}
          </button>
        </div>
        {tab === 'compress' ? <CompressPanel /> : <ExportImagesPanel />}
      </div>
    </div>
  )
}
