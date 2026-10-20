import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown in the fallback; keep it short and translated by the caller. */
  message: string
  reloadLabel: string
}

interface State {
  error: Error | null
}

/**
 * Catches render errors so a failure in one view (a malformed page, an
 * out-of-memory raster) shows a recoverable message instead of a blank window.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error boundary caught:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-fallback" role="alert">
        <h2>{this.props.message}</h2>
        <pre>{this.state.error.message}</pre>
        <button type="button" className="primary" onClick={() => location.reload()}>
          {this.props.reloadLabel}
        </button>
      </div>
    )
  }
}
