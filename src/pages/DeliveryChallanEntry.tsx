import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useSettings } from "@/hooks/useSettings";
import { useEntryBillProductSearch } from "@/hooks/useEntryBillProductSearch";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarIcon,
  Plus,
  X,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronDown,
  Save,
  Printer,
  Truck,
} from "lucide-react";
import { SizeGridDialog } from "@/components/SizeGridDialog";
import { EntryBillProductSearchBar } from "@/components/entry/EntryBillProductSearchBar";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { format } from "date-fns";
import { cn, buildProductDisplayName } from "@/lib/utils";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";
import { mergeSizeColorVariantsForGrid } from "@/utils/mergeSizeColorVariantsForGrid";
import {
  searchSaleOrderVariants,
  type SaleOrderProductSearchGroup,
  type SaleOrderVariantSearchResult,
} from "@/utils/saleOrderProductSearch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useReactToPrint } from "react-to-print";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  color: string;
  quantity: number;
  stockQty: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  lineTotal: number;
  hsnCode: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Mobile number is required").max(20),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

const EMPTY_LINE = (): LineItem => ({
  id: `row-${Date.now()}-${Math.random()}`,
  productId: "",
  variantId: "",
  productName: "",
  size: "",
  barcode: "",
  color: "",
  quantity: 0,
  stockQty: 0,
  mrp: 0,
  salePrice: 0,
  discountPercent: 0,
  lineTotal: 0,
  hsnCode: "",
});

