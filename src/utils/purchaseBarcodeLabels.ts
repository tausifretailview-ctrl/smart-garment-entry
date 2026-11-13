/**
 * Labels handed from Purchase Entry to the Barcode Printing screen, one entry per bill line.
 * The toolbar Print Barcodes button and the "Bill Saved" dialog's Print All / Print New Only
 * built this list three times by hand (Plan Phase 4).
 */
import { resolveLabelPurchaseBillDate } from "@/utils/purchaseCodeEncoder";

export type PurchaseLabelSourceLine = {
  sku_id: string;
  product_name?: string | null;
  brand?: string | null;
  category?: string | null;
  color?: string | null;
  style?: string | null;
  size: string;
  sale_price: number;
  mrp?: number;
  pur_price: number;
  barcode: string;
  qty: number;
};

export function buildPurchaseBarcodeLabels(
  items: PurchaseLabelSourceLine[],
  opts: {
    /** Software bill number ("" when none yet). */
    billNumber: string | null | undefined;
    /** The bill's date on screen, yyyy-MM-dd. */
    screenBillDate: string;
    /** Date stored on the saved bill (wins over the screen date), or null. */
    savedInvoiceDate: string | null | undefined;
    supplierCode: string;
  },
) {
  const billDate =
    resolveLabelPurchaseBillDate({ savedInvoiceDate: opts.savedInvoiceDate, itemBillDate: opts.screenBillDate }) ??
    opts.screenBillDate;
  return items.map((item) => ({
    sku_id: item.sku_id,
    product_name: item.product_name || "",
    brand: item.brand || "",
    category: item.category || "",
    color: item.color || "",
    style: item.style || "",
    size: item.size,
    sale_price: item.sale_price,
    mrp: item.mrp,
    pur_price: item.pur_price,
    barcode: item.barcode,
    qty: item.qty,
    bill_number: opts.billNumber || "",
    bill_date: billDate,
    supplier_code: opts.supplierCode,
  }));
}

/** Labels a list of lines will print (sum of qty). */
export function purchaseLabelCount(items: Array<{ qty: number }>): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}
