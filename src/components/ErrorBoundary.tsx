import { Component, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { logError } from '../lib/logger'
import { Button } from './Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Top-level error boundary. Catches uncaught render errors in the React tree
 * and renders a friendly recovery UI instead of a blank white page.
 *
 * Logs the error via `logError` so it shows up in the console (and, once a
 * remote logger like Sentry is added, in the dashboard).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }): void {
    logError('ErrorBoundary', error)
    if (errorInfo.componentStack) {
      // eslint-disable-next-line no-console
      console.error('Component stack:', errorInfo.componentStack)
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-dark p-4">
        <div className="bg-bg-card rounded-lg p-6 md:p-8 max-w-md w-full shadow-card text-center border border-text-muted/10">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
          <h1 className="text-xl md:text-2xl font-semibold text-text-primary mb-2">
            Something went wrong
          </h1>
          <p className="text-text-muted text-sm md:text-base mb-6 leading-relaxed">
            An unexpected error broke this page. Reloading usually fixes it. If the problem keeps happening, please report it on GitHub.
          </p>
          <Button onClick={this.handleReload} variant="primary" fullWidth>
            Reload page
          </Button>
        </div>
      </div>
    )
  }
}
