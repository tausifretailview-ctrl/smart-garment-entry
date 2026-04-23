import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  Search,
  Download,
  Printer,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Calendar,
  RefreshCw,
  X,
  ShoppingCart,
  Edit,
  History,
  ArrowUpDown,
  Plus,
  Trash2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { multiTokenMatch } from "@/utils/multiTokenSearch";

interface PurchaseHistoryItem {
  id: string;
  barcode: string;
  product_name: string;
  brand: string;
  category: string;
  size: string;
  pur_price: number;
  sale_price: number;
  qty: number;
  bill_number: string;
  software_bill_no: string;
  supplier_name: string;
  bill_date: string;
  created_at: string;
  current_sale_price: number | null;
  current_pur_price: number | null;
}

interface SalesHistoryItem {
  id: string;
  barcode: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_percent: number;
  discount_percent: number;
  line_total: number;
  sale_number: string;
  sale_date: string;
  customer_name: string;
}

interface PriceEditItem {
  id: string;
  created_at: string;
  user_email: string;
  barcode: string;
  size: string;
  old_pur_price: number | null;
  new_pur_price: number | null;
  old_sale_price: number | null;
  new_sale_price: number | null;
}

interface StockMovementItem {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  bill_number: string | null;
  notes: string | null;
  barcode: string;
  product_name: string;
  size: string;
}

interface ProductChangeItem {
  id: string;
  created_at: string;
  action: string;
  user_email: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  old_values: any;
  new_values: any;
}

interface Supplier {
  id: string;
  supplier_name: string;
}

interface Customer {
  id: string;
  customer_name: string;
}

