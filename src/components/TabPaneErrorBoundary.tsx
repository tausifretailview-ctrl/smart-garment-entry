import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError, attemptSkewRecoveryReload } from "@/lib/chunkLoadRetry";

type Props = {
  children: ReactNode;
  tabPath: string;
  onRetry: () => void;
};

type State = {
  hasError: boolean;
  error?: Error;
  isRecovering?: boolean;
};

/**
 * Catches lazy-chunk failures inside a single window tab without taking down the whole app.
 */
export class TabPaneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) {
      return { hasError: true, error, isRecovering: true };
    }
    return { hasError: true, error, isRecovering: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[tab:${this.props.tabPath}]`, error, errorInfo);
    if (isChunkLoadError(error)) {
      if (attemptSkewRecoveryReload()) {
        return;
      }
      this.setState({ isRecovering: false });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry();
  };

  private handleReload = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.handleRetry();
  };

  render() {
    if (this.state.isRecovering) {
      return (
        <div className="flex flex-1 h-full min-h-[40vh] w-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Updating…</p>
        </div>
      );
    }

    if (!this.state.hasError) return this.props.children;

    const chunkError = this.state.error && isChunkLoadError(this.state.error);

    return (
      <div className="flex flex-1 h-full min-h-[40vh] w-full items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm font-medium">
            {chunkError ? "This tab failed to load" : "Something went wrong on this tab"}
          </p>
          <p className="text-xs text-muted-foreground">
            {chunkError
              ? "The page module could not be loaded. Try again or refresh the app."
              : "An unexpected error occurred. Try again or refresh the app. Other tabs are unaffected."}
          </p>
          {this.state.error?.message && (
            <p className="text-[11px] text-muted-foreground break-words font-mono">
              {this.state.error.message}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="sm" onClick={this.handleRetry}>
              Retry tab
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Refresh app
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
