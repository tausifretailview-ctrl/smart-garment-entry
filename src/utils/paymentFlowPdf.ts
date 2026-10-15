/**
 * Colourful landscape A4 PDF of the Payment Flow page, to hand to a customer or supplier.
 * All bills, or one bill with its payment steps. Figures are the page model (ledger rows).
 */
import type jsPDFType from "jspdf";
import { format, parseISO } from "date-fns";
import { downloadJsPdf } from "@/utils/mobileDocumentDelivery";
import {
  billPaymentSteps,
  type FlowBill,
  type FlowKind,
  type PartyFlowModel,
  type PartyKind,
} from "@/utils/partyPaymentFlow";

let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> => (jsPdfPromise ??= import("jspdf").then((m) => m.default));

type RGB = [number, number, number];

export const PDF_KIND_RGB: Record<FlowKind | "bill" | "due", RGB> = {
  payment: [22, 163, 74],
  cn: [124, 58, 237],
  advance: [37, 99, 235],
  refund: [220, 38, 38],
  opening: [217, 119, 6],
  adjustment: [100, 116, 139],
  account: [13, 148, 136],
  bill: [15, 23, 42],
  due: [245, 158, 11],
};

const STATUS_RGB: Record<FlowBill["status"], { bg: RGB; fg: RGB; label: string }> = {
  paid: { bg: [220, 252, 231], fg: [22, 101, 52], label: "PAID" },
  partial: { bg: [254, 243, 199], fg: [146, 64, 14], label: "PARTLY PAID" },
  unpaid: { bg: [254, 226, 226], fg: [153, 27, 27], label: "UNPAID" },
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
/** Helvetica has no ₹ glyph. */
export const pdfRs = (n: number) => `Rs. ${inr.format(Math.abs(n))}`;

export function pdfText(s: string): string {
  return String(s ?? "")
    .replace(/₹\s*/g, "Rs. ")
    .replace(/[−–—]/g, "-")
    .replace(/[→]/g, "->")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function fmtDate(d: string) {
  if (!d || d.startsWith("1900")) return "Opening";
  try {
    return format(parseISO(d.slice(0, 10)), "dd MMM yyyy");
  } catch {
    return d;
  }
}

function balanceText(party: PartyKind, n: number) {
  if (Math.abs(n) < 0.005) return "Rs. 0";
  if (party === "customer") return `${pdfRs(n)} ${n > 0 ? "Dr" : "Cr"}`;
  return `${pdfRs(n)} ${n > 0 ? "Cr" : "Dr"}`;
}

const PAGE_W = 297;
const PAGE_H = 210;
const M = 10;

export interface PaymentFlowPdfInput {
  model: PartyFlowModel;
  partyName: string;
  partyPhone?: string | null;
  periodLabel: string;
  businessName?: string;
  /** Only this bill, with its payment steps. */
  billId?: string | null;
}

export async function exportPaymentFlowPdf(input: PaymentFlowPdfInput) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const { model, partyName } = input;
  const party = model.party;
  const sourceById = new Map(model.sources.map((s) => [s.id, s]));
  const focusBill = input.billId ? model.bills.find((b) => b.id === input.billId) ?? null : null;

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const t = (s: string, x: number, y: number, opts?: any) => doc.text(pdfText(s), x, y, opts);

  /* Header band: violet → teal gradient. */
  const header = (compact: boolean) => {
    const h = compact ? 14 : 26;
    const from: RGB = [109, 40, 217];
    const to: RGB = [13, 148, 136];
    const strips = 60;
    for (let i = 0; i < strips; i++) {
      const f = i / (strips - 1);
      fill([0, 1, 2].map((k) => Math.round(from[k] + (to[k] - from[k]) * f)) as RGB);
      doc.rect((PAGE_W / strips) * i, 0, PAGE_W / strips + 0.3, h, "F");
    }
    ink([255, 255, 255]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(compact ? 12 : 18);
    t(`Payment Flow  |  ${partyName}`, M, compact ? 9 : 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(compact ? 8 : 9.5);
    if (!compact) {
      const who = [
        party === "customer" ? "Customer" : "Supplier",
        input.partyPhone || "",
        input.periodLabel,
        focusBill ? `Bill ${focusBill.reference}` : `${model.bills.length} bills`,
      ]
        .filter(Boolean)
        .join("   |   ");
      t(who, M, 19.5);
    }
    const right = [input.businessName || "", `Printed ${format(new Date(), "dd MMM yyyy, hh:mm a")}`]
      .filter(Boolean)
      .join("  |  ");
    t(right, PAGE_W - M, compact ? 9 : 12, { align: "right" });
    return h + 6;
  };

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      ink([100, 116, 139]);
      t(
        "Amounts are taken from the ledger. Advances and credit notes used on a bill are matched oldest first.",
        M,
        PAGE_H - 5,
      );
      t(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 5, { align: "right" });
    }
  };

  let y = header(false);
  const newPage = () => {
    doc.addPage();
    y = header(true);
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - 10) newPage();
  };

  /* Tiles. */
  const tot = model.totals;
  const tiles: Array<{ k: string; v: string; c: RGB }> = [
    { k: "Opening", v: balanceText(party, tot.opening), c: PDF_KIND_RGB.opening },
    { k: party === "customer" ? "Billed" : "Purchases", v: pdfRs(tot.billed), c: PDF_KIND_RGB.bill },
    { k: party === "customer" ? "Received" : "Paid", v: pdfRs(tot.paid), c: PDF_KIND_RGB.payment },
    { k: "CN / Returns", v: pdfRs(tot.cn), c: PDF_KIND_RGB.cn },
    ...(party === "customer" ? [{ k: "Advance", v: pdfRs(tot.advance), c: PDF_KIND_RGB.advance }] : []),
    { k: party === "customer" ? "Refunds paid" : "Refunds received", v: pdfRs(tot.refund), c: PDF_KIND_RGB.refund },
    ...(Math.abs(tot.adjustment) > 0.005
      ? [{ k: "Adjustments", v: `${tot.adjustment < 0 ? "-" : ""}${pdfRs(tot.adjustment)}`, c: PDF_KIND_RGB.adjustment }]
      : []),
    { k: "Closing balance", v: balanceText(party, tot.closing), c: [180, 83, 9] },
  ];
  const gap = 3;
  const tileW = (PAGE_W - 2 * M - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((tile, i) => {
    const x = M + i * (tileW + gap);
    const last = i === tiles.length - 1;
    fill(last ? [255, 251, 235] : [248, 250, 252]);
    draw(last ? [251, 191, 36] : [226, 232, 240]);
    doc.setLineWidth(last ? 0.6 : 0.2);
    doc.roundedRect(x, y, tileW, 15, 2, 2, "FD");
    fill(tile.c);
    doc.rect(x + 0.3, y + 0.3, tileW - 0.6, 1.4, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    ink([100, 116, 139]);
    t(tile.k.toUpperCase(), x + 2.5, y + 6);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    ink(last ? [180, 83, 9] : [15, 23, 42]);
    t(tile.v, x + 2.5, y + 12);
  });
  y += 21;

  /* Legend. */
  const legend: Array<[RGB, string]> = [
    [PDF_KIND_RGB.payment, "Payment"],
    [PDF_KIND_RGB.cn, "CN / return"],
    ...(party === "customer" ? ([[PDF_KIND_RGB.advance, "Advance"]] as Array<[RGB, string]>) : []),
    [PDF_KIND_RGB.opening, "Opening"],
    [PDF_KIND_RGB.refund, "Refund"],
    [PDF_KIND_RGB.account, "From account balance"],
    [PDF_KIND_RGB.due, "Still due"],
  ];
  let lx = M;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  legend.forEach(([c, l]) => {
    fill(c);
    doc.circle(lx + 1.3, y - 1, 1.3, "F");
    ink([71, 85, 105]);
    t(l, lx + 3.8, y);
    lx += 6 + doc.getTextWidth(l) + 4;
  });
  y += 6;

  /* Story line: balance after each step. */
  const storySteps = model.steps.filter((s) => !s.memo || s.kind === "opening");
  const drawStory = (steps: typeof storySteps, title: string) => {
    if (steps.length === 0) return;
    const per = 12;
    const colW = (PAGE_W - 2 * M) / per;
    ensure(10 + 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    ink([51, 65, 85]);
    t(title, M, y);
    y += 4;
    for (let i = 0; i < steps.length; i += per) {
      ensure(22);
      const row = steps.slice(i, i + per);
      const ly = y + 3;
      draw([203, 213, 225]);
      doc.setLineWidth(0.5);
      doc.line(M + colW / 2, ly, M + colW * (row.length - 0.5), ly);
      row.forEach((st, j) => {
        const cx = M + colW * j + colW / 2;
        const c = PDF_KIND_RGB[st.kind === "bill" ? "bill" : st.kind];
        fill([255, 255, 255]);
        doc.circle(cx, ly, 2.4, "F");
        fill(c);
        doc.circle(cx, ly, 1.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        ink([15, 23, 42]);
        const ref = doc.splitTextToSize(pdfText(st.reference), colW - 2)[0] as string;
        doc.text(ref, cx, ly + 6, { align: "center" });
        doc.setFont("helvetica", "normal");
        ink([100, 116, 139]);
        t(fmtDate(st.date), cx, ly + 9.5, { align: "center" });
        doc.setFont("helvetica", "bold");
        ink(c);
        t(balanceText(party, st.balance), cx, ly + 13, { align: "center" });
      });
      y += 19;
    }
    y += 2;
  };

  /* A bill block: number, status, coloured bar, paid-by list, figures. */
  const drawBill = (bill: FlowBill) => {
    const parts = [...bill.parts].sort((a, b) => a.step - b.step);
    const paidBy = parts.map((p) => {
      const s = p.sourceId ? sourceById.get(p.sourceId) : undefined;
      return {
        c: PDF_KIND_RGB[p.kind],
        text: s
          ? `${s.reference} (${s.label}, ${fmtDate(s.date)})  ${pdfRs(p.amount)}`
          : `From account balance  ${pdfRs(p.amount)}`,
      };
    });
    const barX = M + 62;
    const barW = 150;
    doc.setFontSize(7.5);
    // Paid-by chips flow under the bar.
    const chips: Array<{ x: number; y: number; w: number; c: RGB; text: string }> = [];
    let cx = barX;
    let cy = 0;
    paidBy.forEach((pb) => {
      const w = doc.getTextWidth(pdfText(pb.text)) + 6;
      if (cx + w > barX + barW && cx > barX) {
        cx = barX;
        cy += 5;
      }
      chips.push({ x: cx, y: cy, w, c: pb.c, text: pb.text });
      cx += w + 2;
    });
    const h = Math.max(22, 15 + cy + (paidBy.length ? 5 : 0));
    ensure(h + 3);
    const top = y;
    fill([255, 255, 255]);
    draw([226, 232, 240]);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, top, PAGE_W - 2 * M, h, 2.5, 2.5, "FD");
    if (bill.isOpening) {
      fill(PDF_KIND_RGB.opening);
      doc.rect(M + 0.2, top + 0.6, 1.4, h - 1.2, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    ink([15, 23, 42]);
    t(bill.reference, M + 4, top + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink([100, 116, 139]);
    t(bill.isOpening ? "Carried forward" : fmtDate(bill.date), M + 4, top + 12);
    const st = STATUS_RGB[bill.status];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const sw = doc.getTextWidth(st.label) + 5;
    fill(st.bg);
    doc.roundedRect(M + 4, top + 14.5, sw, 4.6, 2.3, 2.3, "F");
    ink(st.fg);
    t(st.label, M + 4 + 2.5, top + 17.8);

    // Bar
    const barY = top + 4;
    fill([254, 243, 199]);
    doc.roundedRect(barX, barY, barW, 5, 2.5, 2.5, "F");
    let bx = barX;
    parts.forEach((p, i) => {
      const w = bill.amount > 0 ? Math.min(barW - (bx - barX), (p.amount / bill.amount) * barW) : 0;
      if (w <= 0) return;
      const c = PDF_KIND_RGB[p.kind];
      fill(i % 2 ? (c.map((v) => Math.round(v + (255 - v) * 0.25)) as RGB) : c);
      doc.rect(bx, barY, w, 5, "F");
      bx += w;
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    if (chips.length === 0) {
      ink([153, 27, 27]);
      t("Nothing paid yet", barX, top + 15);
    }
    chips.forEach((ch) => {
      const yy = top + 12 + ch.y;
      fill(ch.c.map((v) => Math.round(v + (255 - v) * 0.86)) as RGB);
      doc.roundedRect(ch.x, yy - 3.2, ch.w, 4.4, 1, 1, "F");
      fill(ch.c);
      doc.rect(ch.x, yy - 3.2, 1, 4.4, "F");
      ink([30, 41, 59]);
      t(ch.text, ch.x + 2.6, yy);
    });

    // Figures
    const fx = barX + barW + 8;
    const fig = (label: string, v: string, yy: number, c: RGB) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      ink([100, 116, 139]);
      t(label, fx, yy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ink(c);
      t(v, PAGE_W - M - 4, yy, { align: "right" });
    };
    fig(bill.isOpening ? "Amount" : "Bill amount", pdfRs(bill.amount), top + 7, [15, 23, 42]);
    fig("Settled", pdfRs(bill.settled), top + 12.5, PDF_KIND_RGB.payment);
    fig("Due", pdfRs(bill.due), top + 18, bill.due > 0.5 ? [180, 83, 9] : [15, 23, 42]);
    y = top + h + 3;
  };

  if (focusBill) {
    drawBill(focusBill);
    // Step by step for this bill.
    const steps = billPaymentSteps(focusBill, model.sources);
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    ink([51, 65, 85]);
    t(`How ${focusBill.reference} was paid`, M, y + 4);
    y += 8;
    const cols = [M, M + 12, M + 40, M + 110, M + 170, M + 215];
    const head = ["#", "Date", "What", "How", "Amount", "Still due after"];
    fill([241, 245, 249]);
    doc.rect(M, y, PAGE_W - 2 * M, 7, "F");
    doc.setFontSize(8);
    ink([71, 85, 105]);
    head.forEach((hd, i) => t(hd, cols[i] + 2, y + 4.8));
    y += 7;
    steps.forEach((s, i) => {
      ensure(8);
      const c = PDF_KIND_RGB[s.kind === "bill" ? "bill" : s.kind];
      if (i % 2) {
        fill([248, 250, 252]);
        doc.rect(M, y, PAGE_W - 2 * M, 7.5, "F");
      }
      fill(c);
      doc.circle(cols[0] + 4, y + 3.7, 1.8, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      ink([15, 23, 42]);
      t(String(i + 1), cols[0] + 7, y + 5);
      t(fmtDate(s.date), cols[1] + 2, y + 5);
      doc.setFont("helvetica", "bold");
      t(s.reference, cols[2] + 2, y + 5);
      doc.setFont("helvetica", "normal");
      t(s.sourceTotal ? `${s.label} (part of ${pdfRs(s.sourceTotal)})` : s.label, cols[3] + 2, y + 5);
      doc.setFont("helvetica", "bold");
      ink(c);
      t(i === 0 ? pdfRs(s.amount) : `- ${pdfRs(s.amount)}`, cols[4] + 2, y + 5);
      ink(s.dueAfter > 0.5 ? [180, 83, 9] : PDF_KIND_RGB.payment);
      t(s.dueAfter > 0.5 ? pdfRs(s.dueAfter) : "Rs. 0  (fully paid)", cols[5] + 2, y + 5);
      y += 7.5;
    });
  } else {
    drawStory(storySteps, "Story  |  balance after each step");
    ensure(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    ink([51, 65, 85]);
    t("Bills and what settled them", M, y + 3);
    y += 6;
    model.bills.forEach(drawBill);
    const loose = model.sources.filter((s) => s.raisesBalance || !model.links.some((l) => l.sourceId === s.id));
    if (loose.length) {
      ensure(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ink([51, 65, 85]);
      t("On account / not tied to a bill", M, y + 4);
      y += 8;
      doc.setFontSize(8.5);
      loose.forEach((s) => {
        ensure(6);
        fill(PDF_KIND_RGB[s.kind]);
        doc.circle(M + 2, y - 1, 1.4, "F");
        doc.setFont("helvetica", "normal");
        ink([15, 23, 42]);
        t(`${fmtDate(s.date)}   ${s.reference}   ${s.label}${s.note ? `  (${s.note})` : ""}`, M + 5, y);
        doc.setFont("helvetica", "bold");
        ink(PDF_KIND_RGB[s.kind]);
        t(`${s.raisesBalance ? "-" : ""}${pdfRs(s.amount)}`, M + 150, y);
        y += 5.5;
      });
    }
  }

  footer();
  const safe = pdfText(partyName).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "party";
  const suffix = focusBill ? `-${pdfText(focusBill.reference).replace(/[^A-Za-z0-9]+/g, "-")}` : "";
  return downloadJsPdf(doc, `Payment-Flow-${safe}${suffix}.pdf`);
}
