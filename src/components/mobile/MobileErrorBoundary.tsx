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

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isOffline = !navigator.onLine;

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
    }

    return this.props.children;
  }
}
