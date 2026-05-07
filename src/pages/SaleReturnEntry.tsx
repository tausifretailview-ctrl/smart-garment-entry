import { useState, useEffect, useRef } from "react";
import { logError } from "@/lib/errorLogger";
import { insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";
import {
  deleteJournalEntryByReference,
  recordSaleReturnJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Trash2, Search, Plus, Check, ChevronsUpDown } from "lucide-react";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const navigate = useNavigate();
  const { editId } = useParams<{ editId?: string }>();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

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
  }>>([]);
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
        navigate("/sale-returns");
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
  // Get unit price from a specific sale's items for a given variant
  const getPriceFromSale = async (
    variantId: string, 
    specificSaleId?: string,
    useOriginalPrice?: boolean
  ): Promise<{ price: number; originalPrice?: number; discountPercent?: number } | null> => {
    try {
      let query = supabase
        .from('sale_items')
        .select('unit_price, per_qty_net_amount, line_total, quantity, discount_percent')
        .eq('variant_id', variantId)
        .is('deleted_at', null);

      if (specificSaleId) {
        query = query.eq('sale_id', specificSaleId);
      } else {
        query = query.order('created_at', { ascending: false }).limit(1);
      }

      const { data } = await query.maybeSingle();
      if (!data) return null;

      const origPrice = (data.unit_price && data.unit_price > 0) ? data.unit_price : undefined;
      const discPct = (data.discount_percent && data.discount_percent > 0) ? data.discount_percent : undefined;

      let price: number | null = null;
      if (useOriginalPrice) {
        // Return original price before discount (for exchange scenarios)
        if (data.unit_price && data.unit_price > 0) price = data.unit_price;
        else if (data.per_qty_net_amount && data.per_qty_net_amount > 0) price = data.per_qty_net_amount;
      } else {
        // DEFAULT: Return actual paid price after all discounts (accounting-correct)
        if (data.per_qty_net_amount && data.per_qty_net_amount > 0) price = data.per_qty_net_amount;
        else if (data.line_total && data.quantity) price = data.line_total / data.quantity;
        else if (data.unit_price && data.unit_price > 0) price = data.unit_price;
      }

      if (price === null) return null;
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

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!barcodeInput.trim()) return;
    const query = barcodeInput.trim();
    
    let variant = variants.find((v) => v.barcode === query);
    let product = variant ? products.find((p) => p.id === variant!.product_id) : null;
    
    if (!variant) {
      const matchedProduct = products.find((p) => 
        p.product_name.toLowerCase().includes(query.toLowerCase())
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
          .eq("barcode", query)
          .eq("active", true)
          .is("deleted_at", null)
          .maybeSingle();

        if (dbVariant && (dbVariant.products as any)?.status === 'active' && !(dbVariant.products as any)?.deleted_at) {
          const { count } = await supabase
            .from("sale_items")
            .select("id", { count: "exact", head: true })
            .eq("variant_id", dbVariant.id)
            .is("deleted_at", null);

          if (count && count > 0) {
            const p = dbVariant.products as any;
            product = { id: p.id, product_name: p.product_name, brand: p.brand, category: p.category, hsn_code: p.hsn_code };
            variant = { id: dbVariant.id, product_id: dbVariant.product_id, size: dbVariant.size, color: dbVariant.color || null, sale_price: dbVariant.sale_price || 0, stock_qty: dbVariant.stock_qty, barcode: dbVariant.barcode, gst_per: p.gst_per || 0 };
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
        variant: "destructive" 
      });
      setBarcodeInput("");
      return;
    }
    
    // Check max returnable before adding
    const maxReturnable = await getMaxReturnable(variant!.id);
    
    const existingIndex = returnItems.findIndex(
      (item) => item.variantId === variant!.id
    );
    
    if (existingIndex !== -1) {
      const currentQty = returnItems[existingIndex].quantity;
      if (currentQty >= maxReturnable) {
        toast({ title: "Cannot Return", description: `${product!.product_name} (${variant!.size}) — max returnable is ${maxReturnable}`, variant: "destructive" });
        setBarcodeInput("");
        return;
      }
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = 
        updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      updated[existingIndex].maxReturnable = maxReturnable;
      setReturnItems(updated);
    } else {
      if (maxReturnable <= 0) {
        toast({ title: "Cannot Return", description: `${product!.product_name} (${variant!.size}) — all sold units already returned`, variant: "destructive" });
        setBarcodeInput("");
        return;
      }
      const fetchedResult = await getPriceFromSale(variant!.id, originalSaleId || undefined, useOriginalPriceForReturn);
      let unitPrice = fetchedResult?.price ?? variant!.sale_price;

      const newItem: ReturnItem = {
        productId: product!.id,
        variantId: variant!.id,
        productName: product!.product_name,
        size: variant!.size,
        color: variant!.color || undefined,
        barcode: variant!.barcode,
        quantity: 1,
        unitPrice,
        gstPercent: variant!.gst_per,
        lineTotal: unitPrice,
        hsnCode: product!.hsn_code || '',
        maxReturnable,
        originalPrice: fetchedResult?.originalPrice,
        discountPercent: fetchedResult?.discountPercent,
      };
      setReturnItems(prev => [...prev, newItem]);
    }
    
    setBarcodeInput("");
    barcodeInputRef.current?.focus();
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
        .select('id, customer_id, sale_items(id, product_id, variant_id, product_name, size, color, barcode, unit_price, gst_percent, hsn_code, quantity, line_total)')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_number', originalSaleNumber.trim())
        .is('deleted_at', null)
        .single();

      if (saleError || !sale) {
        toast({ title: 'Not Found', description: `No sale found with number "${originalSaleNumber.trim()}"`, variant: 'destructive' });
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

      const saleItemsArr = (sale as any).sale_items || [];
      const items = saleItemsArr.map((item: any) => ({
        variantId: item.variant_id || '',
        productName: item.product_name || '',
        size: item.size || '',
        color: item.color || null,
        barcode: item.barcode || null,
        unitPrice: item.unit_price || 0,
        gstPercent: item.gst_percent || 0,
        hsnCode: item.hsn_code || '',
        productId: item.product_id || '',
        quantity: item.quantity || 1,
      }));

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
    toAdd.forEach(item => {
      const lineTotal = item.unitPrice * item.quantity;
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
          unitPrice: item.unitPrice,
          gstPercent: item.gstPercent,
          lineTotal,
          hsnCode: item.hsnCode,
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
              await supabase.from("sale_return_items").delete().eq("return_id", returnData.id);
              await supabase.from("sale_returns").delete().eq("id", returnData.id);
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
              await supabase.from("sale_return_items").delete().eq("return_id", createdReturnId);
              await supabase.from("sale_returns").delete().eq("id", createdReturnId);
            } catch (cleanupErr) {
              console.error("Cleanup failed:", cleanupErr);
            }
          }
          throw innerError;
        }
      }

      navigate("/sale-returns");
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

  if (editLoading) {
    return (
      <div className="w-full px-6 py-6 flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading sale return...</p>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-5 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-destructive rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {isEditMode ? 'Edit Sale Return' : 'Sale Return Entry'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEditMode ? `Editing return ${nextReturnNumber}` : 'Create a new return against a sale'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/sale-returns')}
          className="h-9 px-4 text-sm font-medium border-border"
        >
          ← Back to Dashboard
        </Button>
      </div>

      {/* Barcode Scanner */}
      <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 bg-primary rounded-full" />
          <h2 className="font-semibold text-sm text-foreground uppercase tracking-wide">Barcode Scanner</h2>
        </div>
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              type="text"
              placeholder="SCAN BARCODE OR ENTER PRODUCT NAME..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="pl-9 h-10 text-sm uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
              autoFocus
            />
          </div>
          <CameraScanButton
            onBarcodeScanned={(barcode) => {
              setBarcodeInput(barcode);
              setTimeout(() => {
                if (barcodeInputRef.current) {
                  barcodeInputRef.current.focus();
                  const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                  barcodeInputRef.current.dispatchEvent(enterEvent);
                }
              }, 100);
            }}
            className="h-10"
          />
          <Button type="submit" className="h-10 px-5 text-sm font-semibold">
            Add
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Scan barcode or enter product name/barcode number to add product to return
        </p>
      </div>

      {/* Return Details */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
          <div className="w-1.5 h-5 bg-orange-500 rounded-full" />
          <h2 className="font-semibold text-sm text-foreground uppercase tracking-wide">Return Details</h2>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Return No</Label>
              <Input
                value={nextReturnNumber}
                readOnly
                className="bg-muted h-10 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer (Optional)</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between font-normal h-10 text-sm"
                  >
                    {selectedCustomer
                      ? customers.find(c => c.id === selectedCustomer)?.customer_name || "Selected"
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
                              <Check className="ml-auto h-4 w-4 text-primary" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Return Date</Label>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax Type</Label>
              <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive") => setTaxType(value)}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive">Exclusive GST</SelectItem>
                  <SelectItem value="inclusive">Inclusive GST</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2 lg:col-span-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Original Sale Number (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter sale invoice number e.g. INV/25-26/123 or POS/25-26/34"
                  value={originalSaleNumber}
                  onChange={(e) => {
                    setOriginalSaleNumber(e.target.value);
                    setOriginalSaleId('');
                    setSaleLoaded(false);
                    setSaleItems([]);
                    setSelectedSaleItemIds(new Set());
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadSaleByNumber(); } }}
                  className="h-10 flex-1 text-sm"
                />
                <Button
                  type="button"
                  onClick={loadSaleByNumber}
                  disabled={saleLoading || !originalSaleNumber.trim()}
                  className="h-10 px-4 flex items-center gap-2"
                >
                  {saleLoading ? (
                    <><span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Loading...</>
                  ) : (
                    <><Search className="h-4 w-4" />Load Items</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Enter sale number and click "Load Items" to auto-populate products for return selection</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sale Items Selection Panel */}
      {saleLoaded && saleItems.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-blue-200 dark:border-blue-800 bg-blue-100/60 dark:bg-blue-900/30">
            <div className="flex items-center gap-2">
              <div className="w-2 h-5 bg-blue-500 rounded-full" />
              <h3 className="font-semibold text-blue-900 dark:text-blue-200 text-sm">
                Sale Items — {originalSaleNumber}
              </h3>
              <span className="text-xs text-blue-600 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 px-2 py-0.5 rounded-full font-medium">
                {saleItems.length} items
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                onClick={() => setSelectedSaleItemIds(new Set(saleItems.map(i => i.variantId)))}
              >
                Select All
              </button>
              <span className="text-blue-300 dark:text-blue-600">|</span>
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                onClick={() => setSelectedSaleItemIds(new Set())}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="divide-y divide-blue-100 dark:divide-blue-800">
            {saleItems.map((item, i) => {
              const isSelected = selectedSaleItemIds.has(item.variantId);
              return (
                <div
                  key={item.variantId + i}
                  onClick={() => toggleSaleItemSelection(item.variantId)}
                  className={`flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-100/80 dark:bg-blue-900/40' : 'hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected ? 'bg-blue-600 border-blue-600' : 'border-blue-300 dark:border-blue-600 bg-white dark:bg-transparent'
                  }`}>
                    {isSelected && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{item.productName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">Size: <span className="font-medium text-foreground">{item.size}</span></span>
                      {item.color && <span className="text-xs text-muted-foreground">Color: <span className="font-medium text-foreground">{item.color}</span></span>}
                      {item.barcode && <span className="text-xs text-muted-foreground">Barcode: <span className="font-mono text-foreground">{item.barcode}</span></span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-foreground">₹{item.unitPrice.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity} | GST: {item.gstPercent}%</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-blue-200 dark:border-blue-800 bg-blue-100/60 dark:bg-blue-900/30 flex items-center justify-between">
            <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              {selectedSaleItemIds.size} of {saleItems.length} selected
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setSaleLoaded(false); setSaleItems([]); setSelectedSaleItemIds(new Set()); }}
                className="h-8 text-xs"
              >
                Dismiss
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedSaleItemIds.size === 0}
                onClick={addSelectedSaleItems}
                className="h-8 text-xs px-4"
              >
                Add {selectedSaleItemIds.size > 0 ? `${selectedSaleItemIds.size} ` : ''}Selected to Return
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Return Items */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 bg-green-600 rounded-full" />
            <h2 className="font-semibold text-sm text-foreground uppercase tracking-wide">Return Items</h2>
            {returnItems.length > 0 && (
              <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                {returnItems.length} item{returnItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" className="h-8 px-3 text-xs font-semibold gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Product
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="end">
              <Command>
                <CommandInput
                  placeholder="Search products..."
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                />
                <CommandList>
                  <CommandEmpty>No products found</CommandEmpty>
                  <CommandGroup>
                    {filteredProducts.map((product) => {
                      const productVariants = variants.filter((v) => v.product_id === product.id);
                      return productVariants.map((variant) => (
                        <CommandItem
                          key={variant.id}
                          onSelect={() => addProduct(product.id, variant.id)}
                        >
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

        <div className="px-5 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Product</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Size</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Color</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">Barcode</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 w-24">Qty</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 text-right">Price</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 text-right">GST%</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40 text-right">Total</TableHead>
                <TableHead className="bg-muted/40 w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No items added
                  </TableCell>
                </TableRow>
              ) : (
                returnItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                    <TableCell className="text-sm">{item.size}</TableCell>
                    <TableCell className="text-sm">{item.color || "-"}</TableCell>
                    <TableCell className="text-sm font-mono">{item.barcode || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <Input
                          type="number"
                          min="1"
                          max={item.maxReturnable || undefined}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-20 h-8 text-sm text-center"
                        />
                        {item.maxReturnable && (
                          <span className="text-[10px] text-muted-foreground">Max: {item.maxReturnable}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      ₹{item.unitPrice.toFixed(2)}
                      {useOriginalPriceForReturn && item.discountPercent ? (
                        <span className="block text-[10px] text-muted-foreground">(before disc)</span>
                      ) : item.originalPrice && item.originalPrice !== item.unitPrice ? (
                        <span className="block text-[10px] text-muted-foreground">MRP ₹{item.originalPrice.toFixed(0)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm">{item.gstPercent}%</TableCell>
                    <TableCell className="text-right text-sm font-semibold">₹{item.lineTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Totals */}
          <div className="mt-5 flex justify-end">
            <div className="w-72 bg-muted/30 rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-border">
                <span className="text-sm text-muted-foreground">Gross Amount</span>
                <span className="text-sm font-semibold text-foreground">₹{totals.grossAmount.toFixed(2)}</span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-border">
                <span className="text-sm text-muted-foreground">Total GST</span>
                <span className="text-sm font-semibold text-foreground">₹{totals.gstAmount.toFixed(2)}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between bg-muted/50">
                <span className="text-sm font-bold text-foreground">Net Amount</span>
                <span className="text-lg font-extrabold text-green-600">₹{totals.netAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
          <div className="w-1.5 h-5 bg-muted-foreground rounded-full" />
          <h2 className="font-semibold text-sm text-foreground uppercase tracking-wide">Additional Notes</h2>
        </div>
        <div className="px-5 py-4">
          <Textarea
            placeholder="Reason for return, notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {returnItems.length === 0
            ? 'No items added yet'
            : `${returnItems.length} item(s) · Net Return: ₹${totals.netAmount.toFixed(2)}`}
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/sale-returns')}
            className="h-9 px-5 text-sm font-medium"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || returnItems.length === 0}
            className="h-9 px-6 text-sm font-semibold min-w-[130px]"
          >
            {saving ? (
              <><span className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />Saving...</>
            ) : (
              isEditMode ? 'Update Return' : 'Save Return'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