export default function DeliveryChallanEntry() {
  useEntryViewportSync();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const location = useLocation();
  const { orgNavigate: navigate } = useOrgNavigation();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [challanDate, setChallanDate] = useState<Date>(new Date());
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5)
      .fill(null)
      .map((_, i) => ({ ...EMPTY_LINE(), id: `row-${i}` })),
  );

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingChallanId, setEditingChallanId] = useState<string | null>(null);
  const [originalItemsForEdit, setOriginalItemsForEdit] = useState<Array<{ variantId: string; quantity: number }>>([]);
  const [salesman, setSalesman] = useState<string>("");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountRupees, setFlatDiscountRupees] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const [nextChallanPreview, setNextChallanPreview] = useState<string>("");
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("grid");
  const [entryModeInitialized, setEntryModeInitialized] = useState(false);
  const [invoiceFormat, setInvoiceFormat] = useState<"standard" | "wholesale-size-grouping">("standard");
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  const [selectedSaleOrderId, setSelectedSaleOrderId] = useState<string | null>(null);
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [printData, setPrintData] = useState<{
    items: Array<Record<string, unknown>>;
    grossAmount: number;
    totalDiscount: number;
    netAmount: number;
    challanNumber: string;
    customerName: string;
    customerAddress: string;
    customerMobile: string;
    customerGSTIN: string;
    notes: string;
    salesman: string;
    roundOff: number;
  } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const tableEndRef = useRef<HTMLDivElement>(null);
  const processingBarcodeRef = useRef(false);
  const lastInputTimeRef = useRef(0);

  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const { filteredCustomers, isLoading: isCustomersLoading, refetch: refetchCustomers } =
    useCustomerSearch(customerSearchInput);

  const productSearch = useEntryBillProductSearch(currentOrganization?.id, entryMode);
  const barcodeScanner = useBarcodeScanner({
    minBarcodeLength: 4,
    maxKeystrokeInterval: 50,
    autoSubmitDelay: 120,
  });

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { customer_name: "", phone: "", email: "", address: "", gst_number: "" },
  });

  const getPrintPageStyle = useCallback(() => {
    const fmt = (settings?.sale_settings as { sales_bill_format?: string })?.sales_bill_format || "a4";
    const size =
      fmt === "a4"
        ? "A4 portrait"
        : fmt === "a5"
          ? "A5 portrait"
          : fmt === "a5-horizontal"
            ? "A5 landscape"
            : "80mm auto";
    const margin = fmt === "a4" ? "10mm" : fmt === "thermal" ? "3mm" : "2mm";
    return `@page { size: ${size}; margin: ${margin}; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}`;
  }, [settings]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `DeliveryChallan_${printData?.challanNumber || nextChallanPreview || "NEW"}`,
    pageStyle: getPrintPageStyle(),
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
  });

  const saleBillFormat = (settings?.sale_settings as { sales_bill_format?: string })?.sales_bill_format || "a4";
  const printPaperFormat =
    saleBillFormat === "a5"
      ? "a5-vertical"
      : saleBillFormat === "a5-horizontal"
        ? "a5-horizontal"
        : saleBillFormat;

  // Initialize entry mode from org settings (default: grid).
  useEffect(() => {
    if (settings && !entryModeInitialized) {
      const saleSettings = settings.sale_settings as { defaultEntryMode?: string } | undefined;
      setEntryMode(saleSettings?.defaultEntryMode === "inline" ? "inline" : "grid");
      setEntryModeInitialized(true);
    }
  }, [settings, entryModeInitialized]);

  // Fetch employees
  const { data: employeesData } = useQuery({
    queryKey: ["employees", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_name, status")
        .eq("organization_id", currentOrganization.id)
        .eq("status", "active")
        .order("employee_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch pending sale orders
  const { data: pendingSaleOrders } = useQuery({
    queryKey: ["pending-sale-orders", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sale_orders")
        .select(`*, sale_order_items (*)`)
        .eq("organization_id", currentOrganization.id)
        .in("status", ["pending", "partially_fulfilled"])
        .is("deleted_at", null)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Generate next challan number preview
  useEffect(() => {
    const previewNextChallan = async () => {
      if (!currentOrganization?.id || editingChallanId) return;
      try {
        const { data: nextNumber } = await supabase.rpc("generate_challan_number", {
          p_organization_id: currentOrganization.id,
        });
        if (nextNumber) setNextChallanPreview(nextNumber);
      } catch (e) {
        console.error("Error getting challan preview:", e);
      }
    };
    previewNextChallan();
  }, [currentOrganization?.id, editingChallanId]);

  const loadFromSaleOrder = useCallback((order: any) => {
    setSelectedSaleOrderId(order.id);
    setSelectedCustomerId(order.customer_id || "");
    setSelectedCustomer({
      id: order.customer_id,
      customer_name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
      address: order.customer_address,
    });
    setShippingAddress(order.shipping_address || "");
    setSalesman(order.salesman || "");
    setNotes(`From Sale Order: ${order.order_number}`);

    const items: LineItem[] = order.sale_order_items
      .filter((item: any) => item.pending_qty > 0 && !item.deleted_at)
      .map((item: any, idx: number) => ({
        id: `row-${idx}`,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        size: item.size,
        barcode: item.barcode || "",
        color: item.color || "",
        quantity: item.pending_qty,
        stockQty: 0,
        mrp: item.mrp,
        salePrice: item.unit_price,
        discountPercent: item.discount_percent,
        lineTotal: item.pending_qty * item.unit_price * (1 - item.discount_percent / 100),
        hsnCode: item.hsn_code || "",
      }));

    while (items.length < 5) {
      items.push({ ...EMPTY_LINE(), id: `row-${items.length}` });
    }
    setLineItems(items);
  }, []);

  // Load from sale order if passed via location state
  useEffect(() => {
    if (location.state?.fromSaleOrder && pendingSaleOrders) {
      const order = pendingSaleOrders.find((o: any) => o.id === location.state.fromSaleOrder);
      if (order) loadFromSaleOrder(order);
    }
  }, [location.state, pendingSaleOrders, loadFromSaleOrder]);

  const openSizeGridForProductGroup = useCallback(
    async (productIds: string[], selectedSalePrice?: number) => {
      if (!currentOrganization?.id || productIds.length === 0) return;

      const primaryProductId = productIds[0];
      const { data: productRow, error: productError } = await supabase
        .from("products")
        .select("id, product_name, brand, category, style, color, hsn_code, gst_per, uom, size_group_id")
        .eq("id", primaryProductId)
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (productError || !productRow) {
        toast({ title: "Product not found", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color, barcode, sale_price, mrp, stock_qty, active, product_id")
        .in("product_id", productIds)
        .eq("organization_id", currentOrganization.id)
        .eq("active", true)
        .is("deleted_at", null);

      if (error || !data?.length) {
        toast({
          title: "No variants found",
          description: "This product has no active variants.",
          variant: "destructive",
        });
        return;
      }

      const cartQtyByVariant = new Map<string, number>();
      for (const item of lineItems) {
        if (item.variantId) {
          cartQtyByVariant.set(item.variantId, (cartQtyByVariant.get(item.variantId) || 0) + item.quantity);
        }
      }

      setSizeGridProduct(productRow);
      setSizeGridVariants(
        mergeSizeColorVariantsForGrid(data, {
          selectedSalePrice,
          cartQtyByVariant,
          defaultColor: productRow.color || "",
        }),
      );
      setShowSizeGrid(true);
      productSearch.setOpenProductSearch(false);
      productSearch.setSearchInput("");
    },
    [currentOrganization?.id, lineItems, toast, productSearch],
  );

  const addVariantFromSearch = useCallback(
    (result: SaleOrderVariantSearchResult, options?: { skipSizeGrid?: boolean }) => {
      if (entryMode === "grid" && !options?.skipSizeGrid) {
        void openSizeGridForProductGroup([result.product_id], result.sale_price);
        return;
      }

      const productDisplay = buildProductDisplayName({
        product_name: result.product_name,
        brand: result.brand,
        style: result.style,
        category: result.category,
      });

      setLineItems((prev) => {
        const existingIndex = prev.findIndex(
          (item) => item.variantId === result.id && item.productId !== "",
        );
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + 1,
            lineTotal:
              (updated[existingIndex].quantity + 1) *
              updated[existingIndex].salePrice *
              (1 - updated[existingIndex].discountPercent / 100),
          };
          return updated;
        }

        const emptyRowIndex = prev.findIndex((item) => item.productId === "");
        const newItem: LineItem = {
          id: emptyRowIndex >= 0 ? prev[emptyRowIndex].id : `row-${prev.length}`,
          productId: result.product_id,
          variantId: result.id,
          productName: productDisplay,
          size: result.size,
          barcode: result.barcode || "",
          color: result.color || "",
          quantity: 1,
          stockQty: result.stock_qty ?? 0,
          mrp: result.mrp || 0,
          salePrice: result.sale_price || 0,
          discountPercent: 0,
          lineTotal: result.sale_price || 0,
          hsnCode: result.hsn_code || "",
        };

        if (emptyRowIndex >= 0) {
          const updated = [...prev];
          updated[emptyRowIndex] = newItem;
          return updated;
        }
        return [...prev, newItem];
      });

      productSearch.setOpenProductSearch(false);
      productSearch.setSearchInput("");
      productSearch.setBarcodeInput("");
      setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    [entryMode, openSizeGridForProductGroup, productSearch],
  );

  const selectProductSearchGroup = (group: SaleOrderProductSearchGroup) => {
    void openSizeGridForProductGroup(group.productIds, group.representative.sale_price);
  };

  const selectSearchResult = (result: SaleOrderVariantSearchResult) => {
    productSearch.resolveSearchSelection(result, productSearch.searchInput, {
      onOpenSizeGrid: (productIds, salePrice) => void openSizeGridForProductGroup(productIds, salePrice),
      onAddVariant: (r, opts) => addVariantFromSearch(r, opts),
    });
  };

  const handleBarcodeScan = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      if (!trimmed || !currentOrganization?.id) return;
      if (processingBarcodeRef.current) return;

      processingBarcodeRef.current = true;
      barcodeScanner.markSubmitted(trimmed);
      barcodeScanner.cancelAutoSubmit();

      try {
        const results = await searchSaleOrderVariants(currentOrganization.id, trimmed);
        const exact = results.find((r) => r.barcode?.toLowerCase() === trimmed.toLowerCase());

        if (!exact && results.length === 0) {
          toast({
            title: "Product not found",
            description: "No product matches the scanned barcode.",
            variant: "destructive",
          });
          productSearch.setBarcodeInput("");
          return;
        }

        const result = exact || results[0];
        productSearch.resolveSearchSelection(result, trimmed, {
          onOpenSizeGrid: (productIds, salePrice) => void openSizeGridForProductGroup(productIds, salePrice),
          onAddVariant: (r, opts) => addVariantFromSearch(r, opts),
        });
        productSearch.setBarcodeInput("");
      } finally {
        setTimeout(() => {
          processingBarcodeRef.current = false;
        }, 150);
      }
    },
    [
      currentOrganization?.id,
      barcodeScanner,
      toast,
      productSearch,
      openSizeGridForProductGroup,
      addVariantFromSearch,
    ],
  );

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && productSearch.barcodeInput.trim()) {
      e.preventDefault();
      void handleBarcodeScan(productSearch.barcodeInput);
    }
  };

  const handleSizeGridConfirm = (items: Array<{ variant: any; qty: number }>) => {
    if (!sizeGridProduct) return;

    let updatedItems = [...lineItems];
    for (const { variant, qty } of items) {
      if (qty <= 0) continue;
      const existingIndex = updatedItems.findIndex(
        (item) => item.variantId === variant.id && item.productId !== "",
      );

      if (existingIndex >= 0) {
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          quantity: updatedItems[existingIndex].quantity + qty,
          lineTotal:
            (updatedItems[existingIndex].quantity + qty) *
            updatedItems[existingIndex].salePrice *
            (1 - updatedItems[existingIndex].discountPercent / 100),
        };
      } else {
        const emptyRowIndex = updatedItems.findIndex((item) => item.productId === "");
        const newItem: LineItem = {
          id: emptyRowIndex >= 0 ? updatedItems[emptyRowIndex].id : `row-${updatedItems.length}`,
          productId: sizeGridProduct.id,
          variantId: variant.id,
          productName: buildProductDisplayName(sizeGridProduct),
          size: variant.size,
          barcode: variant.barcode || "",
          color: variant.color || sizeGridProduct.color || "",
          quantity: qty,
          stockQty: variant.stock_qty ?? 0,
          mrp: variant.mrp || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          lineTotal: qty * (variant.sale_price || 0),
          hsnCode: sizeGridProduct.hsn_code || "",
        };
        if (emptyRowIndex >= 0) {
          updatedItems[emptyRowIndex] = newItem;
        } else {
          updatedItems = [...updatedItems, newItem];
        }
      }
    }

    setLineItems(updatedItems);
    setShowSizeGrid(false);
    setSizeGridProduct(null);
    setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const updateQuantity = (idx: number, qty: number) => {
    const newItems = [...lineItems];
    newItems[idx].quantity = qty;
    newItems[idx].lineTotal = qty * newItems[idx].salePrice * (1 - newItems[idx].discountPercent / 100);
    setLineItems(newItems);
  };

  const updateDiscountPercent = (idx: number, disc: number) => {
    const newItems = [...lineItems];
    newItems[idx].discountPercent = disc;
    newItems[idx].lineTotal = newItems[idx].quantity * newItems[idx].salePrice * (1 - disc / 100);
    setLineItems(newItems);
  };

  const removeItem = (idx: number) => {
    const newItems = [...lineItems];
    newItems.splice(idx, 1);
    newItems.push({ ...EMPTY_LINE(), id: `row-${Date.now()}` });
    setLineItems(newItems);
  };

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setSelectedCustomer(customer);
    setOpenCustomerSearch(false);
    setCustomerSearchInput("");
    if (customer.address) setShippingAddress(customer.address);
  };

  const handleCreateCustomer = async (data: z.infer<typeof customerSchema>) => {
    try {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const { createOrGetCustomer } = await import("@/utils/customerUtils");

      const result = await createOrGetCustomer({
        customer_name: data.customer_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        organization_id: currentOrganization.id,
      });

      setSelectedCustomerId(result.customer.id);
      setSelectedCustomer(result.customer);
      setOpenCustomerDialog(false);
      customerForm.reset();
      refetchCustomers();

      if (result.isExisting) {
        toast({
          title: "Customer Found",
          description: `${result.customer.customer_name} already exists and has been selected`,
        });
      } else {
        toast({ title: "Customer Created", description: "New customer has been added" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const filledItems = lineItems.filter((item) => item.productId !== "");
  const billableItems = filledItems.filter((item) => item.quantity > 0);

  // Refresh live stock for lines on screen (display only — challan does not deduct stock).
  const variantIdsKey = filledItems
    .map((item) => item.variantId)
    .filter(Boolean)
    .sort()
    .join(",");
  useEffect(() => {
    if (!currentOrganization?.id || !variantIdsKey) return;

    const variantIds = variantIdsKey.split(",").filter(Boolean);
    const refreshLiveStock = async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, stock_qty")
        .eq("organization_id", currentOrganization.id)
        .in("id", variantIds);
      if (error || !data) return;

      const stockByVariant = new Map(data.map((row) => [row.id, Number(row.stock_qty) || 0]));
      setLineItems((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (!item.variantId || !stockByVariant.has(item.variantId)) return item;
          const stockQty = stockByVariant.get(item.variantId)!;
          if (item.stockQty === stockQty) return item;
          changed = true;
          return { ...item, stockQty };
        });
        return changed ? next : prev;
      });
    };

    void refreshLiveStock();
    const timer = window.setInterval(refreshLiveStock, 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshLiveStock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentOrganization?.id, variantIdsKey]);

  const grossAmount = billableItems.reduce((sum, item) => sum + item.quantity * item.salePrice, 0);
  const lineItemDiscount = billableItems.reduce(
    (sum, item) => sum + (item.quantity * item.salePrice * item.discountPercent) / 100,
    0,
  );
  const subtotalAfterLineDiscount = grossAmount - lineItemDiscount;
  const flatDiscountAmount =
    flatDiscountPercent > 0 ? (subtotalAfterLineDiscount * flatDiscountPercent) / 100 : flatDiscountRupees;
  const netAmount = subtotalAfterLineDiscount - flatDiscountAmount + roundOff;
  const totalQty = billableItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalDiscount = lineItemDiscount + flatDiscountAmount;

  const buildPrintItems = useCallback(
    (items: LineItem[]) =>
      items.map((item, index) => ({
        sr: index + 1,
        particulars: item.productName,
        size: item.size,
        barcode: item.barcode || "",
        hsn: item.hsnCode || "",
        sp: item.salePrice,
        mrp: item.mrp,
        qty: item.quantity,
        rate: item.salePrice,
        total: item.lineTotal,
        color: item.color || "",
        discountPercent: item.discountPercent,
      })),
    [],
  );

  const triggerPrint = useCallback(
    (
      challanNumber: string,
      items: LineItem[],
      snapshot: {
        grossAmount: number;
        totalDiscount: number;
        netAmount: number;
        customer: { customer_name?: string; address?: string; phone?: string; gst_number?: string } | null;
        notes: string;
        shippingAddress: string;
        salesman: string;
        roundOff: number;
      },
    ) => {
      setPrintData({
        items: buildPrintItems(items),
        grossAmount: snapshot.grossAmount,
        totalDiscount: snapshot.totalDiscount,
        netAmount: snapshot.netAmount,
        challanNumber,
        customerName: snapshot.customer?.customer_name || "",
        customerAddress: snapshot.customer?.address || snapshot.shippingAddress,
        customerMobile: snapshot.customer?.phone || "",
        customerGSTIN: snapshot.customer?.gst_number || "",
        notes: snapshot.notes,
        salesman: snapshot.salesman,
        roundOff: snapshot.roundOff,
      });
      requestAnimationFrame(() => {
        waitForPrintReady(printRef, () => handlePrint(), { maxWait: 8000 });
      });
    },
    [buildPrintItems, handlePrint],
  );

  const handleSaveChallan = async (options?: { print?: boolean }) => {
    if (savingRef.current) return;
    if (isSaving) return;
    savingRef.current = true;
    try {
      await handleSaveChallanInner(options?.print ?? false);
    } finally {
      savingRef.current = false;
    }
  };

  const handleSaveChallanInner = async (shouldPrint: boolean) => {
    if (!selectedCustomerId || !selectedCustomer) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select a customer" });
      return;
    }
    if (billableItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please add at least one product with quantity",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingChallanId) {
        await supabase.from("delivery_challan_items").delete().eq("challan_id", editingChallanId);

        const challanItemsData = billableItems.map((item) => ({
          challan_id: editingChallanId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.salePrice,
          mrp: item.mrp,
          discount_percent: item.discountPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));
        await supabase.from("delivery_challan_items").insert(challanItemsData);

        await supabase
          .from("delivery_challans")
          .update({
            challan_date: challanDate.toISOString(),
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer.customer_name,
            customer_phone: selectedCustomer.phone || null,
            customer_email: selectedCustomer.email || null,
            customer_address: selectedCustomer.address || null,
            gross_amount: grossAmount,
            discount_amount: lineItemDiscount,
            flat_discount_percent: flatDiscountPercent,
            flat_discount_amount: flatDiscountAmount,
            round_off: roundOff,
            net_amount: netAmount,
            salesman: salesman || null,
            shipping_address: shippingAddress || null,
            notes: notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingChallanId);

        toast({ title: "Challan Updated", description: "Delivery challan has been updated" });
        if (shouldPrint) {
          triggerPrint(challanBadge, billableItems, {
            grossAmount,
            totalDiscount,
            netAmount,
            customer: selectedCustomer,
            notes,
            shippingAddress,
            salesman,
            roundOff,
          });
        }
      } else {
        const { data: challanNumber } = await supabase.rpc("generate_challan_number", {
          p_organization_id: currentOrganization?.id,
        });

        const { data: challanData, error: challanError } = await supabase
          .from("delivery_challans")
          .insert([
            {
              challan_number: challanNumber,
              challan_date: challanDate.toISOString(),
              organization_id: currentOrganization?.id,
              customer_id: selectedCustomerId,
              customer_name: selectedCustomer.customer_name,
              customer_phone: selectedCustomer.phone || null,
              customer_email: selectedCustomer.email || null,
              customer_address: selectedCustomer.address || null,
              sale_order_id: selectedSaleOrderId,
              gross_amount: grossAmount,
              discount_amount: lineItemDiscount,
              flat_discount_percent: flatDiscountPercent,
              flat_discount_amount: flatDiscountAmount,
              round_off: roundOff,
              net_amount: netAmount,
              salesman: salesman || null,
              shipping_address: shippingAddress || null,
              notes: notes || null,
              status: "pending",
            },
          ])
          .select()
          .single();

        if (challanError) throw challanError;

        const challanItemsData = billableItems.map((item) => ({
          challan_id: challanData.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.salePrice,
          mrp: item.mrp,
          discount_percent: item.discountPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));

        const { error: itemsError } = await supabase.from("delivery_challan_items").insert(challanItemsData);
        if (itemsError) throw itemsError;

        if (selectedSaleOrderId) {
          for (const item of billableItems) {
            const { data: orderItem } = await supabase
              .from("sale_order_items")
              .select("fulfilled_qty, pending_qty")
              .eq("order_id", selectedSaleOrderId)
              .eq("variant_id", item.variantId)
              .maybeSingle();

            if (orderItem) {
              await supabase
                .from("sale_order_items")
                .update({
                  fulfilled_qty: (orderItem.fulfilled_qty || 0) + item.quantity,
                  pending_qty: Math.max(0, (orderItem.pending_qty || 0) - item.quantity),
                })
                .eq("order_id", selectedSaleOrderId)
                .eq("variant_id", item.variantId);
            }
          }
        }

        toast({
          title: "Challan Saved",
          description: `Delivery Challan ${challanNumber} created successfully`,
        });

        const savedItems = [...billableItems];
        const printSnapshot = {
          grossAmount,
          totalDiscount,
          netAmount,
          customer: selectedCustomer,
          notes,
          shippingAddress,
          salesman,
          roundOff,
        };
        if (shouldPrint && challanNumber) {
          triggerPrint(challanNumber, savedItems, printSnapshot);
        }

        setLineItems(
          Array(5)
            .fill(null)
            .map((_, i) => ({ ...EMPTY_LINE(), id: `row-${i}` })),
        );
        setSelectedCustomerId("");
        setSelectedCustomer(null);
        setNotes("");
        setShippingAddress("");
        setSalesman("");
        setFlatDiscountPercent(0);
        setFlatDiscountRupees(0);
        setRoundOff(0);
        setSelectedSaleOrderId(null);

        if (currentOrganization?.id) {
          const { data: nextNumber } = await supabase.rpc("generate_challan_number", {
            p_organization_id: currentOrganization.id,
          });
          if (nextNumber) setNextChallanPreview(nextNumber);
        }
      }
    } catch (error: any) {
      console.error("Error saving challan:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save challan",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const challanBadge = editingChallanId ? "EDIT" : nextChallanPreview || "NEW";

  return (
    <div className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0")} data-entry-form>
      <header className="bg-white border-b-2 border-black shrink-0 flex flex-col">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/delivery-challan-dashboard")}
              className="h-8 shrink-0 text-black hover:text-black hover:bg-black/5 border border-black/20 text-xs gap-1.5 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="w-px h-6 bg-black/15 shrink-0" />
            <Truck className="h-5 w-5 text-black shrink-0" />
            <div className="min-w-0">
              <span className="text-black font-bold text-[15px] whitespace-nowrap">Delivery Challan</span>
              <p className="text-[11px] text-black/60 font-medium hidden sm:block">
                No GST — live stock shown for reference; stock is not deducted on save
              </p>
            </div>
            <span className="border-2 border-black text-black font-mono text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
              {challanBadge}
            </span>
          </div>
        </div>
      </header>

      <main className={entryPageMainClass}>
        <section className={cn("bg-white border-b border-black/10 py-2 shrink-0 shadow-sm", entryPageSectionX)}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start">
            <div>
              <Label className="text-[13px] font-bold text-black mb-1 block">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal h-10 text-sm border-black/20"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(challanDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={challanDate} onSelect={(d) => d && setChallanDate(d)} />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-[13px] font-bold text-black mb-1 block">Salesman</Label>
              <Select value={salesman || "none"} onValueChange={(v) => setSalesman(v === "none" ? "" : v)}>
                <SelectTrigger className="h-10 text-sm border-black/20">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employeesData?.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.employee_name}>
                      {emp.employee_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 md:col-span-1 lg:col-span-2">
              <Label className="text-[13px] font-bold text-black">
                Customer <span className="text-red-600">*</span>
              </Label>
              <div className="flex gap-2">
                <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal h-10 border-black/20">
                      {selectedCustomer
                        ? `${selectedCustomer.customer_name}${selectedCustomer.phone ? ` - ${selectedCustomer.phone}` : ""}`
                        : "Search customer..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by name or phone..."
                        value={customerSearchInput}
                        onValueChange={setCustomerSearchInput}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {isCustomersLoading ? "Loading..." : "No customers found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredCustomers?.map((customer: any) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
                              onSelect={() => handleSelectCustomer(customer)}
                            >
                              <span className="font-medium">{customer.customer_name}</span>
                              <span className="ml-2 text-muted-foreground text-xs">{customer.phone}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon" className="h-10 w-10 border-black/20" onClick={() => setOpenCustomerDialog(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-[13px] font-bold text-black mb-1 block">From Sale Order</Label>
              <Select
                value={selectedSaleOrderId || "none"}
                onValueChange={(v) => {
                  if (v === "none") {
                    setSelectedSaleOrderId(null);
                    return;
                  }
                  const order = pendingSaleOrders?.find((o: any) => o.id === v);
                  if (order) loadFromSaleOrder(order);
                }}
              >
                <SelectTrigger className="h-10 text-sm border-black/20">
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {pendingSaleOrders?.map((order: any) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} - {order.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[13px] font-bold text-black mb-1 block">Invoice Format</Label>
              <Select
                value={invoiceFormat}
                onValueChange={(v: "standard" | "wholesale-size-grouping") => setInvoiceFormat(v)}
              >
                <SelectTrigger className="h-10 text-sm border-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="wholesale-size-grouping">Modern Wholesale Size Grouping</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <EntryBillProductSearchBar
          entryMode={entryMode}
          onEntryModeChange={setEntryMode}
          openProductSearch={productSearch.openProductSearch}
          onOpenProductSearchChange={productSearch.setOpenProductSearch}
          searchInput={productSearch.searchInput}
          onSearchInputChange={productSearch.setSearchInput}
          isProductSearching={productSearch.isProductSearching}
          displaySearchCount={productSearch.displaySearchCount}
          displayLimit={productSearch.displayLimit}
          onDisplayLimitIncrease={() => productSearch.setDisplayLimit((prev) => prev + 100)}
          productSearchGroups={productSearch.productSearchGroups}
          popoverSearchResults={productSearch.popoverSearchResults}
          onSelectGroup={selectProductSearchGroup}
          onSelectResult={selectSearchResult}
          barcodeValue={productSearch.barcodeInput}
          onBarcodeValueChange={(value) => {
            const now = Date.now();
            const delta = now - lastInputTimeRef.current;
            lastInputTimeRef.current = now;
            barcodeScanner.recordKeystroke();
            productSearch.setBarcodeInput(value);
            if (
              barcodeScanner.detectScannerInput(value, delta) ||
              barcodeScanner.isScannerInput
            ) {
              barcodeScanner.scheduleAutoSubmit(value, (val) => void handleBarcodeScan(val));
            }
          }}
          onBarcodeKeyDown={handleBarcodeKeyDown}
          onBarcodeScanned={(barcode) => void handleBarcodeScan(barcode)}
          totalQty={totalQty}
        />

        <section className={cn("flex-1 min-h-0 pb-2 overflow-hidden bg-neutral-100 relative w-full min-w-0", entryPageSectionX)}>
          <div className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto isolate rounded-lg border border-black/15 shadow-sm bg-white">
            <div className="bg-white min-h-full pb-4 w-full min-w-full">
              <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white border-b-2 border-black">
                    <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-10">#</th>
                    <th className="text-left text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 min-w-[200px]">Product</th>
                    <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-28">Barcode</th>
                    <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Size</th>
                    <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Stock</th>
                    <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-20">Qty</th>
                    <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-24">Rate</th>
                    <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Disc%</th>
                    <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-28 border-l-2 border-black">Total</th>
                    <th className="w-8 h-11 bg-white" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    if (filledItems.length === 0) {
                      return Array.from({ length: 7 }, (_, i) => (
                        <tr key={`empty-${i}`} className="h-[38px] border-b border-black/10">
                          <td className="text-center text-[12px] text-black/30 px-2">{i + 1}</td>
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="px-2" />
                          ))}
                        </tr>
                      ));
                    }

                    const displayItems = filledItems.slice().reverse();
                    const padCount = Math.max(0, 7 - displayItems.length);

                    const itemRows = displayItems.map((item, displayIndex) => {
                      const originalIndex = lineItems.findIndex((li) => li.id === item.id);
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "group border-b border-black/10 transition-colors",
                            displayIndex % 2 === 0 ? "bg-white" : "bg-neutral-50",
                            "hover:bg-neutral-100",
                          )}
                        >
                          <td className="text-center text-[14px] font-bold text-black/70 px-2 py-2">{originalIndex + 1}</td>
                          <td className="px-2 py-2 text-black font-bold break-words text-[14px]">{item.productName}</td>
                          <td className="text-center font-mono text-[13px] px-2 py-2">{item.barcode || "—"}</td>
                          <td className="text-center text-[13px] font-bold px-2 py-2">{item.size || "—"}</td>
                          <td
                            className={cn(
                              "text-center text-[13px] font-bold font-mono tabular-nums px-2 py-2",
                              item.stockQty > 0 ? "text-green-700" : "text-red-600",
                            )}
                          >
                            {item.variantId ? item.stockQty : "—"}
                          </td>
                          <td className="text-center px-1 py-1">
                            <Input
                              type="number"
                              min="0"
                              value={item.quantity || ""}
                              onChange={(e) => updateQuantity(originalIndex, parseInt(e.target.value, 10) || 0)}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-16 h-9 text-center font-bold mx-auto border-black/20"
                            />
                          </td>
                          <td className="text-right font-mono tabular-nums text-[13px] px-2 py-2">
                            ₹{item.salePrice.toFixed(2)}
                          </td>
                          <td className="text-right px-1 py-1">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountPercent || ""}
                              onChange={(e) => updateDiscountPercent(originalIndex, parseFloat(e.target.value) || 0)}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-14 h-9 text-right ml-auto border-black/20"
                            />
                          </td>
                          <td className="text-right px-2 py-2 border-l border-black/10 font-black font-mono tabular-nums">
                            ₹{item.lineTotal.toFixed(2)}
                          </td>
                          <td className="px-0 py-1 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100"
                              onClick={() => removeItem(originalIndex)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    });

                    const padRows = Array.from({ length: padCount }, (_, i) => (
                      <tr key={`pad-${i}`} className="h-[38px] border-b border-black/10 bg-white">
                        <td className="text-center text-[12px] text-black/30 px-2">{displayItems.length + i + 1}</td>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} className="px-2" />
                        ))}
                      </tr>
                    ));

                    return [...itemRows, ...padRows];
                  })()}
                </tbody>
              </table>
              <div ref={tableEndRef} />
            </div>
          </div>
        </section>

        {showNotesSection && (
          <div className={cn("shrink-0 py-3 bg-white border-t border-black/10 max-h-[30vh] overflow-y-auto", entryPageSectionX)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-bold text-black">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="text-[13px] bg-white border-black/20 mt-1"
                  placeholder="Internal notes..."
                />
              </div>
              <div>
                <Label className="text-[12px] font-bold text-black">Shipping Address</Label>
                <Textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  rows={2}
                  className="text-[13px] bg-white border-black/20 mt-1"
                  placeholder="Delivery address..."
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="entry-page-footer sale-order-footer shrink-0 relative z-40">
        <div className="bg-white text-black border-t-2 border-black w-full">
          <div className="flex items-center justify-between px-4 py-3 gap-4 w-full min-w-0 flex-wrap">
            <div className="flex items-center gap-0 shrink-0 overflow-x-auto flex-wrap">
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Flat Disc %</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={flatDiscountPercent || ""}
                placeholder="0"
                onChange={(e) => {
                  setFlatDiscountPercent(parseFloat(e.target.value) || 0);
                  setFlatDiscountRupees(0);
                }}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-[80px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
              <div className="w-px h-8 bg-black/15 mx-3 shrink-0" />
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Flat Disc ₹</span>
              <Input
                type="number"
                min="0"
                value={flatDiscountRupees || ""}
                placeholder="0"
                onChange={(e) => {
                  setFlatDiscountRupees(parseFloat(e.target.value) || 0);
                  setFlatDiscountPercent(0);
                }}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-[90px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
              <div className="w-px h-8 bg-black/15 mx-3 shrink-0" />
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Round</span>
              <Input
                type="number"
                step="0.01"
                value={roundOff || ""}
                placeholder="0"
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-[100px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Items</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{filledItems.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Total Qty</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{totalQty}</span>
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Gross</span>
                  <span className="text-[16px] font-extrabold tabular-nums">₹{grossAmount.toFixed(0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Discount</span>
                  <span className="text-[16px] font-extrabold tabular-nums">-₹{totalDiscount.toFixed(0)}</span>
                </div>
              </div>
              <div className="pl-4 border-l-2 border-black flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-black underline underline-offset-2">Net Amount</span>
                <span className="text-[36px] font-black font-mono tabular-nums leading-none text-black tracking-tighter">
                  ₹{netAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-neutral-100 border-t border-black/10 flex flex-wrap items-center px-4 py-2 gap-x-3 gap-y-1.5">
          <div className="hidden xl:flex items-center gap-2 text-[14px] text-black font-mono flex-1 min-w-0 overflow-hidden whitespace-nowrap">
            <span>
              Gross <span className="font-extrabold">₹{grossAmount.toFixed(0)}</span>
            </span>
            <span className="text-black/30">—</span>
            <span>
              Disc <span className="font-extrabold">₹{totalDiscount.toFixed(0)}</span>
            </span>
            <span className="text-black/30">=</span>
            <span>
              Net <span className="font-black">₹{netAmount.toLocaleString("en-IN")}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/sale-order-dashboard")}
              className="h-9 px-3 text-[13px] font-bold text-black hover:bg-black/5 gap-1.5 border border-black/15"
            >
              <FileText className="h-4 w-4" />
              Orders
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotesSection((prev) => !prev)}
              className="h-9 px-3 text-[13px] font-bold text-black hover:bg-black/5 gap-1.5 border border-black/15"
            >
              <FileText className="h-4 w-4" />
              Notes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/delivery-challan-dashboard")}
              className="h-9 px-3 text-[13px] font-bold text-red-700 hover:bg-red-50 gap-1.5 border border-red-200"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveChallan({ print: true })}
              disabled={isSaving || billableItems.length === 0}
              variant="outline"
              className="h-9 px-4 text-[13px] font-extrabold gap-1.5 border-2 border-black text-black hover:bg-black/5"
            >
              <Printer className="h-4 w-4" />
              Save & Print
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveChallan()}
              disabled={isSaving || billableItems.length === 0}
              className="h-9 px-5 text-[14px] bg-black text-white hover:bg-black/90 font-extrabold gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Delivery Challan
                </>
              )}
            </Button>
          </div>
        </div>
      </footer>

      <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField
                control={customerForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="9876543210" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={customerForm.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Customer name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={customerForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Address" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                Create Customer
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <SizeGridDialog
        open={showSizeGrid}
        onClose={() => setShowSizeGrid(false)}
        product={sizeGridProduct}
        variants={sizeGridVariants}
        onConfirm={handleSizeGridConfirm}
        showStock={true}
        validateStock={false}
        allowMultiColor={true}
        showSizePrices={false}
        title="Enter Color & Size-wise Qty"
      />

      <div className="invoice-print-source-screen">
        {printData && (
          <InvoiceWrapper
            ref={printRef}
            billNo={printData.challanNumber}
            date={challanDate}
            customerName={printData.customerName}
            customerAddress={printData.customerAddress}
            customerMobile={printData.customerMobile}
            customerGSTIN={printData.customerGSTIN}
            items={printData.items as any}
            subTotal={printData.grossAmount}
            discount={printData.totalDiscount}
            grandTotal={printData.netAmount}
            roundOff={printData.roundOff}
            notes={printData.notes}
            salesman={printData.salesman}
            isDcInvoice={true}
            documentTitle="DELIVERY CHALLAN"
            showGSTBreakdown={false}
            showTaxDetails={false}
            taxType="inclusive"
            template={(settings?.sale_settings as { invoice_template?: string })?.invoice_template}
            format={printPaperFormat}
            enableWholesaleMode={invoiceFormat === "wholesale-size-grouping"}
          />
        )}
        {!printData && <div ref={printRef} />}
      </div>
    </div>
  );
}
