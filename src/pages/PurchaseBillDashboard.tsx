import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Home, Edit, Trash2, Database, ArrowUpDown, Wallet, Settings2, CheckCircle2, Clock, ShoppingCart, IndianRupee, FileText, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { useOrganization } from "@/contexts/OrganizationContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { SupplierHistoryDialog } from "@/components/SupplierHistoryDialog";
import { useSoftDelete, StockDependency } from "@/hooks/useSoftDelete";
import { useDraftSave } from "@/hooks/useDraftSave";

interface PurchaseItem {
  id: string;
  product_id: string;
  product_name?: string;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
}

// Helper function to format product description
const formatProductDescription = (item: {
  product_name?: string;
  brand?: string;
  category?: string;
  style?: string;
  color?: string;
  size: string;
}) => {
  const parts = [];
  if (item.product_name) parts.push(item.product_name);
  if (item.brand) parts.push(item.brand);
  if (item.category) parts.push(item.category);
  if (item.style) parts.push(item.style);
  if (item.color) parts.push(item.color);
  parts.push(item.size);
  return parts.join(' | ');
};

interface PurchaseBill {
  id: string;
  supplier_id?: string;
  supplier_name: string;
  supplier_invoice_no: string;
  software_bill_no: string;
  bill_date: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  notes: string;
  created_at: string;
  payment_status?: string;
  paid_amount?: number;
  items?: PurchaseItem[];
}

