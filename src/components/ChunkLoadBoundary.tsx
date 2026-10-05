import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  attemptStaleChunkRecovery,
  didStartChunkReload,
  hardReloadAfterChunkMiss,
  isChunkLoadError,
} from "@/lib/chunkLoadRetry";

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error; isRecovering?: boolean };

/**
 * POS is an Outlet lazy chunk, so a failed POSSales-*.js download used to reach
 * the root crash screen ("Something went wrong" + the chunk URL).
 * Recover onto the current build first. If that file was already retried, stay
 * on this screen instead of taking down the rest of the app.
 */
export class ChunkLoadBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) {
      return { hasError: true, error, isRecovering: true };
    }
    return { hasError: true, error, isRecovering: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[POS] screen failed to load", error, info.componentStack);
    if (!isChunkLoadError(error)) return;
    if (attemptStaleChunkRecovery(error) || didStartChunkReload()) return;
    this.setState({ isRecovering: false });
  }

  render() {
    if (this.state.isRecovering) {
      return (
        <div className="flex flex-1 h-full min-h-[40vh] w-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Opening POS…</p>
        </div>
      );
    }

    if (!this.state.hasError) return this.props.children;

    const chunkError = this.state.error ? isChunkLoadError(this.state.error) : false;

    return (
      <div className="flex flex-1 h-full min-h-[40vh] w-full items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm font-medium">POS could not open</p>
          <p className="text-xs text-muted-foreground">
            {chunkError
              ? "The billing screen did not download. Refresh to load the current POS."
              : "Refresh POS and try again."}
          </p>
          {this.state.error?.message && (
            <p className="text-[11px] text-muted-foreground break-words font-mono">
              {this.state.error.message}
            </p>
          )}
          <Button size="sm" onClick={() => hardReloadAfterChunkMiss()}>
            Refresh POS
          </Button>
        </div>
      </div>
    );
  }
}
