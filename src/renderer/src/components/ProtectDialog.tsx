import { Eye, EyeOff, Lock } from 'lucide-react'
import { useState } from 'react'
import type { EncryptOptions, Permissions } from '../lib/security'
import { useApp } from '../store/useApp'

const DEFAULT_PERMS: Permissions = {
  printing: true,
  highQualityPrinting: true,
  modifying: false,
  copying: false,
  annotating: true,
  fillingForms: true
}

const PERM_KEYS: { key: keyof Permissions; label: Parameters<ReturnType<typeof useApp.getState>['t']>[0] }[] = [
  { key: 'printing', label: 'permPrinting' },
  { key: 'highQualityPrinting', label: 'permHighPrint' },
  { key: 'copying', label: 'permCopying' },
  { key: 'modifying', label: 'permModifying' },
  { key: 'annotating', label: 'permAnnotating' },
  { key: 'fillingForms', label: 'permForms' }
]

function PasswordInput(props: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="password-input">
      <input
        type={show ? 'text' : 'password'}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="new-password"
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button type="button" aria-label="toggle" onClick={() => setShow(!show)}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export function ProtectDialog(): React.JSX.Element {
  const t = useApp((s) => s.t)
  const s = useApp.getState()
  const wasEncrypted = s.openedPermissions() !== null
  const [userPassword, setUserPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [perms, setPerms] = useState<Permissions>(DEFAULT_PERMS)
  const [error, setError] = useState('')
  const busy = useApp((x) => x.busy)
  const close = () => s.openDialog(null)

  const protect = (): void => {
    if (!userPassword && !ownerPassword) {
      setError(t('passwordsDiffer'))
      return
    }
    const options: EncryptOptions = { userPassword, ownerPassword, permissions: perms }
    void s.saveProtected(options)
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide" role="dialog" aria-label={t('protectTitle')} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>
          <Lock size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          {t('protectTitle')}
        </h2>

        <div className="protect-status">
          <span className="muted">{t('currentProtection')}:</span>{' '}
          {wasEncrypted ? t('wasEncrypted') : t('notEncrypted')}
        </div>

        <label className="field">
          <span>{t('openPasswordLabel')}</span>
          <PasswordInput value={userPassword} onChange={setUserPassword} placeholder="••••••" />
          <small className="muted">{t('openPasswordHint')}</small>
        </label>
        <label className="field">
          <span>{t('ownerPasswordLabel')}</span>
          <PasswordInput value={ownerPassword} onChange={setOwnerPassword} placeholder="••••••" />
          <small className="muted">{t('ownerPasswordHint')}</small>
        </label>

        <div className="field">
          <span>{t('permissionsLabel')}</span>
          <div className="perm-grid">
            {PERM_KEYS.map(({ key, label }) => (
              <label key={key} className="check">
                <input type="checkbox" checked={perms[key]} onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))} />
                {t(label)}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        <p className="note-line">{t('encryptionNote')}</p>

        <div className="modal-actions">
          <button type="button" onClick={close}>
            {t('cancel')}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void s.save()}>
            {t('saveUnprotected')}
          </button>
          <button type="button" className="primary" disabled={busy !== null} onClick={protect}>
            {t('saveProtected')}
          </button>
        </div>
      </div>
    </div>
  )
}
