import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Minus, Search, Loader2, Scan, FileText, Banknote, CreditCard, RotateCcw } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { insertLedgerCredit } from "@/lib/customerLedger";

type RefundType = "cash_refund" | "credit_note" | "exchange";

interface ReturnItem {
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  hsn_code: string | null;
}

interface Variant {
  id: string;
  product_id: string;
  size: string;
  sale_price: number;
  barcode: string | null;
  gst_per: number;
}

interface SaleItemRecord {
  variant_id: string;
  product_id: string;
  product_name: string;
  size: string;
  barcode: string | null;
  quantity: number;
  per_qty_net_amount: number;
  unit_price: number;
  line_total: number;
}

interface FloatingSaleReturnProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  customerId?: string;
  customerName?: string;
  onReturnSaved: (returnAmount: number, returnNumber: string, refundType: RefundType) => void;
}

export const FloatingSaleReturn = ({
  open,
  onOpenChange,
  organizationId,
  customerId,
  customerName,
  onReturnSaved,
}: FloatingSaleReturnProps) => {
  const { toast } = useToast();
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [billNumber, setBillNumber] = useState("");
  const [billSaleId, setBillSaleId] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<SaleItemRecord[]>([]);
  const [billLookupLoading, setBillLookupLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [refundType, setRefundType] = useState<RefundType>("credit_note");
  const [useOriginalPrice, setUseOriginalPrice] = useState(false);

  // Inline customer picker (used when no customer was passed from POS)
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [customerOptions, setCustomerOptions] = useState<Array<{ id: string; customer_name: string; phone: string | null }>>([]);
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null);
  const [pickedCustomerName, setPickedCustomerName] = useState<string | null>(null);

  // Effective customer (prop wins, otherwise inline-picked)
  const effectiveCustomerId = customerId || pickedCustomerId || undefined;
  const effectiveCustomerName = customerName || pickedCustomerName || undefined;

  // Pending credit notes for current customer (unapplied sale returns with credit_status = 'pending')
  const [pendingCreditNotes, setPendingCreditNotes] = useState<Array<{
    id: string;
    returnNumber: string;
    returnDate: string;
    creditAmount: number;
    creditNoteId: string | null;
  }>>([]);
  const [appliedCreditNoteId, setAppliedCreditNoteId] = useState<string | null>(null);
  const [appliedCreditAmount, setAppliedCreditAmount] = useState(0);
  // Per-CN editable redeem amount (keyed by sale_return id). Defaults to full amount.
  const [cnRedeemInputs, setCnRedeemInputs] = useState<Record<string, number>>({});

  // Fetch sale return price setting
  useEffect(() => {
    if (organizationId) {
      supabase
        .from("settings")
        .select("sale_settings")
        .eq("organization_id", organizationId)
        .maybeSingle()
        .then(({ data }) => {
          const saleSettings = (data as any)?.sale_settings;
          setUseOriginalPrice(!!saleSettings?.sale_return_use_original_price);
        });
    }
  }, [organizationId]);

  // Inline customer search — only relevant when no customer was passed from POS
  useEffect(() => {
    if (!open || customerId || !organizationId) return;
    const term = customerSearchTerm.trim();
    const handle = setTimeout(async () => {
      let query = supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("customer_name")
        .limit(30);
      if (term) {
        query = query.or(`customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      const { data } = await query;
      setCustomerOptions((data as any) || []);
    }, 200);
    return () => clearTimeout(handle);
  }, [open, organizationId, customerId, customerSearchTerm]);

  // Load sold products when dialog opens
  useEffect(() => {
    if (open && organizationId) {
      loadSoldProducts();
      setTimeout(() => barcodeInputRef.current?.focus(), 200);
    }
    if (!open) {
      setReturnItems([]);
      setBarcodeInput("");
      setSearchTerm("");
      setBillNumber("");
      setBillSaleId(null);
      setBillItems([]);
      setRefundType("credit_note");
      setPendingCreditNotes([]);
      setAppliedCreditNoteId(null);
      setAppliedCreditAmount(0);
      setCnRedeemInputs({});
      setPickedCustomerId(null);
      setPickedCustomerName(null);
      setCustomerSearchTerm("");
      setCustomerSearchOpen(false);
    }
  }, [open, organizationId, customerId]);

  // Load pending credit notes whenever the effective customer changes
  // (covers both prop-passed customer and inline-picked customer).
  useEffect(() => {
    if (!open || !organizationId || !effectiveCustomerId) {
      setPendingCreditNotes([]);
      setAppliedCreditNoteId(null);
      setAppliedCreditAmount(0);
      setCnRedeemInputs({});
      return;
    }
    supabase
      .from("sale_returns")
      .select("id, return_number, return_date, net_amount, credit_note_id")
      .eq("customer_id", effectiveCustomerId)
      .eq("organization_id", organizationId)
      .eq("credit_status", "pending")
      .is("deleted_at", null)
      .order("return_date", { ascending: false })
      .then(({ data }) => {
        const list = (data || []).map((r: any) => ({
          id: r.id,
          returnNumber: r.return_number,
          returnDate: r.return_date,
          creditAmount: Number(r.net_amount) || 0,
          creditNoteId: r.credit_note_id || null,
        }));
        setPendingCreditNotes(list);
        // Reset edited amounts to full when list changes
        const defaults: Record<string, number> = {};
        list.forEach((c) => { defaults[c.id] = c.creditAmount; });
        setCnRedeemInputs(defaults);
        setAppliedCreditNoteId(null);
        setAppliedCreditAmount(0);
      });
  }, [open, organizationId, effectiveCustomerId]);

  const loadSoldProducts = async () => {
    setLoading(true);
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
          .eq("sales.organization_id", organizationId)
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
        setLoading(false);
        return;
      }

      const allProducts: Product[] = [];
      for (let i = 0; i < productIdArray.length; i += 500) {
        const batch = productIdArray.slice(i, i + 500);
        const { data } = await supabase
          .from("products")
          .select("id, product_name, brand, hsn_code")
          .in("id", batch)
          .eq("status", "active")
          .is("deleted_at", null);
        allProducts.push(...(data || []));
      }

      const variantIdArray = Array.from(soldVariantIds);
      const allVariants: Variant[] = [];
      for (let i = 0; i < variantIdArray.length; i += 500) {
        const batch = variantIdArray.slice(i, i + 500);
        const { data } = await supabase
          .from("product_variants")
          .select("id, product_id, size, sale_price, barcode, products(gst_per)")
          .in("id", batch)
          .eq("active", true)
          .is("deleted_at", null);
        allVariants.push(
          ...(data?.map(v => ({
            id: v.id,
            product_id: v.product_id,
            size: v.size,
            sale_price: v.sale_price || 0,
            barcode: v.barcode,
            gst_per: (v.products as any)?.gst_per || 0,
          })) || [])
        );
      }

      setProducts(allProducts);
      setVariants(allVariants);
    } catch (error) {
      console.error("Error loading sold products:", error);
    } finally {
      setLoading(false);
    }
  };

  // Look up sale by bill number
  const lookupBillNumber = async () => {
    if (!billNumber.trim()) {
      setBillSaleId(null);
      setBillItems([]);
      return;
    }
    setBillLookupLoading(true);
    try {
      const { data: sale } = await supabase
        .from("sales")
        .select("id")
        .eq("sale_number", billNumber.trim())
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!sale) {
        toast({ title: "Not Found", description: `No sale found with number "${billNumber.trim()}"`, variant: "destructive" });
        setBillSaleId(null);
        setBillItems([]);
        setBillLookupLoading(false);
        return;
      }

      setBillSaleId(sale.id);

      const { data: items } = await supabase
        .from("sale_items")
        .select("variant_id, product_id, product_name, size, barcode, quantity, per_qty_net_amount, unit_price, line_total")
        .eq("sale_id", sale.id)
        .is("deleted_at", null);

      setBillItems((items as SaleItemRecord[]) || []);
      toast({ title: "Bill Found", description: `${(items || []).length} items loaded from ${billNumber.trim()}` });
    } catch (err) {
      console.error("Bill lookup error:", err);
    } finally {
      setBillLookupLoading(false);
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  };

  const fetchUnitPrice = async (variantId: string, fallbackPrice: number): Promise<number> => {
    if (billSaleId && billItems.length > 0) {
      const billItem = billItems.find(bi => bi.variant_id === variantId);
      if (billItem) {
        if (useOriginalPrice && billItem.unit_price && billItem.unit_price > 0) {
          return billItem.unit_price;
        }
        if (billItem.per_qty_net_amount && billItem.per_qty_net_amount > 0) {
          return billItem.per_qty_net_amount;
        }
        if (billItem.line_total && billItem.quantity) {
          return billItem.line_total / billItem.quantity;
        }
      }
    }

    const priceField = useOriginalPrice ? "unit_price" : "per_qty_net_amount";
    const { data: saleItemData } = await supabase
      .from("sale_items")
      .select(`${priceField}, unit_price, per_qty_net_amount, line_total, quantity`)
      .eq("variant_id", variantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (saleItemData) {
      if (useOriginalPrice && saleItemData.unit_price && saleItemData.unit_price > 0) {
        return saleItemData.unit_price;
      }
      if (saleItemData.per_qty_net_amount && saleItemData.per_qty_net_amount > 0) {
        return saleItemData.per_qty_net_amount;
      }
      if (saleItemData.line_total && saleItemData.quantity) {
        return saleItemData.line_total / saleItemData.quantity;
      }
    }
    return fallbackPrice;
  };

  const addProduct = async (productId: string, variantId: string) => {
    const product = products.find(p => p.id === productId);
    const variant = variants.find(v => v.id === variantId);
    if (!product || !variant) return;

    if (billSaleId && billItems.length > 0) {
      const inBill = billItems.find(bi => bi.variant_id === variantId);
      if (!inBill) {
        toast({ title: "Warning", description: "This item was not found in the specified bill", variant: "destructive" });
      }
    }

    const existingIndex = returnItems.findIndex(item => item.variantId === variantId);
    if (existingIndex !== -1) {
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setReturnItems(updated);
      setSearchOpen(false);
      setSearchTerm("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
      return;
    }

    const unitPrice = await fetchUnitPrice(variantId, variant.sale_price);

    setReturnItems(prev => [...prev, {
      productId: product.id,
      variantId: variant.id,
      productName: product.product_name,
      size: variant.size,
      barcode: variant.barcode,
      quantity: 1,
      unitPrice,
      lineTotal: unitPrice,
    }]);
    setSearchOpen(false);
    setSearchTerm("");
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const query = barcodeInput.trim();

    let variant = variants.find(v => v.barcode === query);
    let product = variant ? products.find(p => p.id === variant!.product_id) : null;

    if (!variant) {
      const matchedProduct = products.find(p =>
        p.product_name.toLowerCase().includes(query.toLowerCase())
      );
      if (matchedProduct) {
        product = matchedProduct;
        variant = variants.find(v => v.product_id === matchedProduct.id);
      }
    }

    if (!variant || !product) {
      try {
        const { data: dbVariant } = await supabase
          .from("product_variants")
          .select("id, product_id, size, sale_price, barcode, products(id, product_name, brand, hsn_code, gst_per, status, deleted_at)")
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
            product = { id: p.id, product_name: p.product_name, brand: p.brand, hsn_code: p.hsn_code };
            variant = { id: dbVariant.id, product_id: dbVariant.product_id, size: dbVariant.size, sale_price: dbVariant.sale_price || 0, barcode: dbVariant.barcode, gst_per: p.gst_per || 0 };

            if (!products.find(pp => pp.id === p.id)) setProducts(prev => [...prev, product!]);
            if (!variants.find(vv => vv.id === dbVariant.id)) setVariants(prev => [...prev, variant!]);
          }
        }
      } catch (err) {
        console.error("DB barcode lookup error:", err);
      }
    }

    if (!variant || !product) {
      toast({ title: "Not Found", description: "No sold product found with this barcode", variant: "destructive" });
      setBarcodeInput("");
      return;
    }

    if (billSaleId && billItems.length > 0) {
      const inBill = billItems.find(bi => bi.variant_id === variant!.id);
      if (!inBill) {
        toast({ title: "Warning", description: "This item was not found in the specified bill" });
      }
    }

    const existingIndex = returnItems.findIndex(item => item.variantId === variant!.id);
    if (existingIndex !== -1) {
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setReturnItems(updated);
    } else {
      const unitPrice = await fetchUnitPrice(variant.id, variant.sale_price);
      setReturnItems(prev => [...prev, {
        productId: product!.id,
        variantId: variant!.id,
        productName: product!.product_name,
        size: variant!.size,
        barcode: variant!.barcode,
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
      }]);
    }

    setBarcodeInput("");
    barcodeInputRef.current?.focus();
  };

  const updateQuantity = (index: number, qty: number) => {
    if (qty < 1) return;
    const updated = [...returnItems];
    updated[index].quantity = qty;
    updated[index].lineTotal = qty * updated[index].unitPrice;
    setReturnItems(updated);
  };

  const removeItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalAmount = returnItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const handleSaveReturn = async () => {
    // PRIMARY GUARD: synchronous ref (React state updates are async — `saving` check is insufficient against rapid double-clicks)
    if (savingRef.current) return;
    if (saving) return;
    savingRef.current = true;
    try {
      await handleSaveReturnInner();
    } finally {
      savingRef.current = false;
    }
  };

  const handleSaveReturnInner = async () => {
    if (returnItems.length === 0 && !appliedCreditNoteId) {
      toast({ title: "Error", description: "Add items to return or select a pending credit note", variant: "destructive" });
      return;
    }

    // Credit Note refund REQUIRES a customer (otherwise the credit cannot be tracked/applied later)
    if (refundType === "credit_note" && returnItems.length > 0 && !effectiveCustomerId) {
      toast({
        title: "Customer Required",
        description: "Please select a customer to generate a Credit Note. Use the customer search above.",
        variant: "destructive",
      });
      return;
    }

    // If only applying a credit note (no return items), skip the full return flow
    if (returnItems.length === 0 && appliedCreditNoteId) {
      const cn = pendingCreditNotes.find(c => c.id === appliedCreditNoteId);
      if (!cn) return;
      const redeemAmount = Math.max(0, Math.min(appliedCreditAmount || cn.creditAmount, cn.creditAmount));
      if (redeemAmount <= 0) {
        toast({ title: "Invalid", description: "Redeem amount must be greater than 0", variant: "destructive" });
        return;
      }
      const isPartial = redeemAmount < cn.creditAmount;
      setSaving(true);
      try {
        if (isPartial) {
          // Keep SR pending, reduce its net_amount by what's being redeemed now
          await supabase.from("sale_returns").update({
            net_amount: cn.creditAmount - redeemAmount,
          } as any).eq("id", cn.id);
        } else {
          await supabase.from("sale_returns").update({
            credit_status: "adjusted",
          }).eq("id", cn.id);
        }

        const { data: lastVoucher } = await supabase
          .from("voucher_entries")
          .select("voucher_number")
          .eq("organization_id", organizationId)
          .eq("voucher_type", "receipt")
          .order("created_at", { ascending: false })
          .limit(1);
        const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
        await supabase.from("voucher_entries").insert({
          organization_id: organizationId,
          voucher_number: `RCP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`,
          voucher_type: "receipt",
          voucher_date: new Date().toISOString().split("T")[0],
          reference_type: "customer",
          reference_id: effectiveCustomerId,
          description: isPartial
            ? `Credit note ${cn.returnNumber} partially applied (₹${Math.round(redeemAmount)} of ₹${Math.round(cn.creditAmount)}) via POS`
            : `Credit note ${cn.returnNumber} applied via POS`,
          total_amount: redeemAmount,
          payment_method: "credit_note_adjustment",
        });

        toast({
          title: "Credit Note Applied",
          description: `${cn.returnNumber} — ₹${Math.round(redeemAmount).toLocaleString("en-IN")} applied to current bill${isPartial ? ` (₹${Math.round(cn.creditAmount - redeemAmount).toLocaleString("en-IN")} remaining)` : ""}`,
        });
        onReturnSaved(redeemAmount, cn.returnNumber, "credit_note");
        onOpenChange(false);
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Failed to apply credit note", variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    let createdReturnId: string | null = null;
    try {
      const { data: returnNumber, error: rnError } = await supabase
        .rpc('generate_sale_return_number', { p_organization_id: organizationId });
      if (rnError) throw rnError;

      const grossAmount = totalAmount;
      const gstAmount = returnItems.reduce((sum, item) => {
        const v = variants.find(vv => vv.id === item.variantId);
        const gstPer = v?.gst_per || 0;
        return sum + (item.lineTotal - (item.lineTotal / (1 + gstPer / 100)));
      }, 0);

      // Determine credit_status based on refund type
      const creditStatus =
        refundType === "cash_refund" ? "refunded" :
        refundType === "exchange" ? "adjusted" :
        "pending";

      const { data: returnData, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          return_number: returnNumber,
          organization_id: organizationId,
          customer_id: effectiveCustomerId || null,
          customer_name: effectiveCustomerName || "Walk-in Customer",
          return_date: new Date().toISOString().split("T")[0],
          gross_amount: grossAmount,
          gst_amount: gstAmount,
          net_amount: grossAmount,
          refund_type: refundType,
          credit_status: creditStatus,
          linked_sale_id: billSaleId || null,
          original_sale_number: billSaleId ? billNumber.trim() : null,
        } as any)
        .select()
        .single();

      if (returnError) throw returnError;
      createdReturnId = returnData.id;

      const itemsToInsert = returnItems.map(item => {
        const v = variants.find(vv => vv.id === item.variantId);
        return {
          return_id: returnData.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          gst_percent: v?.gst_per || 0,
          line_total: item.lineTotal,
        };
      });

      const { error: itemsError } = await supabase
        .from("sale_return_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Stock is restored automatically by the database trigger
      // (restore_stock_on_sale_return) — no manual increment needed

      // Customer Account Statement — write SR credit so it shows in the new
      // ledger and gets offset by future exchange/refund debits.
      if (effectiveCustomerId) {
        insertLedgerCredit({
          organizationId,
          customerId: effectiveCustomerId,
          voucherType: 'SALE_RETURN',
          voucherNo: returnNumber,
          particulars: `Sale Return ${returnNumber}`,
          transactionDate: new Date().toISOString().slice(0, 10),
          amount: grossAmount,
        });
      }

      // For cash_refund: create payment voucher so ledger balance updates
      if (refundType === "cash_refund" && effectiveCustomerId) {
        try {
          const { data: lastV } = await supabase
            .from("voucher_entries")
            .select("voucher_number")
            .eq("organization_id", organizationId)
            .eq("voucher_type", "payment")
            .order("created_at", { ascending: false })
            .limit(1);
          const lastNum = lastV?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
          await supabase.from("voucher_entries").insert({
            organization_id: organizationId,
            voucher_number: `PAY-${String(parseInt(lastNum) + 1).padStart(5, "0")}`,
            voucher_type: "payment",
            voucher_date: new Date().toISOString().split("T")[0],
            reference_type: "customer",
            reference_id: effectiveCustomerId,
            description: `Refund paid for sale return: ${returnNumber}`,
            total_amount: grossAmount,
            payment_method: "cash",
          });
        } catch (vErr) { console.error("Refund voucher failed:", vErr); }
      }

      // For credit_note: create a real credit_notes record and mark sale_return as adjusted
      // (otherwise it stays 'pending' forever and inflates the customer ledger)
      if (refundType === "credit_note" && effectiveCustomerId) {
        try {
          const { data: cnNumber } = await supabase
            .rpc('generate_credit_note_number', { p_organization_id: organizationId });

          const { data: creditNote } = await supabase
            .from('credit_notes')
            .insert({
              organization_id: organizationId,
              credit_note_number: cnNumber,
              sale_id: billSaleId || null,
              customer_id: effectiveCustomerId,
              customer_name: effectiveCustomerName || 'Walk-in Customer',
              credit_amount: grossAmount,
              used_amount: 0,
              status: 'active',
              notes: `Credit note from sale return ${returnNumber}`,
            } as any)
            .select('id')
            .single();

          if (creditNote) {
            await supabase
              .from('sale_returns')
              .update({
                credit_status: 'adjusted',
                credit_note_id: creditNote.id,
              } as any)
              .eq('id', returnData.id);
          }
        } catch (cnErr) {
          console.error('Credit note creation failed:', cnErr);
        }
      } else if (refundType === "credit_note" && !effectiveCustomerId) {
        // No customer — credit note cannot be tracked, mark as adjusted_outstanding
        try {
          await supabase
            .from('sale_returns')
            .update({ credit_status: 'adjusted_outstanding' } as any)
            .eq('id', returnData.id);
        } catch (e) { console.error('CN status update failed:', e); }
      }

      // Apply pending credit note if one was selected alongside this return
      if (appliedCreditNoteId && effectiveCustomerId) {
        try {
          const cn = pendingCreditNotes.find(c => c.id === appliedCreditNoteId);
          if (cn) {
            const redeemAmount = Math.max(0, Math.min(appliedCreditAmount || cn.creditAmount, cn.creditAmount));
            const isPartial = redeemAmount < cn.creditAmount;
            if (isPartial) {
              await supabase.from("sale_returns").update({
                net_amount: cn.creditAmount - redeemAmount,
              } as any).eq("id", cn.id);
            } else {
              await supabase
                .from("sale_returns")
                .update({
                  credit_status: "adjusted",
                  linked_sale_id: null,
                })
                .eq("id", cn.id);
            }

            const { data: lastVoucher } = await supabase
              .from("voucher_entries")
              .select("voucher_number")
              .eq("organization_id", organizationId)
              .eq("voucher_type", "receipt")
              .order("created_at", { ascending: false })
              .limit(1);
            const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
            const newVoucherNumber = `RCP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

            await supabase.from("voucher_entries").insert({
              organization_id: organizationId,
              voucher_number: newVoucherNumber,
              voucher_type: "receipt",
              voucher_date: new Date().toISOString().split("T")[0],
              reference_type: "customer",
              reference_id: effectiveCustomerId,
              description: isPartial
                ? `Credit note ${cn.returnNumber} partially applied (₹${Math.round(redeemAmount)} of ₹${Math.round(cn.creditAmount)}) via POS`
                : `Credit note ${cn.returnNumber} applied via POS`,
              total_amount: redeemAmount,
              payment_method: "credit_note_adjustment",
            });
          }
        } catch (cnErr) {
          console.error("Credit note apply failed:", cnErr);
        }
      }

      const refundLabel = refundType === "cash_refund" ? "Cash Refund" : refundType === "exchange" ? "Exchange" : "Credit Note";
      toast({ title: "Return Saved", description: `Return ${returnNumber} — ₹${Math.round(grossAmount)} (${refundLabel})` });
      const effectiveReturnAmount = returnItems.length === 0 ? appliedCreditAmount : grossAmount;
      const effectiveRefundType: RefundType = returnItems.length === 0 ? "credit_note" : refundType;
      onReturnSaved(effectiveReturnAmount, returnNumber, effectiveRefundType);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving return:", error);
      // Clean up orphan parent record if it was created but items failed
      if (createdReturnId) {
        try {
          await supabase.from("sale_return_items").delete().eq("return_id", createdReturnId);
          await supabase.from("sale_returns").delete().eq("id", createdReturnId);
          console.log("Cleaned up orphan sale return:", createdReturnId);
        } catch (cleanupErr) {
          console.error("Cleanup failed:", cleanupErr);
        }
      }
      const errMsg = error?.details || error?.hint || error?.message || "Failed to save sale return";
      toast({ title: "Error", description: errMsg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const matchingVariants = variants.filter(v => v.product_id === product.id);
    const barcodeMatch = matchingVariants.some(v => v.barcode?.toLowerCase().includes(search));
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      barcodeMatch
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="flex items-center gap-2">
              <RotateCcwIcon className="h-5 w-5" />
              Sale Return
              {effectiveCustomerName && <span className="text-sm font-normal text-muted-foreground">— {effectiveCustomerName}</span>}
            </DialogTitle>
            <a
              href="/sale-returns"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline mr-6 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              View S/R Dashboard ↗
            </a>
          </div>
        </DialogHeader>

        {/* Inline Customer Picker — only when no customer was passed from POS */}
        {!customerId && (
          <div className="rounded-md border bg-muted/30 p-2">
            <Label className="text-xs mb-1 flex items-center gap-1">
              Customer
              <span className="text-destructive">*</span>
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                (required for Credit Note)
              </span>
            </Label>
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-normal"
                >
                  <span className={cn(!pickedCustomerName && "text-muted-foreground")}>
                    {pickedCustomerName || "Search customer by name or phone..."}
                  </span>
                  <Search className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type name or phone..."
                    value={customerSearchTerm}
                    onValueChange={setCustomerSearchTerm}
                  />
                  <CommandList>
                    <CommandEmpty>No customers found</CommandEmpty>
                    <CommandGroup>
                      {pickedCustomerId && (
                        <CommandItem
                          onSelect={() => {
                            setPickedCustomerId(null);
                            setPickedCustomerName(null);
                            setCustomerSearchOpen(false);
                          }}
                          className="text-destructive"
                        >
                          ✕ Clear customer (Walk-in)
                        </CommandItem>
                      )}
                      {customerOptions.map((c) => (
                        <CommandItem
                          key={c.id}
                          onSelect={() => {
                            setPickedCustomerId(c.id);
                            setPickedCustomerName(c.customer_name);
                            setCustomerSearchOpen(false);
                            setCustomerSearchTerm("");
                          }}
                          className="flex justify-between"
                        >
                          <span className="truncate">{c.customer_name}</span>
                          {c.phone && (
                            <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Bill Number Lookup */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs mb-1">Original Sale Bill No (optional)</Label>
            <div className="relative">
              <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="e.g. POS/25-26/52"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupBillNumber(); } }}
                className="pl-9"
              />
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={lookupBillNumber} disabled={billLookupLoading || !billNumber.trim()}>
            {billLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
          </Button>
          {billSaleId && billItems.length > 0 && (
            <span className="text-xs text-green-600 font-medium whitespace-nowrap pb-1">✓ {billItems.length} items loaded</span>
          )}
        </div>

        {/* Bill Items Quick-Select Panel */}
        {billSaleId && billItems.length > 0 && (
          <div className="border rounded-lg bg-muted/30 p-2 space-y-1 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground px-1 mb-1">Tap item to add for return:</p>
            {billItems.map((bi, idx) => {
              const alreadyAdded = returnItems.some(r => r.variantId === bi.variant_id);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => addProduct(bi.product_id, bi.variant_id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors text-left",
                    alreadyAdded
                      ? "bg-green-100 text-green-700 opacity-60 cursor-not-allowed dark:bg-green-900/30 dark:text-green-400"
                      : "bg-background hover:bg-primary/10 border border-border"
                  )}
                >
                  <span className="font-medium truncate">{bi.product_name}</span>
                  <span className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-mono dark:bg-violet-900/30 dark:text-violet-400">{bi.size}</span>
                    <span className="text-xs text-muted-foreground">×{bi.quantity}</span>
                    <span className="text-xs font-semibold">₹{Math.round(bi.per_qty_net_amount || (bi.line_total / bi.quantity) || 0)}</span>
                    {alreadyAdded && <span className="text-[10px] text-green-600">✓ Added</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Pending Credit Notes for current customer */}
        {pendingCreditNotes.length > 0 && (
          <div className="border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Pending Credit Notes — Click to apply to current bill
            </p>
            {pendingCreditNotes.map((pcn) => {
              const isApplied = appliedCreditNoteId === pcn.id;
              const editVal = cnRedeemInputs[pcn.id] ?? pcn.creditAmount;
              return (
                <div
                  key={pcn.id}
                  className={cn(
                    "flex flex-col gap-1.5 px-3 py-2 rounded-md border text-sm transition-all",
                    isApplied
                      ? "border-green-500 bg-green-50 dark:bg-green-900/30"
                      : "border-amber-300 bg-white dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs bg-amber-100 dark:bg-amber-800/50 px-1.5 py-0.5 rounded mr-2">
                        {pcn.returnNumber}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {pcn.returnDate}
                      </span>
                    </div>
                    <span className="font-bold text-amber-800 dark:text-amber-200 shrink-0">
                      Available: ₹{Math.round(pcn.creditAmount).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground shrink-0">Redeem ₹</Label>
                    <Input
                      type="number"
                      min={1}
                      max={pcn.creditAmount}
                      step="1"
                      value={editVal || ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setCnRedeemInputs((prev) => ({ ...prev, [pcn.id]: v }));
                        if (isApplied) {
                          const clamped = Math.max(0, Math.min(v, pcn.creditAmount));
                          setAppliedCreditAmount(clamped);
                        }
                      }}
                      disabled={isApplied}
                      className="h-7 w-28 text-sm no-uppercase"
                    />
                    <span className="text-[11px] text-muted-foreground">of ₹{Math.round(pcn.creditAmount).toLocaleString("en-IN")}</span>
                    <div className="ml-auto">
                      {isApplied ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCreditNoteId(null);
                            setAppliedCreditAmount(0);
                          }}
                          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 border border-red-300 font-medium"
                        >
                          ✕ Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const requested = cnRedeemInputs[pcn.id] ?? pcn.creditAmount;
                            if (!requested || requested <= 0) {
                              toast({ title: "Invalid amount", description: "Enter an amount greater than 0", variant: "destructive" });
                              return;
                            }
                            if (requested > pcn.creditAmount) {
                              toast({ title: "Exceeds available", description: `Max ₹${Math.round(pcn.creditAmount).toLocaleString("en-IN")}`, variant: "destructive" });
                              return;
                            }
                            setAppliedCreditNoteId(pcn.id);
                            setAppliedCreditAmount(requested);
                          }}
                          className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 font-medium"
                        >
                          Apply ₹{Math.round(cnRedeemInputs[pcn.id] ?? pcn.creditAmount).toLocaleString("en-IN")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {appliedCreditNoteId && (
              <p className="text-xs text-green-700 dark:text-green-400 font-medium px-1">
                ✓ ₹{Math.round(appliedCreditAmount).toLocaleString("en-IN")} credit note will be applied
                when you press the save button below.
              </p>
            )}
          </div>
        )}

        {/* Barcode Scanner */}
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Scan className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan barcode or enter product name..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button type="submit" size="sm">Add</Button>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Search className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search sold products..." value={searchTerm} onValueChange={setSearchTerm} />
                <CommandList>
                  <CommandEmpty>{loading ? "Loading..." : "No sold products found"}</CommandEmpty>
                  <CommandGroup>
                    {filteredProducts.slice(0, 50).map(product => {
                      const productVariants = variants.filter(v => v.product_id === product.id);
                      return productVariants.map(variant => (
                        <CommandItem
                          key={variant.id}
                          onSelect={() => addProduct(product.id, variant.id)}
                          className="flex justify-between"
                        >
                          <span className="truncate">{product.product_name} - {variant.size}</span>
                          <span className="text-xs text-muted-foreground ml-2">₹{variant.sale_price}</span>
                        </CommandItem>
                      ));
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </form>

        {/* Return Items Table */}
        {returnItems.length > 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-[80px] text-center">Size</TableHead>
                  <TableHead className="w-[120px] text-center">Qty</TableHead>
                  <TableHead className="w-[80px] text-right">Rate</TableHead>
                  <TableHead className="w-[80px] text-right">Total</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnItems.map((item, index) => (
                  <TableRow key={item.variantId}>
                    <TableCell className="font-medium text-sm">{item.productName}</TableCell>
                    <TableCell className="text-center text-sm">{item.size}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(index, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-14 h-7 text-center text-sm"
                          min={1}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(index, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">₹{item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">₹{item.lineTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border rounded-md">
            <Scan className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Scan barcode to add return items</p>
          </div>
        )}

        {/* Refund Type Selection */}
        <div className="pt-2 border-t">
          <Label className="text-xs font-semibold mb-2 block">Refund Type</Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setRefundType("cash_refund")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                refundType === "cash_refund"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              )}
            >
              <Banknote className="h-4 w-4" />
              Cash Refund
            </button>
            <button
              type="button"
              onClick={() => setRefundType("credit_note")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                refundType === "credit_note"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              )}
            >
              <CreditCard className="h-4 w-4" />
              Credit Note
            </button>
            <button
              type="button"
              onClick={() => setRefundType("exchange")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                refundType === "exchange"
                  ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                  : "border-border bg-background text-muted-foreground hover:border-orange-300"
              )}
            >
              <RotateCcw className="h-4 w-4" />
              S/R Exchange
            </button>
          </div>
          {refundType === "exchange" && (
            <div className="mt-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400">
              ✦ Exchange: Return amount (₹{Math.round(totalAmount).toLocaleString('en-IN')}) will be auto-deducted from the new bill in POS as S/R Adjust.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-base font-bold space-y-0.5">
            {appliedCreditNoteId && returnItems.length > 0 && (
              <div className="text-sm font-normal text-muted-foreground">
                Return: ₹{Math.round(totalAmount).toLocaleString("en-IN")}
                {" − "}
                CN: ₹{Math.round(appliedCreditAmount).toLocaleString("en-IN")}
              </div>
            )}
            {appliedCreditNoteId && returnItems.length === 0 ? (() => {
              const cn = pendingCreditNotes.find(c => c.id === appliedCreditNoteId);
              const full = cn?.creditAmount || 0;
              const remaining = Math.max(0, full - appliedCreditAmount);
              return (
                <div>
                  Apply Credit Note:{" "}
                  <span className="text-green-600">
                    ₹{Math.round(appliedCreditAmount).toLocaleString("en-IN")}
                  </span>
                  {remaining > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (of ₹{Math.round(full).toLocaleString("en-IN")} — ₹{Math.round(remaining).toLocaleString("en-IN")} remains)
                    </span>
                  )}
                </div>
              );
            })() : (
              <div>
                Return Total:{" "}
                <span className="text-destructive">
                  ₹{Math.round(totalAmount).toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveReturn} disabled={saving || (returnItems.length === 0 && !appliedCreditNoteId)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {returnItems.length === 0 && appliedCreditNoteId
                ? `Apply Credit Note — ₹${Math.round(appliedCreditAmount).toLocaleString("en-IN")}`
                : refundType === "cash_refund" ? "Save & Cash Refund"
                : refundType === "exchange" ? "Save & Exchange (S/R Adj)"
                : "Save Return (Credit Note)"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Simple rotate icon since we use RotateCcw from lucide
const RotateCcwIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
