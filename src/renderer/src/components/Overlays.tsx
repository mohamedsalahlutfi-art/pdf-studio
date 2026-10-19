import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../store/useApp'

export function Welcome(): React.JSX.Element {
  const { t, openFilesFromDialog } = useApp.getState()
  useApp((s) => s.language)
  return (
    <div className="welcome">
      <FileText size={56} strokeWidth={1.2} />
      <h1>{t('welcomeTitle')}</h1>
      <p>{t('welcomeHint')}</p>
      <button type="button" className="primary" onClick={() => void openFilesFromDialog()}>
        {t('open')}
      </button>
    </div>
  )
}

export function PasswordDialog(): React.JSX.Element | null {
  const prompt = useApp((s) => s.passwordPrompt)
  const t = useApp((s) => s.t)
  const [value, setValue] = useState('')
  if (!prompt) return null

  const finish = (password: string | null): void => {
    setValue('')
    prompt.resolve(password)
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          finish(value)
        }}
      >
        <h2>{t('passwordTitle')}</h2>
        <p className="muted">{prompt.fileName}</p>
        {prompt.reason === 'incorrect' && <p className="error-text">{t('passwordWrong')}</p>}
        <input
          type="password"
          autoFocus
          placeholder={t('passwordPlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" onClick={() => finish(null)}>
            {t('cancel')}
          </button>
          <button type="submit" className="primary">
            {t('ok')}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Toasts(): React.JSX.Element {
  const toasts = useApp((s) => s.toasts)
  const busy = useApp((s) => s.busy)
  const { t, dismissToast } = useApp.getState()
  return (
    <div className="toasts" aria-live="polite">
      {busy && <div className="toast info">{t(busy)}</div>}
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismissToast(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
