import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ScanBarcode, Volume2, VolumeX, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, ArrowUpCircle, ArrowDownCircle,
  Pause, Play, RotateCcw, X, Edit3
} from "lucide-react";

/* ─── Types ─── */
export interface ScanProduct {
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
  onProductScanned: (productIndex: number, newActual: number, source: "scanned") => void;
  onHighlightRow: (productId: string) => void;
}

/* ─── Theme tokens (match parent) ─── */
const C = {
  bgRoot: "#f8fafc", bgCard: "#ffffff", bgInput: "#f1f5f9",
  border: "#e2e8f0", borderHover: "#cbd5e1",
  textPrimary: "#020617", textBody: "#0f172a", textSecondary: "#1e293b",
  textMuted: "#475569", textDim: "#64748b",
  cyan: "#22d3ee", cyanDark: "#0e7490",
  green: "#34d399", greenDark: "#059669",
  yellow: "#fbbf24", red: "#f87171",
};
const font = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

/* ─── Audio helpers ─── */
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
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = type;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.start(now); osc.stop(now + dur);
  } catch {}
};

const BarcodeScanSection = ({ products, onProductScanned, onHighlightRow }: Props) => {
  const [scanQty, setScanQty] = useState(1);
  const [scanMode, setScanMode] = useState<"single" | "continuous">("single");
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastScanned, setLastScanned] = useState<ScanProduct | null>(null);
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

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // F2 global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Session stats
  const totalScans = scanLog.length;
  const uniqueScanned = useMemo(() => new Set(scanLog.filter(l => l.status === "found").map(l => l.productId)).size, [scanLog]);
  const matchedCount = useMemo(() => products.filter(p => p.scanned && p.actualStock === p.softwareStock).length, [products]);
  const surplusCount = useMemo(() => products.filter(p => p.scanned && p.actualStock !== null && p.actualStock > p.softwareStock).length, [products]);
  const shortageCount = useMemo(() => products.filter(p => p.scanned && p.actualStock !== null && p.actualStock < p.softwareStock).length, [products]);

  const handleScan = useCallback((barcode: string) => {
    if (!barcode.trim() || paused) return;
    const trimmed = barcode.trim();

    // Find product by barcode or ID (case-insensitive)
    const idx = products.findIndex(p =>
      (p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()) ||
      p.id.toLowerCase() === trimmed.toLowerCase()
    );

    if (idx >= 0) {
      const p = products[idx];
      const qty = scanMode === "continuous" ? 1 : scanQty;
      const newActual = (p.actualStock ?? 0) + qty;

      onProductScanned(idx, newActual, "scanned");
      onHighlightRow(p.id);

      const updated = { ...p, actualStock: newActual, scanned: true, source: "scanned" as const, scanCount: (p.scanCount || 0) + 1, lastScannedAt: Date.now() };
      setLastScanned(updated);
      setLastError(null);

      setScanLog(prev => [{
        timestamp: Date.now(), barcode: trimmed, productId: p.id,
        productName: p.name, qtyAdded: qty, newTotal: newActual, status: "found",
      }, ...prev.slice(0, 199)]);

      if (soundOn) playBeep(1200, 0.1, "sine");
      if (navigator.vibrate) navigator.vibrate(50);
    } else {
      // Not found
      setLastScanned(null);
      setLastError(trimmed);
      setNotFoundList(prev => [trimmed, ...prev.filter(b => b !== trimmed)]);

      setScanLog(prev => [{
        timestamp: Date.now(), barcode: trimmed, productId: null,
        productName: null, qtyAdded: 0, newTotal: 0, status: "not_found",
      }, ...prev.slice(0, 199)]);

      if (soundOn) { playBeep(400, 0.15, "square"); setTimeout(() => playBeep(400, 0.15, "square"), 180); }
      if (navigator.vibrate) navigator.vibrate(150);

      setInputError(true);
      setTimeout(() => setInputError(false), 800);
    }

    setBarcodeInput("");
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [products, scanQty, scanMode, soundOn, paused, onProductScanned, onHighlightRow]);

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
    setLastScanned(null);
    setLastError(null);
    sessionStart.current = Date.now();
  };

  const handleEditQty = (productId: string, val: string) => {
    const num = parseInt(val);
    if (isNaN(num) || num < 0) return;
    const idx = products.findIndex(p => p.id === productId);
    if (idx >= 0) {
      onProductScanned(idx, num, "scanned");
      setLastScanned(prev => prev && prev.id === productId ? { ...prev, actualStock: num } : prev);
    }
    setEditQtyProduct(null);
  };

  const handleResetProduct = (productId: string) => {
    const idx = products.findIndex(p => p.id === productId);
    if (idx >= 0) {
      onProductScanned(idx, -1, "scanned"); // -1 signals reset
      if (lastScanned?.id === productId) setLastScanned(prev => prev ? { ...prev, actualStock: null, scanned: false } : null);
    }
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const getDiff = (p: ScanProduct) => {
    if (p.actualStock === null) return null;
    return p.actualStock - p.softwareStock;
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* ─── SCAN INPUT CARD ─── */}
      <div style={{
        background: C.bgCard, borderRadius: 14, padding: "18px 22px",
        border: `1px solid ${C.cyan}30`, marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Barcode Input */}
          <div style={{ flex: 1, minWidth: 250, position: "relative" }}>
            <ScanBarcode size={18} color={C.cyan} style={{ position: "absolute", left: 14, top: 14 }} />
            <input
              ref={inputRef}
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={paused ? "Scanning paused..." : "Scan barcode or type product code..."}
              disabled={paused}
              autoFocus
              style={{
                width: "100%", background: C.bgInput,
                border: `2px solid ${inputError ? C.red : C.cyan}40`,
                borderRadius: 12, padding: "14px 16px 14px 44px",
                color: C.textPrimary, fontSize: 16, fontFamily: font, fontWeight: 600,
                outline: "none", transition: "border-color 0.2s",
                opacity: paused ? 0.5 : 1,
              }}
              onFocus={e => { if (!inputError) e.target.style.borderColor = `${C.cyan}80`; }}
              onBlur={e => { if (!inputError) e.target.style.borderColor = `${C.cyan}40`; }}
            />
          </div>

          {/* Qty Input */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Qty</div>
            <input
              type="number"
              value={scanQty}
              onChange={e => setScanQty(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              style={{
                width: 60, textAlign: "center", background: C.bgInput,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontFamily: mono, fontSize: 16, fontWeight: 700, color: C.textPrimary,
                padding: "12px 4px", outline: "none",
              }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); inputRef.current?.focus(); } }}
            />
          </div>

          {/* Scan Mode Toggle */}
          <div style={{
            display: "flex", background: C.bgInput, borderRadius: 10, border: `1px solid ${C.border}`,
            overflow: "hidden",
          }}>
            {(["single", "continuous"] as const).map(mode => (
              <button key={mode} onClick={() => setScanMode(mode)} style={{
                padding: "12px 14px", fontSize: 12, fontFamily: font, fontWeight: 600,
                background: scanMode === mode ? `${C.cyan}20` : "transparent",
                color: scanMode === mode ? C.cyan : C.textDim,
                border: "none", cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {mode === "single" ? "Single" : "Continuous"}
              </button>
            ))}
          </div>

          {/* Sound Toggle */}
          <button onClick={() => setSoundOn(!soundOn)} style={{
            background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "12px", cursor: "pointer", color: soundOn ? C.cyan : C.textDim,
            display: "flex", alignItems: "center",
          }}>
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Pause/Resume */}
          <button onClick={() => setPaused(!paused)} style={{
            background: paused ? `${C.yellow}20` : C.bgInput,
            border: `1px solid ${paused ? C.yellow : C.border}`, borderRadius: 10,
            padding: "12px", cursor: "pointer", color: paused ? C.yellow : C.textDim,
            display: "flex", alignItems: "center",
          }}>
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>

          {/* Clear Session */}
          <button onClick={handleClearSession} style={{
            background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "12px", cursor: "pointer", color: C.textDim,
            display: "flex", alignItems: "center",
          }} title="Start New Session">
            <RotateCcw size={18} />
          </button>
        </div>

        {paused && (
          <div style={{
            marginTop: 10, padding: "8px 14px", borderRadius: 8,
            background: `${C.yellow}15`, color: C.yellow, fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Pause size={14} /> Scanning paused — press Resume to continue
          </div>
        )}
      </div>

      {/* ─── LAST SCANNED CARD ─── */}
      <div style={{
        background: C.bgCard, borderRadius: 14, padding: "16px 22px",
        border: `1px solid ${C.border}`, marginBottom: 12, minHeight: 72,
        transition: "all 0.15s ease",
      }}>
        {!lastScanned && !lastError ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.textDim }}>
            <ScanBarcode size={28} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 14 }}>Scan a barcode to begin counting...</span>
          </div>
        ) : lastError ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.red }}>
            <AlertTriangle size={22} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Product not found</div>
              <code style={{ fontFamily: mono, fontSize: 12, background: `${C.red}15`, padding: "2px 8px", borderRadius: 4 }}>{lastError}</code>
            </div>
          </div>
        ) : lastScanned ? (() => {
          const diff = getDiff(lastScanned);
          const diffColor = diff === null ? C.textDim : diff === 0 ? C.green : diff > 0 ? C.yellow : C.red;
          const diffText = diff === null ? "—" : diff === 0 ? "0" : diff > 0 ? `+${diff}` : `${diff}`;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              {/* Product info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.textPrimary, marginBottom: 4 }}>{lastScanned.name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <code style={{ fontFamily: mono, fontSize: 11, background: `${C.yellow}12`, padding: "2px 6px", borderRadius: 4, color: C.yellow }}>{lastScanned.barcode || lastScanned.id}</code>
                  {lastScanned.brand !== "—" && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: `${C.cyan}12`, color: C.cyan }}>{lastScanned.brand}</span>
                  )}
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: `${C.textDim}15`, color: C.textDim }}>{lastScanned.department}</span>
                </div>
              </div>

              {/* Stock comparison */}
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Software</div>
                  <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.textMuted }}>{lastScanned.softwareStock}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Actual</div>
                  <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.cyan }}>{lastScanned.actualStock ?? "—"}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Diff</div>
                  <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: diffColor }}>{diffText}</div>
                </div>
              </div>

              {/* Quick actions */}
              <div style={{ display: "flex", gap: 6 }}>
                {editQtyProduct === lastScanned.id ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      autoFocus
                      type="number"
                      value={editQtyVal}
                      onChange={e => setEditQtyVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleEditQty(lastScanned.id, editQtyVal);
                        if (e.key === "Escape") setEditQtyProduct(null);
                      }}
                      style={{
                        width: 60, textAlign: "center", background: C.bgInput,
                        border: `1px solid ${C.cyan}`, borderRadius: 6, padding: "4px",
                        fontFamily: mono, fontSize: 14, fontWeight: 700, color: C.textPrimary, outline: "none",
                      }}
                    />
                    <button onClick={() => handleEditQty(lastScanned.id, editQtyVal)} style={{
                      background: `${C.green}20`, border: "none", borderRadius: 6, padding: "6px",
                      cursor: "pointer", color: C.green, display: "flex",
                    }}><CheckCircle2 size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => { setEditQtyProduct(lastScanned.id); setEditQtyVal(String(lastScanned.actualStock ?? 0)); }} style={{
                    background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: "6px 10px", cursor: "pointer", color: C.textMuted,
                    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontFamily: font,
                  }}><Edit3 size={12} /> Edit</button>
                )}
                <button onClick={() => handleResetProduct(lastScanned.id)} style={{
                  background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "6px 10px", cursor: "pointer", color: C.textMuted,
                  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontFamily: font,
                }}><X size={12} /> Reset</button>
              </div>
            </div>
          );
        })() : null}
      </div>

      {/* ─── SCAN SESSION SUMMARY ─── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { label: "Total Scans", val: totalScans, color: C.cyan },
          { label: "Products Counted", val: uniqueScanned, color: C.textPrimary },
          { label: "Matched", val: matchedCount, color: C.green },
          { label: "Surplus", val: surplusCount, color: C.yellow },
          { label: "Shortage", val: shortageCount, color: C.red },
          { label: "Not Found", val: notFoundList.length, color: C.red, clickable: true },
        ].map((s, i) => (
          <div key={i} onClick={s.clickable ? () => setShowNotFound(!showNotFound) : undefined} style={{
            flex: 1, minWidth: 100, background: C.bgCard, borderRadius: 10,
            padding: "10px 14px", border: `1px solid ${C.border}`, textAlign: "center",
            cursor: s.clickable ? "pointer" : "default", position: "relative",
          }}>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Not Found Popover */}
      {showNotFound && notFoundList.length > 0 && (
        <div style={{
          background: C.bgCard, borderRadius: 12, padding: "14px 18px",
          border: `1px solid ${C.red}30`, marginBottom: 12, maxHeight: 200, overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Unknown Barcodes ({notFoundList.length})</span>
            <button onClick={() => setShowNotFound(false)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}><X size={14} /></button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {notFoundList.map((b, i) => (
              <code key={i} style={{ fontFamily: mono, fontSize: 11, background: `${C.red}15`, padding: "3px 8px", borderRadius: 5, color: C.red }}>{b}</code>
            ))}
          </div>
        </div>
      )}

      {/* ─── SCAN LOG (collapsible) ─── */}
      {scanLog.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowLog(!showLog)} style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: showLog ? "10px 10px 0 0" : 10,
            padding: "10px 16px", cursor: "pointer", color: C.textMuted, fontSize: 12,
            fontWeight: 600, fontFamily: font, display: "flex", alignItems: "center", gap: 6, width: "100%",
          }}>
            {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Show Scan Log ({scanLog.length} entries)
          </button>
          {showLog && (
            <div style={{
              background: C.bgCard, borderRadius: "0 0 10px 10px",
              border: `1px solid ${C.border}`, borderTop: "none",
              maxHeight: 300, overflowY: "auto", padding: "8px 0",
            }}>
              {scanLog.slice(0, 50).map((entry, i) => (
                <div key={i} style={{
                  padding: "6px 16px", fontSize: 12, fontFamily: font,
                  display: "flex", alignItems: "center", gap: 10,
                  borderBottom: `1px solid ${C.border}08`,
                  color: C.textBody,
                }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.textDim, minWidth: 80 }}>{formatTime(entry.timestamp)}</span>
                  <code style={{ fontFamily: mono, fontSize: 11, background: `${C.yellow}12`, padding: "1px 6px", borderRadius: 4, color: C.yellow }}>{entry.barcode}</code>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: entry.status === "found" ? C.textBody : C.red }}>
                    {entry.productName || "Not found"}
                  </span>
                  {entry.status === "found" && (
                    <>
                      <span style={{ fontFamily: mono, fontWeight: 600, color: C.green }}>+{entry.qtyAdded}</span>
                      <span style={{ fontFamily: mono, fontSize: 11, color: C.textMuted }}>→ {entry.newTotal} pcs</span>
                    </>
                  )}
                  <span style={{ color: entry.status === "found" ? C.green : C.red }}>
                    {entry.status === "found" ? <CheckCircle2 size={13} /> : <X size={13} />}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BarcodeScanSection;
