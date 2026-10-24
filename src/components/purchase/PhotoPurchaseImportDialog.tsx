import { useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { productNameMatchKey } from "@/utils/productNameDedupe";
import { cleanProductName } from "@/utils/productNameMerge";
import {
  DEFAULT_PHOTO_MARKUP_PERCENT,
  PHOTO_IMPORT_MAX_PAGES,
  billChecks,
  billToReviewRows,
  defaultSalePrice,
  reviewRowsToImportRows,
  rowIssues,
  shrinkBillPhoto,
  type CatalogMatch,
  type PhotoReviewRow,
  type ReadBill,
} from "@/utils/purchasePhotoImport";

const MARKUP_KEY = "ezzy-photo-import-markup";
const PRODUCT_PAGE = 1000;

function readMarkup(): number {
  try {
    const n = Number(localStorage.getItem(MARKUP_KEY));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PHOTO_MARKUP_PERCENT;
  } catch {
    return DEFAULT_PHOTO_MARKUP_PERCENT;
  }
}

/** Shop products by name key, so a read line can reuse the catalog's name, brand, category and price. */
async function loadCatalogMatches(organizationId: string): Promise<Map<string, CatalogMatch>> {
  const map = new Map<string, CatalogMatch>();
  for (let from = 0; from < 100_000; from += PRODUCT_PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("product_name, brand, category, style, color, default_sale_price")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .range(from, from + PRODUCT_PAGE - 1);
    if (error) break;
    for (const p of data ?? []) {
      const key = productNameMatchKey(p.product_name);
      if (key && !map.has(key)) map.set(key, p as CatalogMatch);
    }
    if (!data || data.length < PRODUCT_PAGE) break;
  }
  return map;
}

/** Supplier name for a GSTIN printed on the bill, so the import picks the right supplier. */
async function supplierNameForGstin(organizationId: string, gstin: string): Promise<string | null> {
  const clean = gstin.replace(/\s/g, "").toUpperCase();
  if (clean.length !== 15) return null;
  const { data } = await supabase
    .from("suppliers")
    .select("supplier_name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("gst_number", clean)
    .limit(1)
    .maybeSingle();
  return data?.supplier_name ?? null;
}

type Step = "photos" | "reading" | "review";

/**
 * Purchase Entry > Photo: take or pick up to 4 photos of a supplier bill, let AI read the lines,
 * check and fix them here, then add them to the bill through the Excel import. Nothing is saved
 * until staff press Save on Purchase Entry.
 */
export function PhotoPurchaseImportDialog({
  open,
  onClose,
  organizationId,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onImport: (rows: Record<string, unknown>[]) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<string[]>([]);
  const [bill, setBill] = useState<ReadBill | null>(null);
  const [rows, setRows] = useState<PhotoReviewRow[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [otherCharges, setOtherCharges] = useState(0);
  const [markup, setMarkup] = useState(readMarkup);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setStep("photos");
    setPhotos([]);
    setBill(null);
    setRows([]);
    setSupplierName("");
    setInvoiceNo("");
    setBillDate("");
    setOtherCharges(0);
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = PHOTO_IMPORT_MAX_PAGES - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (files.length > room) toast.message(`Up to ${PHOTO_IMPORT_MAX_PAGES} photos per bill`);
    try {
      const shrunk = await Promise.all(picked.map((f) => shrinkBillPhoto(f)));
      setPhotos((prev) => [...prev, ...shrunk].slice(0, PHOTO_IMPORT_MAX_PAGES));
    } catch {
      toast.error("Could not open that photo. Try a JPEG or PNG.");
    }
  };

  const read = async () => {
    setStep("reading");
    try {
      const [{ data, error }, catalog] = await Promise.all([
        supabase.functions.invoke("read-purchase-bill", { body: { organizationId, images: photos } }),
        loadCatalogMatches(organizationId),
      ]);
      if (error || !data?.bill) {
        let message = (data as { error?: string } | null)?.error;
        const ctx = (error as { context?: Response } | null)?.context;
        if (!message && ctx && typeof ctx.json === "function") {
          message = await ctx.json().then((b: { error?: string }) => b?.error).catch(() => undefined);
        }
        throw new Error(message || error?.message || "Could not read this bill");
      }
      const readBill = data.bill as ReadBill;
      const findMatch = (name: string) => catalog.get(productNameMatchKey(cleanProductName(name))) ?? null;
      const reviewRows = billToReviewRows(readBill, findMatch, markup);
      const gstinName = readBill.supplier_gstin ? await supplierNameForGstin(organizationId, readBill.supplier_gstin) : null;
      setBill(readBill);
      setRows(reviewRows);
      setSupplierName(gstinName ?? readBill.supplier_name?.trim() ?? "");
      setInvoiceNo(readBill.invoice_no?.trim() ?? "");
      setBillDate(readBill.invoice_date?.trim() ?? "");
      setOtherCharges(Number(readBill.other_charges) || 0);
      setStep("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read this bill");
      setStep("photos");
    }
  };

  const update = (key: string, patch: Partial<PhotoReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, unclear: false } : r)));

  const applyMarkup = (value: number) => {
    setMarkup(value);
    try {
      localStorage.setItem(MARKUP_KEY, String(value));
    } catch {
      /* not remembered in a private window */
    }
    // Only new items without MRP follow the markup; matched items keep their shop price.
    setRows((prev) =>
      prev.map((r) => (r.matchedName || r.mrp > 0 ? r : { ...r, sale_price: defaultSalePrice(0, r.pur_price, value) })),
    );
  };

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        key: `n${Date.now()}`,
        product_name: "",
        brand: "",
        category: "",
        style: "",
        color: "",
        size: "",
        hsn_code: "",
        barcode: "",
        uom: "",
        qty: 1,
        pur_price: 0,
        line_total: 0,
        gst_per: 5,
        mrp: 0,
        sale_price: 0,
        unclear: false,
        matchedName: null,
      },
    ]);

  const runImport = async () => {
    const usable = rows.filter((r) => r.product_name.trim() && r.qty > 0);
    if (!usable.length) {
      toast.error("No lines to add");
      return;
    }
    setImporting(true);
    try {
      await onImport(reviewRowsToImportRows(usable, { supplierName, invoiceNo, billDate, otherCharges }));
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the lines");
    } finally {
      setImporting(false);
    }
  };

  const checks = bill ? billChecks(bill, rows, otherCharges) : [];
  const anyWarn = checks.some((c) => c.level === "warn");
  const numCell = "h-8 w-20 px-1.5 text-right tabular-nums";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className={cn("flex max-h-[92vh] flex-col gap-3", step === "review" ? "max-w-[min(96vw,1200px)]" : "max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-teal-600" /> Purchase from bill photo
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {step === "review"
              ? "Check the lines read from the photo. Fix anything in amber, then add them to the bill. Nothing is saved until you press Save."
              : `Take a clear photo of the whole supplier bill, flat and in good light. Up to ${PHOTO_IMPORT_MAX_PAGES} photos for a long bill.`}
          </p>
        </DialogHeader>

        {step !== "review" && (
          <div className="grid gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {photos.map((src, i) => (
                <div key={i} className="relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={src} alt={`Bill page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] text-white">Page {i + 1}</span>
                  {step === "photos" && (
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-700 hover:bg-white"
                      aria-label={`Remove page ${i + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {photos.length < PHOTO_IMPORT_MAX_PAGES && step === "photos" && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-teal-500 hover:text-teal-700"
                >
                  <ImagePlus className="h-6 w-6" />
                  {photos.length ? "Add page" : "Take / pick photo"}
                </button>
              )}
            </div>
            {step === "reading" && (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading the bill, this takes about 10 to 30 seconds…
              </p>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Label htmlFor="photo-supplier" className="text-xs">Supplier</Label>
                <Input id="photo-supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="no-uppercase h-9" />
              </div>
              <div>
                <Label htmlFor="photo-inv" className="text-xs">Supplier bill no</Label>
                <Input id="photo-inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label htmlFor="photo-date" className="text-xs">Bill date</Label>
                <Input id="photo-date" value={billDate} onChange={(e) => setBillDate(e.target.value)} placeholder="dd/mm/yyyy" className="h-9" />
              </div>
              <div>
                <Label htmlFor="photo-other" className="text-xs">Other charges ₹</Label>
                <Input
                  id="photo-other"
                  type="number"
                  value={otherCharges || ""}
                  onChange={(e) => setOtherCharges(Number(e.target.value) || 0)}
                  className="h-9 text-right"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {checks.map((c) => (
                <span
                  key={c.label}
                  title={c.detail}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                    c.level === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
                  )}
                >
                  {c.level === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {c.label}: {c.detail}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <Label htmlFor="photo-markup" className="text-xs">Sale price for new items without MRP: purchase +</Label>
              <Input
                id="photo-markup"
                type="number"
                min={0}
                value={markup}
                onChange={(e) => applyMarkup(Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-16 text-right"
              />
              <span>%. Items already in your shop keep their sale price.</span>
            </div>

            <div className="min-h-[200px] flex-1 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Product</th>
                    <th className="px-1 py-1.5 text-left">Size</th>
                    <th className="px-1 py-1.5 text-left">Colour</th>
                    <th className="px-1 py-1.5 text-left">HSN</th>
                    <th className="px-1 py-1.5 text-right">Qty</th>
                    <th className="px-1 py-1.5 text-right">Rate</th>
                    <th className="px-1 py-1.5 text-right">Amount</th>
                    <th className="px-1 py-1.5 text-right">GST %</th>
                    <th className="px-1 py-1.5 text-right">MRP</th>
                    <th className="px-1 py-1.5 text-right">Sale</th>
                    <th className="px-1 py-1.5 text-left">Barcode</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const issues = rowIssues(r);
                    return (
                      <tr key={r.key} className={cn(issues.length > 0 && "bg-amber-50/70")} title={issues.join(" · ") || undefined}>
                        <td className="px-2 py-1">
                          <Input value={r.product_name} onChange={(e) => update(r.key, { product_name: e.target.value, matchedName: null })} className="h-8 min-w-[220px]" />
                          <span className={cn("mt-0.5 block text-[11px]", r.matchedName ? "text-emerald-700" : "text-sky-700")}>
                            {r.matchedName ? "In your shop" : "New product"}
                            {issues.length > 0 && <span className="text-amber-700"> · {issues.join(" · ")}</span>}
                          </span>
                        </td>
                        <td className="px-1 py-1"><Input value={r.size} onChange={(e) => update(r.key, { size: e.target.value })} className="h-8 w-16 px-1.5" /></td>
                        <td className="px-1 py-1"><Input value={r.color} onChange={(e) => update(r.key, { color: e.target.value })} className="h-8 w-20 px-1.5" /></td>
                        <td className="px-1 py-1"><Input value={r.hsn_code} onChange={(e) => update(r.key, { hsn_code: e.target.value })} className="h-8 w-20 px-1.5" /></td>
                        <td className="px-1 py-1">
                          <Input
                            type="number"
                            value={r.qty || ""}
                            onChange={(e) => {
                              const qty = Number(e.target.value) || 0;
                              update(r.key, { qty, line_total: Math.round(qty * r.pur_price * 100) / 100 });
                            }}
                            className={cn(numCell, "w-16")}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number"
                            value={r.pur_price || ""}
                            onChange={(e) => {
                              const rate = Number(e.target.value) || 0;
                              update(r.key, {
                                pur_price: rate,
                                line_total: Math.round(r.qty * rate * 100) / 100,
                                ...(r.matchedName || r.mrp > 0 ? {} : { sale_price: defaultSalePrice(0, rate, markup) }),
                              });
                            }}
                            className={numCell}
                          />
                        </td>
                        <td className="px-1 py-1"><Input type="number" value={r.line_total || ""} onChange={(e) => update(r.key, { line_total: Number(e.target.value) || 0 })} className={cn(numCell, "w-24")} /></td>
                        <td className="px-1 py-1"><Input type="number" value={r.gst_per} onChange={(e) => update(r.key, { gst_per: Number(e.target.value) || 0 })} className={cn(numCell, "w-16")} /></td>
                        <td className="px-1 py-1"><Input type="number" value={r.mrp || ""} onChange={(e) => update(r.key, { mrp: Number(e.target.value) || 0 })} className={numCell} /></td>
                        <td className="px-1 py-1"><Input type="number" value={r.sale_price || ""} onChange={(e) => update(r.key, { sale_price: Number(e.target.value) || 0 })} className={numCell} /></td>
                        <td className="px-1 py-1"><Input value={r.barcode} onChange={(e) => update(r.key, { barcode: e.target.value })} placeholder="Auto" className="h-8 w-32 px-1.5" /></td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" /> Add line
            </Button>
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {step === "review" ? (
            <Button type="button" variant="ghost" onClick={() => setStep("photos")} disabled={importing}>
              Back to photos
            </Button>
          ) : (
            <span className="text-xs text-slate-500">GST is taken as the supplier billed it.</span>
          )}
          {step === "review" ? (
            <Button
              type="button"
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void runImport()}
              disabled={importing || rows.length === 0}
            >
              {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {anyWarn ? "Add anyway" : "Add"} {rows.length} lines to bill
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void read()}
              disabled={!photos.length || step === "reading"}
            >
              {step === "reading" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Read bill
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
