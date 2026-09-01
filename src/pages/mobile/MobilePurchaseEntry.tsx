/**
 * Mobile purchase bill entry — easy-entry UI.
 * Totals come from computePurchaseBillTotals (same as desktop PurchaseEntry).
 * Save is supabase.rpc("save_purchase_bill_with_items_atomic") only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, CheckCircle2, Loader2, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useMobileScan } from "@/contexts/MobileScanContext";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AdaptiveSupplierPicker,
  type SupplierPickerOption,
} from "@/components/mobile/AdaptiveSupplierPicker";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";
import { cn } from "@/lib/utils";
import { expandBarcodeScanCandidates } from "@/utils/barcodeScanResolve";
import { resolveBarcodeScanPicker } from "@/utils/barcodeMrpPicker";
import { MrpTierSelectionDialog, toMrpTierSelectionChoices } from "@/components/MrpTierSelectionDialog";
import { computePurchaseBillTotals } from "@/utils/excelImportUtils";
import {
  buildMobilePurchaseRpcPayload,
  mobilePurchaseLineTotal,
  parsePurchaseAtomicSaveError,
  prefillPurchasePrice,
  validateMobilePurchaseBeforeSave,
  type MobilePurchaseLine,
} from "@/utils/mobilePurchaseSave";
import {
  clearMobilePurchaseDraft,
  draftHasWork,
  readMobilePurchaseDraft,
  writeMobilePurchaseDraft,
} from "@/utils/mobilePurchaseDraft";

function formatInr(amount: number): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.select();
}

const VARIANT_SEARCH_SELECT =
  "id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, last_purchase_pur_price, product_id, is_dc_product, products!inner(id, product_name, brand, hsn_code, gst_per, purchase_gst_percent, sale_gst_percent, default_pur_price, category, style, color, product_type, organization_id, status, deleted_at, uom)";

type SearchHit = {
  variant: {
    id: string;
    barcode?: string | null;
    size?: string | null;
    color?: string | null;
    stock_qty?: number | null;
    sale_price?: number | string | null;
    mrp?: number | string | null;
    pur_price?: number | string | null;
    last_purchase_pur_price?: number | string | null;
    is_dc_product?: boolean | null;
  };
  product: {
    id: string;
    product_name: string;
    brand?: string | null;
    category?: string | null;
    style?: string | null;
    color?: string | null;
    hsn_code?: string | null;
    product_type?: string | null;
    uom?: string | null;
    gst_per?: number | null;
    purchase_gst_percent?: number | null;
    sale_gst_percent?: number | null;
    default_pur_price?: number | string | null;
  };
};

type SaveSuccess = {
  billNumber: string;
  billId: string;
  netAmount: number;
  itemCount: number;
};

function todayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function MobilePurchaseEntry() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { openScan, registerBillingScanHandler } = useMobileScan();
  const queryClient = useQueryClient();

  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(todayYmd);
  const [isDcPurchase, setIsDcPurchase] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<MobilePurchaseLine[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [success, setSuccess] = useState<SaveSuccess | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uiSaving, setUiSaving] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [mrpTierPicker, setMrpTierPicker] = useState<{ barcode: string; choices: SearchHit[] } | null>(
    null,
  );

  const saveLockRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSupplierSearch(supplierSearchTerm.trim()), 280);
    return () => window.clearTimeout(t);
  }, [supplierSearchTerm]);

  useEffect(() => {
    if (!currentOrganization?.id || !user?.id) return;
    const existing = readMobilePurchaseDraft(localStorage, currentOrganization.id, user.id);
    if (existing && draftHasWork(existing)) {
      setDraftSavedAt(existing.savedAt);
      setShowDraftDialog(true);
    }
  }, [currentOrganization?.id, user?.id]);

  const persistDraft = useCallback(() => {
    if (!currentOrganization?.id || !user?.id) return;
    const snapshot = {
      supplierId,
      supplierName,
      supplierInvoiceNo,
      billDate,
      isDcPurchase,
      discountAmount,
      otherCharges,
      items: itemsRef.current,
      savedAt: Date.now(),
    };
    if (!draftHasWork(snapshot)) return;
    writeMobilePurchaseDraft(localStorage, currentOrganization.id, user.id, snapshot);
  }, [
    currentOrganization?.id,
    user?.id,
    supplierId,
    supplierName,
    supplierInvoiceNo,
    billDate,
    isDcPurchase,
    discountAmount,
    otherCharges,
  ]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persistDraft();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persistDraft]);

  const { data: supplierOptions = [] } = useQuery({
    queryKey: ["mobile-purchase-suppliers", currentOrganization?.id, debouncedSupplierSearch],
    queryFn: async (): Promise<SupplierPickerOption[]> => {
      if (!currentOrganization?.id) return [];
      const escaped = debouncedSupplierSearch.replace(/[%_,]/g, "");
      let query = supabase
        .from("suppliers")
        .select("id, supplier_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("supplier_name")
        .limit(50);
      if (escaped.length >= 1) {
        query = query.or(`supplier_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        supplier_name: row.supplier_name,
        phone: row.phone,
      }));
    },
    enabled: !!currentOrganization?.id && supplierPickerOpen,
    staleTime: STALE_LIVE,
  });

  const { data: searchHits = [], isFetching: searchLoading } = useQuery({
    queryKey: ["mobile-purchase-product-search", currentOrganization?.id, debouncedSearch],
    queryFn: async (): Promise<SearchHit[]> => {
      if (!currentOrganization?.id || debouncedSearch.length < 1) return [];
      const term = debouncedSearch.replace(/[%_,]/g, "");
      const { data, error } = await supabase
        .from("product_variants")
        .select(VARIANT_SEARCH_SELECT)
        .eq("organization_id", currentOrganization.id)
        .eq("products.organization_id", currentOrganization.id)
        .eq("products.status", "active")
        .eq("active", true)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .or(`barcode.ilike.%${term}%,products.product_name.ilike.%${term}%`)
        .order("stock_qty", { ascending: false })
        .limit(20);
      if (error) throw error;
      return ((data || []) as unknown as Array<SearchHit["variant"] & { products: SearchHit["product"] }>)
        .filter((row) => row.products)
        .map((row) => ({ variant: row, product: row.products }));
    },
    enabled: !!currentOrganization?.id && debouncedSearch.length >= 1,
    staleTime: STALE_LIVE,
  });

  const addFromHit = useCallback(
    (hit: SearchHit) => {
      const gst = isDcPurchase
        ? 0
        : Number(hit.product.purchase_gst_percent || hit.product.gst_per) || 0;
      const pur = prefillPurchasePrice({
        pur_price: hit.variant.pur_price,
        last_purchase_pur_price: hit.variant.last_purchase_pur_price,
        default_pur_price: hit.product.default_pur_price,
      });
      const sale = Number(hit.variant.sale_price) || 0;
      const mrp = Number(hit.variant.mrp) || sale;
      setItems((prev) => {
        const existing = prev.findIndex((row) => row.sku_id === hit.variant.id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], qty: next[existing].qty + 1 };
          return next;
        }
        return [
          ...prev,
          {
            temp_id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            product_id: hit.product.id,
            sku_id: hit.variant.id,
            product_name: hit.product.product_name,
            size: hit.variant.size || "",
            qty: 1,
            pur_price: pur,
            sale_price: sale,
            mrp,
            gst_per: gst,
            hsn_code: hit.product.hsn_code || "",
            barcode: hit.variant.barcode || "",
            brand: hit.product.brand || "",
            category: hit.product.category || "",
            color: hit.variant.color || hit.product.color || "",
            style: hit.product.style || "",
            uom: hit.product.uom || "NOS",
          },
        ];
      });
      toast.success("Added", { description: hit.product.product_name });
      setSearchInput("");
      setDebouncedSearch("");
    },
    [isDcPurchase],
  );

  const addByBarcode = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      if (!code || !currentOrganization?.id) return;
      const orgId = currentOrganization.id;
      const rows: Array<SearchHit["variant"] & { products: SearchHit["product"] }> = [];
      const seenVariantIds = new Set<string>();

      for (const candidate of expandBarcodeScanCandidates(code)) {
        const { data, error } = await supabase
          .from("product_variants")
          .select(VARIANT_SEARCH_SELECT)
          .eq("organization_id", orgId)
          .eq("products.organization_id", orgId)
          .eq("products.status", "active")
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .eq("barcode", candidate)
          .order("stock_qty", { ascending: false })
          .limit(50);
        if (error) {
          toast.error("Scan failed", { description: error.message });
          return;
        }
        for (const row of (data || []) as unknown as Array<
          SearchHit["variant"] & { products: SearchHit["product"] }
        >) {
          if (!row.products || seenVariantIds.has(row.id)) continue;
          seenVariantIds.add(row.id);
          rows.push(row);
        }
      }

      if (rows.length === 0) {
        toast.error("Not found", { description: `No product for barcode ${code}` });
        return;
      }
      if (rows.length === 1) {
        addFromHit({ variant: rows[0], product: rows[0].products });
        return;
      }
      const hits = rows.map((row) => ({ variant: row, product: row.products }));
      const picker = resolveBarcodeScanPicker(hits, (m) => Number(m.variant.stock_qty) > 0);
      if (picker.showMrpDialog) {
        setMrpTierPicker({ barcode: code, choices: picker.mrpDialogChoices });
        setSearchInput("");
        setDebouncedSearch("");
        return;
      }
      if (picker.showProductPicker) {
        setSearchInput(code);
        setDebouncedSearch(code);
        toast.message("Multiple products share this barcode", {
          description: "Pick the correct product from the list.",
        });
        return;
      }
      if (picker.autoPick) addFromHit(picker.autoPick);
    },
    [addFromHit, currentOrganization?.id],
  );

  useEffect(() => {
    if (!isDcPurchase) return;
    setItems((prev) =>
      prev.some((row) => row.gst_per > 0) ? prev.map((row) => ({ ...row, gst_per: 0 })) : prev,
    );
  }, [isDcPurchase]);

  useEffect(() => {
    registerBillingScanHandler(addByBarcode);
    return () => registerBillingScanHandler(null);
  }, [addByBarcode, registerBillingScanHandler]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scan") === "1") {
      openScan();
      params.delete("scan");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [openScan]);

  const totals = useMemo(
    () =>
      computePurchaseBillTotals(
        items.map((item) => ({
          line_total: mobilePurchaseLineTotal(item),
          gst_per: isDcPurchase ? 0 : Math.round(Number(item.gst_per) || 0),
          qty: Number(item.qty) || 0,
          pur_price: Number(item.pur_price) || 0,
          uom: item.uom,
          size: item.size,
          discount_percent: 0,
        })),
        Number(discountAmount) || 0,
        Number(otherCharges) || 0,
        isDcPurchase,
      ),
    [items, discountAmount, otherCharges, isDcPurchase],
  );

  const resetBill = useCallback(() => {
    setSupplierId(null);
    setSupplierName("");
    setSupplierInvoiceNo("");
    setBillDate(todayYmd());
    setIsDcPurchase(false);
    setDiscountAmount(0);
    setOtherCharges(0);
    setItems([]);
    setSuccess(null);
    setSaveError(null);
    setEditIndex(null);
  }, []);

  const applyDraft = () => {
    if (!currentOrganization?.id || !user?.id) return;
    const existing = readMobilePurchaseDraft(localStorage, currentOrganization.id, user.id);
    if (!existing) return;
    setSupplierId(existing.supplierId);
    setSupplierName(existing.supplierName);
    setSupplierInvoiceNo(existing.supplierInvoiceNo);
    setBillDate(existing.billDate || todayYmd());
    setIsDcPurchase(existing.isDcPurchase);
    setDiscountAmount(Number(existing.discountAmount) || 0);
    setOtherCharges(Number(existing.otherCharges) || 0);
    setItems(existing.items || []);
  };

  const discardDraft = () => {
    if (!currentOrganization?.id || !user?.id) return;
    clearMobilePurchaseDraft(localStorage, currentOrganization.id, user.id);
  };

  const saving = uiSaving;

  useEffect(() => {
    if (!saving || !Capacitor.isNativePlatform()) return;
    let sub: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener("backButton", (ev) => {
      ev.canGoBack;
    }).then((s) => {
      sub = s;
    });
    return () => {
      void sub?.remove();
    };
  }, [saving]);

  const runSave = async () => {
    if (saveLockRef.current || saving) return;
    const fields = {
      supplierId,
      supplierName,
      supplierInvoiceNo,
      billDate,
      isDcPurchase,
      discountAmount,
      otherCharges,
    };
    const invalid = validateMobilePurchaseBeforeSave(fields, items);
    if (invalid) {
      setSaveError(invalid);
      toast.error(invalid);
      return;
    }
    if (!currentOrganization?.id) {
      toast.error("No organization");
      return;
    }
    saveLockRef.current = true;
    setUiSaving(true);
    setSaveError(null);
    try {
      const { p_bill, p_items } = buildMobilePurchaseRpcPayload(fields, items);
      const { data, error } = await supabase.rpc("save_purchase_bill_with_items_atomic", {
        p_organization_id: currentOrganization.id,
        p_bill: p_bill as Json,
        p_items: p_items as Json,
      });
      if (error) throw error;
      const row = (data || {}) as {
        id?: string;
        software_bill_no?: string;
        net_amount?: number;
      };
      if (user?.id) {
        clearMobilePurchaseDraft(localStorage, currentOrganization.id, user.id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owner-purchase-dash"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-purchase-items"] }),
        queryClient.invalidateQueries({ queryKey: ["rpt-daily-purchase"] }),
        queryClient.invalidateQueries({ queryKey: ["rpt-stock-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-stock-product-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-stock-status-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["owner-stock-product-pages"] }),
        queryClient.invalidateQueries({ queryKey: ["rpt-stock-report-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["rpt-stock-report-rows"] }),
      ]);
      setItems([]);
      setSuccess({
        billNumber: row.software_bill_no || "",
        billId: row.id || "",
        netAmount: Number(row.net_amount) || totals.netAmount,
        itemCount: p_items.length,
      });
    } catch (err) {
      const message = parsePurchaseAtomicSaveError(
        err && typeof err === "object" && "message" in err ? (err as { message: string }).message : err,
      );
      setSaveError(message);
      toast.error(message);
    } finally {
      saveLockRef.current = false;
      setUiSaving(false);
    }
  };

  const editItem = editIndex != null && editIndex >= 0 && editIndex < items.length ? items[editIndex] : null;

  const updateEdit = (patch: Partial<MobilePurchaseLine>) => {
    if (editIndex == null) return;
    setItems((prev) => prev.map((row, i) => (i === editIndex ? { ...row, ...patch } : row)));
  };

  if (success) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background safe-area-pt">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-600" />
          <div>
            <p className="text-sm text-muted-foreground">Purchase bill saved</p>
            <p className="text-xl font-bold tabular-nums">{success.billNumber}</p>
            <p className="mt-2 text-3xl font-black tabular-nums tracking-tight">
              ₹{formatInr(success.netAmount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {success.itemCount} line{success.itemCount === 1 ? "" : "s"}
            </p>
          </div>
          <Button className="h-12 w-full max-w-sm text-base font-semibold" onClick={resetBill}>
            New Bill
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {saving && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium">Saving purchase bill…</p>
          <p className="text-xs text-muted-foreground">Please wait — do not go back</p>
        </div>
      )}

      <div className="shrink-0 border-b border-border bg-background px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <AdaptiveSupplierPicker
          open={supplierPickerOpen}
          onOpenChange={setSupplierPickerOpen}
          selectedId={supplierId}
          selectedLabel={supplierName}
          placeholder="Supplier"
          searchTerm={supplierSearchTerm}
          onSearchTermChange={setSupplierSearchTerm}
          options={supplierOptions}
          onSelect={(s) => {
            setSupplierId(s.id);
            setSupplierName(s.supplier_name);
            setSupplierPickerOpen(false);
            setSupplierSearchTerm("");
          }}
          onUseTypedName={(name) => {
            setSupplierId(null);
            setSupplierName(name);
          }}
          emptyMessage="No supplier found"
          triggerClassName="h-11"
        />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">Bill date</Label>
            <Input
              type="date"
              className="mt-0.5 h-10 text-sm"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Supplier invoice</Label>
            <Input
              className="mt-0.5 h-10 text-sm"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              placeholder="Auto if blank"
              disabled={saving}
            />
          </div>
        </div>

        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isDcPurchase}
            onChange={(e) => setIsDcPurchase(e.target.checked)}
            disabled={saving}
          />
          DC purchase (no GST)
        </label>

        <div className="mt-2 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={selectOnFocus}
              placeholder="Search name or barcode"
              className="h-11 pl-9 pr-3 text-base"
              inputMode="search"
              autoComplete="off"
              disabled={saving}
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-11 w-11 shrink-0"
            onClick={openScan}
            disabled={saving}
            aria-label="Scan barcode"
          >
            <Camera className="h-5 w-5" />
          </Button>
        </div>

        {debouncedSearch.length >= 1 && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
            {searchLoading && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}
            {!searchLoading && searchHits.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted-foreground">No products found</p>
            )}
            {searchHits.map((hit) => {
              const salePrice = Number(hit.variant.sale_price) || 0;
              const pur = prefillPurchasePrice({
                pur_price: hit.variant.pur_price,
                last_purchase_pur_price: hit.variant.last_purchase_pur_price,
                default_pur_price: hit.product.default_pur_price,
              });
              return (
                <button
                  key={hit.variant.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 text-left last:border-0 active:bg-muted/60"
                  onClick={() => addFromHit(hit)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{hit.product.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {hit.variant.barcode || "—"}
                      {hit.variant.size ? ` · ${hit.variant.size}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Pur ₹{formatInr(pur)}</p>
                    <p className="text-sm font-semibold tabular-nums">₹{formatInr(salePrice)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-2">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <p className="text-sm font-medium">No items yet</p>
            <p className="text-xs">Search or scan to add products</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-4">
            {items.map((item, index) => (
              <li key={item.temp_id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-card p-3 text-left active:bg-muted/40"
                  onClick={() => setEditIndex(index)}
                  disabled={saving}
                >
                  <p className="truncate text-sm font-semibold">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.size ? `Size ${item.size} · ` : ""}Qty {item.qty} · ₹{formatInr(item.pur_price)}
                  </p>
                  <p className="mt-1 text-base font-bold tabular-nums">₹{formatInr(mobilePurchaseLineTotal(item))}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className={cn(
          "shrink-0 border-t border-border bg-background px-3 pt-2",
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.5rem)]",
        )}
      >
        {saveError && <p className="mb-1.5 text-xs font-medium text-destructive">{saveError}</p>}
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">Discount</Label>
            <Input
              className="mt-0.5 h-10 text-sm tabular-nums"
              inputMode="decimal"
              value={String(discountAmount || "")}
              onFocus={selectOnFocus}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              disabled={saving}
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Other charges</Label>
            <Input
              className="mt-0.5 h-10 text-sm tabular-nums"
              inputMode="decimal"
              value={String(otherCharges || "")}
              onFocus={selectOnFocus}
              onChange={(e) => setOtherCharges(Number(e.target.value) || 0)}
              disabled={saving}
            />
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {items.length} line{items.length === 1 ? "" : "s"}
              {!isDcPurchase && totals.gstAmount > 0 ? ` · GST ₹${formatInr(totals.gstAmount)}` : ""}
            </p>
            <p className="text-3xl font-black leading-none tabular-nums tracking-tight whitespace-nowrap">
              ₹{formatInr(totals.netAmount)}
            </p>
          </div>
          <Button
            className="h-12 min-w-[8.5rem] shrink-0 px-5 text-base font-semibold"
            disabled={items.length === 0 || saving}
            onClick={() => void runSave()}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      <Drawer
        open={editItem != null}
        onOpenChange={(open) => {
          if (!open) setEditIndex(null);
        }}
      >
        <DrawerContent className="max-h-[90dvh] px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <DrawerHeader className="px-0 pb-2">
            <div className="flex items-start justify-between gap-2">
              <DrawerTitle className="text-left text-base leading-snug">
                {editItem?.product_name || "Edit line"}
              </DrawerTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditIndex(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DrawerHeader>
          {editItem != null && editIndex != null && (
            <div className="space-y-4 overflow-y-auto pb-2">
              <div>
                <Label className="text-xs text-muted-foreground">Quantity</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => updateEdit({ qty: Math.max(1, editItem.qty - 1) })}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-11 text-center text-base tabular-nums"
                    defaultValue={String(editItem.qty)}
                    key={`qty-${editIndex}-${editItem.qty}`}
                    onFocus={selectOnFocus}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      updateEdit({ qty: Math.max(0, v) });
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => updateEdit({ qty: editItem.qty + 1 })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(
                [
                  ["pur_price", "Purchase price"],
                  ["sale_price", "Sale price"],
                  ["mrp", "MRP"],
                  ["gst_per", "GST %"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 h-11 text-base tabular-nums"
                    defaultValue={String(editItem[key] || 0)}
                    key={`${key}-${editIndex}-${editItem[key]}`}
                    onFocus={selectOnFocus}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      updateEdit({ [key]: v });
                    }}
                    disabled={key === "gst_per" && isDcPurchase}
                  />
                </div>
              ))}
              <p className="text-sm font-semibold tabular-nums">
                Line total: ₹{formatInr(mobilePurchaseLineTotal(editItem))}
              </p>
              <Button
                variant="destructive"
                className="h-11 w-full"
                onClick={() => {
                  setItems((prev) => prev.filter((_, i) => i !== editIndex));
                  setEditIndex(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete line
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <MrpTierSelectionDialog
        open={mrpTierPicker != null}
        enableMrp
        onOpenChange={(open) => {
          if (!open) setMrpTierPicker(null);
        }}
        barcode={mrpTierPicker?.barcode ?? ""}
        choices={toMrpTierSelectionChoices(mrpTierPicker?.choices ?? [])}
        onSelect={(choiceId) => {
          const pick = mrpTierPicker?.choices.find((c) => c.variant.id === choiceId);
          setMrpTierPicker(null);
          if (pick) addFromHit(pick);
        }}
      />

      <DraftResumeDialog
        open={showDraftDialog}
        onOpenChange={setShowDraftDialog}
        draftType="purchase"
        lastSaved={draftSavedAt ? new Date(draftSavedAt) : undefined}
        onResume={() => {
          applyDraft();
          setShowDraftDialog(false);
        }}
        onStartFresh={() => {
          discardDraft();
          setShowDraftDialog(false);
        }}
      />
    </div>
  );
}
