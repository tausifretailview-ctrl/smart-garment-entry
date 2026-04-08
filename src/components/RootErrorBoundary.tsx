import React, { Component, ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('EzzyERP crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md text-center space-y-6">
            <p className="text-6xl">😵</p>
            <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground">
              An unexpected error occurred. Your data is safe.
              Please try refreshing the page.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
              <Button variant="outline" onClick={() => this.setState({ hasError: false })}>
                Try Again
              </Button>
              <Button variant="link" onClick={() => {
                const slug = localStorage.getItem("selectedOrgSlug");
                window.location.href = slug ? `/${slug}` : "/";
              }}>
                Go to Dashboard
              </Button>
            </div>
            {this.state.error && (
              <p className="mt-4 text-xs text-muted-foreground break-all">
                Error: {this.state.error.message}
              </p>
            )}
            {import.meta.env.DEV && this.state.error?.stack && (
              <pre className="mt-4 p-4 bg-muted rounded text-xs text-left overflow-auto max-h-48 text-muted-foreground">
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
