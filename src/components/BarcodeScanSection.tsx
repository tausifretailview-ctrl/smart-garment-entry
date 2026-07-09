import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ScanBarcode, Volume2, VolumeX, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Pause, Play, RotateCcw, X, Edit3
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ScanProduct {
  variantId: string;
  id: string;
  name: string;
  department: string;
  brand: string;
  unit: string;
  shop: string;
  softwareStock: number;
  actualStock: number | null;
  scanned: boolean;
  barcode?: string;
  purPrice: number;
  salePrice: number;
  source?: "scanned" | "manual" | "imported" | null;
  scanCount?: number;
  lastScannedAt?: number | null;
}

interface ScanLogEntry {
  timestamp: number;
  barcode: string;
  productId: string | null;
  productName: string | null;
  qtyAdded: number;
  newTotal: number;
  status: "found" | "not_found";
}

interface Props {
  products: ScanProduct[];
  /** Total products with a count in the current settlement session (includes restored scans). */
  totalScannedProducts?: number;
  onProductScanned: (variantId: string, newActual: number, source: "scanned") => void;
  onHighlightRow: (productId: string) => void;
}

function findProductByScan(products: ScanProduct[], raw: string): ScanProduct | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const byBarcode = products.filter(
    (p) => p.barcode && p.barcode.toLowerCase() === trimmed,
  );
  if (byBarcode.length === 1) return byBarcode[0];
  if (byBarcode.length > 1) {
    // Duplicate barcodes in catalog — use the variant that is already being counted, else first match.
    const active = byBarcode.find((p) => p.scanned);
    return active ?? byBarcode[0];
  }
  return products.find((p) => p.id.toLowerCase() === trimmed) ?? null;
}

let audioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
};

const playBeep = (freq: number, dur: number, type: OscillatorType = "sine") => {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    /* ignore */
  }
};

