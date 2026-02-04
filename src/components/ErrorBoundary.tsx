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

  private handleClearCacheAndRetry = async () => {
    try {
      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      
      // Clear cache storage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
    
    // Force reload from server
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0f172a',
          color: '#f1f5f9'
        }}>
          <div style={{ maxWidth: '400px' }}>
            <div style={{ 
              fontSize: '48px', 
              marginBottom: '16px' 
            }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>
              Something went wrong
            </h1>
            <p style={{ marginBottom: '24px', color: '#94a3b8', fontSize: '14px' }}>
              The application encountered an unexpected error. 
              Please try again or clear the cache.
            </p>
            
            <button 
              onClick={this.handleRetry}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '12px',
                width: '100%'
              }}
            >
              Try Again
            </button>
            
            <button 
              onClick={this.handleClearCacheAndRetry}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '12px',
                width: '100%'
              }}
            >
              Clear Cache & Reload
            </button>
            
            <button 
              onClick={() => window.location.href = '/'}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'transparent',
                color: '#64748b',
                border: 'none',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Go to Home
            </button>
            
            {this.state.error && (
              <p style={{ 
                marginTop: '24px', 
                fontSize: '11px', 
                color: '#475569',
                wordBreak: 'break-word'
              }}>
                Error: {this.state.error.message}
              </p>
            )}
            
            <p style={{ marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
              Recommended: Chrome 80+, Firefox 75+, Edge 80+, Safari 13+
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
