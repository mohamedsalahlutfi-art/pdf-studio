import { CheckCircle2, FilePlus, Loader2, Lock, Minimize2, Unlock, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { CompressOptions } from '../lib/compress'
import type { EncryptOptions } from '../lib/security'
import { useApp, type BatchItem, type BatchOperation } from '../store/useApp'

const PRESETS: Record<string, CompressOptions> = {
  screen: { maxImagePixels: 1600, imageQuality: 0.6, minSaving: 0.05, stripMetadata: true },
  print: { maxImagePixels: 2600, imageQuality: 0.82, minSaving: 0.08, stripMetadata: true }
}

const DEFAULT_PERMS: EncryptOptions['permissions'] = {
  printing: true,
  highQualityPrinting: true,
  modifying: false,
  copying: false,
  annotating: true,
  fillingForms: true
}

function StatusIcon({ status }: { status: BatchItem['status'] }) {
  if (status === 'done') return <CheckCircle2 size={16} className="ok" />
  if (status === 'error') return <XCircle size={16} className="bad" />
  if (status === 'working') return <Loader2 size={16} className="spin" />
  return <span className="dot-pending" />
}

export function BatchDialog(): React.JSX.Element {
  const t = useApp((s) => s.t)
  const batch = useApp((s) => s.batch)
  const s = useApp.getState()
  const [operation, setOperation] = useState<BatchOperation>('compress')
  const [preset, setPreset] = useState<'screen' | 'print'>('screen')
  const [password, setPassword] = useState('') // open/unlock password
  const close = () => s.openDialog(null)
  const items = batch?.items ?? []
  const running = batch?.running ?? false

  const run = (): void => {
    if (operation === 'compress') void s.runBatch('compress', { compress: PRESETS[preset], password })
    else if (operation === 'protect') void s.runBatch('protect', { encrypt: { userPassword: password, ownerPassword: password, permissions: DEFAULT_PERMS } })
    else void s.runBatch('unlock', { password })
  }

  const OPS: { id: BatchOperation; label: string; icon: React.ReactNode }[] = [
    { id: 'compress', label: t('batchCompress'), icon: <Minimize2 size={15} /> },
    { id: 'protect', label: t('batchProtect'), icon: <Lock size={15} /> },
    { id: 'unlock', label: t('batchUnlock'), icon: <Unlock size={15} /> }
  ]

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !running && close()}>
      <div className="modal wide batch-modal" role="dialog" aria-label={t('batchTitle')} onKeyDown={(e) => e.key === 'Escape' && !running && close()}>
        <h2>{t('batchTitle')}</h2>

        <div className="batch-toolbar">
          <button type="button" onClick={() => void s.addBatchFiles()} disabled={running}>
            <FilePlus size={16} /> {t('batchAddFiles')}
          </button>
          {items.length > 0 && (
            <button type="button" onClick={s.clearBatch} disabled={running}>
              {t('batchClear')}
            </button>
          )}
          <span className="muted">{items.length ? `${items.length}` : ''}</span>
        </div>

        <div className="batch-list">
          {items.length === 0 ? (
            <div className="panel-empty">{t('batchEmpty')}</div>
          ) : (
            items.map((item, i) => (
              <div key={i} className="batch-row">
                <StatusIcon status={item.status} />
                <span className="batch-name">{item.name}</span>
                {item.message && <span className="batch-msg">{item.message}</span>}
                {item.status === 'pending' && !running && (
                  <button type="button" className="batch-remove" aria-label={t('cancel')} onClick={() => s.removeBatchItem(i)}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="batch-options">
          <label className="field">
            <span>{t('batchOperation')}</span>
            <div className="segmented wide">
              {OPS.map((op) => (
                <button key={op.id} type="button" aria-pressed={operation === op.id} disabled={running} onClick={() => setOperation(op.id)}>
                  {op.icon} {op.label}
                </button>
              ))}
            </div>
          </label>

          {operation === 'compress' && (
            <label className="field">
              <span>{t('quality')}</span>
              <select value={preset} onChange={(e) => setPreset(e.target.value as 'screen' | 'print')} disabled={running}>
                <option value="screen">{t('presetScreen')}</option>
                <option value="print">{t('presetPrint')}</option>
              </select>
            </label>
          )}

          <label className="field">
            <span>{operation === 'protect' ? t('openPasswordLabel') : t('batchPasswordFor')}</span>
            <input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} disabled={running} />
          </label>
        </div>

        <p className="note-line">{t('batchNote')}</p>

        <div className="modal-actions">
          <button type="button" onClick={close} disabled={running}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={running || !items.length || (operation === 'protect' && !password)}
            onClick={run}
          >
            {running ? t('batchRunning') : t('batchRun')}
          </button>
        </div>
      </div>
    </div>
  )
}
