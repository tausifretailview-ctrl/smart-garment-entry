import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'Arial, sans-serif',
          background: '#0f172a',
          color: '#f1f5f9'
        }}>
          <div>
            <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>
              Something went wrong
            </h1>
            <p style={{ marginBottom: '24px', color: '#94a3b8' }}>
              Please try refreshing the page or updating your browser to the latest version.
            </p>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
            <p style={{ marginTop: '24px', fontSize: '12px', color: '#64748b' }}>
              Recommended browsers: Chrome 80+, Firefox 75+, Edge 80+, Safari 13+
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