const BarcodeScanSection = ({ products, totalScannedProducts, onProductScanned, onHighlightRow }: Props) => {
  const [scanQty, setScanQty] = useState(1);
  const [scanMode, setScanMode] = useState<"single" | "continuous">("single");
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastScannedVariantId, setLastScannedVariantId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [notFoundList, setNotFoundList] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showNotFound, setShowNotFound] = useState(false);
  const [editQtyProduct, setEditQtyProduct] = useState<string | null>(null);
  const [editQtyVal, setEditQtyVal] = useState("");
  const [inputError, setInputError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sessionScanEvents = scanLog.length;
  const sessionUniqueScanned = useMemo(
    () => new Set(scanLog.filter((l) => l.status === "found").map((l) => l.productId)).size,
    [scanLog],
  );
  const lastScanned = useMemo(() => {
    if (!lastScannedVariantId) return null;
    return products.find((p) => p.variantId === lastScannedVariantId) ?? null;
  }, [products, lastScannedVariantId]);
  const matchedCount = useMemo(
    () => products.filter((p) => p.scanned && p.actualStock === p.softwareStock).length,
    [products],
  );
  const surplusCount = useMemo(
    () => products.filter((p) => p.scanned && p.actualStock !== null && p.actualStock > p.softwareStock).length,
    [products],
  );
  const shortageCount = useMemo(
    () => products.filter((p) => p.scanned && p.actualStock !== null && p.actualStock < p.softwareStock).length,
    [products],
  );

  const handleScan = useCallback(
    (barcode: string) => {
      if (!barcode.trim() || paused) return;
      const trimmed = barcode.trim();

      const p = findProductByScan(products, trimmed);

      if (p) {
        const qty = scanMode === "continuous" ? 1 : scanQty;
        const newActual = (p.actualStock ?? 0) + qty;

        onProductScanned(p.variantId, newActual, "scanned");
        onHighlightRow(p.id);
        setLastScannedVariantId(p.variantId);
        setLastError(null);

        setScanLog((prev) => [
          {
            timestamp: Date.now(),
            barcode: trimmed,
            productId: p.id,
            productName: p.name,
            qtyAdded: qty,
            newTotal: newActual,
            status: "found",
          },
          ...prev.slice(0, 199),
        ]);

        if (soundOn) playBeep(1200, 0.1, "sine");
        if (navigator.vibrate) navigator.vibrate(50);
      } else {
        setLastScannedVariantId(null);
        setLastError(trimmed);
        setNotFoundList((prev) => [trimmed, ...prev.filter((b) => b !== trimmed)]);

        setScanLog((prev) => [
          {
            timestamp: Date.now(),
            barcode: trimmed,
            productId: null,
            productName: null,
            qtyAdded: 0,
            newTotal: 0,
            status: "not_found",
          },
          ...prev.slice(0, 199),
        ]);

        if (soundOn) {
          playBeep(400, 0.15, "square");
          setTimeout(() => playBeep(400, 0.15, "square"), 180);
        }
        if (navigator.vibrate) navigator.vibrate(150);

        setInputError(true);
        setTimeout(() => setInputError(false), 800);
      }

      setBarcodeInput("");
      setTimeout(() => inputRef.current?.focus(), 10);
    },
    [products, scanQty, scanMode, soundOn, paused, onProductScanned, onHighlightRow],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(barcodeInput);
    } else if (e.key === "Escape") {
      setBarcodeInput("");
    }
  };

  const handleClearSession = () => {
    if (!confirm("This will clear all current scan data. Continue?")) return;
    setScanLog([]);
    setNotFoundList([]);
    setLastScannedVariantId(null);
    setLastError(null);
    sessionStart.current = Date.now();
  };

  const handleEditQty = (productId: string, val: string) => {
    const num = parseInt(val);
    if (isNaN(num) || num < 0) return;
    const p = products.find((row) => row.id === productId);
    if (p) {
      onProductScanned(p.variantId, num, "scanned");
      setLastScannedVariantId(p.variantId);
    }
    setEditQtyProduct(null);
  };

  const handleResetProduct = (productId: string) => {
    const p = products.find((row) => row.id === productId);
    if (p) {
      onProductScanned(p.variantId, -1, "scanned");
      if (lastScannedVariantId === p.variantId) {
        setLastScannedVariantId(null);
      }
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", {
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const getDiff = (p: ScanProduct) => {
    if (p.actualStock === null) return null;
    return p.actualStock - p.softwareStock;
  };

  const productsCounted =
    totalScannedProducts ?? products.filter((p) => p.scanned).length;

  const summaryTiles = [
    { label: "Session scans", val: sessionScanEvents, className: "text-teal-700" },
    { label: "Products counted", val: productsCounted, className: "text-slate-800" },
    { label: "Matched", val: matchedCount, className: "text-emerald-700" },
    { label: "Surplus", val: surplusCount, className: "text-amber-700" },
    { label: "Shortage", val: shortageCount, className: "text-red-700" },
    {
      label: "Not Found",
      val: notFoundList.length,
      className: "text-red-700",
      clickable: true,
      onClick: () => setShowNotFound(!showNotFound),
    },
  ];

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <Card className="border-teal-200/60 shadow-sm">
        <CardContent className="p-2.5 sm:p-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-[220px] flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-600" />
              <Input
                ref={inputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={paused ? "Scanning paused..." : "SCAN BARCODE OR TYPE PRODUCT CODE..."}
                disabled={paused}
                autoFocus
                className={cn(
                  "h-12 border-2 pl-11 text-base font-semibold uppercase tracking-wide",
                  inputError ? "border-red-400 focus-visible:ring-red-400" : "border-teal-200 focus-visible:ring-teal-500",
                  paused && "opacity-50",
                )}
              />
            </div>

            <div className="flex flex-col items-center">
              <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Qty</span>
              <Input
                type="number"
                value={scanQty}
                onChange={(e) => setScanQty(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="h-12 w-16 text-center font-mono text-base font-bold tabular-nums"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    inputRef.current?.focus();
                  }
                }}
              />
            </div>

            <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {(["single", "continuous"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScanMode(mode)}
                  className={cn(
                    "px-3 py-2.5 text-xs font-semibold capitalize transition-colors",
                    scanMode === mode ? "bg-teal-100 text-teal-800" : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  {mode === "single" ? "Single" : "Continuous"}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn("h-12 w-12 shrink-0", soundOn && "border-teal-200 text-teal-700")}
              onClick={() => setSoundOn(!soundOn)}
            >
              {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn("h-12 w-12 shrink-0", paused && "border-amber-300 bg-amber-50 text-amber-700")}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0"
              onClick={handleClearSession}
              title="Start New Session"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>

          {paused && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <Pause className="h-3.5 w-3.5" />
              Scanning paused — press Resume to continue
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-h-[64px] border-slate-200/80 shadow-sm">
        <CardContent className="flex min-h-[64px] items-center p-2.5 sm:p-3">
          {!lastScanned && !lastError ? (
            <div className="flex items-center gap-3 text-slate-500">
              <ScanBarcode className="h-7 w-7 opacity-30" />
              <span className="text-base">Scan a barcode to begin counting...</span>
            </div>
          ) : lastError ? (
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <div className="text-sm font-semibold">Product not found</div>
                <code className="mt-0.5 inline-block rounded bg-red-50 px-2 py-0.5 font-mono text-xs">{lastError}</code>
              </div>
            </div>
          ) : lastScanned ? (
            (() => {
              const diff = getDiff(lastScanned);
              const diffClass =
                diff === null
                  ? "text-slate-400"
                  : diff === 0
                    ? "text-emerald-600"
                    : diff > 0
                      ? "text-amber-600"
                      : "text-red-600";
              const diffText = diff === null ? "—" : diff === 0 ? "0" : diff > 0 ? `+${diff}` : `${diff}`;
              return (
                <div className="flex w-full flex-wrap items-center gap-4">
                  <div className="min-w-[200px] flex-1">
                    <div className="text-base font-bold text-slate-900">{lastScanned.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <code className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[12px] text-amber-700">
                        {lastScanned.barcode || lastScanned.id}
                      </code>
                      {lastScanned.brand !== "—" && (
                        <span className="rounded bg-teal-50 px-2 py-0.5 text-[12px] font-medium text-teal-700">
                          {lastScanned.brand}
                        </span>
                      )}
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[12px] text-slate-600">
                        {lastScanned.department}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    {[
                      { label: "Software", val: lastScanned.softwareStock, className: "text-slate-600" },
                      { label: "Actual", val: lastScanned.actualStock ?? "—", className: "text-teal-700" },
                      { label: "Diff", val: diffText, className: diffClass },
                    ].map((col) => (
                      <div key={col.label} className="text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{col.label}</div>
                        <div className={cn("font-mono text-xl font-bold tabular-nums", col.className)}>{col.val}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-1.5">
                    {editQtyProduct === lastScanned.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          type="number"
                          value={editQtyVal}
                          onChange={(e) => setEditQtyVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditQty(lastScanned.id, editQtyVal);
                            if (e.key === "Escape") setEditQtyProduct(null);
                          }}
                          className="h-8 w-16 text-center font-mono text-sm font-bold"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-emerald-600"
                          onClick={() => handleEditQty(lastScanned.id, editQtyVal)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => {
                          setEditQtyProduct(lastScanned.id);
                          setEditQtyVal(String(lastScanned.actualStock ?? 0));
                        }}
                      >
                        <Edit3 className="h-3 w-3" /> Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => handleResetProduct(lastScanned.id)}
                    >
                      <X className="h-3 w-3" /> Reset
                    </Button>
                  </div>
                </div>
              );
            })()
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {summaryTiles.map((s) => (
          <Card
            key={s.label}
            className={cn("border-slate-200/80 shadow-sm", s.clickable && "cursor-pointer hover:bg-slate-50")}
            onClick={s.onClick}
          >
            <CardContent className="px-3 py-2 text-center">
              <div className={cn("font-mono text-xl font-bold tabular-nums", s.className)}>{s.val}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showNotFound && notFoundList.length > 0 && (
        <Card className="border-red-200/60">
          <CardContent className="max-h-[200px] overflow-y-auto p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-red-700">Unknown Barcodes ({notFoundList.length})</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNotFound(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {notFoundList.map((b) => (
                <code key={b} className="rounded bg-red-50 px-2 py-0.5 font-mono text-[11px] text-red-700">
                  {b}
                </code>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scanLog.length > 0 && (
        <div>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-start gap-2 rounded-b-none border-b-0 text-xs font-semibold text-slate-600"
            onClick={() => setShowLog(!showLog)}
          >
            {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Show Scan Log ({scanLog.length} entries)
          </Button>
          {showLog && (
            <Card className="max-h-[300px] overflow-y-auto rounded-t-none border-t-0">
              <CardContent className="p-0">
                {scanLog.slice(0, 50).map((entry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-xs last:border-0"
                  >
                    <span className="min-w-[72px] font-mono text-[10px] text-slate-400">{formatTime(entry.timestamp)}</span>
                    <code className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-700">
                      {entry.barcode}
                    </code>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        entry.status === "found" ? "text-slate-800" : "text-red-600",
                      )}
                    >
                      {entry.productName || "Not found"}
                    </span>
                    {entry.status === "found" && (
                      <>
                        <span className="font-mono font-semibold text-emerald-600">+{entry.qtyAdded}</span>
                        <span className="font-mono text-[11px] text-slate-500">→ {entry.newTotal} pcs</span>
                      </>
                    )}
                    {entry.status === "found" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default BarcodeScanSection;
