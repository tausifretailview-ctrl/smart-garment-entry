import { useState, useCallback, useMemo, useRef } from "react";
import {
  Upload, FileSpreadsheet, Check, AlertCircle, X, Loader2,
  ArrowRight, ArrowLeft, FileText, Table2, CheckCircle2,
  ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

/* ─── Theme tokens (match parent) ─── */
const C = {
  bgRoot: "#0b1120",
  bgCard: "#0f172a",
  bgInput: "#111827",
  border: "#1e293b",
  borderHover: "#334155",
  textPrimary: "#f1f5f9",
  textBody: "#e2e8f0",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  cyan: "#22d3ee",
  green: "#34d399",
  greenDark: "#059669",
  yellow: "#fbbf24",
  red: "#f87171",
  purple: "#a78bfa",
  purpleDark: "#7c3aed",
};

const font = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

/* ─── Types ─── */
interface ParsedRow {
  [key: string]: string | number;
}

interface ImportResult {
  totalRows: number;
  matched: number;
  surplus: number;
  shortage: number;
  notFound: number;
  updatedProducts: { barcode: string; qty: number; source: string }[];
}

interface StockImportTabProps {
  products: {
    id: string;
    name: string;
    barcode?: string;
    softwareStock: number;
    actualStock: number | null;
    scanned: boolean;
  }[];
  onApplyImport: (updates: { productId: string; actualQty: number }[]) => void;
}

/* ─── Smart Delimiter Detection ─── */
function detectDelimiter(text: string): string {
  const firstLines = text.split("\n").slice(0, 5).join("\n");
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  for (const ch of Object.keys(counts)) {
    counts[ch] = (firstLines.match(new RegExp(ch === "|" ? "\\|" : ch, "g")) || []).length;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/* ─── Auto Column Mapping ─── */
const BARCODE_KEYWORDS = ["barcode", "bar_code", "sku", "upc", "ean", "code", "item_code", "itemcode", "product_code", "article"];
const QTY_KEYWORDS = ["qty", "quantity", "count", "stock", "actual", "physical", "pcs", "pieces", "nos", "units"];

function autoMapColumns(headers: string[]): { barcodeCol: number; qtyCol: number } {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));
  let barcodeCol = -1;
  let qtyCol = -1;

  for (let i = 0; i < normalized.length; i++) {
    if (barcodeCol === -1 && BARCODE_KEYWORDS.some(k => normalized[i].includes(k))) barcodeCol = i;
    if (qtyCol === -1 && QTY_KEYWORDS.some(k => normalized[i].includes(k))) qtyCol = i;
  }

  // Fallback: if only 1 column, treat as barcode-only
  if (barcodeCol === -1 && headers.length >= 1) barcodeCol = 0;
  if (qtyCol === -1 && headers.length >= 2) qtyCol = 1;

  return { barcodeCol, qtyCol };
}

/* ─── Detect if file has headers ─── */
function hasHeaders(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const firstRow = rows[0];
  // If first row has any cells that look purely numeric, likely no header
  const numericCount = firstRow.filter(c => /^\d+(\.\d+)?$/.test(c.trim())).length;
  return numericCount < firstRow.length / 2;
}

/* ─── Component ─── */
const StockImportTab = ({ products, onApplyImport }: StockImportTabProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [barcodeCol, setBarcodeCol] = useState(-1);
  const [qtyCol, setQtyCol] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isBarcodeOnly = qtyCol === -1;

  /* ── Parse file ── */
  const parseFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError("");
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    setFileType(ext);

    try {
      if (ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (json.length < 1) throw new Error("Empty file");

        const hasH = hasHeaders(json);
        const headers = hasH ? json[0].map(String) : json[0].map((_, i) => `Column ${i + 1}`);
        const dataRows = hasH ? json.slice(1) : json;

        setRawHeaders(headers);
        setRawRows(dataRows.filter(r => r.some(c => String(c).trim())).map(r => r.map(String)));
        const mapping = autoMapColumns(headers);
        setBarcodeCol(mapping.barcodeCol);
        setQtyCol(mapping.qtyCol);
        setStep(2);
      } else if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        const delimiter = detectDelimiter(text);
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) throw new Error("Empty file");

        const parsed = lines.map(l => l.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, "")));
        const hasH = hasHeaders(parsed);
        const headers = hasH ? parsed[0] : parsed[0].map((_, i) => `Column ${i + 1}`);
        const dataRows = hasH ? parsed.slice(1) : parsed;

        setRawHeaders(headers);
        setRawRows(dataRows.filter(r => r.some(c => c.trim())));
        const mapping = autoMapColumns(headers);
        setBarcodeCol(mapping.barcodeCol);
        setQtyCol(mapping.qtyCol);
        setStep(2);
      } else {
        throw new Error("Unsupported file type. Please use .xlsx, .csv, or .txt");
      }
    } catch (e: any) {
      setError(e.message || "Failed to parse file");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  /* ── Preview data with barcode summing ── */
  const previewData = useMemo(() => {
    if (barcodeCol === -1) return [];

    const barcodeMap = new Map<string, number>();
    for (const row of rawRows) {
      const barcode = String(row[barcodeCol] || "").trim();
      if (!barcode) continue;
      const qty = qtyCol >= 0 ? (parseInt(String(row[qtyCol])) || 1) : 1;
      barcodeMap.set(barcode, (barcodeMap.get(barcode) || 0) + qty);
    }

    return Array.from(barcodeMap.entries()).map(([barcode, qty]) => {
      const product = products.find(p => p.barcode === barcode);
      return {
        barcode,
        qty,
        productName: product?.name || "—",
        productId: product?.id || "—",
        softwareQty: product?.softwareStock ?? 0,
        found: !!product,
        diff: product ? qty - product.softwareStock : 0,
      };
    });
  }, [rawRows, barcodeCol, qtyCol, products]);

  const previewStats = useMemo(() => {
    const found = previewData.filter(r => r.found);
    return {
      total: previewData.length,
      matched: found.filter(r => r.diff === 0).length,
      surplus: found.filter(r => r.diff > 0).length,
      shortage: found.filter(r => r.diff < 0).length,
      notFound: previewData.filter(r => !r.found).length,
    };
  }, [previewData]);

  /* ── Apply import ── */
  const handleApply = useCallback(() => {
    const updates: { productId: string; actualQty: number }[] = [];
    for (const row of previewData) {
      if (!row.found) continue;
      const product = products.find(p => p.barcode === row.barcode);
      if (product) updates.push({ productId: product.id, actualQty: row.qty });
    }
    onApplyImport(updates);
    setImportResult({
      totalRows: previewData.length,
      matched: previewStats.matched,
      surplus: previewStats.surplus,
      shortage: previewStats.shortage,
      notFound: previewStats.notFound,
      updatedProducts: previewData.filter(r => r.found).map(r => ({
        barcode: r.barcode, qty: r.qty, source: fileName,
      })),
    });
    setStep(3);
  }, [previewData, previewStats, products, onApplyImport, fileName]);

  /* ── Reset ── */
  const reset = () => {
    setStep(1);
    setFileName("");
    setRawHeaders([]);
    setRawRows([]);
    setBarcodeCol(-1);
    setQtyCol(-1);
    setImportResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ─── RENDER ─── */
  return (
    <div>
      {/* Section Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.textPrimary, fontFamily: font }}>
            Import Stock File
          </h2>
          <p style={{ fontSize: 13, color: C.textDim, margin: 0, fontFamily: font }}>
            Upload CSV, TXT or Excel files with barcode & quantity data
          </p>
        </div>
        {step > 1 && step < 3 && (
          <button onClick={reset} style={{
            background: C.border, border: `1px solid ${C.borderHover}`, borderRadius: 10,
            padding: "8px 16px", color: C.textMuted, fontSize: 13, fontFamily: font, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <X size={14} /> Start Over
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0, marginBottom: 20,
        background: C.bgCard, borderRadius: 12, padding: "12px 20px", border: `1px solid ${C.border}`,
      }}>
        {[
          { num: 1, label: "Upload File" },
          { num: 2, label: "Map & Preview" },
          { num: 3, label: "Results" },
        ].map((s, i) => (
          <div key={s.num} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : undefined }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: step >= s.num ? (step > s.num ? `${C.green}20` : `${C.purple}20`) : `${C.textDim}15`,
              border: `2px solid ${step >= s.num ? (step > s.num ? C.green : C.purple) : C.textDim}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, fontFamily: mono,
              color: step >= s.num ? (step > s.num ? C.green : C.purple) : C.textDim,
            }}>
              {step > s.num ? <Check size={14} /> : s.num}
            </div>
            <span style={{
              fontSize: 12, fontWeight: step === s.num ? 600 : 400, marginLeft: 8,
              color: step === s.num ? C.purple : C.textMuted, fontFamily: font,
            }}>{s.label}</span>
            {i < 2 && (
              <div style={{
                flex: 1, height: 2, marginLeft: 12, marginRight: 12,
                background: step > s.num ? C.green : C.border, borderRadius: 2,
                transition: "background 0.3s",
              }} />
            )}
          </div>
        ))}
      </div>

      {/* ═══ STEP 1: Upload ═══ */}
      {step === 1 && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? C.purple : C.border}`,
              borderRadius: 14, padding: "60px 40px", textAlign: "center",
              background: isDragging ? `${C.purple}08` : C.bgCard,
              cursor: "pointer", transition: "all 0.2s",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleFileInput}
              style={{ display: "none" }}
            />
            {isLoading ? (
              <Loader2 size={40} color={C.purple} className="animate-spin" style={{ margin: "0 auto 16px" }} />
            ) : (
              <div style={{
                width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
                background: `linear-gradient(135deg, ${C.purpleDark}30, ${C.purple}20)`,
                border: `1px solid ${C.purple}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Upload size={28} color={C.purple} />
              </div>
            )}
            <p style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, margin: "0 0 6px", fontFamily: font }}>
              {isLoading ? "Parsing file..." : "Drop your file here or click to browse"}
            </p>
            <p style={{ fontSize: 13, color: C.textDim, margin: 0, fontFamily: font }}>
              Supports <span style={{ color: C.purple, fontWeight: 600 }}>.xlsx</span>,{" "}
              <span style={{ color: C.purple, fontWeight: 600 }}>.csv</span>,{" "}
              <span style={{ color: C.purple, fontWeight: 600 }}>.txt</span> — auto-detects delimiters & headers
            </p>
          </div>

          {/* Supported Format Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
            {[
              { icon: <FileSpreadsheet size={18} />, label: "Excel (.xlsx)", desc: "Standard spreadsheet" },
              { icon: <FileText size={18} />, label: "CSV / Text", desc: "Comma, tab, pipe separated" },
              { icon: <Table2 size={18} />, label: "Barcode-only", desc: "One barcode per line" },
            ].map((f, i) => (
              <div key={i} style={{
                background: C.bgCard, borderRadius: 10, padding: "14px 16px",
                border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ color: C.purple, opacity: 0.7 }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textBody, fontFamily: font }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: C.textDim, fontFamily: font }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div style={{
              marginTop: 14, padding: "12px 16px", borderRadius: 10,
              background: `${C.red}15`, border: `1px solid ${C.red}40`,
              display: "flex", alignItems: "center", gap: 8,
              color: C.red, fontSize: 13, fontFamily: font,
            }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 2: Map & Preview ═══ */}
      {step === 2 && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          {/* File info banner */}
          <div style={{
            background: `${C.purple}10`, border: `1px solid ${C.purple}30`, borderRadius: 10,
            padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, fontFamily: font,
          }}>
            <FileSpreadsheet size={16} color={C.purple} />
            <span style={{ color: C.textBody, fontWeight: 500 }}>{fileName}</span>
            <span style={{ color: C.textDim }}>•</span>
            <span style={{ color: C.textMuted }}>{rawRows.length} rows detected</span>
            <span style={{ color: C.textDim }}>•</span>
            <span style={{ color: C.textMuted }}>{fileType.toUpperCase()}</span>
            {isBarcodeOnly && (
              <>
                <span style={{ color: C.textDim }}>•</span>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                  background: `${C.yellow}18`, color: C.yellow,
                }}>Barcode-only mode (qty=1 each)</span>
              </>
            )}
          </div>

          {/* Column Mapping */}
          <div style={{
            background: C.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 10, fontFamily: font }}>
              Column Mapping
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {/* Barcode Column */}
              <div style={{ minWidth: 180 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.purple, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: font }}>
                  Barcode Column
                </label>
                <select
                  value={barcodeCol}
                  onChange={e => setBarcodeCol(Number(e.target.value))}
                  style={{
                    display: "block", marginTop: 4, width: "100%",
                    background: C.bgInput, border: `1px solid ${C.purple}40`, borderRadius: 8,
                    padding: "8px 10px", color: C.textBody, fontSize: 13, fontFamily: font,
                    outline: "none", cursor: "pointer",
                  }}
                >
                  <option value={-1}>— Not mapped —</option>
                  {rawHeaders.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Qty Column */}
              <div style={{ minWidth: 180 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.purple, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: font }}>
                  Quantity Column
                </label>
                <select
                  value={qtyCol}
                  onChange={e => setQtyCol(Number(e.target.value))}
                  style={{
                    display: "block", marginTop: 4, width: "100%",
                    background: C.bgInput, border: `1px solid ${C.borderHover}`, borderRadius: 8,
                    padding: "8px 10px", color: C.textBody, fontSize: 13, fontFamily: font,
                    outline: "none", cursor: "pointer",
                  }}
                >
                  <option value={-1}>— None (count as 1 each) —</option>
                  {rawHeaders.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview Stats */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14,
          }}>
            {[
              { label: "Total Barcodes", val: previewStats.total, color: C.purple },
              { label: "Will Match", val: previewStats.matched, color: C.green },
              { label: "Will Surplus", val: previewStats.surplus, color: C.yellow },
              { label: "Will Shortage", val: previewStats.shortage, color: C.red },
              { label: "Not Found", val: previewStats.notFound, color: C.textDim },
            ].map((s, i) => (
              <div key={i} style={{
                background: C.bgCard, borderRadius: 10, padding: "12px 14px",
                border: `1px solid ${C.border}`, textAlign: "center",
              }}>
                <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Preview Table */}
          <div style={{
            borderRadius: 12, border: `1px solid ${C.border}`, background: C.bgCard, overflowX: "auto",
            maxHeight: 360, overflowY: "auto", marginBottom: 14,
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: font }}>
              <thead>
                <tr style={{ background: C.bgInput, position: "sticky", top: 0, zIndex: 1 }}>
                  {["Barcode", "Qty", "Product", "Software Qty", "Difference", "Status"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: 0.8, color: C.textDim,
                      borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.slice(0, 100).map((row, idx) => {
                  const diffColor = !row.found ? C.textDim : row.diff === 0 ? C.green : row.diff > 0 ? C.yellow : C.red;
                  return (
                    <tr key={idx} style={{
                      borderBottom: `1px solid ${C.border}10`,
                      animation: `fadeIn 0.3s ease ${Math.min(idx * 0.02, 0.5)}s both`,
                      opacity: row.found ? 1 : 0.5,
                    }}>
                      <td style={{ padding: "8px 14px" }}>
                        <code style={{
                          fontFamily: mono, fontSize: 12, background: C.border,
                          padding: "2px 8px", borderRadius: 5, color: C.purple,
                        }}>{row.barcode}</code>
                      </td>
                      <td style={{ padding: "8px 14px", fontFamily: mono, fontWeight: 700, color: C.textPrimary }}>{row.qty}</td>
                      <td style={{ padding: "8px 14px", fontWeight: 500, color: C.textBody, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.productName}
                      </td>
                      <td style={{ padding: "8px 14px", fontFamily: mono, fontWeight: 600, color: C.textSecondary }}>
                        {row.found ? row.softwareQty : "—"}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        {row.found ? (
                          <span style={{
                            fontFamily: mono, fontSize: 13, fontWeight: 700, borderRadius: 6,
                            padding: "3px 10px", color: diffColor, background: `${diffColor}15`,
                          }}>
                            {row.diff === 0 ? "0" : row.diff > 0 ? `+${row.diff}` : row.diff}
                          </span>
                        ) : <span style={{ color: C.textDim }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        {!row.found ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                            color: C.red, background: `${C.red}18`,
                          }}>
                            <X size={12} /> Not Found
                          </span>
                        ) : row.diff === 0 ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                            color: C.green, background: `${C.green}18`,
                          }}>
                            <CheckCircle2 size={12} /> Match
                          </span>
                        ) : row.diff > 0 ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                            color: C.yellow, background: `${C.yellow}18`,
                          }}>
                            <ArrowUpCircle size={12} /> Surplus
                          </span>
                        ) : (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                            color: C.red, background: `${C.red}18`,
                          }}>
                            <ArrowDownCircle size={12} /> Shortage
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {previewData.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 40, color: C.textDim }}>
                      No barcode data found. Check your column mapping.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {previewData.length > 100 && (
            <p style={{ fontSize: 12, color: C.textDim, textAlign: "center", fontFamily: font }}>
              Showing first 100 of {previewData.length} rows
            </p>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button onClick={reset} style={{
              background: C.border, border: `1px solid ${C.borderHover}`, borderRadius: 10,
              padding: "10px 20px", color: C.textMuted, fontSize: 13, fontFamily: font,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={handleApply}
              disabled={previewData.filter(r => r.found).length === 0}
              style={{
                background: previewData.filter(r => r.found).length === 0
                  ? C.border
                  : `linear-gradient(135deg, ${C.purpleDark}, ${C.purple})`,
                color: previewData.filter(r => r.found).length === 0 ? C.textDim : "#fff",
                fontWeight: 700, fontSize: 14, fontFamily: font,
                border: "none", borderRadius: 10, padding: "10px 24px",
                cursor: previewData.filter(r => r.found).length === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: previewData.filter(r => r.found).length > 0 ? `0 0 20px ${C.purple}30` : "none",
              }}
            >
              Apply Import <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Results ═══ */}
      {step === 3 && importResult && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          {/* Success Banner */}
          <div style={{
            background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 14,
            padding: "28px 32px", textAlign: "center", marginBottom: 20,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px",
              background: `${C.green}20`, border: `2px solid ${C.green}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CheckCircle2 size={28} color={C.green} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.green, margin: "0 0 6px", fontFamily: font }}>
              Import Successful
            </h3>
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0, fontFamily: font }}>
              {importResult.totalRows - importResult.notFound} products updated from <span style={{ color: C.purple, fontWeight: 600 }}>{fileName}</span>
            </p>
          </div>

          {/* Result Stats */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20,
          }}>
            {[
              { label: "Total Rows", val: importResult.totalRows, color: C.purple },
              { label: "Matched", val: importResult.matched, color: C.green },
              { label: "Surplus", val: importResult.surplus, color: C.yellow },
              { label: "Shortage", val: importResult.shortage, color: C.red },
              { label: "Not Found", val: importResult.notFound, color: C.textDim },
            ].map((s, i) => (
              <div key={i} style={{
                background: C.bgCard, borderRadius: 10, padding: "16px 14px",
                border: `1px solid ${C.border}`, textAlign: "center",
              }}>
                <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: font }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Import another */}
          <div style={{ textAlign: "center" }}>
            <button onClick={reset} style={{
              background: `linear-gradient(135deg, ${C.purpleDark}, ${C.purple})`,
              color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: font,
              border: "none", borderRadius: 10, padding: "10px 24px",
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <Upload size={15} /> Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockImportTab;
