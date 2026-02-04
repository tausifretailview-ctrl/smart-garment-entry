import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Inline styles fallback for when CSS fails to load
const fallbackStyles = {
  container: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  icon: {
    width: '64px',
    height: '64px',
    color: '#fbbf24',
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '8px',
    color: '#f1f5f9',
  },
  message: {
    fontSize: '14px',
    color: '#94a3b8',
    textAlign: 'center' as const,
    marginBottom: '24px',
    maxWidth: '280px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    background: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '12px',
    width: '100%',
    maxWidth: '280px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
  },
  buttonOutline: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    maxWidth: '280px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
  },
  errorText: {
    marginTop: '24px',
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center' as const,
    maxWidth: '280px',
    wordBreak: 'break-word' as const,
  },
};

export class MobileErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("MobileErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleClearCacheAndRetry = async () => {
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

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isOffline = !navigator.onLine;

      // Try to use Tailwind classes first, fall back to inline styles if CSS fails
      try {
        return (
          <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 safe-area-inset">
            {isOffline ? (
              <WifiOff className="h-16 w-16 text-muted-foreground mb-4" />
            ) : (
              <AlertTriangle className="h-16 w-16 text-warning mb-4" />
            )}
            
            <h1 className="text-xl font-semibold mb-2 text-foreground">
              {isOffline ? "You're Offline" : "Oops! Something went wrong"}
            </h1>
            
            <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
              {isOffline 
                ? "Please check your internet connection and try again."
                : "We encountered an unexpected error. Please try again."
              }
            </p>
            
            <Button 
              onClick={this.handleRetry} 
              className="mb-3 w-full max-w-xs h-12 text-base touch-manipulation"
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              Try Again
            </Button>

            <Button 
              variant="outline"
              onClick={this.handleClearCacheAndRetry} 
              className="mb-3 w-full max-w-xs h-12 text-base touch-manipulation"
            >
              Clear Cache & Reload
            </Button>
            
            <Button 
              variant="outline" 
              onClick={this.handleGoHome}
              className="w-full max-w-xs h-12 text-base touch-manipulation"
            >
              <Home className="h-5 w-5 mr-2" />
              Go to Home
            </Button>

            {this.state.error && (
              <p className="text-xs text-muted-foreground mt-6 text-center max-w-xs break-words">
                Error: {this.state.error.message}
              </p>
            )}
          </div>
        );
      } catch {
        // Fallback to inline styles if Tailwind/CSS fails
        return (
          <div style={fallbackStyles.container}>
            <div style={fallbackStyles.icon}>⚠️</div>
            
            <h1 style={fallbackStyles.title}>
              {isOffline ? "You're Offline" : "Something went wrong"}
            </h1>
            
            <p style={fallbackStyles.message}>
              {isOffline 
                ? "Please check your internet connection and try again."
                : "We encountered an unexpected error. Please try again."
              }
            </p>
            
            <button 
              onClick={this.handleRetry}
              style={fallbackStyles.button}
            >
              🔄 Try Again
            </button>

            <button 
              onClick={this.handleClearCacheAndRetry}
              style={fallbackStyles.buttonOutline}
            >
              Clear Cache & Reload
            </button>
            
            <button 
              onClick={this.handleGoHome}
              style={fallbackStyles.buttonOutline}
            >
              🏠 Go to Home
            </button>

            {this.state.error && (
              <p style={fallbackStyles.errorText}>
                Error: {this.state.error.message}
              </p>
            )}
          </div>
        );
      }
    }

    return this.props.children;
  }
}