const PriceHistoryReport = () => {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  
  const [activeTab, setActiveTab] = useState("all");
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryItem[]>([]);
  const [priceEdits, setPriceEdits] = useState<PriceEditItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementItem[]>([]);
  const [productChanges, setProductChanges] = useState<ProductChangeItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPriceChangesOnly, setShowPriceChangesOnly] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("all");

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchAllData();
    }
  }, [currentOrganization?.id]);

  // Re-fetch when user types a search term (barcode/product/bill) so we bypass row caps
  // and pull EVERY historical record for that specific item across all tables.
  useEffect(() => {
    if (!currentOrganization?.id) return;
    const term = searchTerm.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      fetchAllData(term);
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, currentOrganization?.id]);

  const fetchAllData = async (focusTerm?: string) => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      // When a focus term is supplied (typed barcode / product), resolve matching
      // variant ids first so we can fetch ALL related rows without 500-row caps
      // and across joined tables (sale_items, stock_movements, audit_logs).
      let focusVariantIds: string[] | null = null;
      let focusBarcodes: string[] | null = null;
      let focusProductIds: string[] | null = null;
      if (focusTerm && focusTerm.length >= 2) {
        const t = focusTerm.trim();
        const { data: matchedVariants } = await supabase
          .from("product_variants")
          .select("id, barcode, product_id, products!inner(product_name, brand)")
          .eq("organization_id", currentOrganization.id)
          .or(`barcode.ilike.%${t}%,size.ilike.%${t}%`)
          .limit(500);
        const { data: matchedProducts } = await supabase
          .from("products")
          .select("id, product_variants(id, barcode)")
          .eq("organization_id", currentOrganization.id)
          .or(`product_name.ilike.%${t}%,brand.ilike.%${t}%`)
          .limit(200);
        const vIds = new Set<string>();
        const bcs = new Set<string>();
        const pIds = new Set<string>();
        (matchedVariants || []).forEach((v: any) => {
          vIds.add(v.id);
          if (v.barcode) bcs.add(v.barcode);
          if (v.product_id) pIds.add(v.product_id);
        });
        (matchedProducts || []).forEach((p: any) => {
          pIds.add(p.id);
          (p.product_variants || []).forEach((v: any) => {
            vIds.add(v.id);
            if (v.barcode) bcs.add(v.barcode);
          });
        });
        if (vIds.size > 0 || bcs.size > 0 || pIds.size > 0) {
          focusVariantIds = Array.from(vIds);
          focusBarcodes = Array.from(bcs);
          focusProductIds = Array.from(pIds);
        }
      }

      // Fetch all data in parallel
      const [
        purchaseResult,
        salesResult,
        stockMovementsResult,
        auditLogsResult,
        suppliersResult,
        customersResult,
      ] = await Promise.all([
        // Fetch purchase items with bill info
        (focusBarcodes && focusBarcodes.length > 0
          ? supabase
              .from("purchase_items")
              .select(`
                id, barcode, product_name, brand, category, size,
                pur_price, sale_price, qty, bill_number, created_at,
                purchase_bills!inner (
                  software_bill_no, supplier_name, bill_date, organization_id
                )
              `)
              .eq("purchase_bills.organization_id", currentOrganization.id)
              .in("barcode", focusBarcodes)
              .order("created_at", { ascending: false })
          : supabase
          .from("purchase_items")
          .select(`
            id, barcode, product_name, brand, category, size,
            pur_price, sale_price, qty, bill_number, created_at,
            purchase_bills!inner (
              software_bill_no, supplier_name, bill_date, organization_id
            )
          `)
          .eq("purchase_bills.organization_id", currentOrganization.id)
          .order("created_at", { ascending: false })
        ),
        
        // Fetch sales
        supabase
          .from("sales")
          .select("id, sale_number, sale_date, customer_name, organization_id")
          .eq("organization_id", currentOrganization.id),
        
        // Fetch stock movements
        (focusVariantIds && focusVariantIds.length > 0
          ? supabase
              .from("stock_movements")
              .select(`
                id, movement_type, quantity, bill_number, notes, created_at,
                product_variants!inner (
                  barcode, size,
                  products!inner (product_name)
                )
              `)
              .eq("organization_id", currentOrganization.id)
              .in("variant_id", focusVariantIds)
              .order("created_at", { ascending: false })
          : supabase
          .from("stock_movements")
          .select(`
            id, movement_type, quantity, bill_number, notes, created_at,
            product_variants!inner (
              barcode, size,
              products!inner (product_name)
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .order("created_at", { ascending: false })
          .limit(500)
        ),
        
        // Fetch audit logs for price edits and product changes
        (focusVariantIds && (focusVariantIds.length > 0 || (focusProductIds && focusProductIds.length > 0))
          ? supabase
              .from("audit_logs")
              .select("*")
              .eq("organization_id", currentOrganization.id)
              .in("entity_type", ["product_variant", "product"])
              .in("entity_id", [
                ...(focusVariantIds || []),
                ...(focusProductIds || []),
              ])
              .order("created_at", { ascending: false })
          : supabase
          .from("audit_logs")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .in("entity_type", ["product_variant", "product"])
          .order("created_at", { ascending: false })
          .limit(500)
        ),
        
        // Fetch suppliers
        supabase
          .from("suppliers")
          .select("id, supplier_name")
          .eq("organization_id", currentOrganization.id)
          .order("supplier_name"),
        
        // Fetch customers
        supabase
          .from("customers")
          .select("id, customer_name")
          .eq("organization_id", currentOrganization.id)
          .order("customer_name"),
      ]);

      // Process purchase data
      const purchaseItems = purchaseResult.data || [];
      const barcodes = [...new Set(purchaseItems.map(p => p.barcode).filter(Boolean))];
      
      let currentPricesMap = new Map<string, { sale_price: number; pur_price: number }>();
      if (barcodes.length > 0) {
        const { data: currentPrices } = await supabase
          .from("product_variants")
          .select("barcode, sale_price, pur_price")
          .in("barcode", barcodes);
        
        currentPrices?.forEach(p => {
          if (p.barcode) {
            currentPricesMap.set(p.barcode, {
              sale_price: p.sale_price || 0,
              pur_price: p.pur_price || 0,
            });
          }
        });
      }

      const mergedPurchaseData: PurchaseHistoryItem[] = purchaseItems.map(item => {
        const bills = item.purchase_bills as any;
        const currentPrice = currentPricesMap.get(item.barcode || "");
        
        return {
          id: item.id,
          barcode: item.barcode || "",
          product_name: item.product_name || "",
          brand: item.brand || "",
          category: item.category || "",
          size: item.size || "",
          pur_price: item.pur_price || 0,
          sale_price: item.sale_price || 0,
          qty: item.qty || 0,
          bill_number: item.bill_number || "",
          software_bill_no: bills?.software_bill_no || "",
          supplier_name: bills?.supplier_name || "",
          bill_date: bills?.bill_date || "",
          created_at: item.created_at,
          current_sale_price: currentPrice?.sale_price ?? null,
          current_pur_price: currentPrice?.pur_price ?? null,
        };
      });
      setPurchaseHistory(mergedPurchaseData);

      // Fetch and process sale items
      const sales = salesResult.data || [];
      const salesMap = new Map(sales.map(s => [s.id, s]));
      const saleIds = sales.map(s => s.id);
      const { data: saleItems } = saleIds.length > 0
        ? await supabase
            .from("sale_items")
            .select(`
              id, barcode, product_name, size, quantity,
              unit_price, mrp, gst_percent, discount_percent, line_total,
              sale_id
            `)
            .in("sale_id", saleIds)
            .order("created_at", { ascending: false })
        : { data: [] };
      const orgSaleItems = saleItems || [];

      const mergedSalesData: SalesHistoryItem[] = orgSaleItems.map(item => {
        const sale = salesMap.get(item.sale_id);
        return {
          id: item.id,
          barcode: item.barcode || "",
          product_name: item.product_name || "",
          size: item.size || "",
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          mrp: item.mrp || 0,
          gst_percent: item.gst_percent || 0,
          discount_percent: item.discount_percent || 0,
          line_total: item.line_total || 0,
          sale_number: sale?.sale_number || "",
          sale_date: sale?.sale_date || "",
          customer_name: sale?.customer_name || "",
        };
      });
      setSalesHistory(mergedSalesData);

      // Process stock movements
      const stockMovementsData: StockMovementItem[] = (stockMovementsResult.data || []).map(item => {
        const variant = item.product_variants as any;
        return {
          id: item.id,
          created_at: item.created_at,
          movement_type: item.movement_type,
          quantity: item.quantity,
          bill_number: item.bill_number,
          notes: item.notes,
          barcode: variant?.barcode || "",
          product_name: variant?.products?.product_name || "",
          size: variant?.size || "",
        };
      });
      setStockMovements(stockMovementsData);

      // Process audit logs
      const auditLogs = auditLogsResult.data || [];
      
      const priceEditData: PriceEditItem[] = auditLogs
        .filter(log => log.entity_type === "product_variant" && log.action === "PRICE_CHANGE")
        .map(log => ({
          id: log.id,
          created_at: log.created_at || "",
          user_email: log.user_email || "System",
          barcode: (log.old_values as any)?.barcode || "",
          size: (log.old_values as any)?.size || "",
          old_pur_price: (log.old_values as any)?.pur_price ?? null,
          new_pur_price: (log.new_values as any)?.pur_price ?? null,
          old_sale_price: (log.old_values as any)?.sale_price ?? null,
          new_sale_price: (log.new_values as any)?.sale_price ?? null,
        }));
      setPriceEdits(priceEditData);

      const productChangeData: ProductChangeItem[] = auditLogs
        .filter(log => log.entity_type === "product" && ["CREATE", "UPDATE", "DELETE"].includes(log.action))
        .map(log => ({
          id: log.id,
          created_at: log.created_at || "",
          action: log.action,
          user_email: log.user_email || "System",
          product_name: (log.new_values as any)?.product_name || (log.old_values as any)?.product_name || "",
          brand: (log.new_values as any)?.brand || (log.old_values as any)?.brand || null,
          category: (log.new_values as any)?.category || (log.old_values as any)?.category || null,
          old_values: log.old_values,
          new_values: log.new_values,
        }));
      setProductChanges(productChangeData);

      setSuppliers(suppliersResult.data || []);
      setCustomers(customersResult.data || []);

    } catch (error) {
      console.error("Error fetching price history:", error);
      toast.error("Failed to load price history");
    } finally {
      setLoading(false);
    }
  };

  // Filter purchase data
  const filteredPurchaseData = useMemo(() => {
    return purchaseHistory.filter(item => {
      if (searchTerm) {
        if (!multiTokenMatch(searchTerm, item.barcode, item.product_name, item.brand, item.bill_number, item.software_bill_no)) return false;
      }

      if (selectedSupplier !== "all" && item.supplier_name !== selectedSupplier) return false;
      if (startDate && item.bill_date < startDate) return false;
      if (endDate && item.bill_date > endDate) return false;

      if (showPriceChangesOnly) {
        if (item.current_sale_price === null) return false;
        if (item.sale_price === item.current_sale_price) return false;
      }

      return true;
    });
  }, [purchaseHistory, searchTerm, selectedSupplier, startDate, endDate, showPriceChangesOnly]);

  // Filter sales data
  const filteredSalesData = useMemo(() => {
    return salesHistory.filter(item => {
      if (searchTerm) {
        if (!multiTokenMatch(searchTerm, item.barcode, item.product_name, item.sale_number)) return false;
      }

      if (selectedCustomer !== "all" && item.customer_name !== selectedCustomer) return false;
      
      const saleDate = item.sale_date?.split("T")[0] || "";
      if (startDate && saleDate < startDate) return false;
      if (endDate && saleDate > endDate) return false;

      return true;
    });
  }, [salesHistory, searchTerm, selectedCustomer, startDate, endDate]);

  // Filter price edit data
  const filteredPriceEdits = useMemo(() => {
    return priceEdits.filter(item => {
      if (searchTerm) {
        if (!multiTokenMatch(searchTerm, item.barcode)) return false;
      }

      const editDate = item.created_at?.split("T")[0] || "";
      if (startDate && editDate < startDate) return false;
      if (endDate && editDate > endDate) return false;

      return true;
    });
  }, [priceEdits, searchTerm, startDate, endDate]);

  // Filter stock movements
  const filteredStockMovements = useMemo(() => {
    return stockMovements.filter(item => {
      if (searchTerm) {
        if (!multiTokenMatch(searchTerm, item.barcode, item.product_name, item.bill_number, item.notes)) return false;
      }

      if (movementTypeFilter !== "all" && item.movement_type !== movementTypeFilter) return false;

      const moveDate = item.created_at?.split("T")[0] || "";
      if (startDate && moveDate < startDate) return false;
      if (endDate && moveDate > endDate) return false;

      return true;
    });
  }, [stockMovements, searchTerm, movementTypeFilter, startDate, endDate]);

  // Filter product changes
  const filteredProductChanges = useMemo(() => {
    return productChanges.filter(item => {
      if (searchTerm) {
        if (!multiTokenMatch(searchTerm, item.product_name, item.brand)) return false;
      }

      const changeDate = item.created_at?.split("T")[0] || "";
      if (startDate && changeDate < startDate) return false;
      if (endDate && changeDate > endDate) return false;

      return true;
    });
  }, [productChanges, searchTerm, startDate, endDate]);

  // Combined history for "All" tab
  const combinedHistory = useMemo(() => {
    const combined: Array<{
      type: "purchase" | "sale" | "edit" | "stock" | "product";
      date: string;
      reference: string;
      barcode: string;
      product_name: string;
      size: string;
      qty: number | null;
      price: string;
      party: string;
    }> = [];

    filteredPurchaseData.forEach(item => {
      combined.push({
        type: "purchase",
        date: item.bill_date,
        reference: item.software_bill_no || item.bill_number,
        barcode: item.barcode,
        product_name: item.product_name,
        size: item.size,
        qty: item.qty,
        price: `₹${item.pur_price} / ₹${item.sale_price}`,
        party: item.supplier_name,
      });
    });

    filteredSalesData.forEach(item => {
      combined.push({
        type: "sale",
        date: item.sale_date?.split("T")[0] || "",
        reference: item.sale_number,
        barcode: item.barcode,
        product_name: item.product_name,
        size: item.size,
        qty: item.quantity,
        price: `₹${item.unit_price}`,
        party: item.customer_name,
      });
    });

    filteredPriceEdits.forEach(item => {
      combined.push({
        type: "edit",
        date: item.created_at?.split("T")[0] || "",
        reference: "-",
        barcode: item.barcode,
        product_name: "-",
        size: item.size,
        qty: null,
        price: `₹${item.old_sale_price || 0} → ₹${item.new_sale_price || 0}`,
        party: item.user_email,
      });
    });

    filteredStockMovements.forEach(item => {
      combined.push({
        type: "stock",
        date: item.created_at?.split("T")[0] || "",
        reference: item.bill_number || "-",
        barcode: item.barcode,
        product_name: item.product_name,
        size: item.size,
        qty: item.quantity,
        price: item.movement_type,
        party: item.notes || "-",
      });
    });

    filteredProductChanges.forEach(item => {
      combined.push({
        type: "product",
        date: item.created_at?.split("T")[0] || "",
        reference: item.action,
        barcode: "-",
        product_name: item.product_name,
        size: "-",
        qty: null,
        price: "-",
        party: item.user_email,
      });
    });

    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredPurchaseData, filteredSalesData, filteredPriceEdits, filteredStockMovements, filteredProductChanges]);

  // Summary statistics
  const stats = useMemo(() => {
    const uniqueProducts = new Set(filteredPurchaseData.map(d => d.barcode)).size;
    const productsWithPriceChange = new Set(
      filteredPurchaseData
        .filter(d => d.current_sale_price !== null && d.sale_price !== d.current_sale_price)
        .map(d => d.barcode)
    ).size;
    
    const stockIn = filteredStockMovements
      .filter(m => m.quantity > 0)
      .reduce((sum, m) => sum + m.quantity, 0);
    const stockOut = filteredStockMovements
      .filter(m => m.quantity < 0)
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

    // Total quantities and amounts
    const totalPurchaseQty = filteredPurchaseData.reduce((sum, d) => sum + (d.qty || 0), 0);
    const totalPurchaseAmount = filteredPurchaseData.reduce((sum, d) => sum + ((d.qty || 0) * (d.pur_price || 0)), 0);
    const totalSalesQty = filteredSalesData.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const totalSalesAmount = filteredSalesData.reduce((sum, d) => sum + (d.line_total || 0), 0);
    
    // MRP and savings calculations
    const totalMRPAmount = filteredSalesData.reduce((sum, d) => sum + ((d.mrp || d.unit_price) * (d.quantity || 0)), 0);
    const totalSavings = totalMRPAmount - filteredSalesData.reduce((sum, d) => sum + ((d.unit_price || 0) * (d.quantity || 0)), 0);

    return { 
      uniqueProducts, 
      productsWithPriceChange, 
      totalPurchases: filteredPurchaseData.length,
      totalSales: filteredSalesData.length,
      totalEdits: filteredPriceEdits.length,
      totalMovements: filteredStockMovements.length,
      totalProductChanges: filteredProductChanges.length,
      stockIn,
      stockOut,
      totalPurchaseQty,
      totalPurchaseAmount,
      totalSalesQty,
      totalSalesAmount,
      totalMRPAmount,
      totalSavings,
    };
  }, [filteredPurchaseData, filteredSalesData, filteredPriceEdits, filteredStockMovements, filteredProductChanges]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSupplier("all");
    setSelectedCustomer("all");
    setStartDate("");
    setEndDate("");
    setShowPriceChangesOnly(false);
    setMovementTypeFilter("all");
  };

  const getPriceChangeIndicator = (batchPrice: number, currentPrice: number | null) => {
    if (currentPrice === null) return { icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground" };
    if (currentPrice > batchPrice) return { icon: <TrendingUp className="h-4 w-4" />, color: "text-green-600" };
    if (currentPrice < batchPrice) return { icon: <TrendingDown className="h-4 w-4" />, color: "text-red-600" };
    return { icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground" };
  };

  const getMovementTypeBadge = (type: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      purchase: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", label: "Purchase" },
      sale: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", label: "Sale" },
      purchase_return: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", label: "Pur Return" },
      sale_return: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", label: "Sale Return" },
      purchase_increase: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-300", label: "Pur Increase" },
      purchase_decrease: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Pur Decrease" },
      purchase_delete: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", label: "Pur Delete" },
      sale_delete: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-300", label: "Sale Delete" },
    };
    const badge = badges[type] || { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", label: type };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>;
  };

  const getActionBadge = (action: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      CREATE: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", icon: Plus },
      UPDATE: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", icon: Edit },
      DELETE: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", icon: Trash2 },
    };
    const badge = badges[action] || { bg: "bg-gray-100", text: "text-gray-700", icon: Edit };
    const Icon = badge.icon;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${badge.bg} ${badge.text}`}>
        <Icon className="h-3 w-3" />
        {action}
      </span>
    );
  };

  const movementTypes = useMemo(() => {
    const types = [...new Set(stockMovements.map(m => m.movement_type))];
    return types;
  }, [stockMovements]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Purchase Sheet
    const purchaseData = filteredPurchaseData.map(item => ({
      "Date": item.bill_date ? format(new Date(item.bill_date), "dd/MM/yyyy") : "",
      "Bill No": item.software_bill_no || item.bill_number,
      "Barcode": item.barcode,
      "Product Name": item.product_name,
      "Brand": item.brand,
      "Size": item.size,
      "Supplier": item.supplier_name,
      "Qty": item.qty,
      "Purchase Price": item.pur_price,
      "Batch Sale Price": item.sale_price,
      "Current Price": item.current_sale_price ?? "-",
    }));
    const purchaseWs = XLSX.utils.json_to_sheet(purchaseData);
    XLSX.utils.book_append_sheet(wb, purchaseWs, "Purchases");

    // Sales Sheet
    const salesData = filteredSalesData.map(item => ({
      "Date": item.sale_date ? format(new Date(item.sale_date), "dd/MM/yyyy") : "",
      "Sale No": item.sale_number,
      "Barcode": item.barcode,
      "Product Name": item.product_name,
      "Size": item.size,
      "Customer": item.customer_name,
      "Qty": item.quantity,
      "Unit Price": item.unit_price,
      "MRP": item.mrp,
      "Discount %": item.discount_percent,
      "Line Total": item.line_total,
    }));
    const salesWs = XLSX.utils.json_to_sheet(salesData);
    XLSX.utils.book_append_sheet(wb, salesWs, "Sales");

    // Price Edits Sheet
    const editsData = filteredPriceEdits.map(item => ({
      "Date": item.created_at ? format(new Date(item.created_at), "dd/MM/yyyy HH:mm") : "",
      "Barcode": item.barcode,
      "Size": item.size,
      "Old Pur Price": item.old_pur_price ?? "-",
      "New Pur Price": item.new_pur_price ?? "-",
      "Old Sale Price": item.old_sale_price ?? "-",
      "New Sale Price": item.new_sale_price ?? "-",
      "Changed By": item.user_email,
    }));
    const editsWs = XLSX.utils.json_to_sheet(editsData);
    XLSX.utils.book_append_sheet(wb, editsWs, "Price Edits");

    // Stock Movements Sheet
    const movementsData = filteredStockMovements.map(item => ({
      "Date": item.created_at ? format(new Date(item.created_at), "dd/MM/yyyy HH:mm") : "",
      "Type": item.movement_type,
      "Bill No": item.bill_number || "-",
      "Barcode": item.barcode,
      "Product": item.product_name,
      "Size": item.size,
      "Qty Change": item.quantity,
      "Notes": item.notes || "-",
    }));
    const movementsWs = XLSX.utils.json_to_sheet(movementsData);
    XLSX.utils.book_append_sheet(wb, movementsWs, "Stock Movements");

    // Product Changes Sheet
    const productData = filteredProductChanges.map(item => ({
      "Date": item.created_at ? format(new Date(item.created_at), "dd/MM/yyyy HH:mm") : "",
      "Action": item.action,
      "Product Name": item.product_name,
      "Brand": item.brand || "-",
      "Category": item.category || "-",
      "Changed By": item.user_email,
    }));
    const productWs = XLSX.utils.json_to_sheet(productData);
    XLSX.utils.book_append_sheet(wb, productWs, "Product Changes");

    XLSX.writeFile(wb, `Price_History_Report_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("Exported to Excel");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 print:p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Price & Stock History</h1>
            <p className="text-muted-foreground text-sm">
              Track prices, stock movements & product changes
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAllData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Summary Cards - Clickable with Tooltips */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6 print:hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-blue-500/50"
              onClick={() => setActiveTab("purchases")}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Purchases</p>
                    <p className="text-lg font-bold">{stats.totalPurchases}</p>
                    <p className="text-xs text-muted-foreground">Qty: {stats.totalPurchaseQty} | ₹{stats.totalPurchaseAmount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View all purchase entries with prices and quantities</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-green-500/50"
              onClick={() => setActiveTab("sales")}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Sales</p>
                    <p className="text-lg font-bold">{stats.totalSales}</p>
                    <p className="text-xs text-muted-foreground">Qty: {stats.totalSalesQty} | ₹{stats.totalSalesAmount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View all sales transactions with customer details</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-orange-500/50"
              onClick={() => setActiveTab("edits")}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Edit className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Price Edits</p>
                    <p className="text-lg font-bold">{stats.totalEdits}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View price change history (old → new prices)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-purple-500/50"
              onClick={() => setActiveTab("movements")}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Movements</p>
                    <p className="text-lg font-bold">{stats.totalMovements}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View all stock movements (purchases, sales, returns)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-cyan-500/50"
              onClick={() => setActiveTab("products")}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Prod Changes</p>
                    <p className="text-lg font-bold">{stats.totalProductChanges}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View product create/update/delete history</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-green-600/50"
              onClick={() => {
                setActiveTab("movements");
                setMovementTypeFilter("purchase");
              }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Stock In</p>
                    <p className="text-lg font-bold text-green-600">+{stats.stockIn}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View stock additions (purchases, returns received)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-red-500/50"
              onClick={() => {
                setActiveTab("movements");
                setMovementTypeFilter("sale");
              }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Stock Out</p>
                    <p className="text-lg font-bold text-red-500">-{stats.stockOut}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View stock deductions (sales, returns sent)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-amber-500/50"
              onClick={() => {
                setActiveTab("purchases");
                setShowPriceChangesOnly(true);
              }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Price Changed</p>
                    <p className="text-lg font-bold text-amber-600">{stats.productsWithPriceChange}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>View products where purchase price changed over time</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Filters */}
      <Card className="mb-6 print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, barcode, bill... (multi-word AND)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 no-uppercase"
                />
              </div>
            </div>
            
            {activeTab === "purchases" && (
              <div className="w-[180px]">
                <Label className="text-xs mb-1">Supplier</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.supplier_name}>
                        {s.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === "sales" && (
              <div className="w-[180px]">
                <Label className="text-xs mb-1">Customer</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.customer_name}>
                        {c.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === "movements" && (
              <div className="w-[180px]">
                <Label className="text-xs mb-1">Movement Type</Label>
                <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {movementTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="w-[140px]">
              <Label className="text-xs mb-1">From Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="w-[140px]">
              <Label className="text-xs mb-1">To Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {activeTab === "purchases" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="priceChangesOnly"
                  checked={showPriceChangesOnly}
                  onCheckedChange={(checked) => setShowPriceChangesOnly(checked as boolean)}
                />
                <Label htmlFor="priceChangesOnly" className="text-sm cursor-pointer">
                  Price changes only
                </Label>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="print:hidden flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="gap-2">
            <History className="h-4 w-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="purchases" className="gap-2">
            <Package className="h-4 w-4" />
            Purchases
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Sales
          </TabsTrigger>
          <TabsTrigger value="edits" className="gap-2">
            <Edit className="h-4 w-4" />
            Price Edits
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Stock Movements
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <FileText className="h-4 w-4" />
            Product Changes
          </TabsTrigger>
        </TabsList>

        {/* All History Tab */}
        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Price/Info</TableHead>
                      <TableHead>Party/User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : combinedHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No data found
                        </TableCell>
                      </TableRow>
                    ) : (
                      combinedHistory.slice(0, 300).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.type === "purchase" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                              item.type === "sale" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                              item.type === "edit" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" :
                              item.type === "stock" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
                              "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                            }`}>
                              {item.type === "purchase" ? "Purchase" :
                               item.type === "sale" ? "Sale" : 
                               item.type === "edit" ? "Edit" :
                               item.type === "stock" ? "Stock" : "Product"}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.date ? format(new Date(item.date), "dd/MM/yy") : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.reference}</TableCell>
                          <TableCell className="font-mono">{item.barcode}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{item.product_name}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className={`text-right font-medium ${
                            item.qty !== null && item.qty < 0 ? "text-red-600" : 
                            item.qty !== null && item.qty > 0 ? "text-green-600" : ""
                          }`}>
                            {item.qty !== null ? (item.qty > 0 ? `+${item.qty}` : item.qty) : "-"}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{item.price}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">{item.party}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchases Tab */}
        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[90px]">Date</TableHead>
                      <TableHead className="w-[100px]">Bill No</TableHead>
                      <TableHead className="w-[100px]">Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-[80px]">Size</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="w-[60px] text-right">Qty</TableHead>
                      <TableHead className="w-[90px] text-right">Pur ₹</TableHead>
                      <TableHead className="w-[90px] text-right">Batch ₹</TableHead>
                      <TableHead className="w-[90px] text-right">Current ₹</TableHead>
                      <TableHead className="w-[60px] text-center">Chg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredPurchaseData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No purchase history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPurchaseData.map((item) => {
                        const change = getPriceChangeIndicator(item.sale_price, item.current_sale_price);
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-sm">
                              {item.bill_date ? format(new Date(item.bill_date), "dd/MM/yy") : "-"}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.software_bill_no || item.bill_number}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.product_name}</TableCell>
                            <TableCell>{item.size}</TableCell>
                            <TableCell>{item.supplier_name}</TableCell>
                            <TableCell className="text-right">{item.qty}</TableCell>
                            <TableCell className="text-right">₹{item.pur_price}</TableCell>
                            <TableCell className="text-right">₹{item.sale_price}</TableCell>
                            <TableCell className="text-right">
                              {item.current_sale_price !== null ? `₹${item.current_sale_price}` : "-"}
                            </TableCell>
                            <TableCell className={`text-center ${change.color}`}>
                              {change.icon}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                    {filteredPurchaseData.length > 0 && (
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell colSpan={6} className="text-right">Total:</TableCell>
                        <TableCell className="text-right">{stats.totalPurchaseQty}</TableCell>
                        <TableCell colSpan={2}></TableCell>
                        <TableCell className="text-right">₹{stats.totalPurchaseAmount.toLocaleString()}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Sale No</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit ₹</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-right">Disc %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Savings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSalesData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No sales history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSalesData.map((item) => {
                        const itemSavings = item.mrp > item.unit_price 
                          ? (item.mrp - item.unit_price) * item.quantity 
                          : 0;
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-sm">
                              {item.sale_date ? format(new Date(item.sale_date), "dd/MM/yy") : "-"}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.sale_number}</TableCell>
                            <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.product_name}</TableCell>
                            <TableCell>{item.size}</TableCell>
                            <TableCell>{item.customer_name}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">₹{item.unit_price}</TableCell>
                            <TableCell className="text-right">
                              {item.mrp > item.unit_price ? (
                                <span className="line-through text-muted-foreground">₹{item.mrp}</span>
                              ) : (
                                <span>₹{item.mrp}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{item.discount_percent}%</TableCell>
                            <TableCell className="text-right font-medium">₹{item.line_total}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {itemSavings > 0 ? `₹${itemSavings}` : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                    {filteredSalesData.length > 0 && (
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell colSpan={6} className="text-right">Total:</TableCell>
                        <TableCell className="text-right">{stats.totalSalesQty}</TableCell>
                        <TableCell colSpan={3}></TableCell>
                        <TableCell className="text-right">₹{stats.totalSalesAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-green-600">₹{stats.totalSavings.toLocaleString()}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price Edits Tab */}
        <TabsContent value="edits">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Old Pur ₹</TableHead>
                      <TableHead className="text-right">New Pur ₹</TableHead>
                      <TableHead className="text-right">Old Sale ₹</TableHead>
                      <TableHead className="text-right">New Sale ₹</TableHead>
                      <TableHead>Changed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredPriceEdits.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No price edit history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPriceEdits.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm">
                            {item.created_at ? format(new Date(item.created_at), "dd/MM/yy HH:mm") : "-"}
                          </TableCell>
                          <TableCell className="font-mono">{item.barcode}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className="text-right">
                            {item.old_pur_price !== null ? `₹${item.old_pur_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.new_pur_price !== null ? `₹${item.new_pur_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.old_sale_price !== null ? `₹${item.old_sale_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.new_sale_price !== null ? `₹${item.new_sale_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.user_email}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock Movements Tab */}
        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Bill No</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Qty Change</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredStockMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No stock movement history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStockMovements.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm">
                            {item.created_at ? format(new Date(item.created_at), "dd/MM/yy HH:mm") : "-"}
                          </TableCell>
                          <TableCell>{getMovementTypeBadge(item.movement_type)}</TableCell>
                          <TableCell className="font-mono text-sm">{item.bill_number || "-"}</TableCell>
                          <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.product_name}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className={`text-right font-bold ${
                            item.quantity > 0 ? "text-green-600" : "text-red-600"
                          }`}>
                            {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {item.notes || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {filteredStockMovements.length > 0 && (
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell colSpan={6} className="text-right">Total:</TableCell>
                        <TableCell className="text-right">
                          <span className="text-green-600">+{stats.stockIn}</span>
                          {" / "}
                          <span className="text-red-600">-{stats.stockOut}</span>
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Product Changes Tab */}
        <TabsContent value="products">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Changed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredProductChanges.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No product change history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductChanges.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm">
                            {item.created_at ? format(new Date(item.created_at), "dd/MM/yy HH:mm") : "-"}
                          </TableCell>
                          <TableCell>{getActionBadge(item.action)}</TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.brand || "-"}</TableCell>
                          <TableCell>{item.category || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{item.user_email}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:p-2 {
            padding: 0.5rem !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PriceHistoryReport;
