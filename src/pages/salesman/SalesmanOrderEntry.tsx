import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  isMissingSaleOrderNumberRpc,
  isSaleOrderNumberConflict,
  saleOrderFyPrefixIst,
} from "@/utils/saleOrderNumber";
import {
  fetchCustomerFinancialSnapshot,
  fetchCustomerFinancialSnapshotMap,
} from "@/utils/customerFinancialSnapshot";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  User,
  Save,
  Share2,
  ArrowLeft,
  Package,
  Pencil,
  ChevronRight,
  X,
  StickyNote,
  Loader2,
} from "lucide-react";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn, sortSearchResults } from "@/lib/utils";
import { ProductThumb } from "@/components/ProductThumb";
import { ProductPhotoViewer } from "@/components/ProductPhotoViewer";
import { isUsableImageUrl } from "@/lib/productImages";
import { colorKey, fetchColorImageMap } from "@/lib/data/productColorImages";
import { SalesmanSizeGridDialog } from "@/components/SalesmanSizeGridDialog";
import { variantsForSalesmanSizeGrid, salesmanSizeBoxCount } from "@/utils/salesmanOrderSizeGrid";
import { sizeColorKey, type MergedSizeGridVariant } from "@/utils/mergeSizeColorVariantsForGrid";
import { compareSizes } from "@/utils/sizeSort";
import { FieldSheet } from "@/components/fieldSales/FieldSheet";
import { FIELD_SALES_SAFE_BOTTOM, FIELD_SALES_SAFE_TOP } from "@/hooks/useFieldSalesShell";
import { useDraftSave } from "@/hooks/useDraftSave";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  balance: number;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  gst_per: number;
  purchase_gst_percent?: number;
  sale_gst_percent?: number;
  size_group_id?: string | null;
  /** Product photo (shown in search, size grid and order lines). */
  image_url?: string | null;
  /** Colour photos (Product Master → Photos), keyed by lower-case colour. */
  colorImages?: Record<string, string>;
}

interface Variant {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  barcode: string | null;
  mrp: number;
  sale_price: number;
  stock_qty: number;
  isCustomSize?: boolean;
}

interface OrderItem {
  id: string;
  product: Product;
  variant: Variant;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  gst_percent: number;
  line_total: number;
  isCustomSize?: boolean;
}

function asOrderVariants(cells: MergedSizeGridVariant[]): Variant[] {
  return cells.map((cell) => ({
    id: cell.id,
    product_id: cell.product_id || "",
    size: cell.size,
    color: cell.color || null,
    barcode: cell.barcode ?? null,
    mrp: cell.mrp || 0,
    sale_price: cell.sale_price || 0,
    stock_qty: cell.stock_qty || 0,
  }));
}

type OrderGroup = {
  name: string;
  imageUrl: string | null;
  quantity: number;
  amount: number;
  items: OrderItem[];
  colors: Array<{ color: string; items: OrderItem[] }>;
};

/** Order lines as one group per product name, sizes in garment order within each colour. */
function groupOrderItems(items: OrderItem[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const item of items) {
    const name = item.product.product_name;
    let group = groups.get(name);
    if (!group) {
      group = { name, imageUrl: null, quantity: 0, amount: 0, items: [], colors: [] };
      groups.set(name, group);
    }
    group.items.push(item);
    group.quantity += item.quantity;
    group.amount += item.line_total;
    if (!group.imageUrl && isUsableImageUrl(item.product.image_url)) group.imageUrl = item.product.image_url!;
    const color = item.variant.color || "";
    let row = group.colors.find((c) => c.color === color);
    if (!row) {
      row = { color, items: [] };
      group.colors.push(row);
    }
    row.items.push(item);
  }
  for (const group of groups.values()) {
    for (const row of group.colors) row.items.sort((a, b) => compareSizes(a.variant.size, b.variant.size));
  }
  return [...groups.values()];
}

