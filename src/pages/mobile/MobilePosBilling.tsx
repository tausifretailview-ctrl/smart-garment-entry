/**
 * Mobile POS billing — UI only. All money numbers come from usePosBilling.
 * Do not add billing math here; report Phase 1 gaps instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useQuery } from "@tanstack/react-query";
import { Search, Camera, Loader2, Minus, Plus, Trash2, X, Share2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useCustomerPoints } from "@/hooks/useCustomerPoints";
import { useSaveSale } from "@/hooks/useSaveSale";
import { usePosBilling } from "@/hooks/usePosBilling";
import { useMobileScan } from "@/contexts/MobileScanContext";
import {
  GST_TAX_TYPE_OPTIONS,
  normalizeGstTaxType,
  resolvePosDefaultTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";
import type { PosGrossBasis } from "@/lib/posBilling";
import { resolveBarcodeScanPicker } from "@/utils/barcodeMrpPicker";
import { expandBarcodeScanCandidates } from "@/utils/barcodeScanResolve";
import { MrpTierSelectionDialog, toMrpTierSelectionChoices } from "@/components/MrpTierSelectionDialog";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MixPaymentDialog } from "@/components/MixPaymentDialog";
import { MobileSalePrintPreviewDialog } from "@/components/mobile/MobileSalePrintPreviewDialog";
import { cn } from "@/lib/utils";
import { adjustQtyByStep, minQtyForUom } from "@/utils/qtyInput";
import type { PosCartItem } from "@/lib/posBilling";

/** Display-only — no arithmetic on money. */
function formatInr(amount: number): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.select();
}

const VARIANT_SEARCH_SELECT =
  "id, barcode, size, color, stock_qty, sale_price, mrp, product_id, is_dc_product, products!inner(id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, category, style, color, product_type, organization_id, sale_discount_type, sale_discount_value, status, deleted_at, uom)";

type SearchHit = {
  variant: {
    id: string;
    barcode?: string | null;
    size?: string | null;
    color?: string | null;
    stock_qty?: number | null;
    sale_price?: number | string | null;
    mrp?: number | string | null;
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
    sale_gst_percent?: number | null;
    purchase_gst_percent?: number | null;
    sale_discount_type?: string | null;
    sale_discount_value?: number | null;
  };
};

type SaveSuccess = { saleNumber: string; saleId: string; netAmount: number };

