import { useEffect, useRef, useState, useCallback } from "react";
import { X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CameraScannerProps {
  onResult: (code: string) => void;
  onClose: () => void;
}

export function CameraScanner({ onResult, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [torch, setTorch] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animRef = useRef<number>(0);
  const [manualCode, setManualCode] = useState("");

  const stableOnResult = useCallback((code: string) => {
    // Vibrate on successful scan
    if (navigator.vibrate) navigator.vibrate(100);
    onResult(code);
  }, [onResult]);

  useEffect(() => {
    let active = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
        });
        streamRef.current = stream;
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Use BarcodeDetector API (Safari 17+, Chrome)
        if ("BarcodeDetector" in window) {
          const BDet = (window as any).BarcodeDetector;
          const supported = await BDet.getSupportedFormats();
          detectorRef.current = new BDet({ formats: supported });

          const scan = async () => {
            if (!active) return;
            if (!videoRef.current || videoRef.current.readyState < 2) {
              animRef.current = requestAnimationFrame(scan);
              return;
            }
            try {
              const codes = await detectorRef.current.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                stableOnResult(codes[0].rawValue);
                return;
              }
            } catch { /* ignore detection errors */ }
            animRef.current = requestAnimationFrame(scan);
          };
          scan();
        } else {
          setError("Camera scanning not supported on this browser. Use Safari 17+ or Chrome on iPad.");
        }
      } catch (err: any) {
        setError(
          err.message?.includes("Permission")
            ? "Camera permission denied. Allow camera access in Settings → Safari → Camera."
            : "Camera error: " + err.message
        );
      }
    };

    start();
    return () => {
      active = false;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stableOnResult]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch { /* torch not supported */ }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <span className="font-semibold text-lg">Scan Barcode</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTorch}
            className="text-white hover:bg-white/20"
          >
            <Zap className="h-4 w-4 mr-1" />
            {torch ? "Flash Off" : "Flash On"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Scanning overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-72 h-40 border-2 border-white/60 rounded-lg relative">
            {/* Corner markers */}
            {[
              "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
              "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
              "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
              "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg",
            ].map((pos, i) => (
              <div
                key={i}
                className={`absolute w-8 h-8 border-green-400 ${pos}`}
              />
            ))}
            {/* Scan line animation */}
            <div className="absolute left-2 right-2 h-0.5 bg-red-500/80 animate-pulse top-1/2" />
          </div>
          <p className="text-white/80 text-sm mt-4">
            Point camera at barcode
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="bg-card rounded-xl p-6 mx-6 max-w-sm text-center">
              <p className="font-semibold text-lg text-foreground">Camera Error</p>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
              <Button className="mt-4" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Manual entry fallback */}
      <div className="p-4 bg-black/80 flex gap-2">
        <Input
          className="flex-1 bg-white/10 text-white border-white/20 placeholder:text-white/40 no-uppercase"
          placeholder="Or type barcode manually..."
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          inputMode="text"
          autoCorrect="off"
          autoCapitalize="off"
          enterKeyHint="go"
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.keyCode === 13) && manualCode.trim()) {
              stableOnResult(manualCode.trim());
            }
          }}
        />
        <Button
          onClick={() => {
            if (manualCode.trim()) stableOnResult(manualCode.trim());
          }}
          className="px-6"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
