import type jsPDFType from "jspdf";
import { colorSwatchesFor } from "@/lib/colorSwatch";

/** Colourful landscape A4 PDF for Stock Summary: header band, KPI tiles, coloured column heads, swatches. */

export type Rgb = [number, number, number];

export interface PdfSizeCell {
  size: string;
  qty: number;
}

export type PdfCell =
  | string
  | number
  | { sizes: PdfSizeCell[] }
  | { color: string }
  | { badge: string; fill: Rgb; text: Rgb };

export interface PdfColumn {
  header: string;
  /** Relative width; columns share the printable width by weight. */
  weight: number;
  align?: "left" | "right" | "center";
  /** Header fill; defaults to slate. */
  head?: Rgb;
  /** Light body fill for the column (like the page's tinted qty columns). */
  tint?: Rgb;
  text?: Rgb;
  bold?: boolean;
}

export interface PdfKpi {
  label: string;
  value: string;
  fill: Rgb;
}

export interface StockSummaryPdfInput {
  title: string;
  orgName: string;
  generatedAt: string;
  filters: string[];
  kpis: PdfKpi[];
  columns: PdfColumn[];
  rows: PdfCell[][];
  /** Totals row; cells line up with columns (empty string = blank). */
  totalRow?: PdfCell[];
  note?: string;
}

const SLATE: Rgb = [30, 41, 59];
const INDIGO: Rgb = [79, 70, 229];
const VIOLET: Rgb = [124, 58, 237];
const ZEBRA: Rgb = [248, 250, 252];
const BORDER: Rgb = [226, 232, 240];

let probe: CanvasRenderingContext2D | null | undefined;

/** CSS colour (hex or keyword) → RGB; null when it cannot be resolved. */
export function cssColorToRgb(color: string): Rgb | null {
  let c = color.trim().toLowerCase();
  if (!c) return null;
  if (!c.startsWith("#")) {
    if (probe === undefined) {
      probe = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    }
    if (!probe) return null;
    probe.fillStyle = "#000000";
    probe.fillStyle = c;
    const resolved = String(probe.fillStyle).toLowerCase();
    if (resolved === "#000000" && c !== "black") return null;
    c = resolved;
  }
  let hex = c.slice(1);
  if (hex.length === 3) hex = hex.split("").map((h) => h + h).join("");
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

const isLight = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b > 200;

function fit(doc: jsPDFType, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > width) s = s.slice(0, -1);
  return `${s}…`;
}

const isSizes = (c: PdfCell): c is { sizes: PdfSizeCell[] } => typeof c === "object" && c !== null && "sizes" in c;
const isColor = (c: PdfCell): c is { color: string } => typeof c === "object" && c !== null && "color" in c;
const isBadge = (c: PdfCell): c is { badge: string; fill: Rgb; text: Rgb } =>
  typeof c === "object" && c !== null && "badge" in c;

const CHIP_H = 3.6;
const CHIP_GAP = 0.8;
const FONT = 6.5;

/** Lay size chips into lines that fit the cell width. */
function chipLines(doc: jsPDFType, sizes: PdfSizeCell[], width: number): Array<Array<{ cell: PdfSizeCell; w: number }>> {
  const lines: Array<Array<{ cell: PdfSizeCell; w: number }>> = [[]];
  let x = 0;
  for (const cell of sizes) {
    const w = doc.getTextWidth(cell.size) + doc.getTextWidth(String(cell.qty)) + 3.2;
    if (x > 0 && x + w > width) {
      lines.push([]);
      x = 0;
    }
    lines[lines.length - 1].push({ cell, w });
    x += w + CHIP_GAP;
  }
  return lines;
}

