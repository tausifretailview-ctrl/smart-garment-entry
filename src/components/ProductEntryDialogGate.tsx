import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isChunkLoadError } from "@/lib/chunkLoadRetry";
import {
  PRODUCT_ENTRY_DIALOG_UI_TIMEOUT_MS,
  beginProductEntryDialogPriorityLoad,
  loadProductEntryDialog,
  resetProductEntryDialogChunk,
} from "@/lib/productEntryDialogLoad";
import type { ComponentProps } from "react";
import type { ProductEntryDialog } from "@/components/ProductEntryDialog";

type ProductEntryDialogProps = ComponentProps<typeof ProductEntryDialog>;

const LazyProductEntryDialog = lazy(() => loadProductEntryDialog());

function ProductDialogLoadingShell({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            Loading product form… please wait.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductDialogLoadTimeoutShell({
  onClose,
  onRetry,
}: {
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">The product form is taking longer than expected.</p>
              <p className="text-muted-foreground text-xs">
                This can happen on first login while the app loads in the background. Retry — your
                purchase bill stays open.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
              <X className="h-4 w-4" />
              Close
            </Button>
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BoundaryProps = {
  children: ReactNode;
  onClose: () => void;
  onRetry: () => void;
};

type BoundaryState = { hasError: boolean; error?: Error };

class ProductEntryDialogErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ProductEntryDialog]", error, errorInfo);
  }

  private handleRetry = () => {
    resetProductEntryDialogChunk();
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const chunkError = this.state.error && isChunkLoadError(this.state.error);

    return (
      <Dialog open onOpenChange={(open) => !open && this.props.onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Could not open Add Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {chunkError
                    ? "The product form failed to download."
                    : "The product form encountered an error."}
                </p>
                <p className="text-muted-foreground text-xs">
                  {chunkError
                    ? "This can happen on slow networks or after an app update. Retry or refresh the app — your purchase bill is still open."
                    : "Your purchase bill is still open. Try again or refresh the app if the problem continues."}
                </p>
                {this.state.error?.message && (
                  <p className="text-[11px] text-muted-foreground break-words font-mono">
                    {this.state.error.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="sm" onClick={this.props.onClose} className="gap-1.5">
                <X className="h-4 w-4" />
                Close
              </Button>
              <Button size="sm" onClick={this.handleRetry}>
                Retry
              </Button>
              {chunkError && (
                <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                  Refresh app
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}

/**
 * Lazy-loads ProductEntryDialog in an isolated error boundary so chunk/runtime
 * failures do not replace the entire Purchase Entry tab with "This tab failed to load".
 */
export function ProductEntryDialogGate(props: ProductEntryDialogProps) {
  const { open, onOpenChange, ...rest } = props;
  const [loadKey, setLoadKey] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleRetry = useCallback(() => {
    resetProductEntryDialogChunk();
    setLoadTimedOut(false);
    setLoadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!open) {
      setLoadTimedOut(false);
      return;
    }

    setLoadTimedOut(false);
    const endPriority = beginProductEntryDialogPriorityLoad();
    let cancelled = false;
    let loadSettled = false;

    loadProductEntryDialog()
      .then(() => {
        if (!cancelled) loadSettled = true;
      })
      .catch(() => {
        if (!cancelled) loadSettled = true;
      });

    const timer = window.setTimeout(() => {
      if (!cancelled && !loadSettled) {
        setLoadTimedOut(true);
      }
    }, PRODUCT_ENTRY_DIALOG_UI_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      endPriority();
    };
  }, [open, loadKey]);

  if (!open) return null;

  if (loadTimedOut) {
    return <ProductDialogLoadTimeoutShell onClose={handleClose} onRetry={handleRetry} />;
  }

  return (
    <ProductEntryDialogErrorBoundary onClose={handleClose} onRetry={handleRetry}>
      <Suspense fallback={<ProductDialogLoadingShell onClose={handleClose} />}>
        <LazyProductEntryDialog key={loadKey} open={open} onOpenChange={onOpenChange} {...rest} />
      </Suspense>
    </ProductEntryDialogErrorBoundary>
  );
}
