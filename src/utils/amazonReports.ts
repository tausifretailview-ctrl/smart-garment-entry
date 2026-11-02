/**
 * Amazon without the API: read Seller Central report files (orders, returns) and make the
 * stock upload file. Pure functions only, so tests can run them.
 */

export type ReportTable = { headers: string[]; rows: Record<string, string>[] };

/** Header as one key: lower case, spaces / underscores become dashes. */
export function normHeader(h: string): string {
  return String(h ?? "")
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Amazon reports are tab-separated .txt; a CSV saved from Excel works too. */
export function parseReportText(text: string): ReportTable {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  const tab = lines[0].includes("\t");
  const split = (l: string) => (tab ? l.split("\t") : splitCsvLine(l)).map((c) => c.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]).map(normHeader);
  const rows = lines.slice(1).map((l) => {
    const cells = split(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h && row[h] === undefined) row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function pick(row: Record<string, string>, names: string[]): string {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function num(v: string): number {
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, "").replace(/^INR/i, ""));
  return Number.isFinite(n) ? n : 0;
}

export type AmazonOrderLine = {
  orderId: string;
  lineKey: string;
  sku: string;
  quantity: number;
  /** Line total the buyer paid for the item, GST included (Amazon.in prices are inclusive). */
  amount: number;
  orderDate: string | null;
};

export type SkippedLine = { orderId: string; sku: string; reason: string };

const ORDER_ID = ["amazon-order-id", "order-id"];
const ORDER_SKU = ["sku", "merchant-sku", "seller-sku"];
const ORDER_QTY = ["quantity", "quantity-purchased", "quantity-shipped", "quantity-ordered"];

export function isOrdersReport(t: ReportTable): boolean {
  return ORDER_ID.some((h) => t.headers.includes(h)) && ORDER_SKU.some((h) => t.headers.includes(h)) &&
    ORDER_QTY.some((h) => t.headers.includes(h)) && !t.headers.includes("return-quantity");
}

/** Order lines to bill. Cancelled, pending-payment and Amazon-fulfilled (FBA) lines are skipped. */
export function readOrderLines(t: ReportTable): { lines: AmazonOrderLine[]; skipped: SkippedLine[] } {
  const lines: AmazonOrderLine[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Set<string>();
  for (const row of t.rows) {
    const orderId = pick(row, ORDER_ID);
    const sku = pick(row, ORDER_SKU);
    if (!orderId || !sku) continue;
    const status = `${pick(row, ["order-status"])} ${pick(row, ["item-status"])}`.toLowerCase();
    if (/cancel/.test(status)) {
      skipped.push({ orderId, sku, reason: "Cancelled" });
      continue;
    }
    if (/\bpending\b/.test(status)) {
      skipped.push({ orderId, sku, reason: "Payment pending on Amazon; upload again later" });
      continue;
    }
    const channel = pick(row, ["fulfillment-channel", "fulfilment-channel"]).toLowerCase();
    if (channel === "amazon" || channel === "afn") {
      skipped.push({ orderId, sku, reason: "Fulfilled by Amazon (FBA): stock is in Amazon's warehouse" });
      continue;
    }
    const quantity = Math.floor(num(pick(row, ORDER_QTY)));
    if (quantity <= 0) {
      skipped.push({ orderId, sku, reason: "Quantity 0" });
      continue;
    }
    const itemId = pick(row, ["order-item-id", "amazon-order-item-id"]);
    const lineKey = itemId ? `${orderId}|${itemId}` : `${orderId}|${sku}`;
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);
    const dateRaw = pick(row, ["purchase-date", "order-date", "payments-date"]);
    const d = dateRaw ? new Date(dateRaw) : null;
    lines.push({
      orderId,
      lineKey,
      sku,
      quantity,
      amount: Math.round(num(pick(row, ["item-price", "item-total", "principal"])) * 100) / 100,
      orderDate: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    });
  }
  return { lines, skipped };
}

export type AmazonReturnLine = {
  orderId: string;
  lineKey: string;
  sku: string;
  quantity: number;
  reason: string;
  returnDate: string | null;
};

export function isReturnsReport(t: ReportTable): boolean {
  return ORDER_ID.some((h) => t.headers.includes(h)) &&
    (t.headers.includes("return-quantity") || t.headers.includes("return-reason") || t.headers.includes("detailed-disposition") ||
      t.headers.includes("amazon-rma-id"));
}

export function readReturnLines(t: ReportTable): AmazonReturnLine[] {
  const out: AmazonReturnLine[] = [];
  const seen = new Set<string>();
  for (const row of t.rows) {
    const orderId = pick(row, ORDER_ID);
    const sku = pick(row, ["merchant-sku", "sku", "seller-sku"]);
    if (!orderId || !sku) continue;
    const status = pick(row, ["return-request-status", "status"]).toLowerCase();
    if (/reject|cancel|closed without/.test(status)) continue;
    const quantity = Math.max(1, Math.floor(num(pick(row, ["return-quantity", "quantity"])) || 1));
    const rma = pick(row, ["amazon-rma-id", "license-plate-number", "rma-id"]);
    const dateRaw = pick(row, ["return-delivery-date", "return-date", "return-request-date"]);
    const lineKey = rma ? `${orderId}|${rma}|${sku}` : `${orderId}|${sku}|${dateRaw}`;
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);
    const d = dateRaw ? new Date(dateRaw) : null;
    out.push({
      orderId,
      lineKey,
      sku,
      quantity,
      reason: pick(row, ["return-reason", "reason", "detailed-disposition"]).slice(0, 200),
      returnDate: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    });
  }
  return out;
}

/** Order lines grouped into one bill per Amazon order, in the order they came. */
export function groupByOrder(lines: AmazonOrderLine[]): { orderId: string; lines: AmazonOrderLine[] }[] {
  const map = new Map<string, AmazonOrderLine[]>();
  for (const l of lines) {
    const list = map.get(l.orderId) ?? [];
    list.push(l);
    map.set(l.orderId, list);
  }
  return [...map.entries()].map(([orderId, ls]) => ({ orderId, lines: ls }));
}

/**
 * Amazon "price and quantity" upload file (tab-separated .txt). Price columns stay empty so
 * Amazon keeps the listed price; only quantity changes.
 */
export function buildAmazonStockFile(rows: { sku: string; quantity: number }[]): string {
  const header = ["sku", "price", "minimum-seller-allowed-price", "maximum-seller-allowed-price", "quantity", "handling-time", "fulfillment-channel"];
  const body = rows.map((r) => [r.sku.replace(/[\t\r\n]/g, " "), "", "", "", String(Math.max(0, Math.floor(r.quantity))), "", ""].join("\t"));
  return [header.join("\t"), ...body].join("\r\n") + "\r\n";
}
