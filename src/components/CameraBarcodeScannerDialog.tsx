import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, SwitchCamera, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CameraBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBarcodeScanned: (barcode: string) => void;
}

export function CameraBarcodeScannerDialog({
  open,
  onOpenChange,
  onBarcodeScanned,
}: CameraBarcodeScannerDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = scanning, State 3 = paused
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        // ignore
      }
      try {
        await scannerRef.current.clear();
      } catch (e) {
        // ignore
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!open || !containerRef.current) return;

    setLoading(true);
    setError(null);
    hasScannedRef.current = false;

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      // Clean up previous instance
      await stopScanner();

      const scannerId = "camera-barcode-scanner";
      
      // Ensure container element exists
      let el = document.getElementById(scannerId);
      if (!el && containerRef.current) {
        el = document.createElement("div");
        el.id = scannerId;
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(el);
      }

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ]
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.5,
          disableFlip: false,
        },
        (decodedText) => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;

          // Vibrate for feedback
          if (navigator.vibrate) navigator.vibrate(100);

          toast.success(`Scanned: ${decodedText}`);
          onBarcodeScanned(decodedText);
          onOpenChange(false);
        },
        () => {
          // scan failure - ignore, keep scanning
        }
      );

      setLoading(false);
    } catch (err: any) {
      console.error("Camera scanner error:", err);
      setLoading(false);

      if (err?.message?.includes("Permission") || err?.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (err?.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError(err?.message || "Failed to start camera scanner.");
      }
    }
  }, [open, onBarcodeScanned, onOpenChange, stopScanner]);

  useEffect(() => {
    if (open) {
      // Small delay to let dialog render
      const timer = setTimeout(startScanner, 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [open, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[95vw] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-5 w-5" />
            Scan Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full" style={{ minHeight: "280px" }}>
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Starting camera...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted z-10 p-4 text-center">
              <Camera className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive font-medium">{error}</p>
              <Button size="sm" variant="outline" onClick={startScanner}>
                Retry
              </Button>
            </div>
          )}

          <div ref={containerRef} className="w-full" />
        </div>

        <div className="p-4 pt-2 text-center">
          <p className="text-xs text-muted-foreground">
            Point camera at product barcode. Scanning will happen automatically.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small camera button to trigger the scanner dialog */
export function CameraScanButton({
  onBarcodeScanned,
  className,
  size = "icon",
}: {
  onBarcodeScanned: (barcode: string) => void;
  className?: string;
  size?: "icon" | "sm" | "default";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        title="Scan with camera"
      >
        <Camera className="h-4 w-4" />
        {size !== "icon" && <span className="ml-1">Scan</span>}
      </Button>
      <CameraBarcodeScannerDialog
        open={open}
        onOpenChange={setOpen}
        onBarcodeScanned={onBarcodeScanned}
      />
    </>
  );
}