const PurchaseBillDashboard = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<Record<string, PurchaseItem[]>>({});
  const [printingBill, setPrintingBill] = useState<string | null>(null);
  const [deletingBill, setDeletingBill] = useState<string | null>(null);
  const [billToDelete, setBillToDelete] = useState<PurchaseBill | null>(null);

  // Selection and pagination states
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Payment recording states
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<PurchaseBill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Supplier history dialog states
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<{id: string; name: string} | null>(null);
  
  // Stock dependency warning states
  const [showDependencyWarning, setShowDependencyWarning] = useState(false);
  const [stockDependencies, setStockDependencies] = useState<StockDependency[]>([]);
  const [isCheckingDependencies, setIsCheckingDependencies] = useState(false);
  
  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved } = useDraftSave('purchase');
  // Column visibility settings with database persistence
  const defaultPurchaseColumns = {
    status: true,
    recordPayment: true,
    modify: true,
    printBarcodes: true,
    delete: true
  };
  
  const { columnSettings, updateColumnSetting } = useDashboardColumnSettings(
    "purchase_bill_dashboard",
    defaultPurchaseColumns
  );
  
  // Virtual scrolling ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Fetch settings to check if MRP is enabled
  const { data: purchaseSettings } = useQuery({
    queryKey: ["settings", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("purchase_settings")
        .eq("organization_id", currentOrganization?.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });
  
  const showMrp = (purchaseSettings?.purchase_settings as any)?.show_mrp || false;

  useEffect(() => {
    fetchBills();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, itemsPerPage]);

  const fetchBills = async () => {
    setLoading(true);
    try {
      // Fetch all purchase bills using pagination to bypass 1000 row limit
      const allBills: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("purchase_bills")
          .select("*")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("bill_date", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allBills.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      setBills(allBills);
      
      // Fetch item counts for all bills (excluding soft-deleted items)
      if (allBills.length > 0) {
        const billIds = allBills.map(b => b.id);
        
        // Also paginate items fetching for large datasets
        const allItems: any[] = [];
        let itemOffset = 0;
        let itemsHasMore = true;
        
        while (itemsHasMore) {
          const { data: itemsData, error: itemsError } = await supabase
            .from("purchase_items")
            .select("bill_id, qty, id, product_id, product_name, brand, category, color, style, size, pur_price, sale_price, mrp, gst_per, hsn_code, barcode, line_total")
            .in("bill_id", billIds)
            .is("deleted_at", null)
            .range(itemOffset, itemOffset + PAGE_SIZE - 1);
          
          if (itemsError) throw itemsError;
          
          if (itemsData && itemsData.length > 0) {
            allItems.push(...itemsData);
            itemOffset += PAGE_SIZE;
            itemsHasMore = itemsData.length === PAGE_SIZE;
          } else {
            itemsHasMore = false;
          }
        }
        
        const itemsByBill: Record<string, PurchaseItem[]> = {};
        allItems.forEach(item => {
          if (!itemsByBill[item.bill_id]) {
            itemsByBill[item.bill_id] = [];
          }
          itemsByBill[item.bill_id].push(item);
        });
        setBillItems(itemsByBill);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load purchase bills",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBillItems = async (billId: string) => {
    if (billItems[billId]) {
      return; // Already fetched
    }

    try {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("id, product_id, product_name, brand, category, color, style, size, qty, pur_price, sale_price, mrp, gst_per, hsn_code, barcode, line_total")
        .eq("bill_id", billId)
        .order("created_at");

      if (error) throw error;

      setBillItems((prev) => ({
        ...prev,
        [billId]: data || [],
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load bill items",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = useCallback(async (billId: string) => {
    if (expandedBill === billId) {
      setExpandedBill(null);
    } else {
      setExpandedBill(billId);
      await fetchBillItems(billId);
    }
  }, [expandedBill, billItems]);

  const { softDelete, bulkSoftDelete, checkPurchaseStockDependencies } = useSoftDelete();

  const handleDeleteClick = async (bill: PurchaseBill, event: React.MouseEvent) => {
    event.stopPropagation();
    setBillToDelete(bill);
    
    // Check for stock dependencies
    setIsCheckingDependencies(true);
    const dependencies = await checkPurchaseStockDependencies(bill.id);
    setIsCheckingDependencies(false);
    
    if (dependencies.length > 0) {
      setStockDependencies(dependencies);
      setShowDependencyWarning(true);
    } else {
      // No dependencies, show normal delete dialog (billToDelete is already set)
    }
  };

  const handleDeleteConfirm = async () => {
    if (!billToDelete) return;

    setDeletingBill(billToDelete.id);
    try {
      const success = await softDelete("purchase_bills", billToDelete.id);
      if (!success) throw new Error("Failed to delete purchase bill");

      toast({
        title: "Success",
        description: "Purchase bill moved to recycle bin",
      });

      setBillToDelete(null);
      setShowDependencyWarning(false);
      setStockDependencies([]);
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase bill",
        variant: "destructive",
      });
    } finally {
      setDeletingBill(null);
    }
  };

  const handleCancelDelete = () => {
    setBillToDelete(null);
    setShowDependencyWarning(false);
    setStockDependencies([]);
  };

  // Note: Stock restoration is now handled automatically by database triggers
  // (handle_purchase_item_delete) when purchase_items are deleted.
  // This prevents double stock deduction that was occurring previously.

  // Note: toggleSelectAll moved after paginatedBills is defined

  const [bulkDependencies, setBulkDependencies] = useState<{billId: string; billNo: string; deps: StockDependency[]}[]>([]);
  const [showBulkDependencyWarning, setShowBulkDependencyWarning] = useState(false);

  const handleBulkDeleteClick = async () => {
    const billsToCheck = Array.from(selectedBills);
    setIsDeleting(true);
    
    // Check each bill for dependencies
    const allDeps: {billId: string; billNo: string; deps: StockDependency[]}[] = [];
    for (const billId of billsToCheck) {
      const deps = await checkPurchaseStockDependencies(billId);
      if (deps.length > 0) {
        const bill = bills.find(b => b.id === billId);
        allDeps.push({
          billId,
          billNo: bill?.software_bill_no || bill?.supplier_invoice_no || billId,
          deps
        });
      }
    }
    setIsDeleting(false);
    
    if (allDeps.length > 0) {
      setBulkDependencies(allDeps);
      setShowBulkDependencyWarning(true);
    } else {
      setShowBulkDeleteDialog(true);
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const billsToDelete = Array.from(selectedBills);
      const count = await bulkSoftDelete("purchase_bills", billsToDelete);

      toast({
        title: "Success",
        description: `${count} purchase bill(s) moved to recycle bin`,
      });

      setSelectedBills(new Set());
      setShowBulkDeleteDialog(false);
      setShowBulkDependencyWarning(false);
      setBulkDependencies([]);
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase bills",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFixMissingProductNames = async () => {
    setIsFixing(true);
    try {
      // Fetch all purchase items with missing product_name
      const { data: itemsToFix, error: fetchError } = await supabase
        .from("purchase_items")
        .select(`
          id,
          sku_id,
          product_variants!inner (
            id,
            products!inner (
              product_name
            )
          )
        `)
        .or("product_name.is.null,product_name.eq.");

      if (fetchError) throw fetchError;

      if (!itemsToFix || itemsToFix.length === 0) {
        toast({
          title: "All Good!",
          description: "No purchase items with missing product names found",
        });
        return;
      }

      // Update each item with the correct product_name
      let updatedCount = 0;
      for (const item of itemsToFix) {
        const productName = (item.product_variants as any)?.products?.product_name;
        
        if (productName) {
          const { error: updateError } = await supabase
            .from("purchase_items")
            .update({ product_name: productName })
            .eq("id", item.id);

          if (updateError) {
            console.error(`Failed to update item ${item.id}:`, updateError);
          } else {
            updatedCount++;
          }
        }
      }

      toast({
        title: "Success",
        description: `Fixed ${updatedCount} purchase item(s) with missing product names`,
      });

      // Refresh bills to reflect changes
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fix missing product names",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  const handlePageSizeChange = useCallback((value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  }, []);

  const handleOpenPaymentDialog = (bill: PurchaseBill, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedBillForPayment(bill);
    const remainingAmount = bill.net_amount - (bill.paid_amount || 0);
    setPaymentAmount(remainingAmount.toFixed(2));
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethod("cash");
    setPaymentNotes("");
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedBillForPayment || !currentOrganization) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const currentPaid = selectedBillForPayment.paid_amount || 0;
    const newTotalPaid = currentPaid + amount;

    // Allow small tolerance (₹1) for floating-point differences
    if (newTotalPaid > selectedBillForPayment.net_amount + 1) {
      toast({
        title: "Amount Exceeds Bill Total",
        description: "Payment amount exceeds the remaining bill amount",
        variant: "destructive",
      });
      return;
    }

    setIsRecordingPayment(true);
    try {
      // Determine new payment status
      let newStatus = 'unpaid';
      if (Math.abs(newTotalPaid - selectedBillForPayment.net_amount) < 1) {
        newStatus = 'paid';
      } else if (newTotalPaid > 0) {
        newStatus = 'partial';
      }

      // Update purchase bill with payment
      const { error: updateError } = await supabase
        .from("purchase_bills")
        .update({
          paid_amount: newTotalPaid,
          payment_status: newStatus,
        })
        .eq("id", selectedBillForPayment.id);

      if (updateError) throw updateError;

      // Generate voucher number for payment
      const { data: voucherNumber, error: voucherNumberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: "payment", p_date: paymentDate }
      );

      if (voucherNumberError) throw voucherNumberError;

      // Create voucher entry for supplier payment
      const paymentDescription = `Payment for Bill: ${selectedBillForPayment.software_bill_no || selectedBillForPayment.supplier_invoice_no} | Supplier: ${selectedBillForPayment.supplier_name}${paymentNotes ? ` | ${paymentNotes}` : ''}`;
      
      const { error: voucherError } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: currentOrganization.id,
          voucher_number: voucherNumber,
          voucher_type: "payment",
          voucher_date: paymentDate,
          reference_type: "supplier",
          reference_id: selectedBillForPayment.supplier_id || null,
          description: paymentDescription,
          total_amount: amount,
        });

      if (voucherError) throw voucherError;

      toast({
        title: "Payment Recorded",
        description: `₹${amount.toFixed(2)} payment recorded successfully`,
      });

      setShowPaymentDialog(false);
      setSelectedBillForPayment(null);
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handlePrintBarcodes = async (billId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card expansion/collapse
    setPrintingBill(billId);

    try {
      // Fetch bill details
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_id")
        .eq("id", billId)
        .single();

      if (billError) throw billError;

      // Fetch supplier code separately
      let supplierCode = "";
      if (billData?.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", billData.supplier_id)
          .single();
        
        supplierCode = supplierData?.supplier_code || "";
      }

      // Fetch bill items with product details directly from purchase_items
      const { data: items, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("bill_id", billId);

      if (error) throw error;

      if (!items || items.length === 0) {
        toast({
          title: "No Items",
          description: "This bill has no items to print barcodes for",
          variant: "destructive",
        });
        return;
      }

      // Format items for barcode printing page - use saved product details
      const barcodeItems = items.map((item: any) => ({
        sku_id: item.sku_id,
        product_name: item.product_name || "",
        brand: item.brand || "",
        category: item.category || "",
        color: item.color || "",
        style: item.style || "",
        size: item.size,
        sale_price: item.sale_price,
        mrp: item.mrp,
        pur_price: item.pur_price, // Include purchase price for purchase code calculation
        barcode: item.barcode,
        qty: item.qty,
        bill_number: item.bill_number || "",
        supplier_code: supplierCode,
      }));

      // Navigate to barcode printing page with items
      navigate("/barcode-printing", { 
        state: { purchaseItems: barcodeItems } 
      });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load items",
        variant: "destructive",
      });
    } finally {
      setPrintingBill(null);
    }
  };

  // Memoize filtered and sorted bills to avoid recomputing on every render
  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      const searchLower = searchQuery.toLowerCase();
      
      // Check basic bill fields
      const matchesBasicSearch =
        searchQuery === "" ||
        bill.supplier_name.toLowerCase().includes(searchLower) ||
        bill.supplier_invoice_no?.toLowerCase().includes(searchLower) ||
        bill.software_bill_no?.toLowerCase().includes(searchLower);
      
      // Check barcode in bill items
      const items = billItems[bill.id] || [];
      const matchesBarcodeSearch = searchQuery !== "" && items.some(item => 
        item.barcode?.toLowerCase().includes(searchLower) ||
        item.product_name?.toLowerCase().includes(searchLower)
      );
      
      const matchesSearch = matchesBasicSearch || matchesBarcodeSearch;

      const billDate = new Date(bill.bill_date);
      const matchesStartDate = !startDate || billDate >= new Date(startDate);
      const matchesEndDate = !endDate || billDate <= new Date(endDate);

      return matchesSearch && matchesStartDate && matchesEndDate;
    }).sort((a, b) => {
      const dateA = new Date(a.bill_date).getTime();
      const dateB = new Date(b.bill_date).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [bills, billItems, searchQuery, startDate, endDate, sortOrder]);

  // Memoize summary statistics
  const summaryStats = useMemo(() => ({
    totalBills: filteredBills.length,
    totalAmount: filteredBills.reduce((sum, bill) => sum + bill.net_amount, 0),
    totalQty: filteredBills.reduce((sum, bill) => {
      const billQty = billItems[bill.id]?.reduce((itemSum, item) => itemSum + item.qty, 0) || 0;
      return sum + billQty;
    }, 0),
    paidCount: filteredBills.filter(bill => bill.payment_status === 'paid' || (bill.paid_amount || 0) >= bill.net_amount).length,
    paidAmount: filteredBills.filter(bill => bill.payment_status === 'paid' || (bill.paid_amount || 0) >= bill.net_amount).reduce((sum, bill) => sum + bill.net_amount, 0),
    unpaidCount: filteredBills.filter(bill => !bill.payment_status || bill.payment_status === 'unpaid' || (bill.paid_amount || 0) === 0).length,
    unpaidAmount: filteredBills.filter(bill => !bill.payment_status || bill.payment_status === 'unpaid' || (bill.paid_amount || 0) === 0).reduce((sum, bill) => sum + bill.net_amount, 0),
    partialCount: filteredBills.filter(bill => bill.payment_status === 'partial' || ((bill.paid_amount || 0) > 0 && (bill.paid_amount || 0) < bill.net_amount)).length,
    partialAmount: filteredBills.filter(bill => bill.payment_status === 'partial' || ((bill.paid_amount || 0) > 0 && (bill.paid_amount || 0) < bill.net_amount)).reduce((sum, bill) => sum + (bill.net_amount - (bill.paid_amount || 0)), 0),
  }), [filteredBills, billItems]);

  // Memoize pagination calculations
  const totalPages = useMemo(() => Math.ceil(filteredBills.length / itemsPerPage), [filteredBills.length, itemsPerPage]);
  const paginatedBills = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredBills.slice(startIndex, endIndex);
  }, [filteredBills, currentPage, itemsPerPage]);

  // Memoized event handlers (defined after filteredBills/paginatedBills)
  const toggleSelectAll = useCallback(() => {
    if (selectedBills.size === paginatedBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(paginatedBills.map(b => b.id)));
    }
  }, [selectedBills.size, paginatedBills]);

  const toggleSelectBill = useCallback((billId: string) => {
    setSelectedBills(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(billId)) {
        newSelected.delete(billId);
      } else {
        newSelected.add(billId);
      }
      return newSelected;
    });
  }, []);

  const getPaymentStatusBadge = (bill: PurchaseBill) => {
    const status = bill.payment_status || 'unpaid';
    const paidAmount = bill.paid_amount || 0;
    // Use tolerance for floating point comparison (within 1 rupee is considered fully paid)
    const isFullyPaid = status === 'paid' || Math.abs(paidAmount - bill.net_amount) < 1;
    
    if (isFullyPaid) {
      return <Badge className="min-w-[70px] justify-center bg-green-500 hover:bg-green-600 text-white">Paid</Badge>;
    } else if (status === 'partial' || (paidAmount > 0 && paidAmount < bill.net_amount)) {
      return <Badge className="min-w-[70px] justify-center bg-pink-400 hover:bg-pink-500 text-white">Partial</Badge>;
    } else {
      return <Badge className="min-w-[70px] justify-center bg-red-500 hover:bg-red-600 text-white">Not Paid</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Receipt className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Purchase Bills</h1>
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Show/Hide Columns</h4>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="status"
                        checked={columnSettings.status}
                        onCheckedChange={(checked) => updateColumnSetting('status', checked as boolean)}
                      />
                      <Label htmlFor="status" className="text-sm cursor-pointer">Payment Status</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="recordPayment"
                        checked={columnSettings.recordPayment}
                        onCheckedChange={(checked) => updateColumnSetting('recordPayment', checked as boolean)}
                      />
                      <Label htmlFor="recordPayment" className="text-sm cursor-pointer">Record Payment</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="modify"
                        checked={columnSettings.modify}
                        onCheckedChange={(checked) => updateColumnSetting('modify', checked as boolean)}
                      />
                      <Label htmlFor="modify" className="text-sm cursor-pointer">Edit</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="printBarcodes"
                        checked={columnSettings.printBarcodes}
                        onCheckedChange={(checked) => updateColumnSetting('printBarcodes', checked as boolean)}
                      />
                      <Label htmlFor="printBarcodes" className="text-sm cursor-pointer">Print Barcodes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="delete"
                        checked={columnSettings.delete}
                        onCheckedChange={(checked) => updateColumnSetting('delete', checked as boolean)}
                      />
                      <Label htmlFor="delete" className="text-sm cursor-pointer">Delete</Label>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              onClick={handleFixMissingProductNames} 
              variant="outline"
              className="gap-2"
              disabled={isFixing}
            >
              {isFixing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Fix Missing Data
            </Button>
            <Button onClick={() => navigate("/purchase-entry")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Purchase
            </Button>
          </div>
        </div>

        {/* Unsaved Draft Card */}
        {hasDraft && draftData && (
          <Card className="mb-6 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-amber-800 dark:text-amber-200">
                      Unsaved Purchase Bill Found
                    </CardTitle>
                    <CardDescription className="text-amber-600 dark:text-amber-400">
                      {lastSaved ? `Last saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}` : 'Draft available'}
                      {draftData.lineItems?.length > 0 && ` • ${draftData.lineItems.length} item(s)`}
                      {draftData.billData?.supplier_name && ` • ${draftData.billData.supplier_name}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await deleteDraft();
                      toast({
                        title: "Draft Discarded",
                        description: "The unsaved purchase bill has been removed",
                      });
                    }}
                    className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  >
                    <X className="h-4 w-4" />
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      // Resume always loads from the saved draft payload (it may already include edit mode info)
                      navigate("/purchase-entry", { state: { loadDraft: true } });
                    }}
                    className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Edit className="h-4 w-4" />
                    Resume Draft
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Summary Statistics - Vasy ERP Style Vibrant Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Total Bills</CardDescription>
              <Receipt className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.totalBills}</div>
              <p className="text-xs text-white/70">Qty: {summaryStats.totalQty}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Paid</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.paidCount}</div>
              <p className="text-xs text-white/70">₹{summaryStats.paidAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Partial</CardDescription>
              <Clock className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.partialCount}</div>
              <p className="text-xs text-white/70">₹{summaryStats.partialAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Unpaid</CardDescription>
              <Wallet className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.unpaidCount}</div>
              <p className="text-xs text-white/70">₹{summaryStats.unpaidAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Total Amount</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalAmount.toFixed(0)}</div>
              <p className="text-xs text-white/70">Avg: ₹{filteredBills.length > 0 ? (summaryStats.totalAmount / filteredBills.length).toFixed(0) : "0"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Actions */}
        {selectedBills.size > 0 && (
          <Card className="mb-4 border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {selectedBills.size} bill(s) selected
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteClick}
                  disabled={isDeleting}
                  className="gap-2"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg border-border">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div>
                <CardTitle className="text-2xl">All Purchase Bills</CardTitle>
                <CardDescription>
                  {filteredBills.length} {filteredBills.length === 1 ? "bill" : "bills"} found
                </CardDescription>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by bill no, supplier, barcode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  type="date"
                  placeholder="End Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <Select value={sortOrder} onValueChange={(value: "asc" | "desc") => setSortOrder(value)}>
                  <SelectTrigger className="gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest First (DESC)</SelectItem>
                    <SelectItem value="asc">Oldest First (ASC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredBills.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No purchase bills found</p>
                <p className="text-sm">Create your first purchase bill to get started</p>
              </div>
            ) : (
              <div 
                ref={tableContainerRef}
                className="border rounded-lg max-h-[600px] overflow-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedBills.size === paginatedBills.length && paginatedBills.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-16">Sr. No.</TableHead>
                      <TableHead>Bill No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice No.</TableHead>
                      <TableHead>Supplier Name</TableHead>
                      <TableHead className="text-right">Gross Amount</TableHead>
                      <TableHead className="text-right">GST Amount</TableHead>
                      <TableHead className="text-right">Net Amount</TableHead>
                      {columnSettings.status && <TableHead className="text-center">Payment Status</TableHead>}
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {paginatedBills.map((bill, index) => (
                      <>
                        <TableRow
                          key={bill.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpanded(bill.id)}
                        >
                        <TableCell>
                          {expandedBill === bill.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedBills.has(bill.id)}
                            onCheckedChange={() => toggleSelectBill(bill.id)}
                          />
                        </TableCell>
                          <TableCell className="font-medium">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {bill.software_bill_no || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {format(new Date(bill.bill_date), "dd MMM yyyy")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{bill.supplier_invoice_no}</TableCell>
                          <TableCell className="font-medium">
                            <span 
                              className={bill.supplier_id ? "cursor-pointer text-blue-600 hover:underline" : ""}
                              onClick={(e) => {
                                if (bill.supplier_id) {
                                  e.stopPropagation();
                                  setSelectedSupplierForHistory({ id: bill.supplier_id, name: bill.supplier_name });
                                  setShowSupplierHistory(true);
                                }
                              }}
                            >
                              {bill.supplier_name}
                            </span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              Qty: {billItems[bill.id]?.reduce((sum, item) => sum + item.qty, 0) || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">₹{bill.gross_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{bill.gst_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ₹{bill.net_amount.toFixed(2)}
                          </TableCell>
                          {columnSettings.status && (
                            <TableCell className="text-center">
                              {getPaymentStatusBadge(bill)}
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {billItems[bill.id]?.length || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {columnSettings.recordPayment && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handleOpenPaymentDialog(bill, e)}
                                  className="gap-1"
                                  title="Record Payment"
                                >
                                  <Wallet className="h-4 w-4" />
                                </Button>
                              )}
                              {columnSettings.modify && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/purchase-entry", { state: { editBillId: bill.id } });
                                  }}
                                  className="gap-1"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {columnSettings.printBarcodes && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handlePrintBarcodes(bill.id, e)}
                                  disabled={printingBill === bill.id}
                                  className="gap-1"
                                >
                                  {printingBill === bill.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Printer className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {columnSettings.delete && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handleDeleteClick(bill, e)}
                                  disabled={deletingBill === bill.id}
                                  className="gap-1 text-destructive hover:text-destructive"
                                >
                                  {deletingBill === bill.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Items Row */}
                        {expandedBill === bill.id && billItems[bill.id] && billItems[bill.id].length > 0 && (
                          <TableRow>
                            <TableCell colSpan={columnSettings.status ? 13 : 12} className="bg-muted/20 p-0">
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-semibold text-sm">Purchase Items Details</h4>
                                  {bill.notes && (
                                    <p className="text-sm text-muted-foreground">
                                      <span className="font-medium">Notes:</span> {bill.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/30">
                                        <TableHead>Product Description</TableHead>
                                        <TableHead>Barcode</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Purchase Price</TableHead>
                                        <TableHead className="text-right">Sale Price</TableHead>
                                        {showMrp && <TableHead className="text-right">MRP</TableHead>}
                                        <TableHead className="text-right">GST %</TableHead>
                                        <TableHead className="text-right">Line Total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                       {billItems[bill.id].map((item) => (
                                        <TableRow key={item.id}>
                                          <TableCell className="font-medium whitespace-nowrap">
                                            {formatProductDescription(item)}
                                          </TableCell>
                                          <TableCell>
                                            {item.barcode ? (
                                              <Badge variant="outline" className="font-mono text-xs">
                                                {item.barcode}
                                              </Badge>
                                            ) : (
                                              <span className="text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">{item.qty}</TableCell>
                                          <TableCell className="text-right">₹{item.pur_price.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">₹{item.sale_price.toFixed(2)}</TableCell>
                                          {showMrp && <TableCell className="text-right">₹{(item.mrp || 0).toFixed(2)}</TableCell>}
                                          <TableCell className="text-right">{item.gst_per}%</TableCell>
                                          <TableCell className="text-right font-semibold">
                                            ₹{item.line_total.toFixed(2)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {filteredBills.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredBills.length)} of {filteredBills.length} bills
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog - Only shown when no dependencies */}
      <AlertDialog open={!!billToDelete && !showDependencyWarning && !isCheckingDependencies} onOpenChange={handleCancelDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete purchase bill{" "}
              <span className="font-semibold">
                {billToDelete?.software_bill_no || billToDelete?.supplier_invoice_no}
              </span>
              ? This will also delete all associated items and reverse stock. This action can be restored from recycle bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stock Dependency Warning Dialog */}
      <AlertDialog open={showDependencyWarning} onOpenChange={handleCancelDelete}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <span className="text-2xl">⚠️</span>
              Warning: Stock Dependencies Found
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <p className="mb-4">
                Deleting purchase bill{" "}
                <span className="font-semibold">
                  {billToDelete?.software_bill_no || billToDelete?.supplier_invoice_no}
                </span>
                {" "}will cause <strong className="text-destructive">negative stock</strong> because the following active sales have already consumed items from this purchase:
              </p>
              
              <div className="max-h-60 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sale #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Sold Qty</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockDependencies.map((dep, index) => (
                      <TableRow key={`${dep.sale_id}-${index}`}>
                        <TableCell className="font-medium">{dep.sale_number}</TableCell>
                        <TableCell>{dep.product_name}</TableCell>
                        <TableCell>{dep.size}</TableCell>
                        <TableCell className="text-right">{dep.quantity}</TableCell>
                        <TableCell className="text-right text-destructive font-medium">
                          {dep.current_stock} → {dep.current_stock - dep.purchased_qty}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <p className="mt-4 text-sm">
                <strong>Recommendation:</strong> Delete the sales listed above first if they were trial entries, or restore from recycle bin if this purchase was accidentally deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBill ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Anyway (Negative Stock)"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Bills</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedBills.size} purchase bill(s)? This will restore the stock quantities and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Stock Dependency Warning Dialog */}
      <AlertDialog open={showBulkDependencyWarning} onOpenChange={(open) => {
        if (!open) {
          setShowBulkDependencyWarning(false);
          setBulkDependencies([]);
        }
      }}>
        <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <span className="text-2xl">⚠️</span>
              Warning: Stock Dependencies Found for {bulkDependencies.length} Bill(s)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <p className="mb-4">
                The following purchase bills have active sales consuming their stock. Deleting them will cause <strong className="text-destructive">negative stock</strong>:
              </p>
              
              {bulkDependencies.map((billDep) => (
                <div key={billDep.billId} className="mb-4 border rounded-md p-3">
                  <h4 className="font-semibold mb-2">Bill: {billDep.billNo}</h4>
                  <div className="max-h-32 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Sale #</TableHead>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Size</TableHead>
                          <TableHead className="text-right text-xs">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billDep.deps.slice(0, 5).map((dep, index) => (
                          <TableRow key={`${dep.sale_id}-${index}`}>
                            <TableCell className="text-xs">{dep.sale_number}</TableCell>
                            <TableCell className="text-xs">{dep.product_name}</TableCell>
                            <TableCell className="text-xs">{dep.size}</TableCell>
                            <TableCell className="text-right text-xs">{dep.quantity}</TableCell>
                          </TableRow>
                        ))}
                        {billDep.deps.length > 5 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-xs text-muted-foreground">
                              ...and {billDep.deps.length - 5} more items
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
              
              <p className="text-sm">
                <strong>Recommendation:</strong> Delete the dependent sales first if they were trial entries.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete All ${selectedBills.size} Bills (Negative Stock)`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Recording Dialog */}
      <AlertDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Record Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Record a payment for purchase bill {selectedBillForPayment?.software_bill_no}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {selectedBillForPayment && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{selectedBillForPayment.supplier_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Bill Date:</span>
                  <p className="font-medium">{format(new Date(selectedBillForPayment.bill_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Bill Amount:</span>
                  <p className="font-medium">₹{selectedBillForPayment.net_amount.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Paid Amount:</span>
                  <p className="font-medium">₹{(selectedBillForPayment.paid_amount || 0).toFixed(2)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Remaining Amount:</span>
                  <p className="font-semibold text-lg text-primary">
                    ₹{(selectedBillForPayment.net_amount - (selectedBillForPayment.paid_amount || 0)).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter payment amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes (Optional)</Label>
                <Input
                  id="payment-notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Payment reference or notes"
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecordingPayment}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecordPayment}
              disabled={isRecordingPayment}
            >
              {isRecordingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Payment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supplier History Dialog */}
      {selectedSupplierForHistory && currentOrganization && (
        <SupplierHistoryDialog
          isOpen={showSupplierHistory}
          onClose={() => setShowSupplierHistory(false)}
          supplierId={selectedSupplierForHistory.id}
          supplierName={selectedSupplierForHistory.name}
          organizationId={currentOrganization.id}
        />
      )}
    </div>
  );
};

export default PurchaseBillDashboard;
