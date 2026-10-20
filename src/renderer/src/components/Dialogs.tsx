import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { LabelRange, LabelStyle } from '../lib/model'
import { pageLabel } from '../lib/pageLabels'
import { chunk, parseRanges, splitBefore } from '../lib/pageOps'
import { useActiveTab, useApp, type Tab } from '../store/useApp'

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

export function Dialogs(): React.JSX.Element | null {
  const dialog = useApp((s) => s.dialog)
  const tab = useActiveTab()
  if (!dialog || !tab) return null
  if (dialog.kind === 'split') return <SplitDialog key={tab.id} tab={tab} />
  return <LabelsDialog key={tab.id} tab={tab} />
}
