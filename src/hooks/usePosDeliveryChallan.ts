import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReactToPrint } from "react-to-print";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useStockValidation } from "@/hooks/useStockValidation";
import { computePosFlatDiscount } from "@/utils/posGstTotals";
import { saleDateIsoIst, saleDateIsoIstForDay } from "@/lib/localDayBounds";

export type PosDcLastBillHint = {
  invoiceNumber: string;
  qty: number;
  amount: number;
} | null;

function buildSearchResult(variant: any, product: any) {
  return {
    variant,
    product,
    label: `${product.product_name}${variant.size ? " | " + variant.size : ""}${variant.color ? " | " + variant.color : ""}`,
    stock: variant.stock_qty || 0,
    mrp: variant.mrp || 0,
    salePrice: variant.sale_price || variant.mrp || 0,
    barcode: variant.barcode || "",
    brand: product.brand || "",
  };
}

function searchInProducts(productsData: any[], term: string) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  const terms = t.split(/\s+/);
  const results: any[] = [];
  for (const product of productsData) {
    for (const v of product.product_variants || []) {
      const barcode = (v.barcode || "").toLowerCase();
      const searchStr =
        `${product.product_name} ${product.brand || ""} ${v.size || ""} ${v.color || ""} ${barcode}`.toLowerCase();
      const barcodeMatch = barcode.startsWith(t) || barcode.includes(t);
      const textMatch = terms.every((part) => searchStr.includes(part));
      if (barcodeMatch || textMatch) {
        results.push(buildSearchResult(v, product));
      }
      if (results.length >= 30) break;
    }
    if (results.length >= 30) break;
  }
  return results;
}

export interface PosDCItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  originalMrp: number | null;
  hsnCode?: string;
  productType?: string;
  stockQty: number;
}

const DC_PRICE_MATCH_EPSILON = 0.005;

function dcPricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < DC_PRICE_MATCH_EPSILON;
}

function resolveServiceVariantDefaultMrp(variant: {
  sale_price?: number | string | null;
  mrp?: number | string | null;
}): number {
  const salePrice = parseFloat(String(variant.sale_price || 0)) || 0;
  const rawMrp = variant.mrp ? parseFloat(String(variant.mrp)) : 0;
  return rawMrp > 0 ? rawMrp : salePrice;
}

function findDcServiceMergeIndex(
  items: PosDCItem[],
  params: { barcode: string; variantId: string; mrp: number; unitCost: number },
): number {
  const code = (params.barcode || "").trim();
  if (!code || !params.variantId) return -1;
  return items.findIndex(
    (item) =>
      item.productType === "service" &&
      (item.barcode || "").trim() === code &&
      item.variantId === params.variantId &&
      dcPricesMatch(item.mrp, params.mrp) &&
      dcPricesMatch(item.unitCost, params.unitCost),
  );
}

export type PosDCPaymentMethod = "cash" | "upi" | "card" | "pay_later";

