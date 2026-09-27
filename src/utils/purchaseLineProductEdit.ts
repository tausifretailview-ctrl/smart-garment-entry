/**
 * Purchase-bill Edit Product → line sync.
 *
 * A product master can have many barcodes (sizes / pieces). Saving the edit
 * panel must refresh only the bill line for the barcode being edited.
 * Sibling lines that share product_id keep their own name and rates.
 */

export type PurchaseBillLineIdentity = {
  temp_id: string;
  barcode?: string | null;
  sku_id?: string | null;
};

export type PurchaseProductEditMatch = {
  barcode?: string | null;
  skuId?: string | null;
};

export type ProductEditFormSnapshot = {
  product_name: string;
  brand: string;
  category: string;
  style: string;
  color: string;
  hsn_code: string;
  gst_per: number;
  uom?: string;
  purchase_gst_percent: number | null;
  default_pur_price: number;
  default_sale_price: number;
  default_mrp: number;
};

export type PurchaseLineEditFields = {
  product_name?: string;
  brand?: string;
  category?: string;
  style?: string;
  color?: string;
  hsn_code?: string;
  gst_per?: number;
  uom?: string;
  pur_price?: number;
  sale_price?: number;
  mrp?: number;
};

export function normalizePurchaseBarcode(value?: string | null): string {
  return (value || "").trim();
}

function barcodesEqual(a?: string | null, b?: string | null): boolean {
  const left = normalizePurchaseBarcode(a);
  const right = normalizePurchaseBarcode(b);
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function normText(value?: string | null): string {
  return (value || "").trim();
}

/**
 * True for the edited row, every bill line with the same barcode, and the
 * same variant when the line barcode is still blank. Never matches on
 * product_id alone.
 */
export function purchaseLineMatchesProductEdit(
  line: PurchaseBillLineIdentity,
  edited: PurchaseProductEditMatch & { tempId: string },
): boolean {
  if (line.temp_id && edited.tempId && line.temp_id === edited.tempId) return true;
  if (barcodesEqual(line.barcode, edited.barcode)) return true;

  const skuId = (edited.skuId || "").trim();
  if (!skuId || (line.sku_id || "").trim() !== skuId) return false;

  const lineBarcode = normalizePurchaseBarcode(line.barcode);
  const editedBarcode = normalizePurchaseBarcode(edited.barcode);
  if (lineBarcode && editedBarcode && !barcodesEqual(lineBarcode, editedBarcode)) return false;
  return true;
}

/**
 * Fields to write onto the matching bill line after Edit Product save.
 * Product name is copied whenever the line still shows an older name, so a
 * price save also refreshes the item description for this barcode.
 * Brand, style, colour, and rates change only when the user edited them.
 */
export function buildPurchaseLinePatchFromProductEdit(args: {
  form: ProductEditFormSnapshot;
  line: PurchaseLineEditFields;
  modifiedFields: ReadonlySet<string>;
}): PurchaseLineEditFields {
  const { form, line, modifiedFields } = args;
  const patch: PurchaseLineEditFields = {};

  const savedName = normText(form.product_name).toUpperCase();
  if (savedName && normText(line.product_name).toUpperCase() !== savedName) {
    patch.product_name = savedName;
  }

  const textFields: Array<{
    modifiedKey: string;
    lineKey: keyof PurchaseLineEditFields;
    next: string;
  }> = [
    { modifiedKey: "brand", lineKey: "brand", next: normText(form.brand) },
    { modifiedKey: "category", lineKey: "category", next: normText(form.category) },
    { modifiedKey: "style", lineKey: "style", next: normText(form.style) },
    { modifiedKey: "color", lineKey: "color", next: normText(form.color) },
    { modifiedKey: "hsn_code", lineKey: "hsn_code", next: normText(form.hsn_code) },
    { modifiedKey: "uom", lineKey: "uom", next: normText(form.uom) },
  ];

  for (const field of textFields) {
    if (!modifiedFields.has(field.modifiedKey)) continue;
    const current = normText(line[field.lineKey] as string | undefined);
    if (current !== field.next) {
      (patch as Record<string, string>)[field.lineKey] = field.next;
    }
  }

  if (modifiedFields.has("gst_per") || modifiedFields.has("purchase_gst_percent")) {
    const gst = modifiedFields.has("purchase_gst_percent")
      ? (form.purchase_gst_percent ?? form.gst_per)
      : form.gst_per;
    if (Number(line.gst_per) !== Number(gst)) patch.gst_per = Number(gst) || 0;
  }

  if (modifiedFields.has("default_pur_price") && Number(line.pur_price) !== Number(form.default_pur_price)) {
    patch.pur_price = Number(form.default_pur_price) || 0;
  }
  if (modifiedFields.has("default_sale_price") && Number(line.sale_price) !== Number(form.default_sale_price)) {
    patch.sale_price = Number(form.default_sale_price) || 0;
  }
  if (modifiedFields.has("default_mrp") && Number(line.mrp || 0) !== Number(form.default_mrp || 0)) {
    patch.mrp = Number(form.default_mrp) || 0;
  }

  return patch;
}
