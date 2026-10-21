import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X, Bug } from 'lucide-react';
import { sound } from '../utils/sound.js';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorId: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorId: generateErrorId() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    sound.click();
    this.setState({ hasError: false, error: null, errorId: '' });
  };

  handleDismiss = (): void => {
    sound.click();
    this.setState({ hasError: false, error: null, errorId: '' });
  };

  handleCopyError = (): void => {
    sound.click();
    const error = this.state.error;
    if (!error) return;
    const text = `Error ID: ${this.state.errorId}\nMessage: ${error.message}\nStack:\n${error.stack}`;
    navigator.clipboard.writeText(text).then(() => {
      sound.apply();
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary" role="alert">
          <div className="error-content">
            <AlertTriangle size={32} className="error-icon" />
            <h3>Something went wrong</h3>
            <p className="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <p className="error-id">Error ID: <code>{this.state.errorId}</code></p>
            {this.state.error && (
              <details className="error-details">
                <summary>Error details</summary>
                <pre>{this.state.error.stack}</pre>
              </details>
            )}
            <div className="error-actions">
              <button type="button" className="va-btn va-btn-primary" onClick={this.handleRetry}>
                <RefreshCw size={14} /> Try again
              </button>
              <button type="button" className="va-btn va-btn-ghost" onClick={this.handleCopyError}>
                <Bug size={14} /> Copy error
              </button>
              <button type="button" className="va-btn va-btn-ghost" onClick={this.handleDismiss}>
                <X size={14} /> Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;