export function buildStockSummaryPdf(JsPdf: typeof jsPDFType, input: StockSummaryPdfInput): jsPDFType {
  const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const usable = pageW - margin * 2;
  const totalWeight = input.columns.reduce((s, c) => s + c.weight, 0);
  const widths = input.columns.map((c) => (c.weight / totalWeight) * usable);
  const pad = 1.2;
  const baseRowH = 5.2;
  const headH = 7;
  const footerY = pageH - 5;

  const setFill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);

  const drawBand = (first: boolean): number => {
    // Gradient-like header band: indigo → violet strips.
    const bandH = first ? 18 : 10;
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      setFill([
        Math.round(INDIGO[0] + (VIOLET[0] - INDIGO[0]) * t),
        Math.round(INDIGO[1] + (VIOLET[1] - INDIGO[1]) * t),
        Math.round(INDIGO[2] + (VIOLET[2] - INDIGO[2]) * t),
      ]);
      doc.rect((pageW / steps) * i, 0, pageW / steps + 0.3, bandH, "F");
    }
    setText([255, 255, 255]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(first ? 15 : 10);
    doc.text(input.title, margin, first ? 9 : 6.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(first ? 8.5 : 7);
    doc.text(input.orgName, pageW - margin, first ? 8 : 6.5, { align: "right" });
    if (first) {
      doc.setFontSize(7);
      doc.text(input.generatedAt, pageW - margin, 13, { align: "right" });
      doc.text("Live stock by article, size and colour", margin, 14);
    }
    return bandH + 3;
  };

  const drawKpis = (y: number): number => {
    if (input.kpis.length === 0) return y;
    const gap = 3;
    const w = (usable - gap * (input.kpis.length - 1)) / input.kpis.length;
    input.kpis.forEach((k, i) => {
      const x = margin + i * (w + gap);
      setFill(k.fill);
      doc.roundedRect(x, y, w, 12, 2, 2, "F");
      setText([255, 255, 255]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(k.label.toUpperCase(), x + 3, y + 4);
      doc.setFontSize(12);
      doc.text(k.value, x + 3, y + 10);
    });
    return y + 15;
  };

  const drawFilters = (y: number): number => {
    if (input.filters.length === 0 && !input.note) return y;
    doc.setFontSize(6.5);
    let x = margin;
    setText([71, 85, 105]);
    doc.setFont("helvetica", "bold");
    if (input.filters.length > 0) {
      doc.text("Filters:", x, y + 2.8);
      x += doc.getTextWidth("Filters:") + 2;
    }
    doc.setFont("helvetica", "normal");
    for (const f of input.filters) {
      const w = doc.getTextWidth(f) + 4;
      if (x + w > pageW - margin) break;
      setFill([238, 242, 255]);
      setDraw([199, 210, 254]);
      doc.roundedRect(x, y, w, 4, 1.8, 1.8, "FD");
      setText([55, 48, 163]);
      doc.text(f, x + 2, y + 2.8);
      x += w + 1.5;
    }
    if (input.note) {
      setText([180, 83, 9]);
      doc.text(input.note, pageW - margin, y + 2.8, { align: "right" });
    }
    return y + 6;
  };

  const drawHead = (y: number): number => {
    let x = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    input.columns.forEach((col, i) => {
      setFill(col.head ?? SLATE);
      doc.rect(x, y, widths[i] + 0.05, headH, "F");
      setText([255, 255, 255]);
      const room = widths[i] - pad * 2;
      let fs = 6.3;
      doc.setFontSize(fs);
      while (fs > 4.6 && doc.getTextWidth(col.header.toUpperCase()) > room) {
        fs -= 0.2;
        doc.setFontSize(fs);
      }
      const label = fit(doc, col.header.toUpperCase(), room);
      const tx = col.align === "right" ? x + widths[i] - pad : col.align === "center" ? x + widths[i] / 2 : x + pad;
      doc.text(label, tx, y + headH / 2 + 1, { align: col.align ?? "left" });
      x += widths[i];
    });
    return y + headH;
  };

  const rowHeight = (row: PdfCell[]): number => {
    let h = baseRowH;
    doc.setFontSize(FONT - 0.5);
    row.forEach((cell, i) => {
      if (isSizes(cell)) {
        const lines = chipLines(doc, cell.sizes, widths[i] - pad * 2).length;
        h = Math.max(h, lines * (CHIP_H + CHIP_GAP) + 1.4);
      }
    });
    return h;
  };

  const drawRow = (row: PdfCell[], y: number, h: number, fill: Rgb | null, isTotal = false) => {
    let x = margin;
    row.forEach((cell, i) => {
      const col = input.columns[i];
      const w = widths[i];
      const bg = isTotal ? fill : (col.tint ?? fill);
      if (bg) {
        setFill(bg);
        doc.rect(x, y, w + 0.05, h, "F");
      }
      const midY = y + h / 2 + 1.1;
      if (isSizes(cell)) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(FONT - 0.5);
        let cy = y + 0.7;
        for (const line of chipLines(doc, cell.sizes, w - pad * 2)) {
          let cx = x + pad;
          for (const { cell: s, w: cw } of line) {
            const ok = s.qty > 0;
            const sw = doc.getTextWidth(s.size) + 1.6;
            setFill(ok ? [236, 253, 245] : [255, 241, 242]);
            setDraw(ok ? [110, 231, 183] : [253, 164, 175]);
            doc.roundedRect(cx, cy, cw, CHIP_H, 0.8, 0.8, "FD");
            setFill(ok ? [167, 243, 208] : [254, 205, 211]);
            doc.rect(cx + 0.15, cy + 0.15, sw, CHIP_H - 0.3, "F");
            setText(ok ? [6, 78, 59] : [159, 18, 57]);
            doc.text(s.size, cx + 0.95, cy + CHIP_H - 1);
            setText(ok ? [4, 120, 87] : [225, 29, 72]);
            doc.text(String(s.qty), cx + sw + 0.8, cy + CHIP_H - 1);
            cx += cw + CHIP_GAP;
          }
          cy += CHIP_H + CHIP_GAP;
        }
      } else if (isBadge(cell)) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(FONT - 0.5);
        const bw = Math.min(doc.getTextWidth(cell.badge) + 3, w - pad * 2);
        setFill(cell.fill);
        doc.roundedRect(x + pad, y + h / 2 - 1.9, bw, 3.8, 1.6, 1.6, "F");
        setText(cell.text);
        doc.text(fit(doc, cell.badge, bw - 2), x + pad + 1.5, y + h / 2 + 0.9);
      } else if (isColor(cell)) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(FONT);
        const name = cell.color.trim();
        let tx = x + pad;
        const rgbs = colorSwatchesFor(name)
          .map(cssColorToRgb)
          .filter((c): c is Rgb => c !== null);
        rgbs.forEach((rgb, k) => {
          setFill(rgb);
          setDraw(isLight(rgb) ? [148, 163, 184] : rgb);
          doc.circle(tx + 1.4 + k * 2, y + h / 2, 1.3, "FD");
        });
        if (rgbs.length > 0) tx += 3.4 + (rgbs.length - 1) * 2;
        setText([51, 65, 85]);
        doc.text(fit(doc, name || "—", x + w - pad - tx), tx, midY);
      } else {
        const text = cell === "" || cell === null || cell === undefined ? "" : String(cell);
        doc.setFont("helvetica", isTotal || col.bold ? "bold" : "normal");
        doc.setFontSize(FONT);
        setText(col.text ?? [30, 41, 59]);
        const t = fit(doc, text, w - pad * 2);
        const tx = col.align === "right" ? x + w - pad : col.align === "center" ? x + w / 2 : x + pad;
        doc.text(t, tx, midY, { align: col.align ?? "left" });
      }
      x += w;
    });
    setDraw(BORDER);
    doc.setLineWidth(0.1);
    doc.line(margin, y + h, margin + usable, y + h);
  };

  let y = drawBand(true);
  y = drawKpis(y);
  y = drawFilters(y);
  y = drawHead(y);

  input.rows.forEach((row, idx) => {
    const h = rowHeight(row);
    if (y + h > footerY - 3) {
      doc.addPage();
      y = drawHead(drawBand(false));
    }
    drawRow(row, y, h, idx % 2 === 1 ? ZEBRA : null);
    y += h;
  });

  if (input.totalRow) {
    const h = baseRowH + 1;
    if (y + h > footerY - 3) {
      doc.addPage();
      y = drawHead(drawBand(false));
    }
    drawRow(input.totalRow, y, h, [254, 243, 199], true);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText([100, 116, 139]);
    doc.text(`${input.title} · ${input.orgName}`, margin, footerY + 2);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, footerY + 2, { align: "right" });
  }
  return doc;
}