const SalesmanOrderEntry = () => {
  const [searchParams] = useSearchParams();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { sendWhatsApp } = useWhatsAppSend();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<{ product: Product; variants: Variant[] }[]>([]);
  const [showProductSearch, setShowProductSearch] = useState(false);

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  // Photos only when a product has one (layout unchanged for shops without photos).
  const productsHaveImages = products.some((p) => isUsableImageUrl(p.product.image_url));
  const orderHasImages = orderItems.some((i) => isUsableImageUrl(i.product.image_url));
  const [orderNumber, setOrderNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const savingLockRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeGridLoadRef = useRef(0);
  const [showDraftDialog, setShowDraftDialog] = useState(false);

  // Size Grid state
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  // Full-screen photo (tap a product photo in the search list or an order line).
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const openPhoto = (url: string | null | undefined, name: string) => (e: React.MouseEvent) => {
    if (!isUsableImageUrl(url)) return; // no photo: the tap opens the sizes as before
    e.stopPropagation();
    e.preventDefault();
    setPhoto({ url, name });
  };
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductVariants, setSelectedProductVariants] = useState<Variant[]>([]);
  /** "Edit sizes" on a product already on the order: its quantities (size+colour → qty). */
  const [editingQty, setEditingQty] = useState<Record<string, number> | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Draft save hook for mobile resilience
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('salesman_sale_order');

  // Calculate totals
  const grossAmount = orderItems.reduce((sum, item) => sum + item.line_total, 0);
  const gstAmount = orderItems.reduce((sum, item) => {
    const baseAmount = item.line_total / (1 + item.gst_percent / 100);
    return sum + (item.line_total - baseAmount);
  }, 0);
  const netAmount = grossAmount;

  // Check for existing draft on mount
  useEffect(() => {
    if (hasDraft && draftData) {
      setShowDraftDialog(true);
    }
  }, [hasDraft, draftData]);

  // Start auto-save on mount
  useEffect(() => {
    startAutoSave();
    return () => stopAutoSave();
  }, [startAutoSave, stopAutoSave]);

  // Save draft when app goes to background (mobile-specific)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && (orderItems.length > 0 || selectedCustomer)) {
        saveDraft({
          selectedCustomer,
          orderItems,
          notes,
          orderNumber,
        }, false);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [orderItems, selectedCustomer, notes, orderNumber, saveDraft]);

  // Update draft data whenever order changes
  useEffect(() => {
    if (orderItems.length > 0 || selectedCustomer) {
      updateCurrentData({
        selectedCustomer,
        orderItems,
        notes,
        orderNumber,
      });
    }
  }, [selectedCustomer, orderItems, notes, orderNumber, updateCurrentData]);

  useEffect(() => {
    if (currentOrganization?.id) {
      peekOrderNumberPreview();
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    const customerId = searchParams.get("customerId");
    if (currentOrganization?.id && customerId) {
      fetchCustomerById(customerId);
    }
  }, [currentOrganization?.id, searchParams]);

  // Load draft data
  const loadDraftData = useCallback(() => {
    if (!draftData) return;
    setSelectedCustomer(draftData.selectedCustomer || null);
    setOrderItems(draftData.orderItems || []);
    setNotes(draftData.notes || "");
    if (draftData.orderNumber) setOrderNumber(draftData.orderNumber);
    toast.success("Previous order restored");
    setShowDraftDialog(false);
  }, [draftData]);

  // Start fresh - delete draft
  const handleStartFresh = useCallback(async () => {
    await deleteDraft();
    setShowDraftDialog(false);
  }, [deleteDraft]);

  const fyOrderPrefix = () => saleOrderFyPrefixIst();

  // Fallback when the atomic RPC is unavailable or its sequence has drifted
  // behind numbers already inserted by the old client-side max+1 path.
  const nextOrderNumberFromExisting = async (): Promise<string> => {
    const prefix = fyOrderPrefix();
    let maxSeq = 0;
    const pageSize = 1000;
    let offset = 0;

    while (currentOrganization?.id) {
      const { data: orders } = await supabase
        .from("sale_orders")
        .select("order_number")
        .eq("organization_id", currentOrganization.id)
        .ilike("order_number", `${prefix}%`)
        .range(offset, offset + pageSize - 1);

      if (!orders?.length) break;

      for (const order of orders) {
        const match = order.order_number?.match(/\/(\d+)$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }

      if (orders.length < pageSize) break;
      offset += pageSize;
    }

    return `${prefix}${maxSeq + 1}`;
  };

  const peekOrderNumberPreview = async () => {
    if (!currentOrganization?.id) return;
    const { data, error } = await supabase.rpc("peek_sale_order_number", {
      p_organization_id: currentOrganization.id,
    });
    if (!error && data) {
      setOrderNumber(data);
      return;
    }
    if (error && !isMissingSaleOrderNumberRpc(error)) {
      console.warn("peek_sale_order_number failed, falling back:", error);
    }
    await generateOrderNumber();
  };

  const generateOrderNumber = async (): Promise<string> => {
    if (currentOrganization?.id) {
      const { data, error } = await supabase.rpc("generate_sale_order_number", {
        p_organization_id: currentOrganization.id,
      });
      if (!error && data) {
        setOrderNumber(data);
        return data;
      }
      if (error) {
        console.warn("generate_sale_order_number failed, falling back:", error);
      }
    }

    const fallback = await nextOrderNumberFromExisting();
    setOrderNumber(fallback);
    return fallback;
  };

  const fetchCustomerById = async (customerId: string) => {
    const { data } = await supabase
      .from("customers")
      .select("id, customer_name, phone, address, opening_balance")
      .eq("id", customerId)
      .single();

    if (data && currentOrganization?.id) {
      const snap = await fetchCustomerFinancialSnapshot(
        supabase,
        currentOrganization.id,
        customerId,
      );
      // Bills still unpaid (shop rule, Nov 2026: advance is not subtracted).
      setSelectedCustomer({ ...data, balance: snap.grossOutstandingDr });
    }
  };

  const searchCustomers = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setCustomers([]);
      return;
    }

    const { data } = await supabase
      .from("customers")
      .select("id, customer_name, phone, address, opening_balance")
      .eq("organization_id", currentOrganization!.id)
      .is("deleted_at", null)
      .or(`customer_name.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(20);

    if (data && currentOrganization?.id) {
      const customerIds = data.map((c) => c.id);
      const snapMap = await fetchCustomerFinancialSnapshotMap(
        currentOrganization.id,
        customerIds,
      );

      const customersWithBalance = data.map((c) => ({
        ...c,
        balance: snapMap.get(c.id)?.grossOutstandingDr ?? 0,
      }));
      setCustomers(customersWithBalance);
    }
  }, [currentOrganization?.id]);

  const searchProducts = useCallback(async (term: string) => {
    if (!term || term.length < 1) {
      setProducts([]);
      return;
    }

    if (!currentOrganization?.id) return;

    try {
      // First, search products by name/style in the organization
      const { data: matchingProducts, error: productsError } = await supabase
        .from("products")
        .select("id, product_name, brand, category, gst_per, style, size_group_id, image_url")
        .eq("organization_id", currentOrganization.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .or(`product_name.ilike.%${term}%,style.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%`)
        .limit(50);

      if (productsError) {
        console.error("Product search error:", productsError);
        return;
      }

      const productIds = matchingProducts?.map(p => p.id) || [];

      // Also search by barcode / color — same active+not-deleted gate as name search
      // (previously omitted products.status, so inactive SKUs were still sellable here)
      const { data: barcodeVariants, error: barcodeError } = await supabase
        .from("product_variants")
        .select(`
          id, size, color, barcode, mrp, sale_price, stock_qty, product_id,
          products!inner(id, product_name, brand, category, gst_per, organization_id, size_group_id, image_url, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("products.organization_id", currentOrganization.id)
        .eq("products.status", "active")
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .or(`barcode.ilike.%${term}%,color.ilike.%${term}%`)
        .eq("active", true)
        .order("stock_qty", { ascending: false })
        .limit(50);

      // Fetch variants for matching products
      let productVariants: any[] = [];
      if (productIds.length > 0) {
        const { data: variants, error: variantsError } = await supabase
          .from("product_variants")
          .select(`
            id, size, color, barcode, mrp, sale_price, stock_qty, product_id,
            products!inner(id, product_name, brand, category, gst_per, organization_id, size_group_id, image_url, color)
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("products.organization_id", currentOrganization.id)
          .eq("products.status", "active")
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .in("product_id", productIds)
          .eq("active", true)
          .order("stock_qty", { ascending: false })
          .limit(300);

        if (!variantsError && variants) {
          productVariants = variants;
        }
      }

      // Combine and dedupe results
      const allVariants = [...(barcodeVariants || []), ...productVariants];
      const uniqueVariants = allVariants.filter((v, i, arr) => 
        arr.findIndex(x => x.id === v.id) === i
      );

      // Group variants by product name (merge products with same name but different MRPs)
      const productMap = new Map<string, { product: Product; variants: Variant[] }>();
      uniqueVariants.forEach((v: any) => {
        const groupKey = v.products.product_name;
        if (!productMap.has(groupKey)) {
          productMap.set(groupKey, {
            product: v.products as Product,
            variants: [],
          });
        }
        const existing = productMap.get(groupKey)!;
        // Same-name products (different MRP): show the first photo any of them has.
        if (!existing.product.image_url && v.products?.image_url) {
          existing.product = { ...existing.product, image_url: v.products.image_url };
        }
        // Avoid duplicate variants when merging
        if (!existing.variants.some(ev => ev.id === v.id)) {
          existing.variants.push({
            id: v.id,
            product_id: v.product_id,
            size: v.size,
            color: v.color,
            barcode: v.barcode,
            mrp: v.mrp,
            sale_price: v.sale_price,
            // Oversold (negative) rows count as 0 so totals match the old in-stock-only list
            stock_qty: Math.max(0, v.stock_qty || 0),
          } as Variant);
        }
      });

      // Colour photos: a product with no main photo shows its first colour photo in the list.
      type VariantWithProduct = { product_id: string; color: string | null; products: { product_name: string; color?: string | null } };
      const variantsWithProduct = uniqueVariants as VariantWithProduct[];
      const colorMap = await fetchColorImageMap(
        currentOrganization.id,
        [...new Set(variantsWithProduct.map((v) => v.product_id))],
      );
      if (colorMap.size > 0) {
        for (const v of variantsWithProduct) {
          const entry = productMap.get(v.products.product_name);
          const url = colorMap.get(colorKey(v.product_id, v.color || v.products?.color || ""));
          if (entry && url && !entry.product.image_url) entry.product = { ...entry.product, image_url: url };
        }
      }

      // Apply smart sorting based on product name
      const sortedProducts = sortSearchResults(
        Array.from(productMap.values()),
        term,
        { productName: 'product.product_name' }
      );

      // Multi-term client-side filtering
      const searchTerms = term.toLowerCase().split(/\s+/).filter(Boolean);
      const filtered = searchTerms.length > 1
        ? sortedProducts.filter(({ product, variants }) => {
            const haystack = `${product.product_name} ${product.brand || ''} ${product.category || ''}`.toLowerCase();
            const variantHaystack = variants.map(v => `${v.color} ${v.size} ${v.barcode}`).join(' ').toLowerCase();
            const combined = `${haystack} ${variantHaystack}`;
            return searchTerms.every(t => combined.includes(t));
          })
        : sortedProducts;

      setProducts(filtered);
    } catch (error) {
      console.error("Product search error:", error);
      setProducts([]);
    }
  }, [currentOrganization?.id]);

  const addItem = (product: Product, variant: Variant, qty: number = 1) => {
    setOrderItems((prevItems) => {
      const existingIndex = prevItems.findIndex(item => item.variant.id === variant.id);

      if (existingIndex >= 0) {
        const updated = [...prevItems];
        const currentItem = updated[existingIndex];
        const newQty = currentItem.quantity + qty;

        updated[existingIndex] = {
          ...currentItem,
          quantity: newQty,
          line_total: newQty * currentItem.unit_price,
        };

        return updated;
      }

      const unitPrice = variant.sale_price || variant.mrp || 0;
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        product,
        variant,
        quantity: qty,
        unit_price: unitPrice,
        discount_percent: 0,
        gst_percent: product.sale_gst_percent || product.gst_per || 0,
        line_total: unitPrice * qty,
        isCustomSize: variant.isCustomSize || false,
      };

      return [...prevItems, newItem];
    });
  };

  const openSizeGrid = (product: Product, variants: Variant[]) => {
    const loadId = ++sizeGridLoadRef.current;
    setEditingQty(null);
    setEditingName(null);
    setSelectedProduct(product);
    setSelectedProductVariants(asOrderVariants(variantsForSalesmanSizeGrid(variants)));
    setShowSizeGrid(true);
    setProductSearch("");
    setProducts([]);
    setShowProductSearch(false);
    void loadFullSizeGrid(product, loadId);
  };

  /** Reopen the size sheet for a product on the order, with its quantities filled in. */
  const editSizes = (group: OrderGroup) => {
    const gridItems = group.items.filter((item) => !item.isCustomSize);
    const first = (gridItems[0] ?? group.items[0]).product;
    const qty: Record<string, number> = {};
    for (const item of gridItems) {
      const key = sizeColorKey(item.variant.size, item.variant.color || "");
      qty[key] = (qty[key] || 0) + item.quantity;
    }
    const loadId = ++sizeGridLoadRef.current;
    setEditingQty(qty);
    setEditingName(group.name);
    setSelectedProduct(first);
    setSelectedProductVariants(gridItems.map((item) => item.variant));
    setShowSizeGrid(true);
    // Stock as it is on the shelf: this product's own lines are being replaced, not added to.
    void loadFullSizeGrid(first, loadId, true);
  };

  const removeGroup = (group: OrderGroup) => {
    const ids = new Set(group.items.map((item) => item.id));
    setOrderItems((prev) => prev.filter((item) => !ids.has(item.id)));
  };

  const loadFullSizeGrid = async (product: Product, loadId: number, editing = false) => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    try {
      const { data: siblings, error: siblingError } = await supabase
        .from("products")
        .select("id, product_name, color, size_group_id")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .is("deleted_at", null)
        .eq("product_name", product.product_name);
      if (siblingError) throw siblingError;

      const productRows = siblings?.length
        ? siblings
        : [{ id: product.id, product_name: product.product_name, color: null, size_group_id: product.size_group_id ?? null }];
      const productIds = [...new Set(productRows.map((row) => row.id).concat(product.id))];

      const raw: Array<{
        id: string;
        size: string | null;
        color: string | null;
        barcode: string | null;
        mrp: number | null;
        sale_price: number | null;
        pur_price: number | null;
        stock_qty: number | null;
        product_id: string;
      }> = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("product_variants")
          .select("id, size, color, barcode, mrp, sale_price, pur_price, stock_qty, product_id")
          .eq("organization_id", orgId)
          .in("product_id", productIds)
          .eq("active", true)
          .is("deleted_at", null)
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        // All sizes, out-of-stock included, so salesmen can book any size.
        // Oversold (negative) rows count as 0 so a size's total isn't pulled down.
        raw.push(...(data || []).map((row) => ({ ...row, stock_qty: Math.max(0, row.stock_qty || 0) })));
        if (!data || data.length < pageSize) break;
      }
      if (sizeGridLoadRef.current !== loadId || raw.length === 0) return;

      const cartQtyByVariant = new Map<string, number>();
      for (const item of orderItems) {
        if (editing || !item.variant?.id || item.isCustomSize) continue;
        cartQtyByVariant.set(item.variant.id, (cartQtyByVariant.get(item.variant.id) || 0) + item.quantity);
      }
      const sizeGroupId =
        product.size_group_id ||
        productRows.find((row) => row.size_group_id)?.size_group_id ||
        null;
      // Each colour card in the sheet shows that colour's photo.
      const colorMap = await fetchColorImageMap(orgId, productIds);
      if (sizeGridLoadRef.current !== loadId) return;
      const productColor = new Map(productRows.map((row) => [row.id, row.color ?? ""]));
      const colorImages: Record<string, string> = {};
      for (const v of raw) {
        const col = (v.color || productColor.get(v.product_id) || "").trim();
        const url = colorMap.get(colorKey(v.product_id, col));
        if (url && !colorImages[col.toLowerCase()]) colorImages[col.toLowerCase()] = url;
      }
      const firstColorPhoto = Object.values(colorImages)[0] ?? null;
      setSelectedProduct((current) =>
        current?.id === product.id
          ? {
              ...current,
              size_group_id: sizeGroupId,
              colorImages,
              image_url: current.image_url || firstColorPhoto,
            }
          : current,
      );
      setSelectedProductVariants(
        asOrderVariants(
          variantsForSalesmanSizeGrid(raw, {
            cartQtyByVariant,
            products: productRows,
          }),
        ),
      );
    } catch (error) {
      console.error("Salesman size grid load failed", error);
    }
  };

  const handleSizeGridConfirm = (items: Array<{ variant: Variant; qty: number }>) => {
    if (!selectedProduct) return;

    // Editing: the sheet's quantities replace this product's size lines (extra sizes typed in
    // for the order are kept).
    if (editingName) {
      const name = editingName;
      setOrderItems((prev) => prev.filter((item) => item.isCustomSize || item.product.product_name !== name));
    }

    items.forEach(({ variant, qty }) => {
      // For custom sizes, variant already has isCustomSize flag
      const fullVariant: Variant = {
        ...variant,
        product_id: variant.product_id || selectedProduct.id,
        mrp: variant.mrp || variant.sale_price || 0,
        sale_price: variant.sale_price || 0,
        stock_qty: variant.stock_qty || 0,
        isCustomSize: variant.isCustomSize || false,
      };
      addItem(
        { ...selectedProduct, id: fullVariant.product_id || selectedProduct.id },
        fullVariant,
        qty,
      );
    });
    
    setShowSizeGrid(false);
    setSelectedProduct(null);
    setSelectedProductVariants([]);
    setEditingQty(null);
    setEditingName(null);
  };

  const removeItem = (itemId: string) => {
    setOrderItems(orderItems.filter(item => item.id !== itemId));
  };

  const saveOrder = async (shareAfter: boolean = false) => {
    if (savingLockRef.current) return;
    savingLockRef.current = true;

    if (!selectedCustomer) {
      savingLockRef.current = false;
      toast.error("Please select a customer");
      return;
    }
    if (orderItems.length === 0) {
      savingLockRef.current = false;
      toast.error("Please add at least one item");
      return;
    }

    // Validate no items have zero quantity
    const zeroQtyItems = orderItems.filter(item => item.quantity <= 0);
    if (zeroQtyItems.length > 0) {
      savingLockRef.current = false;
      const itemNames = zeroQtyItems.map(item => 
        `${item.product.product_name} (${item.variant.size})`
      ).join(", ");
      toast.error(`Invalid quantity for: ${itemNames}`);
      return;
    }

    // Validate total quantity is greater than zero
    const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity <= 0) {
      savingLockRef.current = false;
      toast.error("Order must have at least one item with quantity greater than 0");
      return;
    }

    setSaving(true);
    try {
      let freshOrderNumber = await generateOrderNumber();
      let order: { id: string } | null = null;
      let insertError: { code?: string; message?: string } | null = null;

      // Match desktop SaleOrderEntry: retry on unique order_number collisions.
      // After a couple of RPC attempts, jump to max(existing)+1 in case the
      // bill_number sequence lagged behind salesman orders created the old way.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          freshOrderNumber = attempt >= 2
            ? await nextOrderNumberFromExisting()
            : await generateOrderNumber();
        }

        const { data, error: orderError } = await supabase
          .from("sale_orders")
          .insert({
            organization_id: currentOrganization!.id,
            order_number: freshOrderNumber,
            order_date: new Date().toISOString(),
            customer_id: selectedCustomer.id,
            customer_name: selectedCustomer.customer_name,
            customer_phone: selectedCustomer.phone,
            customer_address: selectedCustomer.address,
            gross_amount: grossAmount,
            discount_amount: 0,
            gst_amount: gstAmount,
            net_amount: netAmount,
            status: "pending",
            notes,
            created_by: user!.id,
            salesman: user!.email,
          })
          .select("id")
          .single();

        if (!orderError && data) {
          order = data;
          break;
        }

        insertError = orderError;
        if (!isSaleOrderNumberConflict(orderError)) throw orderError;
      }

      if (!order) throw insertError;

      // Create order items
      const items = orderItems.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        variant_id: item.isCustomSize ? null : item.variant.id,
        product_name: item.product.product_name,
        size: item.variant.size,
        color: item.variant.color,
        barcode: item.isCustomSize ? null : item.variant.barcode,
        order_qty: item.quantity,
        pending_qty: item.quantity,
        fulfilled_qty: 0,
        unit_price: item.unit_price,
        mrp: item.variant.mrp || item.unit_price,
        discount_percent: item.discount_percent,
        gst_percent: item.gst_percent,
        line_total: item.line_total,
        hsn_code: null,
      }));

      const { error: itemsError } = await supabase
        .from("sale_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Clear draft after successful save
      await deleteDraft();

      toast.success("Order saved successfully!");

      if (shareAfter && selectedCustomer.phone) {
        const itemsList = orderItems.map(i => {
          const colorPart = i.variant.color ? ` - ${i.variant.color}` : '';
          return `• ${i.product.product_name}${colorPart} (${i.variant.size}) x ${i.quantity} = ₹${i.line_total.toLocaleString("en-IN")}`;
        }).join("\n");

        const message = `🛒 *Sales Order Confirmation*\n\n` +
          `Order No: ${freshOrderNumber}\n` +
          `Customer: ${selectedCustomer.customer_name}\n\n` +
          `*Items:*\n${itemsList}\n\n` +
          `*Total: ₹${netAmount.toLocaleString("en-IN")}*\n\n` +
          `Thank you for your order!`;

        await sendWhatsApp(selectedCustomer.phone, message);
      }

      navigate("/salesman/orders");
    } catch (error: any) {
      console.error("Error saving order:", error);
      toast.error(
        isSaleOrderNumberConflict(error)
          ? "Order number already used. Please tap Save again."
          : (error.message || "Failed to save order")
      );
    } finally {
      savingLockRef.current = false;
      setSaving(false);
    }
  };

  // One card per product: its sizes grouped by colour, like the order is spoken ("PUL206, black, 6 of size 4…").
  const orderGroups = useMemo(() => groupOrderItems(orderItems), [orderItems]);
  const totalPieces = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="flex min-h-full flex-col bg-slate-50" data-testid="fs-order-entry">
      {/* App bar + customer */}
      <div
        className="sticky top-0 z-20 bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-sm"
        style={{ paddingTop: FIELD_SALES_SAFE_TOP }}
      >
        <div className="flex h-14 items-center gap-1 px-1.5">
          <button
            type="button"
            onClick={() => navigate("/salesman")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold leading-tight">New Order</h1>
            <p className="truncate text-xs leading-tight text-white/80">{orderNumber || "…"}</p>
          </div>
          {totalPieces > 0 && (
            <span className="mr-2 shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold tabular-nums">
              {totalPieces} pcs
            </span>
          )}
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setShowCustomerSearch(true)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left text-slate-900 shadow-sm active:bg-slate-50",
              !selectedCustomer && "ring-2 ring-white/60",
            )}
            data-testid="fs-customer-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <User className="h-5 w-5" />
            </span>
            {selectedCustomer ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight">{selectedCustomer.customer_name}</span>
                  <span className="block truncate text-xs leading-tight text-slate-500">
                    {selectedCustomer.phone || "No phone"}
                    {" · "}
                    <span className={selectedCustomer.balance > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                      Due {rupees(selectedCustomer.balance)}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-orange-600">Change</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight">Select customer</span>
                  <span className="block text-xs leading-tight text-slate-500">Who is this order for?</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Product search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search product or barcode"
            value={productSearch}
            onChange={(e) => {
              const val = e.target.value;
              setProductSearch(val);
              setShowProductSearch(true);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => searchProducts(val), 300);
            }}
            onFocus={() => setShowProductSearch(true)}
            enterKeyHint="search"
            autoCapitalize="characters"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-base font-medium text-slate-900 shadow-sm outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            data-testid="fs-product-search"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => {
                setProductSearch("");
                setProducts([]);
                setShowProductSearch(false);
              }}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showProductSearch && products.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg" data-testid="fs-product-results">
            <div className="max-h-[52dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
              {products.map(({ product, variants }) => {
                const stock = variants.reduce((sum, v) => sum + v.stock_qty, 0);
                const first = variants[0];
                return (
                  <button
                    key={product.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-orange-50"
                    onClick={() => openSizeGrid(product, variants)}
                  >
                    {productsHaveImages && (
                      <ProductThumb
                        url={product.image_url}
                        alt={product.product_name}
                        size={48}
                        onClick={openPhoto(product.image_url, product.product_name)}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-tight">{product.product_name}</span>
                      <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500">
                        {[product.brand, product.category, `${salesmanSizeBoxCount(variants)} sizes`].filter(Boolean).join(" · ")}
                      </span>
                      <span className={cn("mt-0.5 block text-xs font-semibold leading-tight", stock > 0 ? "text-emerald-600" : "text-red-500")}>
                        {stock > 0 ? `${stock} in stock` : "No stock"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] font-bold leading-tight text-slate-900">
                        ₹{first?.sale_price || first?.mrp || 0}
                      </span>
                      {first?.mrp && first.mrp !== first.sale_price ? (
                        <span className="block text-[11px] leading-tight text-slate-400 line-through">₹{first.mrp}</span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Order items, one card per product */}
      <div className="flex-1 space-y-2.5 px-3 py-3">
        {orderGroups.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-500">
              <Package className="h-8 w-8" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-slate-800">No items yet</p>
            <p className="mt-1 text-sm text-slate-500">Search a product above, then enter the quantity for each size.</p>
          </div>
        ) : (
          orderGroups.map((group) => (
            <div key={group.name} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="fs-order-group">
              <div className="flex items-center gap-2.5">
                {orderHasImages && (
                  <ProductThumb url={group.imageUrl} alt={group.name} size={44} onClick={openPhoto(group.imageUrl, group.name)} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-tight">{group.name}</p>
                  <p className="mt-0.5 truncate text-xs leading-tight text-slate-500 tabular-nums">
                    {group.quantity} pcs · {rupees(group.amount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => editSizes(group)}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 active:bg-orange-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit sizes
                </button>
                <button
                  type="button"
                  onClick={() => removeGroup(group)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-500 active:bg-red-50"
                  aria-label={`Remove ${group.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 space-y-1.5">
                {group.colors.map(({ color, items }) => (
                  <div key={color || "-"} className="flex items-start gap-2">
                    {items[0]?.product.colorImages?.[color.trim().toLowerCase()] ? (
                      <ProductThumb
                        url={items[0].product.colorImages[color.trim().toLowerCase()]}
                        alt={`${group.name} ${color}`}
                        size={32}
                        onClick={openPhoto(items[0].product.colorImages[color.trim().toLowerCase()], `${group.name} ${color}`)}
                      />
                    ) : null}
                    {(color || group.colors.length > 1) && (
                      <span className="mt-1 w-16 shrink-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {color || "—"}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {items.map((item) => (
                        <span
                          key={item.id}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs tabular-nums",
                            item.isCustomSize ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800",
                          )}
                        >
                          <span className="font-semibold">{item.variant.size}</span>
                          <span className="text-slate-400">×</span>
                          <span className="font-bold">{item.quantity}</span>
                          {item.isCustomSize && (
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full text-amber-700 active:bg-amber-200"
                              aria-label={`Remove size ${item.variant.size}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals + Save, always on screen once there is an item */}
      {orderItems.length > 0 && (
        <div
          className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-3 pt-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
          style={{ paddingBottom: `calc(${FIELD_SALES_SAFE_BOTTOM} + 10px)` }}
          data-testid="fs-order-footer"
        >
          {showNotes || notes ? (
            <textarea
              placeholder="Note for this order (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="no-uppercase mb-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            />
          ) : null}

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs leading-tight text-slate-500 tabular-nums">
                {orderGroups.length} {orderGroups.length === 1 ? "product" : "products"} · {totalPieces} pcs
                {gstAmount > 0 ? ` · GST ${rupees(Math.round(gstAmount * 100) / 100)}` : ""}
              </p>
              <p className="truncate text-2xl font-bold leading-tight tabular-nums text-slate-900" data-testid="fs-order-total">
                {rupees(netAmount)}
              </p>
            </div>
            {!showNotes && !notes && (
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-slate-600 active:bg-slate-100"
              >
                <StickyNote className="h-4 w-4" />
                Add note
              </button>
            )}
          </div>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => saveOrder(false)}
              disabled={saving}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[15px] font-semibold text-slate-800 active:bg-slate-50 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => saveOrder(true)}
              disabled={saving}
              className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-[15px] font-bold text-white shadow-md shadow-orange-500/30 active:scale-[0.99] disabled:opacity-60"
            >
              <Share2 className="h-4 w-4" />
              Save &amp; Share
            </button>
          </div>
        </div>
      )}

      {/* Customer picker */}
      <ProductPhotoViewer url={photo?.url} name={photo?.name} onClose={() => setPhoto(null)} />

      <FieldSheet open={showCustomerSearch} onOpenChange={setShowCustomerSearch} title="Select customer" testId="fs-customer-sheet">
        <div className="shrink-0 px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Name or phone number"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                searchCustomers(e.target.value);
              }}
              autoFocus
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-2">
          {customers.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {customerSearch.trim().length < 2 ? "Type at least 2 letters of the name, or the phone number." : "No customer found."}
            </p>
          ) : (
            customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-orange-50"
                onClick={() => {
                  setSelectedCustomer(customer);
                  setShowCustomerSearch(false);
                  setCustomerSearch("");
                  setCustomers([]);
                }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold uppercase text-slate-600">
                  {customer.customer_name.trim().charAt(0) || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight">{customer.customer_name}</span>
                  <span className="block truncate text-xs leading-tight text-slate-500">{customer.phone || "No phone"}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                    customer.balance > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600",
                  )}
                >
                  {rupees(customer.balance)}
                </span>
              </button>
            ))
          )}
        </div>
      </FieldSheet>

      {/* Size-wise quantity */}
      <SalesmanSizeGridDialog
        open={showSizeGrid}
        onClose={() => {
          setShowSizeGrid(false);
          setSelectedProduct(null);
          setSelectedProductVariants([]);
          setEditingQty(null);
          setEditingName(null);
        }}
        product={selectedProduct}
        variants={selectedProductVariants}
        onConfirm={handleSizeGridConfirm}
        showStock={true}
        validateStock={false}
        title="Enter size-wise quantity"
        initialQty={editingQty ?? undefined}
        colorImages={selectedProduct?.colorImages}
      />

      {/* Draft Resume Dialog */}
      <DraftResumeDialog
        open={showDraftDialog}
        onOpenChange={setShowDraftDialog}
        onResume={loadDraftData}
        onStartFresh={handleStartFresh}
        draftType="salesman_sale_order"
        lastSaved={draftData?.updated_at}
      />
    </div>
  );
};

export default SalesmanOrderEntry;
