export type VariantSizeColor = {
  id?: string | null;
  product_id?: string | null;
  size?: string | null;
  color?: string | null;
  barcode?: string | null;
};

export type VariantPieceLabels = {
  sizesLabel: string;
  colorsLabel: string;
  barcodesLabel: string;
};

const EMPTY_LABEL = "—";

/** Marks the variant a customer booked. The shop resolves size and barcode from this id. */
const BOOKED_VARIANT_MARK = /\[v:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uniqueTrimmed(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

/** One barcode stays bare. Several are prefixed with size so the piece is identifiable. */
export function barcodeColumnLabel(variants: VariantSizeColor[]): string {
  const parts: Array<{ size: string; barcode: string }> = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const barcode = String(variant.barcode ?? "").trim();
    if (!barcode || seen.has(barcode)) continue;
    seen.add(barcode);
    parts.push({ size: String(variant.size ?? "").trim(), barcode });
  }
  if (parts.length === 0) return EMPTY_LABEL;
  if (parts.length === 1) return parts[0].barcode;
  return parts
    .map((part) => (part.size ? `${part.size} · ${part.barcode}` : part.barcode))
    .join(", ");
}

export function summarizeVariantSizeColor(variants: VariantSizeColor[]): VariantPieceLabels & {
  sizes: string[];
  colors: string[];
} {
  const sizes = uniqueTrimmed(variants.map((v) => v.size));
  const colors = uniqueTrimmed(variants.map((v) => v.color));
  return {
    sizes,
    colors,
    sizesLabel: sizes.length > 0 ? sizes.join(", ") : EMPTY_LABEL,
    colorsLabel: colors.length > 0 ? colors.join(", ") : EMPTY_LABEL,
    barcodesLabel: barcodeColumnLabel(variants),
  };
}

export function aggregateVariantRows(
  rows: VariantSizeColor[],
): Record<string, VariantPieceLabels> {
  const byProduct = new Map<string, VariantSizeColor[]>();
  for (const row of rows) {
    const productId = row.product_id;
    if (!productId) continue;
    const list = byProduct.get(productId) ?? [];
    list.push(row);
    byProduct.set(productId, list);
  }
  return Object.fromEntries(
    [...byProduct.entries()].map(([productId, variants]) => {
      const summary = summarizeVariantSizeColor(variants);
      return [
        productId,
        {
          sizesLabel: summary.sizesLabel,
          colorsLabel: summary.colorsLabel,
          barcodesLabel: summary.barcodesLabel,
        },
      ];
    }),
  );
}

export function bookedVariantIdsFromMessage(message: string | null | undefined): string[] {
  if (!message) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of message.matchAll(BOOKED_VARIANT_MARK)) {
    const id = match[1]?.toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Keep the order text readable and reserve room for the variant marks inside the 1000-char cap. */
export function appendBookedVariantMarks(
  message: string,
  variantIds: Array<string | null | undefined>,
  max = 1000,
): string {
  const ids = uniqueTrimmed(variantIds.map((id) => String(id ?? "").toLowerCase())).filter((id) =>
    UUID_RE.test(id),
  );
  const body = String(message || "").trim();
  let mark = ids.map((id) => `[v:${id}]`).join("");
  while (mark && mark.length + (body ? 1 : 0) > max) {
    ids.pop();
    mark = ids.map((id) => `[v:${id}]`).join("");
  }
  if (!mark) {
    return body.length > max ? `${body.slice(0, Math.max(0, max - 1))}…` : body;
  }
  const room = max - mark.length - 1;
  if (room <= 0 || !body) return mark;
  const trimmed = body.length > room ? `${body.slice(0, Math.max(0, room - 1))}…` : body;
  return `${trimmed} ${mark}`;
}

export function enquiryMessageForDisplay(message: string | null | undefined): string {
  return String(message || "")
    .replace(BOOKED_VARIANT_MARK, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([·,])/g, " $1")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the stored order text names this size as a booked line, not a casual word. */
export function messageBooksSize(message: string | null | undefined, size: string): boolean {
  const label = size.trim();
  if (!message || !label) return false;
  const token = escapeRegExp(label);
  const re = new RegExp(`(?:(?:^|[·\\s])${token}\\s+x\\d+|·\\s*${token}\\s*\\))`, "i");
  return re.test(message);
}

function sizesBookedInMessage(message: string | null | undefined): string[] {
  if (!message) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:^|[·\s])([A-Za-z0-9][A-Za-z0-9./-]{0,11})\s+x\d+/g,
    /·\s*([A-Za-z0-9][A-Za-z0-9./-]{0,11})\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      const size = match[1]?.trim();
      if (!size) continue;
      const key = size.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(size);
    }
  }
  return found;
}

export type StoredEnquiryPiece = {
  size?: string | null;
  barcode?: string | null;
  variant_id?: string | null;
  product_id?: string | null;
};

export type EnquiryPieceRow = {
  message?: string | null;
  product_id?: string | null;
  size?: string | null;
  barcode?: string | null;
  booked_pieces?: StoredEnquiryPiece[] | null;
};

/** Size and barcode to show on an enquiry: the booked piece when we know it, otherwise the product's variants. */
export function enquiryDisplayPieces(
  row: EnquiryPieceRow,
  variants: VariantSizeColor[],
): VariantPieceLabels {
  const stored = Array.isArray(row.booked_pieces)
    ? row.booked_pieces.filter((piece) => String(piece?.size || "").trim() || String(piece?.barcode || "").trim())
    : [];
  if (stored.length > 0) {
    const summary = summarizeVariantSizeColor(stored);
    return {
      sizesLabel: summary.sizesLabel,
      colorsLabel: summary.colorsLabel,
      barcodesLabel: summary.barcodesLabel,
    };
  }
  if (String(row.size || "").trim() || String(row.barcode || "").trim()) {
    const summary = summarizeVariantSizeColor([{ size: row.size, barcode: row.barcode }]);
    return {
      sizesLabel: summary.sizesLabel,
      colorsLabel: summary.colorsLabel,
      barcodesLabel: summary.barcodesLabel,
    };
  }

  const bookedIds = new Set(bookedVariantIdsFromMessage(row.message));
  const forProduct = row.product_id
    ? variants.filter((variant) => variant.product_id === row.product_id)
    : [];
  const byId = variants.filter((variant) => variant.id && bookedIds.has(String(variant.id).toLowerCase()));
  if (byId.length > 0) {
    const summary = summarizeVariantSizeColor(byId);
    return {
      sizesLabel: summary.sizesLabel,
      colorsLabel: summary.colorsLabel,
      barcodesLabel: summary.barcodesLabel,
    };
  }

  const pool = forProduct;
  const sized = pool.filter((variant) => messageBooksSize(row.message, String(variant.size || "")));
  if (sized.length > 0) {
    const summary = summarizeVariantSizeColor(sized);
    return {
      sizesLabel: summary.sizesLabel,
      colorsLabel: summary.colorsLabel,
      barcodesLabel: summary.barcodesLabel,
    };
  }

  if (pool.length > 0) {
    const summary = summarizeVariantSizeColor(pool);
    return {
      sizesLabel: summary.sizesLabel,
      colorsLabel: summary.colorsLabel,
      barcodesLabel: summary.barcodesLabel,
    };
  }

  const mentioned = sizesBookedInMessage(row.message);
  return {
    sizesLabel: mentioned.length > 0 ? mentioned.join(", ") : EMPTY_LABEL,
    colorsLabel: EMPTY_LABEL,
    barcodesLabel: EMPTY_LABEL,
  };
}