export function usePosDeliveryChallan(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { checkStock } = useStockValidation();
  const { data: orgSettings } = useSettings();

  const [items, setItems] = useState<PosDCItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [flatDiscountMode, setFlatDiscountMode] = useState<"percent" | "amount">("percent");
  const [flatDiscountValue, setFlatDiscountValue] = useState<number>(0);
  const [srAdjust, setSrAdjust] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PosDCPaymentMethod>("cash");
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [lastBillHint, setLastBillHint] = useState<PosDcLastBillHint>(null);
  const [isSavingDC, setIsSavingDC] = useState(false);
  const [dcNumber, setDcNumber] = useState("");
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef(0);
  const printRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<any[]>([]);
  const showDropdownRef = useRef(false);
  const selectedIndexRef = useRef(-1);
  const lastSavedPrintRef = useRef<any>(null);
  const [hasSavedForReprint, setHasSavedForReprint] = useState(false);
  const [dcInvoiceDate, setDcInvoiceDate] = useState(() => new Date());
  const [showQuickServiceDialog, setShowQuickServiceDialog] = useState(false);
  const [quickServiceCode, setQuickServiceCode] = useState("");
  const [quickServiceDialogDefaultMrp, setQuickServiceDialogDefaultMrp] = useState<number | undefined>();
  const [quickServiceProductForAdd, setQuickServiceProductForAdd] = useState<{
    product: any;
    variant: any;
  } | null>(null);

  const posAllowDateChange =
    (orgSettings as any)?.sale_settings?.pos_allow_date_change === true;

  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);
  useEffect(() => {
    showDropdownRef.current = showDropdown;
  }, [showDropdown]);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);
  useEffect(() => {
    if (orgSettings) setSettings(orgSettings);
  }, [orgSettings]);

  const { data: productsData } = useQuery({
    queryKey: ["dc-products", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: products } = await supabase
          .from("products")
          .select(
            `id, product_name, brand, hsn_code, gst_per, product_type, status,
            product_variants(id, barcode, size, color, stock_qty, sale_price, mrp, product_id, active, deleted_at)`,
          )
          .eq("organization_id", currentOrganization.id)
          .eq("status", "active")
          .is("deleted_at", null)
          .range(offset, offset + PAGE_SIZE - 1);
        if (products && products.length > 0) {
          allProducts.push(...products);
          offset += PAGE_SIZE;
          hasMore = products.length === PAGE_SIZE;
        } else hasMore = false;
      }
      return allProducts
        .map((p: any) => ({
          ...p,
          product_variants: p.product_variants?.filter((v: any) => !v.deleted_at && v.active !== false),
        }))
        .filter((p: any) => (p.product_variants?.length || 0) > 0);
    },
    enabled: !!currentOrganization?.id && enabled,
  });

  const resetChallan = useCallback(() => {
    setItems([]);
    setBarcodeInput("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerId(null);
    setFlatDiscountValue(0);
    setFlatDiscountMode("percent");
    setSrAdjust(0);
    setRoundOff(0);
    setNotes("");
    setSavedInvoiceData(null);
    setShowDropdown(false);
    setDcInvoiceDate(new Date());
    setShowQuickServiceDialog(false);
    setQuickServiceCode("");
    setQuickServiceProductForAdd(null);
    setQuickServiceDialogDefaultMrp(undefined);
    setTimeout(() => barcodeRef.current?.focus(), 100);
  }, []);

  const fetchNextDcNumber = useCallback(async () => {
    if (!currentOrganization?.id) return;
    const { data } = await supabase.rpc("generate_challan_number", {
      p_organization_id: currentOrganization.id,
    });
    if (data) setDcNumber(data as string);
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (!enabled || !currentOrganization?.id) return;
    void fetchNextDcNumber();
  }, [enabled, currentOrganization?.id, fetchNextDcNumber]);

  useEffect(() => {
    if (!enabled) return;
    setTimeout(() => barcodeRef.current?.focus(), 200);
  }, [enabled]);

  useEffect(() => {
    const tick = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const term = barcodeInput.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const runId = ++searchAbortRef.current;
    const localResults = productsData ? searchInProducts(productsData, term) : [];
    setSearchResults(localResults);
    setShowDropdown(localResults.length > 0);
    setSelectedIndex(-1);

    if (localResults.length > 0 || !currentOrganization?.id) return;

    const timer = setTimeout(async () => {
      if (searchAbortRef.current !== runId) return;
      const escaped = term.replace(/[%_\\]/g, "\\$&");
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select(
          `id, barcode, size, color, stock_qty, sale_price, mrp, product_id, active, deleted_at,
          products!inner(id, product_name, brand, hsn_code, gst_per, product_type, status, deleted_at, organization_id)`,
        )
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or(`barcode.ilike.%${escaped}%,size.ilike.%${escaped}%`)
        .limit(40);

      if (searchAbortRef.current !== runId) return;

      const dbResults: any[] = [];
      const seen = new Set<string>();
      for (const row of variantRows || []) {
        const product = (row as any).products;
        if (!product || product.status !== "active" || product.deleted_at) continue;
        if (row.active === false) continue;
        const key = row.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const label = `${product.product_name} ${product.brand || ""} ${row.size || ""} ${row.color || ""} ${row.barcode || ""}`.toLowerCase();
        const tLower = term.toLowerCase();
        if (!label.includes(tLower) && !(row.barcode || "").toLowerCase().includes(tLower)) continue;
        dbResults.push(buildSearchResult(row, product));
        if (dbResults.length >= 30) break;
      }

      if (dbResults.length === 0) {
        const { data: namedProducts } = await supabase
          .from("products")
          .select(
            `id, product_name, brand, hsn_code, gst_per, product_type, status,
            product_variants(id, barcode, size, color, stock_qty, sale_price, mrp, product_id, active, deleted_at)`,
          )
          .eq("organization_id", currentOrganization.id)
          .eq("status", "active")
          .is("deleted_at", null)
          .ilike("product_name", `%${escaped}%`)
          .limit(10);

        if (searchAbortRef.current !== runId) return;

        for (const product of namedProducts || []) {
          for (const v of (product as any).product_variants || []) {
            if (v.deleted_at || v.active === false) continue;
            if (seen.has(v.id)) continue;
            seen.add(v.id);
            dbResults.push(buildSearchResult(v, product));
            if (dbResults.length >= 30) break;
          }
          if (dbResults.length >= 30) break;
        }
      }

      if (searchAbortRef.current !== runId) return;
      setSearchResults(dbResults);
      setShowDropdown(dbResults.length > 0);
      setSelectedIndex(-1);
    }, 300);

    return () => clearTimeout(timer);
  }, [barcodeInput, productsData, currentOrganization?.id]);

  const addVariantToItems = useCallback(
    async (
      foundVariant: any,
      foundProduct: any,
      overridePrice?: { sale_price: number; mrp: number; quantity?: number },
    ) => {
      const isServiceProduct = foundProduct.product_type === "service";

      // Service products: ask qty & MRP (same as POS), unless dialog disabled + master price set
      if (isServiceProduct && !overridePrice) {
        const serviceQuickEntryEnabled =
          (orgSettings as any)?.product_settings?.service_quick_entry_dialog !== false;
        const svcSalePrice = parseFloat(String(foundVariant.sale_price || 0)) || 0;
        const svcMrp = resolveServiceVariantDefaultMrp(foundVariant);
        const hasPredefinedPrice = svcMrp > 0 || svcSalePrice > 0;

        if (serviceQuickEntryEnabled || !hasPredefinedPrice) {
          setQuickServiceCode(foundVariant.barcode || foundProduct.product_name || "");
          setQuickServiceProductForAdd({ product: foundProduct, variant: foundVariant });
          setQuickServiceDialogDefaultMrp(svcMrp || svcSalePrice || undefined);
          setShowQuickServiceDialog(true);
          setBarcodeInput("");
          setShowDropdown(false);
          return;
        }

        overridePrice = {
          sale_price: svcSalePrice || svcMrp,
          mrp: svcMrp || svcSalePrice,
        };
      }

      const unitCost =
        overridePrice?.sale_price ?? (foundVariant.sale_price || foundVariant.mrp || 0);
      const lineMrp = overridePrice?.mrp ?? (foundVariant.mrp || unitCost || 0);
      const addQty = Math.max(1, overridePrice?.quantity ?? 1);

      let existingIdx = -1;
      if (isServiceProduct && overridePrice) {
        existingIdx = findDcServiceMergeIndex(items, {
          barcode: foundVariant.barcode || "",
          variantId: foundVariant.id,
          mrp: lineMrp,
          unitCost,
        });
      } else {
        existingIdx = items.findIndex((i) => i.variantId === foundVariant.id);
      }

      const newQty = existingIdx >= 0 ? items[existingIdx].quantity + addQty : addQty;
      if (!isServiceProduct) {
        const stockCheck = await checkStock(foundVariant.id, newQty);
        if (!stockCheck.isAvailable) {
          toast.error(`Only ${stockCheck.availableStock} in stock`);
          return;
        }
      }

      if (existingIdx >= 0) {
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === existingIdx
              ? {
                  ...item,
                  quantity: newQty,
                  netAmount: unitCost * newQty,
                  stockQty: foundVariant.stock_qty ?? item.stockQty,
                }
              : item,
          ),
        );
      } else {
        const newItem: PosDCItem = {
          id: isServiceProduct
            ? `dc-service-${foundVariant.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            : `dc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          barcode: foundVariant.barcode || "",
          productName: foundProduct.product_name,
          size: foundVariant.size || "",
          color: foundVariant.color || "",
          quantity: addQty,
          mrp: lineMrp,
          originalMrp: isServiceProduct ? null : foundVariant.mrp || null,
          unitCost,
          netAmount: unitCost * addQty,
          productId: foundProduct.id,
          variantId: foundVariant.id,
          gstPer: foundProduct.gst_per || 0,
          discountPercent: 0,
          discountAmount: 0,
          hsnCode: foundProduct.hsn_code || "",
          productType: foundProduct.product_type || "goods",
          stockQty: foundVariant.stock_qty ?? 0,
        };
        setItems((prev) => [...prev, newItem]);
      }
      setBarcodeInput("");
      setShowDropdown(false);
      setTimeout(() => barcodeRef.current?.focus(), 50);
    },
    [items, checkStock, orgSettings],
  );

  const closeQuickServiceDialog = useCallback(() => {
    setShowQuickServiceDialog(false);
    setQuickServiceCode("");
    setQuickServiceProductForAdd(null);
    setQuickServiceDialogDefaultMrp(undefined);
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, []);

  const handleQuickServiceAdd = useCallback(
    ({
      quantity,
      mrp,
    }: {
      code: string;
      quantity: number;
      mrp: number;
      description?: string;
    }) => {
      if (!quickServiceProductForAdd) return;
      const { product, variant } = quickServiceProductForAdd;
      void addVariantToItems(variant, product, {
        sale_price: mrp,
        mrp,
        quantity,
      }).then(() => {
        closeQuickServiceDialog();
      });
    },
    [quickServiceProductForAdd, addVariantToItems, closeQuickServiceDialog],
  );

  const handleBarcodeEnter = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showDropdownRef.current && searchResultsRef.current.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => {
            const next = Math.min(prev + 1, searchResultsRef.current.length - 1);
            selectedIndexRef.current = next;
            return next;
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            selectedIndexRef.current = next;
            return next;
          });
          return;
        }
        if (e.key === "Enter" && selectedIndexRef.current >= 0) {
          e.preventDefault();
          e.stopPropagation();
          const selected = searchResultsRef.current[selectedIndexRef.current];
          if (selected) await addVariantToItems(selected.variant, selected.product);
          return;
        }
        if (e.key === "Escape") {
          setShowDropdown(false);
          showDropdownRef.current = false;
          return;
        }
      }

      if (e.key !== "Enter" || !barcodeInput.trim()) return;
      e.preventDefault();
      const term = barcodeInput.trim();

      let foundVariant: any = null;
      let foundProduct: any = null;

      if (productsData) {
        for (const product of productsData) {
          const v = product.product_variants?.find(
            (v: any) => v.barcode?.toLowerCase() === term.toLowerCase(),
          );
          if (v) {
            foundVariant = v;
            foundProduct = product;
            break;
          }
        }
      }

      if (!foundVariant && currentOrganization?.id) {
        const { data: variantRow } = await supabase
          .from("product_variants")
          .select(
            `id, barcode, size, color, stock_qty, sale_price, mrp, product_id, active, deleted_at,
          products!inner(id, product_name, brand, hsn_code, gst_per, product_type, status, deleted_at, organization_id)`,
          )
          .eq("organization_id", currentOrganization.id)
          .eq("barcode", term)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (
          variantRow &&
          (variantRow as any).products &&
          (variantRow as any).products.status === "active" &&
          !(variantRow as any).products.deleted_at
        ) {
          foundVariant = variantRow;
          foundProduct = (variantRow as any).products;
        }
      }

      if (!foundVariant || !foundProduct) {
        toast.error(`Barcode "${term}" not found`);
        setTimeout(() => barcodeRef.current?.focus(), 100);
        return;
      }

      await addVariantToItems(foundVariant, foundProduct);
    },
    [barcodeInput, productsData, addVariantToItems, currentOrganization?.id],
  );

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const changeQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, netAmount: item.unitCost * newQty };
      }),
    );
  };

  const lineMerchandiseGross = (item: PosDCItem) =>
    (item.mrp > 0 ? item.mrp : item.unitCost) * item.quantity;

  const grossAmount = items.reduce((s, i) => s + lineMerchandiseGross(i), 0);
  const subTotal = items.reduce((s, i) => s + i.netAmount, 0);
  const { flatDiscountAmount } = computePosFlatDiscount({
    mrpTotal: grossAmount,
    saleReturnAdjust: srAdjust || 0,
    flatDiscountValue: flatDiscountValue || 0,
    flatDiscountMode,
  });
  const amountBeforeRoundOff = Math.max(0, subTotal - (srAdjust || 0) - flatDiscountAmount);
  const netAmount = Math.max(0, amountBeforeRoundOff + (roundOff || 0));
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const getPageStyle = () => {
    const fmt = settings?.pos_bill_format || "thermal";
    const size =
      fmt === "a4"
        ? "A4 portrait"
        : fmt === "a5"
          ? "A5 portrait"
          : fmt === "a5-horizontal"
            ? "A5 landscape"
            : "80mm auto";
    const margin = fmt === "a4" ? "6mm" : fmt === "thermal" ? "3mm" : "2mm";
    return `@page { size: ${size}; margin: ${margin}; } @media print { html, body { margin: 0; padding: 0; } }`;
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: getPageStyle(),
  });

  const handleSaveDC = async (method: PosDCPaymentMethod) => {
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    if (!currentOrganization?.id || !user) return;
    if (!dcNumber) {
      toast.error("DC number not ready, please wait");
      return;
    }

    setPaymentMethod(method);
    setIsSavingDC(true);
    try {
      const saleDate = posAllowDateChange
        ? saleDateIsoIstForDay(dcInvoiceDate)
        : saleDateIsoIst();
      const printDate = posAllowDateChange ? dcInvoiceDate : new Date();
      const gross = items.reduce((s, i) => s + lineMerchandiseGross(i), 0);
      const sub = items.reduce((s, i) => s + i.netAmount, 0);
      const sr = srAdjust || 0;
      const ro = roundOff || 0;
      const { flatDiscountAmount: flatDisc } = computePosFlatDiscount({
        mrpTotal: gross,
        saleReturnAdjust: sr,
        flatDiscountValue: flatDiscountValue || 0,
        flatDiscountMode,
      });
      const net = Math.max(0, sub - sr - flatDisc + ro);

      const cashAmt = method === "cash" ? net : 0;
      const upiAmt = method === "upi" ? net : 0;
      const cardAmt = method === "card" ? net : 0;
      const paidAmt = method === "pay_later" ? 0 : net;
      const payStatus = method === "pay_later" ? "pending" : "completed";

      const { data: savedSale, error: saleError } = await (supabase as any)
        .from("sales")
        .insert({
          sale_number: dcNumber,
          sale_type: "delivery_challan",
          sale_date: saleDate,
          organization_id: currentOrganization.id,
          customer_id: customerId || null,
          customer_name: customerName || "Walk-in",
          customer_phone: customerPhone || null,
          gross_amount: gross,
          discount_amount: flatDisc,
          flat_discount_percent: flatDiscountMode === "percent" ? flatDiscountValue || 0 : 0,
          flat_discount_amount: flatDisc,
          sale_return_adjust: sr,
          round_off: ro,
          net_amount: net,
          notes: notes || null,
          payment_method: method,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: 0,
          points_redeemed_amount: 0,
          created_by: user.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItemsData = items.map((item) => ({
        sale_id: savedSale.id,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode || null,
        color: item.color || null,
        quantity: item.quantity,
        unit_price: item.unitCost,
        mrp: item.mrp,
        gst_percent: item.gstPer,
        discount_percent: item.discountPercent,
        line_total: item.netAmount,
        hsn_code: item.hsnCode || null,
        discount_share: 0,
        round_off_share: 0,
        net_after_discount: item.netAmount,
        per_qty_net_amount: item.unitCost,
      }));

      const { error: itemsError } = await (supabase as any).from("sale_items").insert(saleItemsData);
      if (itemsError) throw itemsError;

      const invoiceData = {
        billNo: dcNumber,
        date: printDate,
        customerName: customerName || "Walk-in",
        customerAddress: "",
        customerMobile: customerPhone || "",
        items: items.map((item, idx) => ({
          sr: idx + 1,
          particulars: item.productName,
          size: item.size,
          barcode: item.barcode,
          hsn: item.hsnCode || "",
          sp: item.unitCost,
          mrp: item.mrp,
          qty: item.quantity,
          rate: item.unitCost,
          total: item.netAmount,
        })),
        subTotal: gross,
        discount: flatDisc,
        grandTotal: net,
        tenderAmount: net,
        cashPaid: cashAmt,
        upiPaid: upiAmt,
        cardPaid: cardAmt,
        refundCash: 0,
        paymentMethod: method,
        documentType: "pos",
        saleId: savedSale.id,
        invoiceNumber: dcNumber,
      };
      setSavedInvoiceData(invoiceData);
      lastSavedPrintRef.current = invoiceData;
      setHasSavedForReprint(true);
      setLastBillHint({
        invoiceNumber: dcNumber,
        qty: items.reduce((s, i) => s + i.quantity, 0),
        amount: net,
      });

      toast.success(`DC ${dcNumber} saved`);

      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["cashier-report-sales-v2"] });
      queryClient.invalidateQueries({ queryKey: ["cashier-report-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-dashboard-sales"] });

      await new Promise((r) => setTimeout(r, 300));
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 200));
      handlePrint();

      resetChallan();
      await fetchNextDcNumber();
    } catch (err: any) {
      console.error("DC save error:", err);
      toast.error(err?.message || "Failed to save DC");
    } finally {
      setIsSavingDC(false);
    }
  };

  const handleReprintLast = useCallback(() => {
    if (!lastSavedPrintRef.current) {
      toast.error("No saved DC to reprint");
      return;
    }
    setSavedInvoiceData(lastSavedPrintRef.current);
    requestAnimationFrame(() => {
      setTimeout(() => handlePrint(), 200);
    });
  }, [handlePrint]);

  return {
    items,
    barcodeInput,
    setBarcodeInput,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerId,
    setCustomerId,
    flatDiscountMode,
    setFlatDiscountMode,
    flatDiscountValue,
    setFlatDiscountValue,
    srAdjust,
    setSrAdjust,
    roundOff,
    setRoundOff,
    notes,
    setNotes,
    paymentMethod,
    setPaymentMethod,
    currentDateTime,
    lastBillHint,
    isSavingDC,
    dcNumber,
    savedInvoiceData,
    settings,
    searchResults,
    showDropdown,
    setShowDropdown,
    selectedIndex,
    setSelectedIndex,
    barcodeRef,
    printRef,
    grossAmount,
    subTotal,
    flatDiscountAmount,
    amountBeforeRoundOff,
    netAmount,
    totalQty,
    handleBarcodeEnter,
    addVariantToItems,
    removeItem,
    changeQty,
    handleSaveDC,
    handleReprintLast,
    resetChallan,
    currentDateLabel: format(new Date(), "dd/MM/yyyy  hh:mm a"),
    hasSavedForReprint,
    posAllowDateChange,
    dcInvoiceDate,
    setDcInvoiceDate,
    showQuickServiceDialog,
    closeQuickServiceDialog,
    quickServiceCode,
    quickServiceProductName: quickServiceProductForAdd?.product?.product_name as string | undefined,
    quickServiceDialogDefaultMrp,
    handleQuickServiceAdd,
  };
}
