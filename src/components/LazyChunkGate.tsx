import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { reloadAppWithUpdateCheck } from "@/lib/appReload";
import { isChunkLoadError, lazyWithRetry } from "@/lib/chunkLoadRetry";

/** Show Retry before importWithRetry's 60s module timeout (deploy-skew / hung import). */
export const LAZY_CHUNK_UI_TIMEOUT_MS = 20_000;

export type LazyChunkGateVariant = "dialog" | "inline" | "corner";

type LazyChunkGateProps<P extends object> = {
  loader: () => Promise<{ default: ComponentType<P> }>;
  componentProps: P;
  title: string;
  loadingMessage: string;
  errorTitle?: string;
  errorDescription?: string;
  variant?: LazyChunkGateVariant;
  onDismiss?: () => void;
  /** Override for tests; production uses {@link LAZY_CHUNK_UI_TIMEOUT_MS}. */
  timeoutMs?: number;
};

type BoundaryProps = {
  children: ReactNode;
  title: string;
  errorTitle: string;
  errorDescription: string;
  variant: LazyChunkGateVariant;
  onDismiss?: () => void;
  onRetry: () => void;
};

type BoundaryState = { hasError: boolean; error?: Error };

function LoadingBody({ message }: { message: string }) {
  return (
    <div
      data-lazy-chunk-loading
      data-invoice-loading
      className="flex flex-col items-center gap-3 py-8 px-4"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground text-center">{message}</p>
    </div>
  );
}

function ErrorBody({
  title,
  description,
  error,
  onRetry,
  onDismiss,
}: {
  title: string;
  description: string;
  error?: Error;
  onRetry: () => void;
  onDismiss?: () => void;
}) {
  const chunkError = error ? isChunkLoadError(error) : true;
  return (
    <div data-lazy-chunk-error className="space-y-4 py-2 px-1">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
          {error?.message && (
            <p className="text-[11px] text-muted-foreground break-words font-mono">{error.message}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onDismiss && (
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            Close
          </Button>
        )}
        <Button type="button" size="sm" onClick={onRetry}>
          Retry
        </Button>
        {chunkError && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              void reloadAppWithUpdateCheck();
            }}
          >
            Refresh app
          </Button>
        )}
      </div>
    </div>
  );
}

function DialogChrome({
  title,
  description,
  onDismiss,
  children,
}: {
  title: string;
  description: string;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CornerChrome({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-background shadow-lg p-3">
      {children}
    </div>
  );
}

function wrapVariant(
  variant: LazyChunkGateVariant,
  title: string,
  description: string,
  onDismiss: (() => void) | undefined,
  inner: ReactNode,
): ReactNode {
  if (variant === "dialog") {
    return (
      <DialogChrome title={title} description={description} onDismiss={onDismiss}>
        {inner}
      </DialogChrome>
    );
  }
  if (variant === "corner") {
    return <CornerChrome>{inner}</CornerChrome>;
  }
  return inner;
}

class LazyChunkErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[LazyChunkGate]", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { title, errorTitle, errorDescription, variant, onDismiss } = this.props;
    const body = (
      <ErrorBody
        title={errorTitle}
        description={errorDescription}
        error={this.state.error}
        onRetry={this.handleRetry}
        onDismiss={onDismiss}
      />
    );
    return wrapVariant(variant, title, errorDescription, onDismiss, body);
  }
}

/**
 * Isolated Suspense + error boundary for a dynamically imported widget.
 * Recreates the React.lazy factory on Retry — React caches a rejected lazy payload,
 * so remounting the same lazy() instance cannot recover a stale hashed chunk.
 */
export function LazyChunkGate<P extends object>({
  loader,
  componentProps,
  title,
  loadingMessage,
  errorTitle,
  errorDescription,
  variant = "dialog",
  onDismiss,
  timeoutMs = LAZY_CHUNK_UI_TIMEOUT_MS,
}: LazyChunkGateProps<P>) {
  const [loadKey, setLoadKey] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [ready, setReady] = useState(false);

  const resolvedErrorTitle = errorTitle ?? `Could not load ${title}`;
  const resolvedErrorDescription =
    errorDescription ??
    "This can happen on a slow network or after an app update. Retry to download again, or refresh the app.";

  const LazyComp = useMemo(
    () =>
      lazyWithRetry(() => loader() as Promise<{ default: ComponentType<unknown> }>) as unknown as ComponentType<P>,
    // loader is a stable module-level function; loadKey forces a new lazy() after failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadKey],
  );

  const handleRetry = useCallback(() => {
    setTimedOut(false);
    setReady(false);
    setLoadKey((k) => k + 1);
  }, []);

  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    setTimedOut(false);
    setReady(false);
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [loadKey, timeoutMs]);

  const loading = wrapVariant(
    variant,
    title,
    loadingMessage,
    onDismiss,
    <LoadingBody message={loadingMessage} />,
  );

  // Keep the in-flight import mounted after the UI timeout. Unmounting Suspense
  // aborted a late chunk (deploy skew / slow PWA) and left "Could not open…"
  // even when the module arrived a moment later.
  const timedOutWaiting = timedOut && !ready;
  const timeoutOverlay = timedOutWaiting
    ? wrapVariant(
        variant,
        title,
        resolvedErrorDescription,
        onDismiss,
        <ErrorBody
          title={resolvedErrorTitle}
          description={resolvedErrorDescription}
          onRetry={handleRetry}
          onDismiss={onDismiss}
        />,
      )
    : null;

  return (
    <>
      {timeoutOverlay}
      <LazyChunkErrorBoundary
        title={title}
        errorTitle={resolvedErrorTitle}
        errorDescription={resolvedErrorDescription}
        variant={variant}
        onDismiss={onDismiss}
        onRetry={handleRetry}
      >
        <Suspense fallback={timedOutWaiting ? null : loading}>
          <LazyChunkReady key={loadKey} onReady={markReady}>
            <LazyComp {...componentProps} />
          </LazyChunkReady>
        </Suspense>
      </LazyChunkErrorBoundary>
    </>
  );
}

function LazyChunkReady({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useLayoutEffect(() => {
    onReady();
  }, [onReady]);
  return <>{children}</>;
}
