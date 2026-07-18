import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logError } from "@/lib/errorLogger";
import { insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";
import {
  deleteJournalEntryByReference,
  recordSaleReturnJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { useParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Trash2, Search, Plus, Check, ChevronsUpDown, ChevronLeft, RotateCcw, Barcode, Save, X, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  resolveSaleReturnLineTotal,
  resolveSaleReturnUnitPrice,
  type SaleItemPriceFields,
} from "@/utils/saleReturnPricing";
import { isSaleInvoiceCancelled } from "@/utils/saleInvoiceStatus";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { cn } from "@/lib/utils";
import { invalidateStatusBarSummary } from "@/utils/invalidateDashboardQueries";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  hsn_code: string | null;
}

interface Variant {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  sale_price: number;
  stock_qty: number;
  barcode: string | null;
  gst_per: number;
}

interface ReturnItem {
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  color?: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string;
  maxReturnable?: number;
  originalPrice?: number;
  discountPercent?: number;
}

export default function SaleReturnEntry() {
  useEntryViewportSync();
  const { orgNavigate } = useOrgNavigation();
  const { editId } = useParams<{ editId?: string }>();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const isEditMode = !!editId;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [originalSaleNumber, setOriginalSaleNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [nextReturnNumber, setNextReturnNumber] = useState<string>("");
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [editLoading, setEditLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const lastInputTimeRef = useRef(0);
  const processingBarcodeRef = useRef(false);
  const barcodeScanner = useBarcodeScanner({
    minBarcodeLength: 4,
    maxKeystrokeInterval: 50,
    autoSubmitDelay: 120,
  });
  const [originalSaleId, setOriginalSaleId] = useState<string>('');
  const [useOriginalPriceForReturn, setUseOriginalPriceForReturn] = useState(false);

  // Fetch sale return price setting
  useEffect(() => {
    if (!currentOrganization?.id) return;
    supabase
      .from("settings")
      .select("sale_settings")
      .eq("organization_id", currentOrganization.id)
      .maybeSingle()
      .then(({ data }) => {
        const saleSettings = data?.sale_settings as any;
        if (saleSettings?.sale_return_use_original_price) {
          setUseOriginalPriceForReturn(true);
        }
      });
  }, [currentOrganization?.id]);

  // Store original item IDs for edit mode (to delete them on resave)
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);

  // Sale items loading state
  const [saleItems, setSaleItems] = useState<Array<{
    variantId: string;
    productName: string;
    size: string;
    color: string | null;
    barcode: string | null;
    unitPrice: number;
    gstPercent: number;
    hsnCode: string;
    productId: string;
    quantity: number;
    paidLineTotal: number;
    originalUnitPrice?: number;
    discountPercent?: number;
    rawItem: SaleItemPriceFields;
  }>>([]);
  const [linkedSaleFlatDiscount, setLinkedSaleFlatDiscount] = useState(0);
  const [linkedSaleRoundOff, setLinkedSaleRoundOff] = useState(0);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleLoaded, setSaleLoaded] = useState(false);
  const [selectedSaleItemIds, setSelectedSaleItemIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentOrganization) return;

    // Fetch initial customers
    supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null)
      .order("customer_name")
      .limit(50)
      .then(({ data }) => setCustomers(data || []));

    // Only generate new return number if not editing
    if (!isEditMode) {
      supabase.rpc('generate_sale_return_number', {
        p_organization_id: currentOrganization.id
      }).then(({ data }) => { if (data) setNextReturnNumber(data); });
    }

    // Fetch all products
    fetchAllProducts();
  }, [currentOrganization]);

  // Load existing return data when in edit mode
  useEffect(() => {
    if (!editId || !currentOrganization) return;
    loadReturnForEdit(editId);
  }, [editId, currentOrganization]);

  const loadReturnForEdit = async (returnId: string) => {
    setEditLoading(true);
    try {
      const { data: returnData, error: returnError } = await supabase
        .from("sale_returns")
        .select("*")
        .eq("id", returnId)
        .eq("organization_id", currentOrganization?.id)
        .single();

      if (returnError || !returnData) {
        toast({ title: "Error", description: "Sale return not found", variant: "destructive" });
        orgNavigate("/sale-returns");
        return;
      }

      setNextReturnNumber(returnData.return_number || "");
      setSelectedCustomer(returnData.customer_id || "");
      setReturnDate(returnData.return_date?.split("T")[0] || new Date().toISOString().split("T")[0]);
      setOriginalSaleNumber(returnData.original_sale_number || "");
      setNotes(returnData.notes || "");

      if (returnData.customer_id) {
        const { data: custData } = await supabase
          .from("customers")
          .select("id, customer_name, phone")
          .eq("id", returnData.customer_id)
          .single();
        if (custData) {
          setCustomers(prev => {
            const exists = prev.some(c => c.id === custData.id);
            return exists ? prev : [custData, ...prev];
          });
        }
      }

      const { data: items, error: itemsError } = await supabase
        .from("sale_return_items")
        .select("*")
        .eq("return_id", returnId);

      if (itemsError) throw itemsError;

      setOriginalItemIds((items || []).map(i => i.id));

      const mappedItems: ReturnItem[] = (items || []).map(item => ({
        productId: item.product_id || "",
        variantId: item.variant_id || "",
        productName: item.product_name,
        size: item.size,
        color: (item as any).color || undefined,
        barcode: item.barcode,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        gstPercent: item.gst_percent,
        lineTotal: item.line_total,
        hsnCode: item.hsn_code || "",
      }));

      setReturnItems(mappedItems);
    } catch (error) {
      console.error("Error loading sale return:", error);
      toast({ title: "Error", description: "Failed to load sale return", variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    try {
      const soldVariantIds = new Set<string>();
      const soldProductIds = new Set<string>();
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from("sale_items")
          .select("product_id, variant_id, sales!inner(organization_id)")
          .eq("sales.organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("id")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        (batch || []).forEach(item => {
          if (item.product_id) soldProductIds.add(item.product_id);
          if (item.variant_id) soldVariantIds.add(item.variant_id);
        });
        hasMore = (batch?.length || 0) === PAGE_SIZE;
        page++;
      }

      const productIdArray = Array.from(soldProductIds);
      if (productIdArray.length === 0) {
        setProducts([]);
        setVariants([]);
        return;
      }

      const allProducts: Product[] = [];
      for (let i = 0; i < productIdArray.length; i += 500) {
        const batch = productIdArray.slice(i, i + 500);
        const { data, error } = await supabase
          .from("products")
          .select("id, product_name, brand, category, hsn_code")
          .in("id", batch)
          .eq("status", "active")
          .is("deleted_at", null);
        if (error) throw error;
        allProducts.push(...(data || []));
      }

      const variantIdArray = Array.from(soldVariantIds);
      const allVariants: Variant[] = [];
      for (let i = 0; i < variantIdArray.length; i += 500) {
        const batch = variantIdArray.slice(i, i + 500);
        const { data: variantsData, error: variantsError } = await supabase
          .from("product_variants")
          .select("id, product_id, size, color, sale_price, stock_qty, barcode, products(gst_per)")
          .in("id", batch)
          .eq("active", true)
          .is("deleted_at", null);

        if (variantsError) throw variantsError;

        allVariants.push(
          ...(variantsData?.map((v) => ({
            id: v.id,
            product_id: v.product_id,
            size: v.size,
            color: v.color || null,
            sale_price: v.sale_price || 0,
            stock_qty: v.stock_qty,
            barcode: v.barcode,
            gst_per: (v.products as any)?.gst_per || 0,
          })) || [])
        );
      }

      setProducts(allProducts);
      setVariants(allVariants);
    } catch (error) {
      console.error("Error loading sold products:", error);
      toast({ title: "Error", description: "Failed to load sold products", variant: "destructive" });
    }
  };

  const filteredProducts = products.filter((product) => {
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    const matchingVariants = variants.filter(v => v.product_id === product.id);
    const barcodeMatch = matchingVariants.some(v => v.barcode?.toLowerCase().includes(search));
    
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search) ||
      barcodeMatch
    );
  });
  const saleReturnPriceOpts = () => ({
    useOriginalPrice: useOriginalPriceForReturn,
    billFlatDiscount: linkedSaleFlatDiscount,
    billRoundOff: linkedSaleRoundOff,
  });

  // Get unit price from a specific sale's items for a given variant
  const getPriceFromSale = async (
    variantId: string,
    specificSaleId?: string,
    useOriginalPrice?: boolean,
  ): Promise<{ price: number; originalPrice?: number; discountPercent?: number } | null> => {
    try {
      let query = supabase
        .from('sale_items')
        .select('unit_price, per_qty_net_amount, line_total, quantity, discount_percent, net_after_discount')
        .eq('variant_id', variantId)
        .is('deleted_at', null);

      if (specificSaleId) {
        query = query.eq('sale_id', specificSaleId);
      } else {
        query = query.order('created_at', { ascending: false }).limit(1);
      }

      const { data } = await query.maybeSingle();
      if (!data) return null;

      let billFlat = linkedSaleFlatDiscount;
      let billRound = linkedSaleRoundOff;
      if (specificSaleId && billFlat <= 0.01 && Math.abs(billRound) < 0.001) {
        const { data: saleHdr } = await supabase
          .from('sales')
          .select('flat_discount_amount, round_off')
          .eq('id', specificSaleId)
          .maybeSingle();
        if (saleHdr) {
          billFlat = Number(saleHdr.flat_discount_amount) || 0;
          billRound = Number(saleHdr.round_off) || 0;
        }
      }

      const opts = {
        useOriginalPrice: useOriginalPrice ?? useOriginalPriceForReturn,
        billFlatDiscount: billFlat,
        billRoundOff: billRound,
      };
      const price = resolveSaleReturnUnitPrice(data, opts);
      if (price <= 0) return null;

      const origPrice = data.unit_price && data.unit_price > 0 ? data.unit_price : undefined;
      const discPct =
        data.discount_percent && data.discount_percent > 0 ? data.discount_percent : undefined;
      return { price, originalPrice: origPrice, discountPercent: discPct };
    } catch {
      return null;
    }
  };

  // Helper: fetch max returnable qty for a variant
  const getMaxReturnable = async (variantId: string): Promise<number> => {
    const { data: soldData } = await supabase
      .from('sale_items')
      .select('quantity')
      .eq('variant_id', variantId)
      .is('deleted_at', null);
    const totalSold = (soldData || []).reduce((sum, r) => sum + (r.quantity || 0), 0);

    const { data: returnedData } = await supabase
      .from('sale_return_items')
      .select('quantity')
      .eq('variant_id', variantId)
      .is('deleted_at', null);
    const alreadyReturned = (returnedData || []).reduce((sum, r) => sum + (r.quantity || 0), 0);

    return totalSold - alreadyReturned;
  };

  const addProduct = async (productId: string, variantId: string) => {
    const product = products.find((p) => p.id === productId);
    const variant = variants.find((v) => v.id === variantId);

    if (!product || !variant) return;

    const maxReturnable = await getMaxReturnable(variantId);
    if (maxReturnable <= 0) {
      toast({ title: "Cannot Return", description: `${product.product_name} (${variant.size}) — all sold units already returned`, variant: "destructive" });
      setSearchOpen(false);
      return;
    }

    const fetchedResult = await getPriceFromSale(variantId, originalSaleId || undefined, useOriginalPriceForReturn);
    let unitPrice = fetchedResult?.price ?? variant.sale_price;

    const newItem: ReturnItem = {
      productId: product.id,
      variantId: variant.id,
      productName: product.product_name,
      size: variant.size,
      barcode: variant.barcode,
      quantity: 1,
      unitPrice,
      gstPercent: variant.gst_per,
      lineTotal: unitPrice,
      hsnCode: product.hsn_code || '',
      maxReturnable,
      originalPrice: fetchedResult?.originalPrice,
      discountPercent: fetchedResult?.discountPercent,
    };

    setReturnItems([...returnItems, newItem]);
    setSearchOpen(false);
    setSearchTerm("");
    
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  /** Sale-bill style: scanner / Enter / camera auto-adds the return line. */
  const searchAndAddProduct = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query || !currentOrganization?.id) return;
    if (processingBarcodeRef.current) return;

    processingBarcodeRef.current = true;
    barcodeScanner.markSubmitted(query);
    barcodeScanner.cancelAutoSubmit();

    try {
      let variant = variants.find((v) => v.barcode === query);
      let product = variant ? products.find((p) => p.id === variant!.product_id) : null;

      if (!variant) {
        const matchedProduct = products.find((p) =>
          p.product_name.toLowerCase().includes(query.toLowerCase()),
        );
        if (matchedProduct) {
          product = matchedProduct;
          variant = variants.find((v) => v.product_id === matchedProduct.id);
        }
      }

      if (!variant || !product) {
        try {
          const { data: dbVariant } = await supabase
            .from("product_variants")
            .select("id, product_id, size, color, sale_price, stock_qty, barcode, products(id, product_name, brand, category, hsn_code, gst_per, status, deleted_at)")
            .eq("organization_id", currentOrganization.id)
            .eq("barcode", query)
            .eq("active", true)
            .is("deleted_at", null)
            .maybeSingle();

          if (
            dbVariant &&
            (dbVariant.products as any)?.status === "active" &&
            !(dbVariant.products as any)?.deleted_at
          ) {
            const { count } = await supabase
              .from("sale_items")
              .select("id", { count: "exact", head: true })
              .eq("variant_id", dbVariant.id)
              .is("deleted_at", null);

            if (count && count > 0) {
              const p = dbVariant.products as any;
              product = {
                id: p.id,
                product_name: p.product_name,
                brand: p.brand,
                category: p.category,
                hsn_code: p.hsn_code,
              };
              variant = {
                id: dbVariant.id,
                product_id: dbVariant.product_id,
                size: dbVariant.size,
                color: dbVariant.color || null,
                sale_price: dbVariant.sale_price || 0,
                stock_qty: dbVariant.stock_qty,
                barcode: dbVariant.barcode,
                gst_per: p.gst_per || 0,
              };
            }
          }
        } catch (err) {
          console.error("DB barcode lookup error:", err);
        }
      }

      if (!variant || !product) {
        toast({
          title: "Not Found",
          description: "No product found with this barcode or name",
          variant: "destructive",
        });
        setBarcodeInput("");
        return;
      }

      const maxReturnable = await getMaxReturnable(variant.id);
      const variantId = variant.id;
      const productSnap = product;
      const variantSnap = variant;

      const existing = returnItems.find((item) => item.variantId === variantId);
      if (existing) {
        if (existing.quantity >= maxReturnable) {
          toast({
            title: "Cannot Return",
            description: `${productSnap.product_name} (${variantSnap.size}) — max returnable is ${maxReturnable}`,
            variant: "destructive",
          });
          setBarcodeInput("");
          return;
        }
        setReturnItems((prev) =>
          prev.map((item) =>
            item.variantId === variantId
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                  lineTotal: (item.quantity + 1) * item.unitPrice,
                  maxReturnable,
                }
              : item,
          ),
        );
        setBarcodeInput("");
        setTimeout(() => barcodeInputRef.current?.focus(), 50);
        return;
      }

      if (maxReturnable <= 0) {
        toast({
          title: "Cannot Return",
          description: `${productSnap.product_name} (${variantSnap.size}) — all sold units already returned`,
          variant: "destructive",
        });
        setBarcodeInput("");
        return;
      }

      const fetchedResult = await getPriceFromSale(
        variantId,
        originalSaleId || undefined,
        useOriginalPriceForReturn,
      );
      const unitPrice = fetchedResult?.price ?? variantSnap.sale_price;

      const newItem: ReturnItem = {
        productId: productSnap.id,
        variantId,
        productName: productSnap.product_name,
        size: variantSnap.size,
        color: variantSnap.color || undefined,
        barcode: variantSnap.barcode,
        quantity: 1,
        unitPrice,
        gstPercent: variantSnap.gst_per,
        lineTotal: unitPrice,
        hsnCode: productSnap.hsn_code || "",
        maxReturnable,
        originalPrice: fetchedResult?.originalPrice,
        discountPercent: fetchedResult?.discountPercent,
      };
      setReturnItems((prev) => [...prev, newItem]);
      setBarcodeInput("");
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    } finally {
      setTimeout(() => {
        processingBarcodeRef.current = false;
      }, 150);
    }
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    barcodeScanner.cancelAutoSubmit();
    await searchAndAddProduct(barcodeInput);
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const item = returnItems[index];
    const max = item.maxReturnable;
    if (max && quantity > max) {
      toast({ title: "Limit Exceeded", description: `Max returnable for ${item.productName} (${item.size}) is ${max}`, variant: "destructive" });
      quantity = max;
    }
    const updated = [...returnItems];
    updated[index].quantity = quantity;
    updated[index].lineTotal = quantity * updated[index].unitPrice;
    setReturnItems(updated);
  };

  const removeItem = (index: number) => {
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  // Load sale items by invoice number
  const loadSaleByNumber = async () => {
    if (!originalSaleNumber.trim() || !currentOrganization) return;
    setSaleLoading(true);
    setSaleLoaded(false);
    setSaleItems([]);
    setSelectedSaleItemIds(new Set());
    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select(
          'id, customer_id, flat_discount_amount, round_off, is_cancelled, payment_status, sale_number, sale_items(id, product_id, variant_id, product_name, size, color, barcode, unit_price, gst_percent, hsn_code, quantity, line_total, per_qty_net_amount, net_after_discount, discount_percent)',
        )
        .eq('organization_id', currentOrganization.id)
        .eq('sale_number', originalSaleNumber.trim())
        .is('deleted_at', null)
        .single();

      if (saleError || !sale) {
        toast({ title: 'Not Found', description: `No sale found with number "${originalSaleNumber.trim()}"`, variant: 'destructive' });
        setSaleLoading(false);
        return;
      }

      if (isSaleInvoiceCancelled(sale)) {
        toast({
          title: 'Invoice Cancelled',
          description: `Invoice ${sale.sale_number} is cancelled. Sale return is not allowed against cancelled bills.`,
          variant: 'destructive',
        });
        setSaleLoading(false);
        return;
      }

      if (!selectedCustomer && sale.customer_id) {
        setSelectedCustomer(sale.customer_id);
        const { data: custData } = await supabase
          .from('customers')
          .select('id, customer_name, phone')
          .eq('id', sale.customer_id)
          .single();
        if (custData) {
          setCustomers(prev => {
            const exists = prev.some(c => c.id === custData.id);
            return exists ? prev : [custData, ...prev];
          });
        }
      }

      const billFlat = Number((sale as any).flat_discount_amount) || 0;
      const billRound = Number((sale as any).round_off) || 0;
      setLinkedSaleFlatDiscount(billFlat);
      setLinkedSaleRoundOff(billRound);

      const priceOpts = {
        useOriginalPrice: useOriginalPriceForReturn,
        billFlatDiscount: billFlat,
        billRoundOff: billRound,
      };

      const saleItemsArr = (sale as any).sale_items || [];
      const items = saleItemsArr.map((item: any) => {
        const raw: SaleItemPriceFields = {
          unit_price: item.unit_price,
          per_qty_net_amount: item.per_qty_net_amount,
          net_after_discount: item.net_after_discount,
          line_total: item.line_total,
          quantity: item.quantity,
          discount_percent: item.discount_percent,
        };
        const qty = Number(item.quantity) || 1;
        const unitPrice = resolveSaleReturnUnitPrice(raw, priceOpts);
        const paidLineTotal = resolveSaleReturnLineTotal(raw, qty, priceOpts);
        return {
          variantId: item.variant_id || '',
          productName: item.product_name || '',
          size: item.size || '',
          color: item.color || null,
          barcode: item.barcode || null,
          unitPrice,
          gstPercent: item.gst_percent || 0,
          hsnCode: item.hsn_code || '',
          productId: item.product_id || '',
          quantity: qty,
          paidLineTotal,
          originalUnitPrice:
            item.unit_price && item.unit_price > 0 ? item.unit_price : undefined,
          discountPercent:
            item.discount_percent && item.discount_percent > 0
              ? item.discount_percent
              : undefined,
          rawItem: raw,
        };
      });

      setOriginalSaleId(sale.id);
      setSaleItems(items);
      setSaleLoaded(true);
      toast({ title: 'Sale Loaded', description: `${items.length} item(s) found — select which to return` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to load sale', variant: 'destructive' });
    } finally {
      setSaleLoading(false);
    }
  };

  const toggleSaleItemSelection = (variantId: string) => {
    setSelectedSaleItemIds(prev => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const addSelectedSaleItems = () => {
    const toAdd = saleItems.filter(item => selectedSaleItemIds.has(item.variantId));
    const priceOpts = saleReturnPriceOpts();
    toAdd.forEach(item => {
      const lineTotal = resolveSaleReturnLineTotal(item.rawItem, item.quantity, priceOpts);
      const unitPrice =
        item.quantity > 0 ? lineTotal / item.quantity : item.unitPrice;
      setReturnItems(prev => {
        const exists = prev.find(p => p.variantId === item.variantId);
        if (exists) return prev;
        return [...prev, {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          size: item.size,
          color: item.color || undefined,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPrice,
          gstPercent: item.gstPercent,
          lineTotal,
          hsnCode: item.hsnCode,
          originalPrice: item.originalUnitPrice,
          discountPercent: item.discountPercent,
        }];
      });
    });
    setSaleLoaded(false);
    setSaleItems([]);
    setSelectedSaleItemIds(new Set());
    toast({ title: 'Added', description: `${toAdd.length} item(s) added to return` });
  };

  const calculateTotals = () => {
    const grossAmount = returnItems.reduce((sum, item) => sum + item.lineTotal, 0);
    
    let gstAmount: number;
    if (taxType === "inclusive") {
      gstAmount = returnItems.reduce((sum, item) => {
        return sum + (item.lineTotal - (item.lineTotal / (1 + item.gstPercent / 100)));
      }, 0);
    } else {
      gstAmount = returnItems.reduce((sum, item) => {
        return sum + (item.lineTotal * item.gstPercent) / 100;
      }, 0);
    }
    
    const netAmount = taxType === "inclusive" ? grossAmount : grossAmount + gstAmount;
    return { grossAmount, gstAmount, netAmount };
  };

  const handleSave = async () => {
    // PRIMARY GUARD: synchronous ref (React state updates are async — `saving` check is insufficient against rapid double-clicks)
    if (savingRef.current) return;
    if (saving) return;
    savingRef.current = true;
    try {
      await handleSaveInner();
    } finally {
      savingRef.current = false;
    }
  };

  const handleSaveInner = async () => {
    if (returnItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    // Final validation: check no item exceeds max returnable
    const overItems = returnItems.filter(item => item.maxReturnable && item.quantity > item.maxReturnable);
    if (overItems.length > 0) {
      const msg = overItems.map(i => `${i.productName} (${i.size}): max ${i.maxReturnable}`).join(', ');
      toast({ title: "Quantity Exceeded", description: `Reduce qty: ${msg}`, variant: "destructive" });
      return;
    }


    setSaving(true);

    try {
      if (originalSaleNumber.trim() && currentOrganization?.id) {
        const { data: linkedSale } = await supabase
          .from("sales")
          .select("id, sale_number, is_cancelled, payment_status")
          .eq("organization_id", currentOrganization.id)
          .eq("sale_number", originalSaleNumber.trim())
          .is("deleted_at", null)
          .maybeSingle();
        if (linkedSale && isSaleInvoiceCancelled(linkedSale)) {
          toast({
            title: "Invoice Cancelled",
            description: `Invoice ${linkedSale.sale_number} is cancelled. Sale return is not allowed.`,
            variant: "destructive",
          });
          return;
        }
      }

      // Stock ceiling validation — ensure stock won't exceed total purchased
      const { validateBatchStockCeiling } = await import("@/utils/stockCeilingValidation");
      const ceilingItems = returnItems
        .filter(item => item.variantId)
        .map(item => ({
          variantId: item.variantId,
          qtyToAdd: item.quantity,
          label: `${item.productName} (${item.size})`,
        }));

      if (ceilingItems.length > 0) {
        const ceilingFailures = await validateBatchStockCeiling(supabase, ceilingItems, "Sale Return");
        if (ceilingFailures.length > 0) {
          const msg = ceilingFailures.map(f => f.label).join(", ");
          toast({
            title: "Stock Ceiling Exceeded",
            description: `Cannot process return — stock would exceed total purchased for: ${msg}`,
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
      }

      const customer = customers.find((c) => c.id === selectedCustomer);
      const totals = calculateTotals();

      if (isEditMode && editId) {
        // Hard-delete items directly so the DB trigger fires normally
        // (trigger sees deleted_at IS NULL → reverses stock correctly)
        // This matches the sale edit pattern in useSaveSale.tsx
        for (const itemId of originalItemIds) {
          const { error: delError } = await supabase
            .from("sale_return_items")
            .delete()
            .eq("id", itemId);
          if (delError) throw delError;
        }

        const itemsToInsert = returnItems.map((item) => ({
          return_id: editId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          gst_percent: item.gstPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));

        const { error: insertError } = await supabase
          .from("sale_return_items")
          .insert(itemsToInsert);

        if (insertError) throw insertError;

        const { error: updateError } = await supabase
          .from("sale_returns")
          .update({
            customer_id: selectedCustomer || null,
            customer_name: customer?.customer_name || "Walk-in Customer",
            original_sale_number: originalSaleNumber || null,
            return_date: returnDate,
            gross_amount: totals.grossAmount,
            gst_amount: totals.gstAmount,
            net_amount: totals.netAmount,
            notes,
          })
          .eq("id", editId);

        if (updateError) throw updateError;

        const { data: srRefundMeta } = await supabase
          .from("sale_returns")
          .select("refund_type, payment_method")
          .eq("id", editId)
          .maybeSingle();
        const { data: acctEditSr } = await supabase
          .from("settings")
          .select("accounting_engine_enabled")
          .eq("organization_id", currentOrganization!.id)
          .maybeSingle();
        if (isAccountingEngineEnabled(acctEditSr as { accounting_engine_enabled?: boolean } | null)) {
          try {
            await deleteJournalEntryByReference(currentOrganization!.id, "SaleReturn", editId, supabase);
            await supabase
              .from("sale_returns")
              .update({ journal_status: "pending", journal_error: null })
              .eq("id", editId);
            await recordSaleReturnJournalEntry(
              editId,
              currentOrganization!.id,
              totals.netAmount,
              srRefundMeta?.refund_type || "credit_note",
              returnDate,
              `Sale return ${nextReturnNumber}`,
              supabase,
              srRefundMeta?.payment_method ?? null
            );
            await supabase
              .from("sale_returns")
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", editId);
          } catch (glErr) {
            const errMsg = glErr instanceof Error ? glErr.message : String(glErr);
            await supabase
              .from("sale_returns")
              .update({ journal_status: "failed", journal_error: errMsg.slice(0, 2000) })
              .eq("id", editId);
            console.error("Sale return edit journal:", glErr);
            toast({
              title: "Ledger warning",
              description: "Return was saved but the day book could not be updated.",
              variant: "destructive",
            });
          }
        }

        toast({ title: "Success", description: `Sale return ${nextReturnNumber} updated successfully` });

        // Customer Account Statement — refresh ledger entry on edit
        if (currentOrganization?.id && nextReturnNumber) {
          await deleteLedgerEntries({
            organizationId: currentOrganization.id,
            voucherNo: nextReturnNumber,
            voucherTypes: ['SALE_RETURN'],
          });
          if (selectedCustomer) {
            insertLedgerCredit({
              organizationId: currentOrganization.id,
              customerId: selectedCustomer,
              voucherType: 'SALE_RETURN',
              voucherNo: nextReturnNumber,
              particulars: `Sale Return ${nextReturnNumber}`,
              transactionDate: returnDate,
              amount: totals.netAmount,
            });
          }
        }
      } else {
        const { data: returnNumber, error: returnNumberError } = await supabase
          .rpc('generate_sale_return_number', { p_organization_id: currentOrganization?.id });

        if (returnNumberError) throw returnNumberError;

        let createdReturnId: string | null = null;
        try {
          const { data: returnData, error: returnError } = await supabase
            .from("sale_returns")
            .insert({
              return_number: returnNumber,
              organization_id: currentOrganization?.id,
              customer_id: selectedCustomer || null,
              customer_name: customer?.customer_name || "Walk-in Customer",
              original_sale_number: originalSaleNumber || null,
              return_date: returnDate,
              gross_amount: totals.grossAmount,
              gst_amount: totals.gstAmount,
              net_amount: totals.netAmount,
              notes,
              refund_type: "credit_note",
              payment_method: null,
            })
            .select()
            .single();

          if (returnError) throw returnError;
          createdReturnId = returnData.id;

          const itemsToInsert = returnItems.map((item) => ({
            return_id: returnData.id,
            product_id: item.productId,
            variant_id: item.variantId,
            product_name: item.productName,
            size: item.size,
            barcode: item.barcode,
            color: item.color || null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            gst_percent: item.gstPercent,
            line_total: item.lineTotal,
            hsn_code: item.hsnCode || null,
          }));

          const { error: itemsError } = await supabase
            .from("sale_return_items")
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;

          const { data: acctSrPage } = await supabase
            .from("settings")
            .select("accounting_engine_enabled")
            .eq("organization_id", currentOrganization!.id)
            .maybeSingle();
          if (isAccountingEngineEnabled(acctSrPage as { accounting_engine_enabled?: boolean } | null)) {
            try {
              await recordSaleReturnJournalEntry(
                returnData.id,
                currentOrganization!.id,
                totals.netAmount,
                "credit_note",
                returnDate,
                `Sale return ${returnData.return_number}`,
                supabase,
                null
              );
              await supabase
                .from("sale_returns")
                .update({ journal_status: "posted", journal_error: null })
                .eq("id", returnData.id);
            } catch (glErr) {
              await supabase
                .from("sale_returns")
                .update({
                  journal_status: "failed",
                  journal_error: glErr instanceof Error ? glErr.message.slice(0, 2000) : String(glErr).slice(0, 2000),
                })
                .eq("id", returnData.id);
              const rollbackAt = new Date().toISOString();
              await supabase.from("sale_return_items").delete().eq("return_id", returnData.id);
              await supabase.from("sale_returns").update({
                deleted_at: rollbackAt,
                notes: "auto-rollback: items insert failed during save",
              }).eq("id", returnData.id);
              throw glErr;
            }
          }

          toast({ title: "Success", description: `Sale return ${returnData.return_number} saved successfully` });

          // Customer Account Statement — write credit ledger entry
          if (currentOrganization?.id && selectedCustomer) {
            insertLedgerCredit({
              organizationId: currentOrganization.id,
              customerId: selectedCustomer,
              voucherType: 'SALE_RETURN',
              voucherNo: returnData.return_number,
              particulars: `Sale Return ${returnData.return_number}`,
              transactionDate: returnDate,
              amount: totals.netAmount,
            });
          }
        } catch (innerError) {
          // Clean up orphan parent if items failed
          if (createdReturnId) {
            try {
              await deleteJournalEntryByReference(
                currentOrganization!.id,
                "SaleReturn",
                createdReturnId,
                supabase
              );
              const rollbackAt = new Date().toISOString();
              await supabase.from("sale_return_items").delete().eq("return_id", createdReturnId);
              await supabase.from("sale_returns").update({
                deleted_at: rollbackAt,
                notes: "auto-rollback: items insert failed during save",
              }).eq("id", createdReturnId);
            } catch (cleanupErr) {
              console.error("Cleanup failed:", cleanupErr);
            }
          }
          throw innerError;
        }
      }

      if (currentOrganization?.id) {
        invalidateStatusBarSummary(queryClient, currentOrganization.id);
      }
      orgNavigate("/sale-returns");
    } catch (error) {
      logError(
        {
          operation: 'sale_return_save',
          organizationId: currentOrganization?.id,
          additionalContext: {
            itemsCount: returnItems.length,
            saleId: selectedCustomer || null,
            isEditMode,
          },
        },
        error
      );
      console.error("Error saving sale return:", error);
      const errMsg = (error as any)?.details || (error as any)?.hint || (error as any)?.message || "Failed to save sale return";
      toast({ title: "Error", description: errMsg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();
  const totalReturnQty = returnItems.reduce((sum, item) => sum + item.quantity, 0);
  const taxableAmount =
    taxType === "inclusive" ? totals.grossAmount - totals.gstAmount : totals.grossAmount;
  const displayNetAmount = totals.netAmount;
  const returnDateAsDate = returnDate ? new Date(`${returnDate}T12:00:00`) : undefined;

  if (editLoading) {
    return (
      <div className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0 relative")} data-entry-form>
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-white/80 px-4 pt-16 backdrop-blur-[1px]">
          <Card className="w-full max-w-md border-black/20 shadow-lg">
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-black" />
              <p className="text-sm font-bold text-black">Loading sale return details...</p>
              <p className="text-xs text-black/60">Item rows will appear here shortly.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0 relative")} data-entry-form>
      <header className="bg-white border-b-2 border-black shrink-0 flex flex-col">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => orgNavigate("/sale-returns")}
              className="h-8 shrink-0 text-black hover:text-black hover:bg-black/5 border border-black/20 text-xs gap-1.5 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="w-px h-6 bg-black/15 shrink-0" />
            <RotateCcw className="h-5 w-5 text-black shrink-0" />
            <span className="text-black font-bold text-[15px] whitespace-nowrap hidden md:inline">
              {isEditMode ? "Edit Sale Return" : "Sale Return Entry"}
            </span>
            <span className="border-2 border-black text-black font-mono text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
              {nextReturnNumber || "NEW"}
            </span>
          </div>
        </div>
      </header>

      <main className={entryPageMainClass}>
        <section className={cn("bg-white border-b border-black/10 py-2 shrink-0 shadow-sm", entryPageSectionX)}>
          <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label htmlFor="return_number" className="text-[13px] font-bold text-black">Return No.</Label>
              <Input
                id="return_number"
                value={nextReturnNumber}
                readOnly
                className="h-10 bg-neutral-50 font-mono font-bold text-sm border-black/20"
              />
            </div>

            <div className="space-y-1 flex-[1.5] min-w-[160px]">
              <Label className="text-[13px] font-bold text-black">Customer (Optional)</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between font-normal h-10 text-sm border-black/20"
                  >
                    {selectedCustomer
                      ? customers.find((c) => c.id === selectedCustomer)?.customer_name || "Selected"
                      : "Select customer"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name or phone..."
                      value={customerSearchTerm}
                      onValueChange={(val) => {
                        setCustomerSearchTerm(val);
                        if (!currentOrganization) return;
                        let query = supabase
                          .from("customers")
                          .select("id, customer_name, phone")
                          .eq("organization_id", currentOrganization.id)
                          .is("deleted_at", null)
                          .order("customer_name")
                          .limit(50);
                        if (val.trim()) {
                          const term = `%${val.trim()}%`;
                          query = query.or(`customer_name.ilike.${term},phone.ilike.${term}`);
                        }
                        query.then(({ data }) => setCustomers(data || []));
                      }}
                    />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.customer_name + (customer.phone || "")}
                            onSelect={() => {
                              setSelectedCustomer(customer.id);
                              setCustomerSearchOpen(false);
                              setCustomerSearchTerm("");
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{customer.customer_name}</span>
                              {customer.phone && (
                                <span className="text-xs text-muted-foreground">{customer.phone}</span>
                              )}
                            </div>
                            {selectedCustomer === customer.id && (
                              <Check className="ml-auto h-4 w-4 text-black" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-[13px] font-bold text-black">Return Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-10 justify-start text-left font-normal border-black/20",
                      !returnDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {returnDateAsDate ? format(returnDateAsDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={returnDateAsDate}
                    onSelect={(date) => date && setReturnDate(format(date, "yyyy-MM-dd"))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-[13px] font-bold text-black">Tax Type</Label>
              <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive") => setTaxType(value)}>
                <SelectTrigger className="h-10 border-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive">Exclusive GST</SelectItem>
                  <SelectItem value="inclusive">Inclusive GST</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap lg:flex-nowrap items-end gap-3">
            <div className="space-y-1 flex-[2] min-w-[220px]">
              <Label className="text-[13px] font-bold text-black">Original Sale Number (Optional)</Label>
              <p className="text-[11px] text-black/55 leading-snug">
                Enter sale number and click Load Items to auto-populate products for return selection.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. INV/25-26/123 or POS/25-26/34"
                  value={originalSaleNumber}
                  className="no-uppercase h-10 border-black/20"
                  onChange={(e) => {
                    setOriginalSaleNumber(e.target.value);
                    setOriginalSaleId("");
                    setLinkedSaleFlatDiscount(0);
                    setLinkedSaleRoundOff(0);
                    setSaleLoaded(false);
                    setSaleItems([]);
                    setSelectedSaleItemIds(new Set());
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      loadSaleByNumber();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={loadSaleByNumber}
                  disabled={saleLoading || !originalSaleNumber.trim()}
                  className="h-10 px-4 flex items-center gap-2 shrink-0 bg-black text-white hover:bg-black/90 font-bold"
                >
                  {saleLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Load Items
                    </>
                  )}
                </Button>
              </div>
              {saleLoaded && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  Sale items loaded — select lines below and add to return.
                </p>
              )}
            </div>

            <div className="space-y-1 flex-[1.5] min-w-[180px]">
              <Label className="text-[13px] font-bold text-black">Notes</Label>
              <Textarea
                placeholder="Reason for return, notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="min-h-[40px] resize-none border-black/20 text-sm"
              />
            </div>
          </div>
        </section>

        {saleLoaded && saleItems.length > 0 && (
          <section className={cn("bg-neutral-50 border-b border-black/10 py-2 shrink-0", entryPageSectionX)}>
            <div className="rounded-lg border border-black/15 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/10 bg-neutral-50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-[14px] text-black truncate">
                    Sale Items — {originalSaleNumber}
                  </span>
                  <span className="text-[11px] text-black/70 bg-black/5 border border-black/10 px-2 py-0.5 rounded-full font-bold shrink-0">
                    {saleItems.length} items
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="text-[12px] text-black font-bold hover:underline"
                    onClick={() => setSelectedSaleItemIds(new Set(saleItems.map((i) => i.variantId)))}
                  >
                    Select All
                  </button>
                  <span className="text-black/25">|</span>
                  <button
                    type="button"
                    className="text-[12px] text-black font-bold hover:underline"
                    onClick={() => setSelectedSaleItemIds(new Set())}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="divide-y divide-black/5 max-h-[220px] overflow-y-auto">
                {saleItems.map((item, i) => {
                  const isSelected = selectedSaleItemIds.has(item.variantId);
                  return (
                    <div
                      key={item.variantId + i}
                      onClick={() => toggleSaleItemSelection(item.variantId)}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors",
                        isSelected ? "bg-neutral-100" : "hover:bg-neutral-50",
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                          isSelected ? "bg-black border-black" : "border-black/30 bg-white",
                        )}
                      >
                        {isSelected && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] text-black truncate">{item.productName}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[13px] text-black/65">
                          <span>
                            Size: <span className="font-semibold text-black">{item.size}</span>
                          </span>
                          {item.color && (
                            <span>
                              Color: <span className="font-semibold text-black">{item.color}</span>
                            </span>
                          )}
                          {item.barcode && (
                            <span className="font-mono">
                              Barcode: <span className="text-black">{item.barcode}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[15px] font-extrabold text-black">₹{item.unitPrice.toFixed(2)}</p>
                        {item.originalUnitPrice != null &&
                          Math.abs(item.originalUnitPrice - item.unitPrice) > 0.01 && (
                            <p className="text-[12px] text-black/50 line-through">
                              ₹{item.originalUnitPrice.toFixed(2)}
                            </p>
                          )}
                        <p className="text-[12px] text-black/60">
                          Qty: {item.quantity} | Line: ₹{item.paidLineTotal.toFixed(2)} | GST: {item.gstPercent}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-2.5 border-t border-black/10 bg-neutral-50 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[13px] text-black font-bold">
                  {selectedSaleItemIds.size} of {saleItems.length} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSaleLoaded(false);
                      setSaleItems([]);
                      setSelectedSaleItemIds(new Set());
                    }}
                    className="h-8 text-xs border-black/20 font-bold"
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={selectedSaleItemIds.size === 0}
                    onClick={addSelectedSaleItems}
                    className="h-8 text-xs px-4 bg-black text-white hover:bg-black/90 font-bold"
                  >
                    Add {selectedSaleItemIds.size > 0 ? `${selectedSaleItemIds.size} ` : ""}Selected to Return
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className={cn("bg-neutral-50 border-b border-black/10 py-3 shrink-0", entryPageSectionX)}>
          <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[280px]">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 pointer-events-none" />
              <Input
                ref={barcodeInputRef}
                type="text"
                placeholder="SCAN BARCODE OR SEARCH BY NAME, BRAND, CATEGORY..."
                value={barcodeInput}
                onChange={(e) => {
                  const newValue = e.target.value;
                  const now = Date.now();
                  const delta = now - lastInputTimeRef.current;
                  lastInputTimeRef.current = now;
                  barcodeScanner.recordKeystroke();
                  setBarcodeInput(newValue);

                  const isScannerLike =
                    barcodeScanner.detectScannerInput(newValue, delta) ||
                    (newValue.length >= 4 && delta < 50);

                  if (isScannerLike) {
                    barcodeScanner.scheduleAutoSubmit(newValue, (val) => {
                      void searchAndAddProduct(val);
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    barcodeScanner.cancelAutoSubmit();
                    const value = (e.currentTarget.value || barcodeInput).trim();
                    if (!value) return;
                    void searchAndAddProduct(value);
                  }
                  if (e.key === "Escape") {
                    barcodeScanner.cancelAutoSubmit();
                    setBarcodeInput("");
                    barcodeScanner.reset();
                  }
                }}
                className="pl-10 h-10 text-sm bg-white border-black/20 uppercase font-semibold"
                autoFocus
                autoComplete="off"
              />
            </div>
            <CameraScanButton
              onBarcodeScanned={(barcode) => {
                void searchAndAddProduct(barcode);
              }}
              className="h-10 border-black/20"
            />
            <Button
              type="submit"
              className="h-10 px-5 bg-black text-white hover:bg-black/90 font-bold shrink-0"
            >
              Add
            </Button>
            <div className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg ml-auto shrink-0">
              <span className="text-[12px] font-bold opacity-80">Total Qty</span>
              <span className="font-black tabular-nums text-[16px]">{totalReturnQty}</span>
            </div>
          </form>
        </section>

        <section className={cn("flex-1 min-h-0 pb-2 overflow-hidden bg-neutral-100 relative w-full min-w-0", entryPageSectionX)}>
          <div className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto isolate rounded-lg border border-black/15 shadow-sm bg-white">
            {returnItems.length > 0 ? (
              <Table className="table-fixed w-full min-w-[1000px] border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-white border-b-2 border-black hover:bg-white">
                    <TableHead className="w-[40px] text-center !text-[15px] uppercase font-bold text-black h-11">#</TableHead>
                    <TableHead className="min-w-[160px] text-left !text-[15px] uppercase font-bold text-black h-11">Product</TableHead>
                    <TableHead className="w-[70px] text-center !text-[15px] uppercase font-bold text-black h-11">Size</TableHead>
                    <TableHead className="w-[80px] text-center !text-[15px] uppercase font-bold text-black h-11">Color</TableHead>
                    <TableHead className="w-[110px] text-center !text-[15px] uppercase font-bold text-black h-11">Barcode</TableHead>
                    <TableHead className="w-[80px] text-center text-[13px] uppercase font-bold text-black h-11">Qty</TableHead>
                    <TableHead className="w-[96px] text-right text-[13px] uppercase font-bold text-black h-11 bg-neutral-100">Price</TableHead>
                    <TableHead className="w-[64px] text-center text-[13px] uppercase font-bold text-black h-11">GST%</TableHead>
                    <TableHead className="w-[96px] text-right text-[13px] uppercase font-bold text-black h-11 border-l-2 border-black bg-neutral-100">Total</TableHead>
                    <TableHead className="w-[40px] h-11" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnItems.map((item, index) => (
                    <TableRow key={index} className="border-b border-black/5">
                      <TableCell className="text-center text-black/60 font-mono !text-[15px] py-1.5">{index + 1}</TableCell>
                      <TableCell className="font-bold !text-[17px] text-black py-1.5 leading-snug">{item.productName}</TableCell>
                      <TableCell className="text-center !text-[16px] font-mono font-semibold text-black py-1.5">{item.size}</TableCell>
                      <TableCell className="text-center !text-[16px] font-medium text-black py-1.5">{item.color || "-"}</TableCell>
                      <TableCell className="text-center !text-[15px] font-mono font-medium text-black/80 py-1.5">{item.barcode || "-"}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <Input
                            type="number"
                            min="1"
                            max={item.maxReturnable || undefined}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-[56px] h-8 text-center text-sm border-black/20 font-mono"
                          />
                          {item.maxReturnable && (
                            <span className="text-[10px] text-black/50">Max: {item.maxReturnable}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right !text-[15px] font-mono font-semibold text-black py-1.5">
                        ₹{item.unitPrice.toFixed(2)}
                        {useOriginalPriceForReturn && item.discountPercent ? (
                          <span className="block text-[10px] text-black/50 font-normal">(before disc)</span>
                        ) : item.originalPrice && item.originalPrice !== item.unitPrice ? (
                          <span className="block text-[10px] text-black/50 font-normal">
                            MRP ₹{item.originalPrice.toFixed(0)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center !text-[15px] font-mono text-black py-1.5">{item.gstPercent}%</TableCell>
                      <TableCell className="text-right font-bold text-[15px] font-mono tabular-nums text-black py-1.5 border-l-2 border-black/10">
                        ₹{item.lineTotal.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-black/45">
                <Search className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-semibold">Scan barcode or search products to add return lines</p>
                <p className="text-xs mt-1">Or load items from an original sale invoice above</p>
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-4 h-9 px-4 bg-black text-white hover:bg-black/90 font-bold gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Add Product
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="center">
                    <Command>
                      <CommandInput placeholder="Search products..." value={searchTerm} onValueChange={setSearchTerm} />
                      <CommandList>
                        <CommandEmpty>No products found</CommandEmpty>
                        <CommandGroup>
                          {filteredProducts.map((product) => {
                            const productVariants = variants.filter((v) => v.product_id === product.id);
                            return productVariants.map((variant) => (
                              <CommandItem key={variant.id} onSelect={() => addProduct(product.id, variant.id)}>
                                <div className="flex-1">
                                  <div className="font-medium">{product.product_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    Size: {variant.size} | Price: ₹{variant.sale_price}
                                    {variant.barcode && ` | ${variant.barcode}`}
                                  </div>
                                </div>
                              </CommandItem>
                            ));
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
          {returnItems.length > 0 && (
            <div className="flex justify-end pt-2">
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-4 bg-black text-white hover:bg-black/90 font-bold gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add Product
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search products..." value={searchTerm} onValueChange={setSearchTerm} />
                    <CommandList>
                      <CommandEmpty>No products found</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map((product) => {
                          const productVariants = variants.filter((v) => v.product_id === product.id);
                          return productVariants.map((variant) => (
                            <CommandItem key={variant.id} onSelect={() => addProduct(product.id, variant.id)}>
                              <div className="flex-1">
                                <div className="font-medium">{product.product_name}</div>
                                <div className="text-sm text-muted-foreground">
                                  Size: {variant.size} | Price: ₹{variant.sale_price}
                                  {variant.barcode && ` | ${variant.barcode}`}
                                </div>
                              </div>
                            </CommandItem>
                          ));
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </section>
      </main>

      <footer className="entry-page-footer sale-order-footer shrink-0 relative z-40">
        <div className="bg-white text-black border-t-2 border-black w-full">
          <div className="flex items-center justify-between px-4 py-3 gap-4 w-full min-w-0 flex-wrap">
            <div className="flex items-center gap-3 shrink-0 text-[13px] font-bold text-black/70">
              {returnItems.length === 0 ? (
                <span>No items added yet</span>
              ) : (
                <span>
                  {returnItems.length} item{returnItems.length !== 1 ? "s" : ""} in return
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 ml-auto">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Items</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{returnItems.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Total Qty</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{totalReturnQty}</span>
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[13px] uppercase tracking-wide font-extrabold text-black/70">Gross</span>
                  <span className="text-[18px] font-extrabold tabular-nums">₹{totals.grossAmount.toFixed(0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[13px] uppercase tracking-wide font-extrabold text-black/70">GST</span>
                  <span className="text-[18px] font-extrabold tabular-nums">₹{totals.gstAmount.toFixed(0)}</span>
                </div>
              </div>
              <div className="pl-4 border-l-2 border-black flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-black underline underline-offset-2">
                  Net Return
                </span>
                <span className="text-[36px] font-black font-mono tabular-nums leading-none text-black tracking-tighter">
                  ₹{displayNetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-neutral-100 border-t border-black/10 flex flex-wrap items-center px-4 py-2.5 gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2.5 !text-[17px] text-black font-mono flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
            <span>
              Gross <span className="font-extrabold">₹{totals.grossAmount.toFixed(0)}</span>
            </span>
            <span className="text-black/30">=</span>
            <span>
              Taxable <span className="font-extrabold">₹{taxableAmount.toFixed(2)}</span>
            </span>
            <span className="text-black/30">+</span>
            <span>
              GST <span className="font-extrabold">₹{totals.gstAmount.toFixed(2)}</span>
            </span>
            <span className="text-black/30">=</span>
            <span>
              Net <span className="font-black">₹{displayNetAmount.toLocaleString("en-IN")}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => orgNavigate("/sale-returns")}
              className="h-9 px-3 text-[13px] font-bold text-red-700 hover:bg-red-50 gap-1.5 border border-red-200"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || returnItems.length === 0}
              className="h-9 px-5 text-[14px] bg-black text-white hover:bg-black/90 font-extrabold gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {isEditMode ? "Update Return" : "Save Return"}
                </>
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