export default function MobilePosBilling() {
  const { currentOrganization } = useOrganization();
  const { data: settingsData } = useSettings();
  const { calculateRedemptionValue } = useCustomerPoints();
  const { saveSale, isSaving } = useSaveSale();
  const { openScan, registerBillingScanHandler } = useMobileScan();

  const saleSettings = (settingsData as { sale_settings?: Record<string, unknown> } | null)?.sale_settings || {};
  const purchaseSettings =
    (settingsData as { purchase_settings?: Record<string, unknown> } | null)?.purchase_settings || {};

  // Same call-site derivation as desktop POSSales — do not look up inside the hook.
  const enableMrp = purchaseSettings.show_mrp === true;
  const posBarcodeMode = saleSettings.pos_barcode_price_mode === "mrp" ? "mrp" : "sale_price";
  const grossBasis: PosGrossBasis =
    enableMrp && posBarcodeMode === "mrp" ? "mrp" : "sale_price";

  const garmentGstSettings = {
    garment_gst_rule_enabled: purchaseSettings.garment_gst_rule_enabled === true,
    garment_gst_threshold: purchaseSettings.garment_gst_threshold as number | undefined,
    garment_gst_below_rate: purchaseSettings.garment_gst_below_rate as number | undefined,
  };

  const initialTaxType = resolvePosDefaultTaxType({
    default_tax_type:
      typeof saleSettings.default_tax_type === "string" ? saleSettings.default_tax_type : undefined,
    default_pos_tax_type:
      typeof (saleSettings as { default_pos_tax_type?: string }).default_pos_tax_type === "string"
        ? (saleSettings as { default_pos_tax_type?: string }).default_pos_tax_type
        : undefined,
  });

  const billing = usePosBilling({
    grossBasis,
    garmentGstSettings,
    calculateRedemptionValue,
    initialTaxType,
  });

  const {
    items,
    taxType,
    setTaxType,
    totals,
    lastError,
    clearLastError,
    addLine,
    updateQty,
    updatePrice,
    updateDiscountPercent,
    removeLine,
    clearCart,
    buildSaleData,
  } = billing;

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [mixOpen, setMixOpen] = useState(false);
  const [success, setSuccess] = useState<SaveSuccess | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uiSaving, setUiSaving] = useState(false);
  const [mrpTierPicker, setMrpTierPicker] = useState<{
    barcode: string;
    choices: SearchHit[];
  } | null>(null);
  const saveLockRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: searchHits = [], isFetching: searchLoading } = useQuery({
    queryKey: ["mobile-pos-product-search", currentOrganization?.id, debouncedSearch],
    queryFn: async (): Promise<SearchHit[]> => {
      if (!currentOrganization?.id || debouncedSearch.length < 1) return [];
      const term = debouncedSearch;
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
        .map((row) => ({
          variant: row,
          product: row.products,
        }));
    },
    enabled: !!currentOrganization?.id && debouncedSearch.length >= 1,
    staleTime: STALE_LIVE,
  });

  const addFromHit = useCallback(
    (hit: SearchHit) => {
      const result = addLine({ product: hit.product, variant: hit.variant });
      if (result.error) {
        toast.warning(result.error.message);
      } else {
        toast.success(result.merged ? "Quantity updated" : "Added to cart", {
          description: hit.product.product_name,
        });
      }
      setSearchInput("");
      setDebouncedSearch("");
      clearLastError();
    },
    [addLine, clearLastError],
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
      if (picker.autoPick) {
        addFromHit(picker.autoPick);
      }
    },
    [addFromHit, currentOrganization?.id],
  );

  // Register Scan nav → camera → add line (context-aware; stock sheet when not registered).
  useEffect(() => {
    registerBillingScanHandler(addByBarcode);
    return () => registerBillingScanHandler(null);
  }, [addByBarcode, registerBillingScanHandler]);

  // Open camera when arriving with ?scan=1 (nav Scan from other hubs).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scan") === "1") {
      openScan();
      params.delete("scan");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [openScan]);

  // Block hardware back while saving.
  useEffect(() => {
    if (!uiSaving || !Capacitor.isNativePlatform()) return;
    let sub: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener("backButton", (ev) => {
      ev.canGoBack; // keep listener signature used
      // Swallow back while save in flight — no navigation.
    }).then((s) => {
      sub = s;
    });
    return () => {
      void sub?.remove();
    };
  }, [uiSaving]);

  // Soft-block browser/history back while saving.
  useEffect(() => {
    if (!uiSaving) return;
    const onPop = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [uiSaving]);

  const saving = uiSaving || isSaving;

  const runSave = async (
    method: "cash" | "card" | "upi" | "multiple" | "pay_later",
    breakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    },
  ) => {
    if (saveLockRef.current || saving) return;
    if (items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    saveLockRef.current = true;
    setUiSaving(true);
    setSaveError(null);
    setPaymentOpen(false);
    setMixOpen(false);

    try {
      const saleData = buildSaleData({
        customerName: "Walk in Customer",
        customerId: null,
        customerPhone: null,
      });
      const result = await saveSale(saleData, method, breakdown, "pos");
      if (!result) {
        setSaveError("Save did not complete. No automatic retry — tap Pay again when ready.");
        return;
      }
      clearCart();
      setPreviewOpen(false);
      setSuccess({
        saleNumber: result.sale_number || "",
        saleId: result.id,
        netAmount: Number(result.net_amount) || totals.finalAmount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network or server error";
      setSaveError(`${message}. No automatic retry — you decide when to try again.`);
    } finally {
      saveLockRef.current = false;
      setUiSaving(false);
    }
  };

  const editItem: PosCartItem | null =
    editIndex != null && editIndex >= 0 && editIndex < items.length ? items[editIndex] : null;

  if (success) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background safe-area-pt">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-600" />
          <div>
            <p className="text-sm text-muted-foreground">Bill saved</p>
            <p className="text-xl font-bold tabular-nums">{success.saleNumber}</p>
            <p className="mt-2 text-3xl font-black tabular-nums tracking-tight">
              ₹{formatInr(success.netAmount)}
            </p>
          </div>
          <Button
            className="h-12 w-full max-w-sm text-base font-semibold"
            onClick={() => {
              setPreviewOpen(false);
              setSuccess(null);
              setSaveError(null);
              searchInputRef.current?.focus();
            }}
          >
            New Bill
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full max-w-sm"
            onClick={() => setPreviewOpen(true)}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Download / Share Invoice
          </Button>
        </div>
        <MobileSalePrintPreviewDialog
          saleId={success.saleId}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Saving overlay — blocks interaction + swipe-back UX */}
      {saving && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium">Saving bill…</p>
          <p className="text-xs text-muted-foreground">Please wait — do not go back</p>
        </div>
      )}

      {/* Top — sticky search */}
      <div className="shrink-0 border-b border-border bg-background px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
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
              const mrp = Number(hit.variant.mrp) || 0;
              const stock = Number(hit.variant.stock_qty) || 0;
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
                      {" · "}Stock {stock}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {mrp > 0 && mrp !== salePrice && (
                      <p className="text-xs text-muted-foreground line-through">MRP: ₹{formatInr(mrp)}</p>
                    )}
                    <p className="text-sm font-semibold tabular-nums">₹{formatInr(salePrice)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Middle — scroll cart */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-2">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs">Search or tap Scan to add products</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-4">
            {items.map((item, index) => (
              <li key={`${item.id}-${index}`}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-card p-3 text-left active:bg-muted/40"
                  onClick={() => setEditIndex(index)}
                  disabled={saving}
                >
                  <p className="text-sm font-semibold leading-snug">{item.productName}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Qty {item.quantity} · ₹{formatInr(item.unitCost)}
                    </p>
                    <p className="text-base font-bold tabular-nums whitespace-nowrap">
                      ₹{formatInr(item.netAmount)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bottom — sticky footer above OwnerBottomNav + gesture bar */}
      <div
        className={cn(
          "shrink-0 border-t border-border bg-background px-3 pt-2",
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.5rem)]",
        )}
      >
        {(lastError?.code === "DISCOUNT_CAP" || totals.flatDiscountCapped) && (
          <p className="mb-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {lastError?.code === "DISCOUNT_CAP"
              ? lastError.message
              : "Bill discount was capped at the maximum allowed for this gross."}
          </p>
        )}
        {saveError && (
          <p className="mb-1.5 text-xs font-medium text-destructive">{saveError}</p>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {totals.quantity} item{totals.quantity === 1 ? "" : "s"}
            </p>
            <p className="text-3xl font-black leading-none tabular-nums tracking-tight whitespace-nowrap">
              ₹{formatInr(totals.finalAmount)}
            </p>
          </div>
          <Button
            className="h-12 min-w-[8.5rem] shrink-0 px-5 text-base font-semibold"
            disabled={items.length === 0 || saving}
            onClick={() => {
              setSaveError(null);
              setPaymentOpen(true);
            }}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Pay"}
          </Button>
        </div>
      </div>

      {/* Line edit sheet */}
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
                {editItem?.productName || "Edit line"}
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
                    onClick={() => {
                      const next = adjustQtyByStep(editItem.quantity, -1, editItem.uom);
                      const r = updateQty(editIndex, next);
                      if (r.error) toast.warning(r.error.message);
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-11 text-center text-base tabular-nums"
                    defaultValue={String(editItem.quantity)}
                    key={`qty-${editIndex}-${editItem.quantity}`}
                    onFocus={selectOnFocus}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      const r = updateQty(editIndex, Math.max(minQtyForUom(editItem.uom), v));
                      if (r.error) toast.warning(r.error.message);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => {
                      const next = adjustQtyByStep(editItem.quantity, 1, editItem.uom);
                      const r = updateQty(editIndex, next);
                      if (r.error) toast.warning(r.error.message);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Unit price</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 h-11 text-base tabular-nums"
                  defaultValue={String(editItem.unitCost)}
                  key={`unit-${editIndex}-${editItem.unitCost}`}
                  onFocus={selectOnFocus}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    const r = updatePrice(editIndex, v);
                    if (r.error) toast.warning(r.error.message);
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Line discount %</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="mt-1 h-11 text-base tabular-nums"
                  defaultValue={String(editItem.discountPercent || 0)}
                  key={`disc-${editIndex}-${editItem.discountPercent}`}
                  onFocus={selectOnFocus}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    const r = updateDiscountPercent(editIndex, v);
                    if (r.error) toast.warning(r.error.message);
                  }}
                />
              </div>
              <p className="text-sm font-semibold tabular-nums">
                Line total: ₹{formatInr(editItem.netAmount)}
              </p>
              <Button
                variant="destructive"
                className="h-11 w-full"
                onClick={() => {
                  removeLine(editIndex);
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

      {/* Payment sheet */}
      <Drawer open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DrawerContent className="max-h-[90dvh] px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <DrawerHeader className="px-0">
            <DrawerTitle>Payment</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto pb-2">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Net total</p>
              <p className="text-3xl font-black tabular-nums whitespace-nowrap">
                ₹{formatInr(totals.finalAmount)}
              </p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">GST type</Label>
              <Select
                value={taxType}
                onValueChange={(v) => setTaxType(normalizeGstTaxType(v) as GstTaxType)}
              >
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_TAX_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["cash", "Cash"],
                  ["upi", "UPI"],
                  ["card", "Card"],
                  ["pay_later", "Pay later"],
                ] as const
              ).map(([method, label]) => (
                <Button
                  key={method}
                  className="h-12"
                  disabled={saving || items.length === 0}
                  onClick={() => void runSave(method)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              className="h-12 w-full"
              disabled={saving || items.length === 0}
              onClick={() => {
                setPaymentOpen(false);
                setMixOpen(true);
              }}
            >
              Mix (Cash / UPI / Card split)
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <MixPaymentDialog
        open={mixOpen}
        onOpenChange={setMixOpen}
        billAmount={totals.finalAmount}
        creditApplied={billing.creditApplied}
        onSave={(paymentData) => {
          void runSave("multiple", {
            cashAmount: paymentData.cashAmount,
            cardAmount: paymentData.cardAmount,
            upiAmount: paymentData.upiAmount,
            totalPaid: paymentData.totalPaid,
            refundAmount: paymentData.refundAmount,
          });
        }}
      />

      <MrpTierSelectionDialog
        open={mrpTierPicker != null}
        enableMrp={enableMrp}
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
    </div>
  );
}
