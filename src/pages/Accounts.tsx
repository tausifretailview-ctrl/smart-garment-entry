import { useState, useRef, useEffect } from "react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, TrendingUp, TrendingDown, DollarSign, Wallet, Printer, Send, FileDown, Filter, X, CheckCircle2, Clock, AlertCircle, Receipt, Trash2, Check, ChevronsUpDown, Search, Pencil, Coins } from "lucide-react";
 import { ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CustomerLedger } from "@/components/CustomerLedger";
import { SupplierLedger } from "@/components/SupplierLedger";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useReactToPrint } from "react-to-print";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import { calculateCustomerInvoiceBalances } from "@/utils/customerBalanceUtils";
import { ChequePrintDialog } from "@/components/ChequePrintDialog";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";

export default function Accounts() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useUserRoles();
  const [selectedTab, setSelectedTab] = useState("customer-ledger");
  
  // Card filter state
  const [paymentCardFilter, setPaymentCardFilter] = useState<string | null>(null);
  
  // Form states
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [voucherType, setVoucherType] = useState("payment");
  const [referenceType, setReferenceType] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<Date | undefined>(undefined);
  const [transactionId, setTransactionId] = useState("");
  const [nextReceiptNumber, setNextReceiptNumber] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  
  // Receipt states
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  
  // Cheque print state
  const [showChequePrintDialog, setShowChequePrintDialog] = useState(false);
  
  // Advance booking dialog state
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);

  // Customer search state
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  // Supplier search and bill selection state
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [selectedSupplierBillIds, setSelectedSupplierBillIds] = useState<string[]>([]);

  // Selected payment receipts for deletion
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

  // Edit payment receipt state
  const [showEditPaymentDialog, setShowEditPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [editPaymentDate, setEditPaymentDate] = useState<Date>(new Date());
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editChequeDate, setEditChequeDate] = useState<Date | undefined>(undefined);
  const [editTransactionId, setEditTransactionId] = useState("");
  const [editDescription, setEditDescription] = useState("");

   // Pagination state for Recent Customer Payments
   const [customerPaymentsPage, setCustomerPaymentsPage] = useState(1);
   const CUSTOMER_PAYMENTS_PER_PAGE = 10;
 
  // Reconciliation filters
  const [reconStartDate, setReconStartDate] = useState<Date>(startOfMonth(new Date()));
  const [reconEndDate, setReconEndDate] = useState<Date>(endOfMonth(new Date()));
  const [reconCustomerFilter, setReconCustomerFilter] = useState<string>("");
  const [reconStatusFilter, setReconStatusFilter] = useState<string>("all");

  // Fetch customer outstanding invoices
  const { data: customerInvoices } = useQuery({
    queryKey: ["customer-invoices", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("customer_id", referenceId)
        .in("payment_status", ["pending", "partial"])
        .is("deleted_at", null)
        .order("sale_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!referenceId && referenceType === "customer",
  });

  // Fetch settings for receipt
  const { data: settings } = useQuery({
    queryKey: ["settings", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch next receipt number preview
  const { data: previewReceiptNumber } = useQuery({
    queryKey: ["next-receipt-number", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("generate_voucher_number", {
        p_type: "receipt",
        p_date: format(new Date(), "yyyy-MM-dd"),
      });
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5000,
  });

  // Fetch customer outstanding balance (includes opening balance + actual outstanding - opening balance payments)
  const { data: customerBalance } = useQuery({
    queryKey: ["customer-balance", referenceId],
    queryFn: async () => {
      // Get customer's opening balance
      const { data: customerData, error: custError } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", referenceId)
        .maybeSingle();
      
      if (custError) throw custError;
      const openingBalance = customerData?.opening_balance || 0;

      // Get outstanding from invoices (net_amount - paid_amount)
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("customer_id", referenceId)
        .in("payment_status", ["pending", "partial"])
        .is("deleted_at", null);
      
      if (error) throw error;
      
      // Calculate actual outstanding: sum of (net_amount - paid_amount) for each invoice
      const invoiceOutstanding = data?.reduce((sum, sale) => {
        const balance = (sale.net_amount || 0) - (sale.paid_amount || 0);
        return sum + Math.max(0, balance);
      }, 0) || 0;
      
      // Get opening balance payments (voucher entries with reference_type='customer' 
      // where reference_id is the customer_id, NOT a sale_id)
      const { data: openingBalancePayments, error: obpError } = await supabase
        .from("voucher_entries")
        .select("total_amount, reference_id")
        .eq("organization_id", currentOrganization?.id)
        .eq("voucher_type", "receipt")
        .eq("reference_type", "customer")
        .is("deleted_at", null);
      
      if (obpError) throw obpError;
      
      // Filter payments where reference_id matches customer_id (opening balance payments)
      const openingBalancePaid = openingBalancePayments?.filter(
        p => p.reference_id === referenceId
      ).reduce((sum, p) => sum + (p.total_amount || 0), 0) || 0;
      
      return openingBalance + invoiceOutstanding - openingBalancePaid;
    },
    enabled: !!referenceId && referenceType === "customer",
  });

  // Fetch supplier outstanding balance
  const { data: supplierBalance } = useQuery({
    queryKey: ["supplier-balance", referenceId],
    queryFn: async () => {
      const { data: bills, error: billsError } = await supabase
        .from("purchase_bills")
        .select("id, net_amount")
        .eq("supplier_id", referenceId)
        .is("deleted_at", null);
      
      if (billsError) throw billsError;

      // Get all payments made for these bills
      const billIds = bills?.map(b => b.id) || [];
      
      // If no bills exist, return 0 (avoid .in() with empty array)
      if (billIds.length === 0) {
        return 0;
      }
      
      const { data: payments, error: paymentsError } = await supabase
        .from("voucher_entries")
        .select("total_amount, reference_id")
        .eq("reference_type", "supplier")
        .in("reference_id", billIds)
        .is("deleted_at", null);
      
      if (paymentsError) throw paymentsError;

      const totalBills = bills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, payment) => sum + (payment.total_amount || 0), 0) || 0;
      
      return totalBills - totalPaid;
    },
    enabled: !!referenceId && referenceType === "supplier",
  });

  // Fetch supplier outstanding bills (pending/partial)
  const { data: supplierBills } = useQuery({
    queryKey: ["supplier-bills", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .eq("supplier_id", referenceId)
        .is("deleted_at", null)
        .order("bill_date", { ascending: false });
      
      if (error) throw error;
      
      // Filter bills with outstanding balance
      return data?.filter(bill => {
        const outstanding = (bill.net_amount || 0) - (bill.paid_amount || 0);
        return outstanding > 0;
      }) || [];
    },
    enabled: !!referenceId && referenceType === "supplier",
  });

  // Fetch suppliers with outstanding balance
  const { data: suppliersWithBalance } = useQuery({
    queryKey: ["suppliers-with-balance", currentOrganization?.id],
    queryFn: async () => {
      // Fetch all suppliers
      const { data: allSuppliers, error: suppError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .order("supplier_name");
      
      if (suppError) throw suppError;
      
      // Fetch all purchase bills
      const { data: allBills, error: billsError } = await supabase
        .from("purchase_bills")
        .select("supplier_id, net_amount, paid_amount")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null);
      
      if (billsError) throw billsError;
      
      // Calculate outstanding balance per supplier
      const supplierBalances = new Map<string, number>();
      allBills?.forEach((bill: any) => {
        if (bill.supplier_id) {
          const outstanding = Math.max(0, (bill.net_amount || 0) - (bill.paid_amount || 0));
          supplierBalances.set(
            bill.supplier_id,
            (supplierBalances.get(bill.supplier_id) || 0) + outstanding
          );
        }
      });
      
      // Filter suppliers with balance > 0 and add outstandingBalance field
      return allSuppliers
        ?.filter((s: any) => {
          const openingBalance = s.opening_balance || 0;
          const billBalance = supplierBalances.get(s.id) || 0;
          return (openingBalance + billBalance) > 0;
        })
        .map((s: any) => ({
          ...s,
          outstandingBalance: (s.opening_balance || 0) + (supplierBalances.get(s.id) || 0),
        })) || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: customersWithBalance } = useQuery({
    queryKey: ["customers-with-balance", currentOrganization?.id],
    queryFn: async () => {
      // Fetch ALL customers using range pagination
      const allCustomers = await fetchAllCustomers(currentOrganization!.id);
      
      // Fetch ALL sales using range pagination
      const allSales = await fetchAllSalesSummary(currentOrganization!.id);
      
      console.log(`Accounts: Fetched ${allCustomers.length} customers, ${allSales.length} sales`);

      // Fetch ALL voucher payments for accurate balance calculation
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount')
        .eq('organization_id', currentOrganization!.id)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);
      
      if (voucherError) throw voucherError;
      
      // Build invoice voucher payments map
      const invoiceVoucherPayments = new Map<string, number>();
      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        // Only count payments that reference a sale_id (not customer opening balance payments)
        const isSalePayment = allSales.some((s: any) => s.id === v.reference_id);
        if (isSalePayment) {
          invoiceVoucherPayments.set(
            v.reference_id,
            (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        }
      });
      
      // Calculate invoice balance per customer using Math.max() logic
      const customerBalances = calculateCustomerInvoiceBalances(allSales, invoiceVoucherPayments);

      // Filter customers with total balance > 0 (opening_balance + invoice balance)
      return allCustomers
        .filter((c: any) => {
          const openingBalance = c.opening_balance || 0;
          const invoiceBalance = customerBalances.get(c.id) || 0;
          const totalBalance = openingBalance + invoiceBalance;
          return totalBalance > 0;
        })
        .map((c: any) => ({
          ...c,
          outstandingBalance: (c.opening_balance || 0) + (customerBalances.get(c.id) || 0),
        }));
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch all customers using pagination (for other purposes like ledger)
  const { data: customers } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      return await fetchAllCustomers(currentOrganization!.id);
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch suppliers with pagination
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const allSuppliers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("suppliers")
          .select("*")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("supplier_name")
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSuppliers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return allSuppliers;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ["employees", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("employee_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch account ledgers
  const { data: accountLedgers } = useQuery({
    queryKey: ["account-ledgers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_ledgers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("account_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch voucher entries with pagination
  const { data: vouchers } = useQuery({
    queryKey: ["voucher-entries", currentOrganization?.id],
    queryFn: async () => {
      const allVouchers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("*")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allVouchers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return allVouchers;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch reconciliation data
  const { data: reconciliationData } = useQuery({
    queryKey: ["payment-reconciliation", currentOrganization?.id, reconStartDate, reconEndDate, reconCustomerFilter, reconStatusFilter],
    queryFn: async () => {
      // If customer filter is selected, first get sales IDs for that customer
      let salesIdsFilter: string[] | null = null;
      
      if (reconCustomerFilter && reconCustomerFilter !== "all" && reconCustomerFilter !== "") {
        const { data: customerSales, error: salesError } = await supabase
          .from("sales")
          .select("id")
          .eq("customer_id", reconCustomerFilter)
          .is("deleted_at", null);
        
        if (salesError) throw salesError;
        salesIdsFilter = customerSales?.map(s => s.id) || [];
        
        // If no sales found for this customer, return empty array
        if (salesIdsFilter.length === 0) {
          return [];
        }
      }

      // Build voucher query
      let query = supabase
        .from("voucher_entries")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .or("voucher_type.eq.receipt,voucher_type.eq.RECEIPT")
        .is("deleted_at", null)
        .gte("voucher_date", format(reconStartDate, "yyyy-MM-dd"))
        .lte("voucher_date", format(reconEndDate, "yyyy-MM-dd"));

      // Apply customer filter through sales IDs
      if (salesIdsFilter !== null) {
        query = query.in("reference_id", salesIdsFilter);
      }

      const { data: payments, error } = await query.order("voucher_date", { ascending: false });

      if (error) throw error;

      // Enhance with customer and invoice details
      const enhanced = await Promise.all(
        (payments || []).map(async (payment) => {
          let customerName = "Unknown";
          let customerPhone = "";
          let invoiceDetails: any = null;

          if (payment.reference_id) {
            // Fetch invoice details
            const { data: invoice } = await supabase
              .from("sales")
              .select("*")
              .eq("id", payment.reference_id)
              .maybeSingle();

            if (invoice) {
              // Apply status filter here
              if (reconStatusFilter && reconStatusFilter !== "all" && invoice.payment_status !== reconStatusFilter) {
                return null; // Filter out this record
              }

              invoiceDetails = invoice;
              customerName = invoice.customer_name || "Walk-in Customer";
              customerPhone = invoice.customer_phone || "";

              // Fetch customer master data if customer_id exists
              if (invoice.customer_id) {
                const { data: customer } = await supabase
                  .from("customers")
                  .select("*")
                  .eq("id", invoice.customer_id)
                  .maybeSingle();
                
                if (customer) {
                  customerName = customer.customer_name || customerName;
                  customerPhone = customer.phone || customerPhone;
                }
              }
            }
          }

          return {
            ...payment,
            customerName,
            customerPhone,
            invoiceDetails,
          };
        })
      );

      // Filter out nulls (records that didn't match status filter)
      return enhanced.filter(e => e !== null);
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch sales data for P&L calculation
  const { data: sales } = useQuery({
    queryKey: ["sales", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Calculate dashboard metrics
  const dashboardMetrics = {
    totalReceivables: vouchers
      ?.filter((v) => (v.reference_type === "customer" || v.reference_type === "customer_payment" || v.reference_type === "SALE") && (v.voucher_type === "receipt" || v.voucher_type === "RECEIPT"))
      .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0,
    
    totalPayables: vouchers
      ?.filter((v) => (v.reference_type === "supplier" || v.reference_type === "employee") && v.voucher_type === "payment")
      .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0,
    
    monthlyExpenses: vouchers
      ?.filter((v) => {
        const voucherDate = new Date(v.voucher_date);
        const now = new Date();
        return (
          v.reference_type === "expense" &&
          voucherDate >= startOfMonth(now) &&
          voucherDate <= endOfMonth(now)
        );
      })
      .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0,
    
    currentMonthPL: (() => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      
      // Calculate revenue from sales
      const revenue = sales
        ?.filter((s) => {
          const saleDate = new Date(s.sale_date);
          return saleDate >= monthStart && saleDate <= monthEnd;
        })
        .reduce((sum, s) => sum + Number(s.net_amount), 0) || 0;
      
      // Calculate expenses
      const expenses = vouchers
        ?.filter((v) => {
          const voucherDate = new Date(v.voucher_date);
          return (
            v.voucher_type === "payment" &&
            voucherDate >= monthStart &&
            voucherDate <= monthEnd
          );
        })
        .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0;
      
      return revenue - expenses;
    })(),
  };

  // Calculate payment stats from all sales
  const salesArray = sales ?? [];
  const paymentStats = {
    totalInvoices: salesArray.length,
    totalAmount: salesArray.reduce((sum, s) => sum + Number(s.net_amount || 0), 0),
    paidAmount: salesArray.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0),
    pendingCount: salesArray.filter(s => s.payment_status === 'pending').length,
    pendingAmount: salesArray.filter(s => s.payment_status === 'pending').reduce((sum, s) => sum + Number(s.net_amount || 0) - Number(s.paid_amount || 0), 0),
    partialCount: salesArray.filter(s => s.payment_status === 'partial').length,
    partialAmount: salesArray.filter(s => s.payment_status === 'partial').reduce((sum, s) => sum + Number(s.net_amount || 0) - Number(s.paid_amount || 0), 0),
    completedCount: salesArray.filter(s => s.payment_status === 'completed').length,
    completedAmount: salesArray.filter(s => s.payment_status === 'completed').reduce((sum, s) => sum + Number(s.paid_amount || 0), 0),
  };

  // Handle card click
  const handleCardClick = (filter: string | null) => {
    setPaymentCardFilter(filter);
    setSelectedTab("customer-ledger");
  };

  // Auto-fill amount when customer invoices are selected
  useEffect(() => {
    if (selectedInvoiceIds.length > 0 && customerInvoices) {
      const totalOutstanding = customerInvoices
        .filter(inv => selectedInvoiceIds.includes(inv.id))
        .reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0);
      setAmount(totalOutstanding.toFixed(2));
    }
  }, [selectedInvoiceIds, customerInvoices]);

  // Auto-fill amount when supplier bills are selected
  useEffect(() => {
    if (selectedSupplierBillIds.length > 0 && supplierBills) {
      const totalOutstanding = supplierBills
        .filter(bill => selectedSupplierBillIds.includes(bill.id))
        .reduce((sum, bill) => sum + ((bill.net_amount || 0) - (bill.paid_amount || 0)), 0);
      setAmount(totalOutstanding.toFixed(2));
    }
  }, [selectedSupplierBillIds, supplierBills]);

  // Create voucher mutation with receipt generation
  const createVoucher = useMutation({
    mutationFn: async (voucherData: any) => {
      const invoicesToProcess = selectedInvoiceIds.length > 0 ? selectedInvoiceIds : (selectedInvoiceId ? [selectedInvoiceId] : []);
      const billsToProcess = selectedSupplierBillIds;
      
      // Allow opening balance payments without invoice - just need a customer selected
      if (voucherType === "receipt" && !referenceId) {
        throw new Error("Please select a customer to record payment");
      }

      // For supplier payments, need supplier selected
      if (voucherType === "payment" && referenceType === "supplier" && !referenceId) {
        throw new Error("Please select a supplier to record payment");
      }

      const paymentAmount = parseFloat(amount);
      const discountValue = parseFloat(discountAmount) || 0;
      const totalSettlement = paymentAmount + discountValue;
      let remainingAmount = totalSettlement;
      const processedInvoices: any[] = [];
      const processedBills: any[] = [];
      const isOpeningBalancePayment = voucherType === "receipt" && invoicesToProcess.length === 0;
      const isSupplierOpeningBalancePayment = voucherType === "payment" && referenceType === "supplier" && billsToProcess.length === 0;

      // For customer payments with invoices, update the sales invoices (distribute payment + discount across selected invoices)
      if (voucherType === "receipt" && invoicesToProcess.length > 0) {
        for (const invoiceId of invoicesToProcess) {
          if (remainingAmount <= 0) break;
          
          const invoice = customerInvoices?.find(inv => inv.id === invoiceId);
          if (!invoice) continue;

          const currentPaid = invoice.paid_amount || 0;
          const outstanding = invoice.net_amount - currentPaid;
          const amountToApply = Math.min(remainingAmount, outstanding);
          
          if (amountToApply <= 0) continue;

          const newPaidAmount = currentPaid + amountToApply;
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : 
                           newPaidAmount > 0 ? 'partial' : 'pending';

          // Update sales invoice - do NOT update payment_method as it has check constraint
          // The original payment method from the sale should be preserved
          const { error: updateError } = await supabase
            .from('sales')
            .update({
              paid_amount: newPaidAmount,
              payment_status: newStatus,
              payment_date: format(voucherDate, 'yyyy-MM-dd'),
            })
            .eq('id', invoiceId);

          if (updateError) throw updateError;
          
          processedInvoices.push({
            invoice,
            amountApplied: amountToApply,
            newPaidAmount,
            previousBalance: outstanding,
            currentBalance: outstanding - amountToApply,
          });
          
          remainingAmount -= amountToApply;
        }
      }

      // For supplier payments with bills, update the purchase bills (distribute payment across selected bills)
      if (voucherType === "payment" && referenceType === "supplier" && billsToProcess.length > 0) {
        remainingAmount = paymentAmount; // Reset for supplier bills
        
        for (const billId of billsToProcess) {
          if (remainingAmount <= 0) break;
          
          const bill = supplierBills?.find(b => b.id === billId);
          if (!bill) continue;

          const currentPaid = bill.paid_amount || 0;
          const outstanding = (bill.net_amount || 0) - currentPaid;
          const amountToApply = Math.min(remainingAmount, outstanding);
          
          if (amountToApply <= 0) continue;

          const newPaidAmount = currentPaid + amountToApply;
          const newStatus = newPaidAmount >= (bill.net_amount || 0) ? 'completed' : 
                           newPaidAmount > 0 ? 'partial' : 'unpaid';

          // Update purchase bill
          const { error: updateError } = await supabase
            .from('purchase_bills')
            .update({
              paid_amount: newPaidAmount,
              payment_status: newStatus,
            })
            .eq('id', billId);

          if (updateError) throw updateError;
          
          processedBills.push({
            bill,
            amountApplied: amountToApply,
            newPaidAmount,
            previousBalance: outstanding,
            currentBalance: outstanding - amountToApply,
          });
          
          remainingAmount -= amountToApply;
        }
      }

      // Generate voucher number
      const { data: voucherNumber, error: numberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: voucherType, p_date: format(voucherDate, "yyyy-MM-dd") }
      );
      if (numberError) throw numberError;

      // Build description with invoice/bill numbers and payment details
      const invoiceNumbers = processedInvoices.map(p => p.invoice.sale_number).join(', ');
      const billNumbers = processedBills.map(p => p.bill.software_bill_no || p.bill.supplier_invoice_no || p.bill.id.slice(0,8)).join(', ');
      
      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) {
        paymentDetails = ` | Cheque No: ${chequeNumber}`;
        if (chequeDate) {
          paymentDetails += `, Date: ${format(chequeDate, 'dd/MM/yyyy')}`;
        }
      } else if ((paymentMethod === 'other' || paymentMethod === 'bank_transfer' || paymentMethod === 'upi') && transactionId) {
        paymentDetails = ` | Transaction ID: ${transactionId}`;
      }
      
      // Build final description based on payment type
      let finalDescription: string;
      if (isOpeningBalancePayment) {
        const customerName = customersWithBalance?.find(c => c.id === referenceId)?.customer_name || 'Customer';
        finalDescription = description 
          ? `${description}${paymentDetails}` 
          : `Opening Balance Payment from ${customerName}${paymentDetails}`;
      } else if (isSupplierOpeningBalancePayment) {
        const supplierName = suppliersWithBalance?.find(s => s.id === referenceId)?.supplier_name || 'Supplier';
        finalDescription = description 
          ? `${description}${paymentDetails}` 
          : `Opening Balance Payment to ${supplierName}${paymentDetails}`;
      } else if (processedBills.length > 0) {
        finalDescription = description 
          ? `${description}${paymentDetails}` 
          : `Payment for Bills: ${billNumbers}${paymentDetails}`;
      } else {
        finalDescription = description 
          ? `${description}${paymentDetails}` 
          : `Payment for: ${invoiceNumbers}${paymentDetails}`;
      }

      // Build discount description suffix
      const discountSuffix = discountValue > 0 
        ? ` | Discount: ₹${discountValue.toFixed(2)}${discountReason ? ` (${discountReason})` : ''}`
        : '';

      // Determine correct reference_type and reference_id
      // - For opening balance payments: reference_type='customer', reference_id=customer_id
      // - For invoice payments: reference_type='sale', reference_id=sale_id
      // - For supplier opening balance: reference_type='supplier', reference_id=supplier_id
      // - For supplier bill payments: reference_type='supplier', reference_id=supplier_id (bills tracked via description)
      let finalReferenceType = referenceType;
      let finalReferenceId = referenceId;
      
      if (voucherType === 'receipt' && referenceType === 'customer') {
        if (isOpeningBalancePayment) {
          // Opening balance payment - reference the customer
          finalReferenceType = 'customer';
          finalReferenceId = referenceId;
        }
        // For invoice payments, we'll create separate vouchers below
      } else if (voucherType === 'payment' && referenceType === 'supplier') {
        // Supplier payments always reference the supplier
        finalReferenceType = 'supplier';
        finalReferenceId = referenceId;
      }

      // Create voucher entries
      let createdVouchers: any[] = [];
      
      // For multi-invoice payments, create separate voucher for each invoice
      if (voucherType === 'receipt' && referenceType === 'customer' && !isOpeningBalancePayment && processedInvoices.length > 0) {
        for (let i = 0; i < processedInvoices.length; i++) {
          const processed = processedInvoices[i];
          // Use numbered suffix only when multiple invoices
          const invoiceVoucherNumber = processedInvoices.length > 1 
            ? `${voucherNumber}-${i + 1}`
            : voucherNumber;
          
          const invoiceDescription = `Payment for ${processed.invoice.sale_number}${paymentDetails}`;
          const invoiceDiscountSuffix = i === 0 && discountValue > 0 
            ? ` | Discount: ₹${discountValue.toFixed(2)}${discountReason ? ` (${discountReason})` : ''}`
            : '';
          
          const { data: voucher, error: voucherError } = await supabase
            .from("voucher_entries")
            .insert({
              organization_id: currentOrganization?.id,
              voucher_number: invoiceVoucherNumber,
              voucher_type: voucherType,
              voucher_date: format(voucherDate, "yyyy-MM-dd"),
              reference_type: 'sale',
              reference_id: processed.invoice.id,
              description: invoiceDescription + invoiceDiscountSuffix,
              total_amount: processed.amountApplied,
              discount_amount: i === 0 ? discountValue : 0,
              discount_reason: i === 0 ? discountReason || null : null,
            })
            .select()
            .single();

          if (voucherError) throw voucherError;
          createdVouchers.push(voucher);
        }
      } else {
        // Single voucher for opening balance, supplier payments, or single invoice
        if (voucherType === 'receipt' && referenceType === 'customer' && !isOpeningBalancePayment && processedInvoices.length === 1) {
          finalReferenceType = 'sale';
          finalReferenceId = processedInvoices[0].invoice.id;
        }
        
        const { data: voucher, error: voucherError } = await supabase
          .from("voucher_entries")
          .insert({
            organization_id: currentOrganization?.id,
            voucher_number: voucherNumber,
            voucher_type: voucherType,
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: finalReferenceType,
            reference_id: finalReferenceId,
            description: finalDescription + discountSuffix,
            total_amount: paymentAmount,
            discount_amount: discountValue,
            discount_reason: discountReason || null,
          })
          .select()
          .single();

        if (voucherError) throw voucherError;
        createdVouchers.push(voucher);
      }

      const voucher = createdVouchers[0];

      return { 
        voucher, 
        voucherNumber, 
        processedInvoices, 
        processedBills, 
        isOpeningBalancePayment, 
        isSupplierOpeningBalancePayment, 
        paymentMethod,
        discountAmount: discountValue,
        discountReason: discountReason,
      };
    },
    onSuccess: (data) => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      
      // Generate receipt for customer payments
      if (voucherType === "receipt") {
        const totalPaid = parseFloat(amount);
        const discountValue = data.discountAmount || 0;
        
        if (data.isOpeningBalancePayment) {
          // Opening balance payment - no invoice
          const customer = customersWithBalance?.find(c => c.id === referenceId);
          const totalSettled = totalPaid + discountValue;
          setReceiptData({
            voucherNumber: data.voucherNumber,
            voucherDate: format(voucherDate, 'yyyy-MM-dd'),
            customerName: customer?.customer_name || 'Customer',
            customerPhone: customer?.phone || '',
            customerAddress: customer?.address || '',
            invoiceNumber: 'Opening Balance',
            invoiceDate: format(voucherDate, 'yyyy-MM-dd'),
            invoiceAmount: customerBalance || 0,
            paidAmount: totalPaid,
            discountAmount: discountValue,
            discountReason: data.discountReason || '',
            previousBalance: customerBalance || 0,
            currentBalance: (customerBalance || 0) - totalSettled,
            paymentMethod: paymentMethod,
            multipleInvoices: [],
          });
          setShowReceiptDialog(true);
        } else if (data.processedInvoices.length > 0) {
          const firstInvoice = data.processedInvoices[0].invoice;
          const totalPreviousBalance = data.processedInvoices.reduce((sum: number, p: any) => sum + p.previousBalance, 0);
          const totalCurrentBalance = data.processedInvoices.reduce((sum: number, p: any) => sum + p.currentBalance, 0);
          
          setReceiptData({
            voucherNumber: data.voucherNumber,
            voucherDate: format(voucherDate, 'yyyy-MM-dd'),
            customerName: firstInvoice.customer_name,
            customerPhone: firstInvoice.customer_phone,
            customerAddress: firstInvoice.customer_address,
            invoiceNumber: data.processedInvoices.map((p: any) => p.invoice.sale_number).join(', '),
            invoiceDate: firstInvoice.sale_date,
            invoiceAmount: data.processedInvoices.reduce((sum: number, p: any) => sum + p.invoice.net_amount, 0),
            paidAmount: totalPaid,
            discountAmount: discountValue,
            discountReason: data.discountReason || '',
            previousBalance: totalPreviousBalance,
            currentBalance: totalCurrentBalance,
            paymentMethod: paymentMethod,
            multipleInvoices: data.processedInvoices,
          });
          setShowReceiptDialog(true);
        }
      }
      
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });

  // Delete receipt mutation - reverses payment on customer account
  const deleteReceipt = useMutation({
    mutationFn: async (payment: any) => {
      const voucherId = payment.id;
      const invoiceId = payment.reference_id;
      const paymentAmount = Number(payment.total_amount);

      // First, get the current invoice to update paid_amount
      if (invoiceId) {
        const { data: invoice, error: fetchError } = await supabase
          .from("sales")
          .select("paid_amount, net_amount, cash_amount, card_amount, upi_amount")
          .eq("id", invoiceId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        
        if (invoice) {
          // Calculate new paid amount (reverse the payment)
          const currentPaid = Number(invoice.paid_amount || 0);
          const newPaidAmount = Math.max(0, currentPaid - paymentAmount);
          const netAmount = Number(invoice.net_amount || 0);

          // Determine new payment status
          let newPaymentStatus = 'pending';
          if (newPaidAmount >= netAmount) {
            newPaymentStatus = 'completed';
          } else if (newPaidAmount > 0) {
            newPaymentStatus = 'partial';
          }

          // Update the sales record with reversed payment
          const { error: updateError } = await supabase
            .from("sales")
            .update({
              paid_amount: newPaidAmount,
              payment_status: newPaymentStatus,
            })
            .eq("id", invoiceId);

          if (updateError) throw updateError;
        } else {
          console.warn("Invoice not found:", invoiceId);
          // Continue with deleting the voucher even if invoice not found
        }
      }

      // Delete the voucher items first (if any)
      const { error: itemsError } = await supabase
        .from("voucher_items")
        .delete()
        .eq("voucher_id", voucherId);

      if (itemsError) throw itemsError;

      // Delete the voucher entry
      const { error: voucherError } = await supabase
        .from("voucher_entries")
        .delete()
        .eq("id", voucherId);

      if (voucherError) throw voucherError;

      return { voucherId, paymentAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      toast.success(`Receipt deleted. ₹${Math.round(data.paymentAmount).toLocaleString('en-IN')} reversed to customer account.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete receipt: ${error.message}`);
    },
  });

  // Edit payment mutation
  const updatePayment = useMutation({
    mutationFn: async () => {
      if (!editingPayment) throw new Error("No payment selected for editing");
      
      const newAmount = parseFloat(editPaymentAmount);
      const oldAmount = editingPayment.total_amount || 0;
      const amountDiff = newAmount - oldAmount;
      
      // Build payment details for description
      let paymentDetails = '';
      if (editPaymentMethod === 'cheque' && editChequeNumber) {
        paymentDetails = ` | Cheque No: ${editChequeNumber}`;
        if (editChequeDate) {
          paymentDetails += `, Date: ${format(editChequeDate, 'dd/MM/yyyy')}`;
        }
      } else if ((editPaymentMethod === 'upi' || editPaymentMethod === 'bank_transfer' || editPaymentMethod === 'other') && editTransactionId) {
        paymentDetails = ` | Transaction ID: ${editTransactionId}`;
      }
      
      // Extract base description (remove old payment details)
      let baseDescription = editDescription.split(' | Cheque No:')[0].split(' | Transaction ID:')[0];
      const finalDescription = baseDescription + paymentDetails;
      
      // Update voucher entry
      const { error: voucherError } = await supabase
        .from("voucher_entries")
        .update({
          voucher_date: format(editPaymentDate, "yyyy-MM-dd"),
          total_amount: newAmount,
          description: finalDescription,
        })
        .eq("id", editingPayment.id);
      
      if (voucherError) throw voucherError;
      
      // Check if reference_id is a valid sale (invoice payment vs opening balance payment)
      // Payments are stored with reference_type: "customer" but reference_id can be either sale_id or customer_id
      if (editingPayment.reference_id && amountDiff !== 0) {
        // Try to find if reference_id is a sale (invoice payment)
        const { data: invoice, error: invoiceError } = await supabase
          .from("sales")
          .select("paid_amount, net_amount")
          .eq("id", editingPayment.reference_id)
          .maybeSingle();
        
        // If invoice exists, this is an invoice payment - update its paid_amount
        if (!invoiceError && invoice) {
          const newPaidAmount = Math.max(0, (invoice.paid_amount || 0) + amountDiff);
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : 
                           newPaidAmount > 0 ? 'partial' : 'pending';
          
          await supabase
            .from("sales")
            .update({
              paid_amount: newPaidAmount,
              payment_status: newStatus,
            })
            .eq("id", editingPayment.reference_id);
        }
        // If invoice not found, this is an opening balance payment - no invoice to update
      }
      
      return { oldAmount, newAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      toast.success(`Payment updated successfully. Amount changed from ₹${Math.round(data.oldAmount).toLocaleString('en-IN')} to ₹${Math.round(data.newAmount).toLocaleString('en-IN')}`);
      setShowEditPaymentDialog(false);
      setEditingPayment(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update payment: ${error.message}`);
    },
  });

  // Open edit payment dialog
  const openEditPaymentDialog = (voucher: any) => {
    setEditingPayment(voucher);
    setEditPaymentDate(new Date(voucher.voucher_date));
    setEditPaymentAmount(voucher.total_amount?.toString() || "");
    
    // Parse payment method from description
    const desc = voucher.description || "";
    if (desc.includes("Cheque No:")) {
      setEditPaymentMethod("cheque");
      const chequeMatch = desc.match(/Cheque No: (\d+)/);
      const dateMatch = desc.match(/Date: (\d{2}\/\d{2}\/\d{4})/);
      if (chequeMatch) setEditChequeNumber(chequeMatch[1]);
      if (dateMatch) {
        const [day, month, year] = dateMatch[1].split('/');
        setEditChequeDate(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));
      }
    } else if (desc.includes("Transaction ID:")) {
      const txMatch = desc.match(/Transaction ID: (\S+)/);
      if (txMatch) setEditTransactionId(txMatch[1]);
      // Determine if UPI or bank transfer based on context
      setEditPaymentMethod("upi");
    } else {
      setEditPaymentMethod("cash");
      setEditChequeNumber("");
      setEditChequeDate(undefined);
      setEditTransactionId("");
    }
    
    setEditDescription(desc);
    setShowEditPaymentDialog(true);
  };

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceType("");
    setReferenceId("");
    setSelectedInvoiceId("");
    setSelectedInvoiceIds([]);
    setSelectedSupplierBillIds([]);
    setDescription("");
    setAmount("");
    setAccountId("");
    setPaymentMethod("cash");
    setChequeNumber("");
    setChequeDate(undefined);
    setTransactionId("");
    setDiscountAmount("");
    setDiscountReason("");
    // Refetch next receipt number
    queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
  };

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${receiptData?.voucherNumber}`,
  });

  const handleSendWhatsApp = () => {
    if (!receiptData || !receiptData.customerPhone) {
      toast.error("Customer phone number not available");
      return;
    }

    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName?.toUpperCase()}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${Math.round(receiptData.invoiceAmount).toLocaleString('en-IN')}\nPaid Amount: ₹${Math.round(receiptData.paidAmount).toLocaleString('en-IN')}\nBalance: ₹${Math.round(receiptData.currentBalance).toLocaleString('en-IN')}\n\nPayment Mode: ${receiptData.paymentMethod.toUpperCase()}\n\nThank you for your payment!`;

    const phoneNumber = receiptData.customerPhone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${phoneNumber.startsWith('91') ? phoneNumber : '91' + phoneNumber}?text=${encodeURIComponent(message)}`;
    
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    
    navigator.clipboard.writeText(message).then(() => {
      toast.success(`✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill`, { duration: 5000 });
    }).catch(() => {
      toast.warning("Couldn't copy to clipboard automatically");
    });
    
    setTimeout(() => {
      window.open(waUrl, '_blank');
    }, 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    // For receipts, we need either selected invoices OR just a customer (for opening balance)
    if (voucherType === "receipt" && !referenceId) {
      toast.error("Please select a customer");
      return;
    }
    // Prevent payment receipt when customer has no outstanding balance
    if (voucherType === "receipt" && referenceType === "customer" && 
        customerBalance !== undefined && customerBalance <= 0) {
      toast.error("Cannot create payment receipt - customer balance is zero");
      return;
    }
    // Validate discount reason when discount is applied
    const discountValue = parseFloat(discountAmount) || 0;
    if (discountValue > 0 && !discountReason.trim()) {
      toast.error("Please enter a discount reason");
      return;
    }
    createVoucher.mutate({});
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
        <BackToDashboard label="Back to Payments" to="/payments-dashboard" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Accounts Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage payments, expenses, vouchers and financial reports
            </p>
          </div>
        </div>

        {/* Payment Stats Cards - Clickable */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg",
              paymentCardFilter === null && "ring-2 ring-white"
            )}
            onClick={() => handleCardClick(null)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Total Invoices
              </CardTitle>
              <Receipt className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(paymentStats.totalAmount).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                {paymentStats.totalInvoices} invoices
              </p>
            </CardContent>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg",
              paymentCardFilter === "completed" && "ring-2 ring-white"
            )}
            onClick={() => handleCardClick("completed")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Paid
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(paymentStats.completedAmount).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                {paymentStats.completedCount} completed
              </p>
            </CardContent>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg",
              paymentCardFilter === "partial" && "ring-2 ring-white"
            )}
            onClick={() => handleCardClick("partial")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Partial
              </CardTitle>
              <Clock className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(paymentStats.partialAmount).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                {paymentStats.partialCount} partial
              </p>
            </CardContent>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg",
              paymentCardFilter === "pending" && "ring-2 ring-white"
            )}
            onClick={() => handleCardClick("pending")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Pending
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(paymentStats.pendingAmount).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                {paymentStats.pendingCount} pending
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Dashboard Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Total Receivables
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(dashboardMetrics.totalReceivables).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                Customer payments received
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Total Payables
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(dashboardMetrics.totalPayables).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                Supplier & employee payments
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Monthly Expenses
              </CardTitle>
              <DollarSign className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(dashboardMetrics.monthlyExpenses).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                Current month expenses
              </p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-0 shadow-lg",
            dashboardMetrics.currentMonthPL >= 0
              ? "bg-gradient-to-br from-green-500 to-green-600"
              : "bg-gradient-to-br from-purple-500 to-purple-600"
          )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/90">
                Current Month P/L
              </CardTitle>
              <Wallet className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ₹{Math.round(dashboardMetrics.currentMonthPL).toLocaleString('en-IN')}
              </div>
              <p className="text-xs text-white/70 mt-1">
                {dashboardMetrics.currentMonthPL >= 0 ? "Profit" : "Loss"} for {format(new Date(), "MMMM yyyy")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
            <TabsTrigger value="customer-ledger">Customer Ledger</TabsTrigger>
            <TabsTrigger value="supplier-ledger">Supplier Ledger</TabsTrigger>
            <TabsTrigger value="customer-payment">Customer Payment</TabsTrigger>
            <TabsTrigger value="supplier-payment">Supplier Payment</TabsTrigger>
            <TabsTrigger value="employee-salary">Employee Salary</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="voucher-entry">Voucher Entry</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="pl-report">P&L Report</TabsTrigger>
          </TabsList>

          {/* Customer Ledger Tab */}
          <TabsContent value="customer-ledger" className="space-y-6">
            {currentOrganization?.id && (
              <CustomerLedger 
                organizationId={currentOrganization.id} 
                paymentFilter={paymentCardFilter}
              />
            )}
          </TabsContent>

          {/* Supplier Ledger Tab */}
          <TabsContent value="supplier-ledger" className="space-y-6">
            {currentOrganization?.id && (
              <SupplierLedger organizationId={currentOrganization.id} />
            )}
          </TabsContent>

          {/* Customer Payment Tab */}
          <TabsContent value="customer-payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Customer Payment Receipt (RCP)</span>
                  {previewReceiptNumber && (
                    <Badge variant="outline" className="text-lg font-mono bg-primary/10 text-primary border-primary/30">
                      {previewReceiptNumber}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>Record payment received from customers</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Customer</Label>
                      <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={customerSearchOpen}
                            className="w-full justify-between"
                          >
                            {referenceId && referenceType === "customer"
                              ? customersWithBalance?.find((c) => c.id === referenceId)?.customer_name || "Select customer"
                              : "Select customer"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput 
                              placeholder="Search customer by name or phone..." 
                              value={customerSearchTerm}
                              onValueChange={setCustomerSearchTerm}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {customersWithBalance?.length === 0 
                                  ? "No customers with outstanding balance" 
                                  : "No customer found"}
                              </CommandEmpty>
                              <CommandGroup>
                                {customersWithBalance
                                  ?.filter((customer) => {
                                    if (!customerSearchTerm) return true;
                                    const term = customerSearchTerm.toLowerCase();
                                    return (
                                      customer.customer_name.toLowerCase().includes(term) ||
                                      (customer.phone?.toLowerCase().includes(term))
                                    );
                                  })
                                  .slice(0, 50)
                                  .map((customer) => (
                                    <CommandItem
                                      key={customer.id}
                                      value={customer.id}
                                      onSelect={() => {
                                        setReferenceId(customer.id);
                                        setReferenceType("customer");
                                        setVoucherType("receipt");
                                        setSelectedInvoiceIds([]);
                                        setSelectedInvoiceId("");
                                        setCustomerSearchOpen(false);
                                        setCustomerSearchTerm("");
                                      }}
                                      className="flex items-center justify-between"
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{customer.customer_name}</span>
                                        {customer.phone && (
                                          <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                        )}
                                      </div>
                                      <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300 bg-amber-50">
                                        ₹{Math.round(customer.outstandingBalance).toLocaleString('en-IN')}
                                      </Badge>
                                      {referenceId === customer.id && (
                                        <Check className="ml-2 h-4 w-4 text-primary" />
                                      )}
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {referenceId && referenceType === "customer" && customerBalance !== undefined && (
                        <div className={cn(
                          "mt-2 p-3 border rounded-md",
                          customerBalance <= 0 
                            ? "bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800" 
                            : "bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800"
                        )}>
                          {customerBalance <= 0 ? (
                            <p className="text-sm font-medium text-red-900 dark:text-red-100">
                              ⚠️ No outstanding balance - Payment receipt not allowed
                            </p>
                          ) : (
                            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                              Outstanding Balance: <span className="text-lg font-bold">₹{Math.round(customerBalance).toLocaleString('en-IN')}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Select Invoices (Optional - Leave empty for Opening Balance)</Label>
                      {!referenceId ? (
                        <p className="text-xs text-muted-foreground">Select a customer first</p>
                      ) : customerInvoices?.length === 0 ? (
                        <div className="p-3 bg-muted/30 border rounded-md">
                          <p className="text-xs text-muted-foreground">No pending invoices - Payment will be applied to Opening Balance</p>
                        </div>
                      ) : (
                        <>
                          <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
                            {customerInvoices?.map((invoice) => {
                              const netAmount = Number(invoice.net_amount || 0);
                              const paidAmount = Number(invoice.paid_amount || 0);
                              const balance = netAmount - paidAmount;
                              const isSelected = selectedInvoiceIds.includes(invoice.id);

                              const invoiceDate = invoice.sale_date ? new Date(invoice.sale_date) : null;
                              const invoiceDateText = invoiceDate && !Number.isNaN(invoiceDate.getTime())
                                ? format(invoiceDate, "dd/MM/yy")
                                : "-";

                              return (
                                <div 
                                  key={invoice.id} 
                                  className={cn(
                                    "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                                    isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                                  )}
                                  onClick={() => {
                                    setSelectedInvoiceIds(prev => 
                                      prev.includes(invoice.id) 
                                        ? prev.filter(id => id !== invoice.id)
                                        : [...prev, invoice.id]
                                    );
                                  }}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary pointer-events-none"
                                  />
                                  <div className="flex-1 flex justify-between items-center">
                                    <span className="font-medium">{invoice.sale_number}</span>
                                    <span className="text-sm text-muted-foreground">
                                      {invoiceDateText}
                                    </span>
                                    <Badge variant={balance > 0 ? "destructive" : "secondary"}>
                                      ₹{balance.toFixed(2)}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {selectedInvoiceIds.length === 0 && referenceId && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              ℹ No invoices selected - Payment will be recorded as Opening Balance collection
                            </p>
                          )}
                        </>
                      )}
                      {selectedInvoiceIds.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="bg-primary/10">
                            {selectedInvoiceIds.length} invoice(s) selected
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Total: ₹{customerInvoices
                              ?.filter(inv => selectedInvoiceIds.includes(inv.id))
                              .reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0)
                              .toFixed(2)}
                          </span>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedInvoiceIds([])}
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={paymentMethod || undefined} onValueChange={(value) => {
                        setPaymentMethod(value);
                        // Clear conditional fields when method changes
                        setChequeNumber("");
                        setChequeDate(undefined);
                        setTransactionId("");
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="upi">UPI</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cheque fields */}
                    {paymentMethod === 'cheque' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Cheque Number</Label>
                          <Input
                            placeholder="Enter cheque number"
                            value={chequeNumber}
                            onChange={(e) => setChequeNumber(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Cheque Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {chequeDate ? format(chequeDate, "dd/MM/yyyy") : "Select date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={chequeDate}
                                onSelect={setChequeDate}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}

                    {/* UPI/Other payment - Transaction ID field */}
                    {(paymentMethod === 'upi' || paymentMethod === 'other' || paymentMethod === 'bank_transfer') && (
                      <div className="space-y-2">
                        <Label>Transaction ID</Label>
                        <Input
                          placeholder="Enter transaction ID"
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    {/* Discount Fields - Show when payment amount is less than total outstanding */}
                    {(() => {
                      const selectedInvoiceTotal = selectedInvoiceIds.length > 0
                        ? customerInvoices
                            ?.filter(inv => selectedInvoiceIds.includes(inv.id))
                            .reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0) || 0
                        : (customerBalance || 0);
                      const paymentValue = parseFloat(amount) || 0;
                      const suggestedDiscount = Math.max(0, selectedInvoiceTotal - paymentValue);
                      const showDiscountFields = paymentValue > 0 && paymentValue < selectedInvoiceTotal;

                      return showDiscountFields && (
                        <div className="space-y-4 p-4 border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 rounded-lg">
                          <div className="flex items-center gap-2 text-foreground">
                            <TrendingDown className="h-4 w-4" />
                            <span className="text-sm font-medium">Discount Settlement</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Discount Amount</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder={`Suggested: ₹${suggestedDiscount.toFixed(2)}`}
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setDiscountAmount(suggestedDiscount.toFixed(2))}
                                className="text-xs text-primary hover:text-primary/80"
                              >
                                Apply ₹{suggestedDiscount.toFixed(2)} discount
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <Label>Discount Reason <span className="text-red-500">*</span></Label>
                              <Input
                                placeholder="e.g., Customer loyalty, Settlement discount"
                                value={discountReason}
                                onChange={(e) => setDiscountReason(e.target.value)}
                                required={parseFloat(discountAmount) > 0}
                              />
                            </div>
                          </div>

                          {/* Settlement Summary */}
                          {parseFloat(discountAmount) > 0 && (
                            <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                              <div className="flex justify-between items-center text-sm">
                                <span>Payment Amount:</span>
                                <span className="font-medium">₹{paymentValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm text-muted-foreground">
                                <span>+ Discount:</span>
                                <span className="font-medium">₹{parseFloat(discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <Separator className="my-2" />
                              <div className="flex justify-between items-center text-sm font-bold text-green-700 dark:text-green-400">
                                <span>Total Settled:</span>
                                <span>₹{(paymentValue + parseFloat(discountAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              {(paymentValue + parseFloat(discountAmount)) >= selectedInvoiceTotal && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                  ✓ Invoice(s) will be marked as fully paid
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Payment description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  {(() => {
                    const paymentAmount = parseFloat(amount) || 0;
                    const discountValue = parseFloat(discountAmount) || 0;
                    const totalSettled = paymentAmount + discountValue;
                    const outstandingBalance = customerBalance || 0;
                    const isExcessPayment = referenceType === 'customer' && totalSettled > Math.round(outstandingBalance) && outstandingBalance > 0;
                    const isZeroBalance = referenceType === 'customer' && outstandingBalance <= 0;
                    const isDisabled = isZeroBalance || isExcessPayment;
                    
                    return (
                      <div className="space-y-2">
                        {isExcessPayment && (
                          <p className="text-sm text-red-600 dark:text-red-400">
                            ⚠️ Payment (₹{Math.round(totalSettled).toLocaleString('en-IN')}) exceeds outstanding balance (₹{Math.round(outstandingBalance).toLocaleString('en-IN')})
                          </p>
                        )}
                        <Button type="submit" className="w-full md:w-auto" disabled={isDisabled}>
                          <Plus className="mr-2 h-4 w-4" />
                          Record Payment
                        </Button>
                      </div>
                    );
                  })()}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recent Customer Payments</CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowAdvanceDialog(true)}
                    className="border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    Booking Advance
                  </Button>
                  {isAdmin && selectedPaymentIds.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected ({selectedPaymentIds.length})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Selected Receipts?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete {selectedPaymentIds.length} receipt(s) and reverse the amounts back to the customers' outstanding balances.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => {
                            const selectedVouchers = vouchers?.filter((v) => selectedPaymentIds.includes(v.id)) || [];
                            selectedVouchers.forEach((voucher) => deleteReceipt.mutate(voucher));
                            setSelectedPaymentIds([]);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete & Reverse All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const customerPayments = vouchers
                    ?.filter((v) => (v.reference_type === "customer" || v.reference_type === "customer_payment" || v.reference_type === "SALE") && (v.voucher_type === "receipt" || v.voucher_type === "RECEIPT"))
                    .sort((a, b) => new Date(b.voucher_date).getTime() - new Date(a.voucher_date).getTime()) || [];
                  
                  const totalPages = Math.ceil(customerPayments.length / CUSTOMER_PAYMENTS_PER_PAGE);
                  const startIndex = (customerPaymentsPage - 1) * CUSTOMER_PAYMENTS_PER_PAGE;
                  const endIndex = startIndex + CUSTOMER_PAYMENTS_PER_PAGE;
                  const paginatedPayments = customerPayments.slice(startIndex, endIndex);
                  
                  return (
                    <>
                      <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && <TableHead className="w-10"></TableHead>}
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      {isAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                        {paginatedPayments.map((voucher) => {
                        // Look up customer from sales table via reference_id (invoice id)
                        const invoice = sales?.find((s) => s.id === voucher.reference_id);
                        const customerName = invoice?.customer_name || 
                          customers?.find((c) => c.id === voucher.reference_id)?.customer_name || 
                          "-";
                        const isSelected = selectedPaymentIds.includes(voucher.id);
                        
                        return (
                          <TableRow key={voucher.id} className={isSelected ? "bg-muted/50" : ""}>
                            {isAdmin && (
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedPaymentIds([...selectedPaymentIds, voucher.id]);
                                    } else {
                                      setSelectedPaymentIds(selectedPaymentIds.filter((id) => id !== voucher.id));
                                    }
                                  }}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                            <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                            <TableCell>{customerName}</TableCell>
                            <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                            <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    title="Edit Payment"
                                    onClick={() => openEditPaymentDialog(voucher)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    title="Print Receipt"
                                    onClick={() => {
                                      const customer = customers?.find((c) => c.id === voucher.reference_id);
                                      setReceiptData({
                                        voucherNumber: voucher.voucher_number,
                                        voucherDate: voucher.voucher_date,
                                        customerName: customerName,
                                        customerPhone: customer?.phone || "",
                                        customerAddress: customer?.address || "",
                                        invoiceNumber: voucher.description?.includes("Against Invoice") 
                                          ? voucher.description.replace("Against Invoice: ", "")
                                          : voucher.description || "-",
                                        invoiceDate: voucher.voucher_date,
                                        invoiceAmount: voucher.total_amount,
                                        paidAmount: voucher.total_amount,
                                        paymentMethod: voucher.payment_method || "cash",
                                        previousBalance: 0,
                                        currentBalance: 0
                                      });
                                      setShowReceiptDialog(true);
                                    }}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
                      
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          <p className="text-sm text-muted-foreground">
                            Showing {startIndex + 1}-{Math.min(endIndex, customerPayments.length)} of {customerPayments.length} receipts
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCustomerPaymentsPage(p => Math.max(1, p - 1))}
                              disabled={customerPaymentsPage === 1}
                            >
                              <ChevronLeft className="h-4 w-4 mr-1" />
                              Previous
                            </Button>
                            <span className="text-sm font-medium px-2">
                              Page {customerPaymentsPage} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCustomerPaymentsPage(p => Math.min(totalPages, p + 1))}
                              disabled={customerPaymentsPage === totalPages}
                            >
                              Next
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Supplier Payment Tab */}
          <TabsContent value="supplier-payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Payment (PAY)</CardTitle>
                <CardDescription>Record payment made to suppliers - select bills or pay against opening balance</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Popover open={supplierSearchOpen} onOpenChange={setSupplierSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={supplierSearchOpen}
                            className="w-full justify-between"
                          >
                            {referenceId && referenceType === "supplier"
                              ? (() => {
                                  const supplier = suppliersWithBalance?.find(s => s.id === referenceId) || 
                                                   suppliers?.find(s => s.id === referenceId);
                                  return supplier ? (
                                    <span className="flex items-center gap-2">
                                      {supplier.supplier_name}
                                      {supplier.outstandingBalance !== undefined && supplier.outstandingBalance !== null && (
                                        <Badge variant="destructive" className="ml-2">
                                          ₹{(supplier.outstandingBalance || 0).toFixed(2)}
                                        </Badge>
                                      )}
                                    </span>
                                  ) : "Select supplier";
                                })()
                              : "Select supplier..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput 
                              placeholder="Search suppliers..." 
                              value={supplierSearchTerm}
                              onValueChange={setSupplierSearchTerm}
                            />
                            <CommandList>
                              <CommandEmpty>No supplier found.</CommandEmpty>
                              <CommandGroup heading="Suppliers with Balance">
                                {suppliersWithBalance?.filter(s => 
                                  s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase())
                                ).map((supplier) => (
                                  <CommandItem
                                    key={supplier.id}
                                    value={supplier.supplier_name}
                                    onSelect={() => {
                                      setReferenceId(supplier.id);
                                      setReferenceType("supplier");
                                      setVoucherType("payment");
                                      setSelectedSupplierBillIds([]);
                                      setAmount("");
                                      setSupplierSearchOpen(false);
                                      setSupplierSearchTerm("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        referenceId === supplier.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="flex-1">{supplier.supplier_name}</span>
                                    <Badge variant="destructive" className="ml-2">
                                      ₹{(supplier.outstandingBalance || 0).toFixed(2)}
                                    </Badge>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                              <CommandGroup heading="All Suppliers">
                                {suppliers?.filter(s => 
                                  s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase()) &&
                                  !suppliersWithBalance?.find(sw => sw.id === s.id)
                                ).map((supplier) => (
                                  <CommandItem
                                    key={supplier.id}
                                    value={supplier.supplier_name}
                                    onSelect={() => {
                                      setReferenceId(supplier.id);
                                      setReferenceType("supplier");
                                      setVoucherType("payment");
                                      setSelectedSupplierBillIds([]);
                                      setAmount("");
                                      setSupplierSearchOpen(false);
                                      setSupplierSearchTerm("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        referenceId === supplier.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="flex-1">{supplier.supplier_name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {referenceId && referenceType === "supplier" && supplierBalance !== undefined && (
                        <div className="mt-2 p-3 bg-gradient-to-r from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 border border-rose-200 dark:border-rose-800 rounded-md">
                          <p className="text-sm font-medium text-rose-900 dark:text-rose-100">
                            Total Outstanding: <span className="text-lg font-bold">₹{supplierBalance.toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bill Selection Section */}
                  {referenceId && referenceType === "supplier" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Select Bills (Optional)</Label>
                        {selectedSupplierBillIds.length > 0 && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedSupplierBillIds([]);
                              setAmount("");
                            }}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Clear Selection
                          </Button>
                        )}
                      </div>
                      
                      {supplierBills && supplierBills.length > 0 ? (
                        <div className="border rounded-lg max-h-[250px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="w-[50px]">Select</TableHead>
                                <TableHead>Bill No</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Bill Amt</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {supplierBills.map((bill) => {
                                const netAmount = Number(bill.net_amount || 0);
                                const paidAmount = Number(bill.paid_amount || 0);
                                const outstanding = netAmount - paidAmount;
                                const isSelected = selectedSupplierBillIds.includes(bill.id);

                                const billDate = bill.bill_date ? new Date(bill.bill_date) : null;
                                const billDateText = billDate && !Number.isNaN(billDate.getTime())
                                  ? format(billDate, "dd/MM/yyyy")
                                  : "-";

                                return (
                                  <TableRow 
                                    key={bill.id} 
                                    className={cn(
                                      "cursor-pointer transition-colors",
                                      isSelected && "bg-primary/5"
                                    )}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                      } else {
                                        setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                                      }
                                    }}
                                  >
                                    <TableCell>
                                      <Checkbox 
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          if (checked === true) {
                                            setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                                          } else {
                                            setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                          }
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      {bill.software_bill_no || bill.supplier_invoice_no || bill.id.slice(0, 8)}
                                    </TableCell>
                                    <TableCell>{billDateText}</TableCell>
                                    <TableCell className="text-right">₹{netAmount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">₹{paidAmount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-400">
                                      ₹{outstanding.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 text-center text-muted-foreground bg-muted/30">
                          No outstanding bills found for this supplier
                        </div>
                      )}

                      {/* Selection Summary */}
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm">
                          {selectedSupplierBillIds.length > 0 ? (
                            <span className="font-medium">
                              {selectedSupplierBillIds.length} bill(s) selected • 
                              Total: <span className="text-primary font-bold">
                                ₹{(supplierBills ?? [])
                                  .filter(b => selectedSupplierBillIds.includes(b.id))
                                  .reduce((sum, b) => sum + (Number(b.net_amount || 0) - Number(b.paid_amount || 0)), 0)
                                  .toFixed(2)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <AlertCircle className="h-4 w-4" />
                              No bills selected = Opening Balance / Advance payment
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="upi">UPI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Amount {selectedSupplierBillIds.length > 0 && <span className="text-xs text-muted-foreground">(Auto-filled)</span>}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    {paymentMethod === "cheque" && (
                      <>
                        <div className="space-y-2">
                          <Label>Cheque Number</Label>
                          <Input
                            placeholder="Enter cheque number"
                            value={chequeNumber}
                            onChange={(e) => setChequeNumber(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Cheque Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !chequeDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {chequeDate ? format(chequeDate, "PPP") : <span>Pick date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={chequeDate}
                                onSelect={setChequeDate}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </>
                    )}

                    {(paymentMethod === "bank_transfer" || paymentMethod === "upi") && (
                      <div className="space-y-2">
                        <Label>Transaction Number</Label>
                        <Input
                          placeholder="Enter UTR / Reference ID"
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Payment description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      type="submit" 
                      className="w-full md:w-auto" 
                      disabled={createVoucher.isPending || (voucherType === "receipt" && referenceType === "customer" && customerBalance !== undefined && customerBalance <= 0)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {createVoucher.isPending ? "Recording..." : "Record Payment"}
                    </Button>
                    {paymentMethod === "cheque" && parseFloat(amount) > 0 && referenceId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowChequePrintDialog(true)}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print Cheque
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Supplier Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "supplier" && v.voucher_type === "payment")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            {suppliers?.find((s) => s.id === voucher.reference_id)?.supplier_name || "-"}
                          </TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Cheque Print Dialog */}
            <ChequePrintDialog
              open={showChequePrintDialog}
              onOpenChange={setShowChequePrintDialog}
              payeeName={suppliers?.find(s => s.id === referenceId)?.supplier_name || ""}
              amount={parseFloat(amount) || 0}
              chequeDate={chequeDate || new Date()}
              chequeNumber={chequeNumber}
            />
          </TabsContent>

          {/* Employee Salary Tab */}
          <TabsContent value="employee-salary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Employee Salary Payment</CardTitle>
                <CardDescription>Record salary payment to employees</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Employee</Label>
                      <Select value={referenceId || undefined} onValueChange={(val) => {
                        setReferenceId(val);
                        setReferenceType("employee");
                        setVoucherType("payment");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees?.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.employee_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter salary amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Salary month/year"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Salary Payment
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Salary Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "employee" && v.voucher_type === "payment")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            {employees?.find((e) => e.id === voucher.reference_id)?.employee_name || "-"}
                          </TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Business Expenses Tab */}
          <TabsContent value="expenses" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Expenses (EXP)</CardTitle>
                <CardDescription>Record business expenses and costs</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Expense Category</Label>
                      <Input
                        placeholder="e.g., Rent, Utilities, Travel"
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          setReferenceType("expense");
                          setVoucherType("expense");
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Expense
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "expense")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Voucher Entry Tab */}
          <TabsContent value="voucher-entry" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Voucher Entries</CardTitle>
                <CardDescription>View all accounting vouchers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers?.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                        <TableCell className="uppercase">{voucher.voucher_type}</TableCell>
                        <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="capitalize">{voucher.reference_type || "-"}</TableCell>
                        <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Reconciliation Tab */}
          <TabsContent value="reconciliation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Reconciliation Report</CardTitle>
                <CardDescription>All customer payments matched with invoices for accounting audit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters Section */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !reconStartDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {reconStartDate ? format(reconStartDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={reconStartDate}
                          onSelect={(date) => date && setReconStartDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !reconEndDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {reconEndDate ? format(reconEndDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={reconEndDate}
                          onSelect={(date) => date && setReconEndDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Customer Filter</Label>
                    <Select value={reconCustomerFilter || "all"} onValueChange={setReconCustomerFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Customers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {customers?.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.customer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status Filter</Label>
                    <Select value={reconStatusFilter || "all"} onValueChange={setReconStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Summary Cards */}
                {reconciliationData && (() => {
                  const filteredData = reconciliationData.filter((r) => {
                    const matchesCustomer = reconCustomerFilter === "all" || reconCustomerFilter === "" || r.invoiceDetails?.customer_id === reconCustomerFilter;
                    const matchesStatus = reconStatusFilter === "all" || r.invoiceDetails?.payment_status === reconStatusFilter;
                    return matchesCustomer && matchesStatus;
                  });

                  // Calculate source-wise breakdown
                  const sourceBreakdown = {
                    accounts: { count: 0, amount: 0 },
                    pos: { count: 0, amount: 0 },
                    sales: { count: 0, amount: 0 },
                  };

                  filteredData.forEach((r) => {
                    const desc = (r.description || '').toLowerCase();
                    const amount = r.total_amount || 0;
                    
                    if (desc.includes('pos') || desc.includes('pos payment')) {
                      sourceBreakdown.pos.count++;
                      sourceBreakdown.pos.amount += amount;
                    } else if (desc.includes('sales') || desc.includes('sales invoice') || desc.includes('sale invoice')) {
                      sourceBreakdown.sales.count++;
                      sourceBreakdown.sales.amount += amount;
                    } else {
                      // Default to Accounts (direct entry)
                      sourceBreakdown.accounts.count++;
                      sourceBreakdown.accounts.amount += amount;
                    }
                  });

                  const totalAmount = filteredData.reduce((sum, r) => sum + (r.total_amount || 0), 0);

                  return (
                    <>
                      {/* Main Summary Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
                              Total Payments
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                              {filteredData.length}
                            </div>
                            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                              Payment transactions
                            </p>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Total Amount Received
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                              ₹{totalAmount.toFixed(2)}
                            </div>
                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                              Cash + Card + UPI
                            </p>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">
                              Unique Customers
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                              {new Set(
                                filteredData
                                  ?.map((r) => r.invoiceDetails?.customer_id)
                                  .filter(Boolean)
                              ).size}
                            </div>
                            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                              Customers paid
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Payment Sources Breakdown */}
                      <Card className="border-l-4 border-l-primary">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Receipt className="h-4 w-4" />
                            Payment Sources Breakdown
                          </CardTitle>
                          <CardDescription>Payments categorized by entry source</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Accounts (Direct Entry) */}
                            <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border border-emerald-200 dark:border-emerald-800">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                  <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Accounts</p>
                                  <p className="text-xs text-emerald-700 dark:text-emerald-300">{sourceBreakdown.accounts.count} payments</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">₹{sourceBreakdown.accounts.amount.toFixed(2)}</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                  {totalAmount > 0 ? ((sourceBreakdown.accounts.amount / totalAmount) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            </div>

                            {/* POS Dashboard */}
                            <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                  <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">POS Dashboard</p>
                                  <p className="text-xs text-blue-700 dark:text-blue-300">{sourceBreakdown.pos.count} payments</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">₹{sourceBreakdown.pos.amount.toFixed(2)}</p>
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                  {totalAmount > 0 ? ((sourceBreakdown.pos.amount / totalAmount) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            </div>

                            {/* Sales Invoice Dashboard */}
                            <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border border-orange-200 dark:border-orange-800">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                  <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-orange-900 dark:text-orange-100">Sales Dashboard</p>
                                  <p className="text-xs text-orange-700 dark:text-orange-300">{sourceBreakdown.sales.count} payments</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-orange-900 dark:text-orange-100">₹{sourceBreakdown.sales.amount.toFixed(2)}</p>
                                <p className="text-xs text-orange-600 dark:text-orange-400">
                                  {totalAmount > 0 ? ((sourceBreakdown.sales.amount / totalAmount) * 100).toFixed(1) : 0}%
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}

                {/* Export Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      const filtered = reconciliationData || [];

                      const ws = XLSX.utils.json_to_sheet(
                        filtered.map((payment) => ({
                          "Voucher No": payment.voucher_number,
                          "Payment Date": format(new Date(payment.voucher_date), "dd/MM/yyyy"),
                          "Customer Name": payment.customerName,
                          "Customer Phone": payment.customerPhone || "-",
                          "Invoice Number": payment.invoiceDetails?.sale_number || "-",
                          "Invoice Date": payment.invoiceDetails?.sale_date ? format(new Date(payment.invoiceDetails.sale_date), "dd/MM/yyyy") : "-",
                          "Invoice Amount": payment.invoiceDetails?.net_amount?.toFixed(2) || "0.00",
                          "Cash Amount": payment.invoiceDetails?.cash_amount?.toFixed(2) || "0.00",
                          "Card Amount": payment.invoiceDetails?.card_amount?.toFixed(2) || "0.00",
                          "UPI Amount": payment.invoiceDetails?.upi_amount?.toFixed(2) || "0.00",
                          "Payment Amount": payment.total_amount.toFixed(2),
                          "Payment Method": ((payment as any).metadata?.paymentMethod) || payment.invoiceDetails?.payment_method || "-",
                          "Payment Status": payment.invoiceDetails?.payment_status || "-",
                          "Balance": payment.invoiceDetails ? (payment.invoiceDetails.net_amount - (payment.invoiceDetails.paid_amount || 0)).toFixed(2) : "0.00",
                        }))
                      );
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
                      XLSX.writeFile(wb, `Payment_Reconciliation_${format(reconStartDate, "dd-MM-yyyy")}_to_${format(reconEndDate, "dd-MM-yyyy")}.xlsx`);
                      toast.success("Reconciliation report exported to Excel");
                    }}
                    variant="outline"
                    className="gap-2"
                  >
                    <FileDown className="h-4 w-4" />
                    Export to Excel
                  </Button>
                </div>

                {/* Reconciliation Table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Voucher No</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Invoice No</TableHead>
                        <TableHead>Invoice Date</TableHead>
                        <TableHead className="text-right">Invoice Amt</TableHead>
                        <TableHead className="text-right">Payment Breakdown</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        {isAdmin && <TableHead className="text-center">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconciliationData?.map((payment) => {
                          const invoice = payment.invoiceDetails;
                          const balance = invoice ? invoice.net_amount - (invoice.paid_amount || 0) : 0;
                          const cashAmt = invoice?.cash_amount || 0;
                          const cardAmt = invoice?.card_amount || 0;
                          const upiAmt = invoice?.upi_amount || 0;

                          return (
                            <TableRow key={payment.id}>
                              <TableCell className="font-medium">{payment.voucher_number}</TableCell>
                              <TableCell>{format(new Date(payment.voucher_date), "dd/MM/yyyy")}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{payment.customerName}</div>
                                  {payment.customerPhone && (
                                    <div className="text-xs text-muted-foreground">{payment.customerPhone}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{invoice?.sale_number || "-"}</TableCell>
                              <TableCell>
                                {invoice?.sale_date ? format(new Date(invoice.sale_date), "dd/MM/yyyy") : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                ₹{invoice?.net_amount?.toFixed(2) || "0.00"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-wrap gap-1 justify-end">
                                  {cashAmt > 0 && (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                                      Cash: ₹{cashAmt.toFixed(2)}
                                    </Badge>
                                  )}
                                  {cardAmt > 0 && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                      Card: ₹{cardAmt.toFixed(2)}
                                    </Badge>
                                  )}
                                  {upiAmt > 0 && (
                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                      UPI: ₹{upiAmt.toFixed(2)}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                ₹{payment.total_amount.toFixed(2)}
                              </TableCell>
                              <TableCell className="capitalize">
                                {((payment as any).metadata?.paymentMethod) || invoice?.payment_method || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    invoice?.payment_status === "completed"
                                      ? "default"
                                      : invoice?.payment_status === "partial"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className={cn(
                                    invoice?.payment_status === "completed" && "bg-green-500 text-white",
                                    invoice?.payment_status === "partial" && "bg-orange-500 text-white"
                                  )}
                                >
                                  {invoice?.payment_status || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className={cn(
                                "text-right font-medium",
                                balance > 0 && "text-orange-600 dark:text-orange-400"
                              )}>
                                ₹{balance.toFixed(2)}
                              </TableCell>
                              {isAdmin && (
                                <TableCell className="text-center">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        disabled={deleteReceipt.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Payment Receipt?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will delete receipt <span className="font-medium">{payment.voucher_number}</span> and reverse ₹{Number(payment.total_amount).toFixed(2)} back to the customer's account.
                                          <br /><br />
                                          This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteReceipt.mutate(payment)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete & Reverse
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      {/* Page Totals Row */}
                      {reconciliationData && reconciliationData.length > 0 && (() => {
                        const pageTotals = reconciliationData.reduce((acc: any, payment: any) => {
                          const invoice = payment.invoiceDetails;
                          const balance = invoice ? invoice.net_amount - (invoice.paid_amount || 0) : 0;
                          return {
                            invoiceAmount: acc.invoiceAmount + (invoice?.net_amount || 0),
                            paidAmount: acc.paidAmount + (payment.total_amount || 0),
                            balance: acc.balance + balance,
                          };
                        }, { invoiceAmount: 0, paidAmount: 0, balance: 0 });

                        return (
                          <TableRow className="bg-muted/70 font-semibold border-t-2">
                            <TableCell colSpan={5} className="text-right">Page Total:</TableCell>
                            <TableCell className="text-right">₹{pageTotals.invoiceAmount.toFixed(2)}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right">₹{pageTotals.paidAmount.toFixed(2)}</TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right">₹{pageTotals.balance.toFixed(2)}</TableCell>
                            {isAdmin && <TableCell></TableCell>}
                          </TableRow>
                        );
                      })()}
                      {(!reconciliationData || reconciliationData.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 12 : 11} className="text-center py-8 text-muted-foreground">
                            No payment records found for the selected period and filters
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* P&L Report Tab */}
          <TabsContent value="pl-report" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profit & Loss Report</CardTitle>
                <CardDescription>View income and expenses summary</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center text-muted-foreground">
                    P&L Report will be calculated based on sales revenue and expenses
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Receipt Dialog */}
        <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {receiptData ? (
              <>
                <DialogHeader>
                  <DialogTitle>Payment Receipt</DialogTitle>
                  <DialogDescription>
                    Payment receipt for {receiptData.customerName}
                  </DialogDescription>
                </DialogHeader>

                <div className="hidden">
                  <PaymentReceipt
                    ref={receiptRef}
                    receiptData={receiptData}
                    companyDetails={{
                      businessName: settings?.business_name,
                      address: settings?.address,
                      mobileNumber: settings?.mobile_number,
                      emailId: settings?.email_id,
                      gstNumber: settings?.gst_number,
                      upiId: (settings?.sale_settings as any)?.upiId,
                    }}
                    receiptSettings={{
                      showCompanyLogo: false,
                      showQrCode: !!(settings?.sale_settings as any)?.upiId,
                      showSignature: true,
                      signatureLabel: "Authorized Signature",
                    }}
                  />
                </div>

                <div className="border rounded-lg p-4">
                  <PaymentReceipt
                    receiptData={receiptData}
                    companyDetails={{
                      businessName: settings?.business_name,
                      address: settings?.address,
                      mobileNumber: settings?.mobile_number,
                      emailId: settings?.email_id,
                      gstNumber: settings?.gst_number,
                      upiId: (settings?.sale_settings as any)?.upiId,
                    }}
                    receiptSettings={{
                      showCompanyLogo: false,
                      showQrCode: !!(settings?.sale_settings as any)?.upiId,
                      showSignature: true,
                      signatureLabel: "Authorized Signature",
                    }}
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={handlePrintReceipt}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Receipt
                  </Button>
                  {receiptData.customerPhone && (
                    <Button onClick={handleSendWhatsApp}>
                      <Send className="mr-2 h-4 w-4" />
                      Send via WhatsApp
                    </Button>
                  )}
                </DialogFooter>
              </>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                Loading receipt data...
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Payment Dialog */}
        <Dialog open={showEditPaymentDialog} onOpenChange={setShowEditPaymentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Payment Receipt</DialogTitle>
              <DialogDescription>
                Update payment details for {editingPayment?.voucher_number}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editPaymentDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editPaymentDate ? format(editPaymentDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editPaymentDate}
                      onSelect={(date) => date && setEditPaymentDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Enter amount"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={editPaymentMethod} onValueChange={(value) => {
                  setEditPaymentMethod(value);
                  if (value !== 'cheque') {
                    setEditChequeNumber("");
                    setEditChequeDate(undefined);
                  }
                  if (value !== 'upi' && value !== 'bank_transfer' && value !== 'other') {
                    setEditTransactionId("");
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editPaymentMethod === 'cheque' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cheque Number</Label>
                    <Input
                      placeholder="Enter cheque number"
                      value={editChequeNumber}
                      onChange={(e) => setEditChequeNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cheque Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editChequeDate ? format(editChequeDate, "dd/MM/yyyy") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editChequeDate}
                          onSelect={setEditChequeDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {(editPaymentMethod === 'upi' || editPaymentMethod === 'bank_transfer' || editPaymentMethod === 'other') && (
                <div className="space-y-2">
                  <Label>Transaction ID</Label>
                  <Input
                    placeholder="Enter transaction ID"
                    value={editTransactionId}
                    onChange={(e) => setEditTransactionId(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Payment description"
                  value={editDescription.split(' | Cheque No:')[0].split(' | Transaction ID:')[0]}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditPaymentDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => updatePayment.mutate()}
                disabled={updatePayment.isPending || !editPaymentAmount || parseFloat(editPaymentAmount) <= 0}
              >
                {updatePayment.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Advance Booking Dialog */}
        {currentOrganization?.id && (
          <AddAdvanceBookingDialog
            open={showAdvanceDialog}
            onOpenChange={setShowAdvanceDialog}
            organizationId={currentOrganization.id}
          />
        )}
      </div>
  );
}
