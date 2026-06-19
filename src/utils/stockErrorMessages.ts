export type StockIssuePresentation = {
  title: string;
  message: string;
  details?: string[];
};

const STOCK_CEILING_RE =
  /Stock ceiling exceeded for variant ([^.]+)\.\s*Current:\s*([\d.]+),\s*Adding:\s*([\d.]+),\s*Max allowed:\s*([\d.]+)\s*\(Opening:\s*([\d.]+),\s*Purchased:\s*([\d.]+),\s*Returned:\s*([\d.]+)\)/i;

function fmtQty(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

export function parseStockCeilingDbError(
  raw: string,
  productLabel?: string,
): StockIssuePresentation {
  const match = raw.match(STOCK_CEILING_RE);
  const label = productLabel?.trim() || "This product";

  if (!match) {
    return {
      title: "Stock Limit Exceeded",
      message: label,
      details: [raw.replace(/^\[[^\]]+\]\s*/, "").trim() || raw],
    };
  }

  const [, , current, adding, maxAllowed, opening, purchased, returned] = match;
  return {
    title: "Stock Limit Exceeded",
    message: `${label} cannot be returned — stock would exceed the quantity purchased from suppliers.`,
    details: [
      `Current stock: ${fmtQty(current)}`,
      `Adding: ${fmtQty(adding)}`,
      `Maximum allowed: ${fmtQty(maxAllowed)}`,
      `(Opening: ${fmtQty(opening)}, Purchased: ${fmtQty(purchased)}, Returned to supplier: ${fmtQty(returned)})`,
    ],
  };
}

export function buildInsufficientStockIssue(
  productName: string,
  size: string,
  requested: number,
  available: number,
): StockIssuePresentation {
  const label = `${productName}${size ? ` (${size})` : ""}`;
  if (available <= 0) {
    return {
      title: "Stock Not Available",
      message: `${label} is not available to sell.`,
      details: ["There is no stock left for this item."],
    };
  }

  return {
    title: "Insufficient Stock",
    message: `${label} does not have enough stock.`,
    details: [
      `Available: ${fmtQty(available)}`,
      `Requested: ${fmtQty(requested)}`,
      `Reduce quantity or choose another size.`,
    ],
  };
}

export function buildMultipleStockIssues(
  items: Array<{ productName: string; size: string; requested: number; available: number }>,
): StockIssuePresentation {
  if (items.length === 1) {
    const item = items[0];
    return buildInsufficientStockIssue(item.productName, item.size, item.requested, item.available);
  }

  return {
    title: `Insufficient Stock (${items.length} items)`,
    message: "Some items in the bill do not have enough stock.",
    details: items.map(
      (item) =>
        `${item.productName}${item.size ? ` (${item.size})` : ""}: ${fmtQty(item.available)} available, ${fmtQty(item.requested)} requested`,
    ),
  };
}

export function buildStockCeilingValidationIssue(
  productName: string,
  size: string,
  currentStock: number,
  qtyToAdd: number,
  maxAllowed: number,
): StockIssuePresentation {
  const label = `${productName}${size ? ` (${size})` : ""}`;
  const projected = currentStock + qtyToAdd;
  return {
    title: "Stock Limit Exceeded",
    message: `${label} cannot be returned because stock would exceed purchased quantity.`,
    details: [
      `Current stock: ${fmtQty(currentStock)}`,
      `Return qty: ${fmtQty(qtyToAdd)}`,
      `Would become: ${fmtQty(projected)}`,
      `Maximum allowed: ${fmtQty(maxAllowed)}`,
    ],
  };
}

export function presentationFromUnknownStockError(
  raw: string,
  productLabel?: string,
): StockIssuePresentation {
  const text = raw.trim();
  if (!text) {
    return {
      title: "Stock Problem",
      message: "This item could not be added due to a stock issue.",
    };
  }

  if (/stock ceiling exceeded/i.test(text)) {
    return parseStockCeilingDbError(text, productLabel);
  }

  if (/insufficient stock|out of stock|not enough stock/i.test(text)) {
    return {
      title: "Insufficient Stock",
      message: productLabel || "This item",
      details: [text],
    };
  }

  return {
    title: "Stock Problem",
    message: productLabel || "This item could not be added.",
    details: [text],
  };
}
