import { useState, useRef } from "react";
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
import { CalendarIcon, Plus, TrendingUp, TrendingDown, DollarSign, Wallet, Printer, Send, FileDown, Filter, X, CheckCircle2, Clock, AlertCircle, Receipt, Trash2, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CustomerLedger } from "@/components/CustomerLedger";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useReactToPrint } from "react-to-print";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
  const [nextReceiptNumber, setNextReceiptNumber] = useState<string>("");
  
  // Receipt states
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

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

  // Fetch customer outstanding balance (includes opening balance + actual outstanding)
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
        .in("payment_status", ["pending", "partial"]);
      
      if (error) throw error;
      
      // Calculate actual outstanding: sum of (net_amount - paid_amount) for each invoice
      const invoiceOutstanding = data?.reduce((sum, sale) => {
        const balance = (sale.net_amount || 0) - (sale.paid_amount || 0);
        return sum + Math.max(0, balance);
      }, 0) || 0;
      
      return openingBalance + invoiceOutstanding;
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
        .eq("supplier_id", referenceId);
      
      if (billsError) throw billsError;

      // Get all payments made for these bills
      const billIds = bills?.map(b => b.id) || [];
      const { data: payments, error: paymentsError } = await supabase
        .from("voucher_entries")
        .select("total_amount, reference_id")
        .eq("reference_type", "supplier")
        .in("reference_id", billIds);
      
      if (paymentsError) throw paymentsError;

      const totalBills = bills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, payment) => sum + (payment.total_amount || 0), 0) || 0;
      
      return totalBills - totalPaid;
    },
    enabled: !!referenceId && referenceType === "supplier",
  });

  // Fetch customers with outstanding balance only (for payment receipt)
  const { data: customersWithBalance } = useQuery({
    queryKey: ["customers-with-balance", currentOrganization?.id],
    queryFn: async () => {
      // First get all customers with opening_balance
      const { data: allCustomers, error: custError } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("customer_name");
      if (custError) throw custError;

      // Get customers with pending/partial invoices
      const { data: pendingInvoices, error: invError } = await supabase
        .from("sales")
        .select("customer_id, net_amount, paid_amount")
        .eq("organization_id", currentOrganization?.id)
        .in("payment_status", ["pending", "partial"]);
      if (invError) throw invError;

      // Calculate invoice balance per customer (net_amount - paid_amount)
      const customerInvoiceBalances = new Map<string, number>();
      pendingInvoices?.forEach((inv) => {
        if (inv.customer_id) {
          const balance = (inv.net_amount || 0) - (inv.paid_amount || 0);
          customerInvoiceBalances.set(
            inv.customer_id,
            (customerInvoiceBalances.get(inv.customer_id) || 0) + Math.max(0, balance)
          );
        }
      });

      // Filter customers with total balance > 0 (opening_balance + invoice balance)
      return allCustomers?.filter((c) => {
        const openingBalance = c.opening_balance || 0;
        const invoiceBalance = customerInvoiceBalances.get(c.id) || 0;
        const totalBalance = openingBalance + invoiceBalance;
        return totalBalance > 0;
      }).map((c) => ({
        ...c,
        outstandingBalance: (c.opening_balance || 0) + (customerInvoiceBalances.get(c.id) || 0),
      })) || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch all customers (for other purposes like ledger)
  const { data: customers } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("customer_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("supplier_name");
      if (error) throw error;
      return data;
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

  // Fetch voucher entries
  const { data: vouchers } = useQuery({
    queryKey: ["voucher-entries", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
          .eq("customer_id", reconCustomerFilter);
        
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
        .eq("organization_id", currentOrganization?.id);
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
  const paymentStats = {
    totalInvoices: sales?.length || 0,
    totalAmount: sales?.reduce((sum, s) => sum + Number(s.net_amount || 0), 0) || 0,
    paidAmount: sales?.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0) || 0,
    pendingCount: sales?.filter(s => s.payment_status === 'pending').length || 0,
    pendingAmount: sales?.filter(s => s.payment_status === 'pending').reduce((sum, s) => sum + Number(s.net_amount || 0) - Number(s.paid_amount || 0), 0) || 0,
    partialCount: sales?.filter(s => s.payment_status === 'partial').length || 0,
    partialAmount: sales?.filter(s => s.payment_status === 'partial').reduce((sum, s) => sum + Number(s.net_amount || 0) - Number(s.paid_amount || 0), 0) || 0,
    completedCount: sales?.filter(s => s.payment_status === 'completed').length || 0,
    completedAmount: sales?.filter(s => s.payment_status === 'completed').reduce((sum, s) => sum + Number(s.paid_amount || 0), 0) || 0,
  };

  // Handle card click
  const handleCardClick = (filter: string | null) => {
    setPaymentCardFilter(filter);
    setSelectedTab("customer-ledger");
  };

  // Create voucher mutation with receipt generation
  const createVoucher = useMutation({
    mutationFn: async (voucherData: any) => {
      const invoicesToProcess = selectedInvoiceIds.length > 0 ? selectedInvoiceIds : (selectedInvoiceId ? [selectedInvoiceId] : []);
      
      if (voucherType === "receipt" && invoicesToProcess.length === 0) {
        throw new Error("Please select at least one invoice to record payment against");
      }

      const paymentAmount = parseFloat(amount);
      let remainingAmount = paymentAmount;
      const processedInvoices: any[] = [];

      // For customer payments, update the sales invoices (distribute payment across selected invoices)
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

          // Update sales invoice
          const { error: updateError } = await supabase
            .from('sales')
            .update({
              paid_amount: newPaidAmount,
              payment_status: newStatus,
              payment_date: format(voucherDate, 'yyyy-MM-dd'),
              payment_method: paymentMethod,
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

      // Generate voucher number
      const { data: voucherNumber, error: numberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: voucherType, p_date: format(voucherDate, "yyyy-MM-dd") }
      );
      if (numberError) throw numberError;

      // Build description with invoice numbers
      const invoiceNumbers = processedInvoices.map(p => p.invoice.sale_number).join(', ');
      const finalDescription = description || `Payment for: ${invoiceNumbers}`;

      // Create voucher entry - use first invoice as reference_id for compatibility
      const { data: voucher, error: voucherError } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: currentOrganization?.id,
          voucher_number: voucherNumber,
          voucher_type: voucherType,
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: referenceType,
          reference_id: invoicesToProcess[0] || referenceId || null,
          description: finalDescription,
          total_amount: paymentAmount,
        })
        .select()
        .single();

      if (voucherError) throw voucherError;

      return { voucher, voucherNumber, processedInvoices };
    },
    onSuccess: (data) => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      
      // Generate receipt for customer payments
      if (voucherType === "receipt" && data.processedInvoices.length > 0) {
        const firstInvoice = data.processedInvoices[0].invoice;
        const totalPaid = parseFloat(amount);
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
          previousBalance: totalPreviousBalance,
          currentBalance: totalCurrentBalance,
          paymentMethod: paymentMethod,
          multipleInvoices: data.processedInvoices,
        });
        setShowReceiptDialog(true);
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
          .single();

        if (fetchError) throw fetchError;

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
      toast.success(`Receipt deleted. ₹${data.paymentAmount.toFixed(2)} reversed to customer account.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete receipt: ${error.message}`);
    },
  });

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceType("");
    setReferenceId("");
    setSelectedInvoiceId("");
    setSelectedInvoiceIds([]);
    setDescription("");
    setAmount("");
    setAccountId("");
    setPaymentMethod("cash");
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

    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${receiptData.invoiceAmount.toFixed(2)}\nPaid Amount: ₹${receiptData.paidAmount.toFixed(2)}\nBalance: ₹${receiptData.currentBalance.toFixed(2)}\n\nPayment Mode: ${receiptData.paymentMethod.toUpperCase()}\n\nThank you for your payment!`;

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
    if (voucherType === "receipt" && selectedInvoiceIds.length === 0 && !selectedInvoiceId) {
      toast.error("Please select at least one invoice");
      return;
    }
    createVoucher.mutate({});
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
        <BackToDashboard />

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
              "cursor-pointer transition-all hover:shadow-lg",
              "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800",
              paymentCardFilter === null && "ring-2 ring-blue-500"
            )}
            onClick={() => handleCardClick(null)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Total Invoices
              </CardTitle>
              <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                ₹{paymentStats.totalAmount.toFixed(2)}
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {paymentStats.totalInvoices} invoices
              </p>
            </CardContent>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg",
              "bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800",
              paymentCardFilter === "completed" && "ring-2 ring-green-500"
            )}
            onClick={() => handleCardClick("completed")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
                Paid
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                ₹{paymentStats.completedAmount.toFixed(2)}
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                {paymentStats.completedCount} completed
              </p>
            </CardContent>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg",
              "bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800",
              paymentCardFilter === "partial" && "ring-2 ring-orange-500"
            )}
            onClick={() => handleCardClick("partial")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-100">
                Partial
              </CardTitle>
              <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                ₹{paymentStats.partialAmount.toFixed(2)}
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                {paymentStats.partialCount} partial
              </p>
            </CardContent>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg",
              "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800",
              paymentCardFilter === "pending" && "ring-2 ring-red-500"
            )}
            onClick={() => handleCardClick("pending")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-900 dark:text-red-100">
                Pending
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                ₹{paymentStats.pendingAmount.toFixed(2)}
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                {paymentStats.pendingCount} pending
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Dashboard Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
                Total Receivables
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                ₹{dashboardMetrics.totalReceivables.toFixed(2)}
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Customer payments received
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-900 dark:text-red-100">
                Total Payables
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                ₹{dashboardMetrics.totalPayables.toFixed(2)}
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                Supplier & employee payments
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-100">
                Monthly Expenses
              </CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                ₹{dashboardMetrics.monthlyExpenses.toFixed(2)}
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                Current month expenses
              </p>
            </CardContent>
          </Card>

          <Card className={cn(
            "bg-gradient-to-br border-2",
            dashboardMetrics.currentMonthPL >= 0
              ? "from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800"
              : "from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800"
          )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn(
                "text-sm font-medium",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-900 dark:text-blue-100"
                  : "text-purple-900 dark:text-purple-100"
              )}>
                Current Month P/L
              </CardTitle>
              <Wallet className={cn(
                "h-4 w-4",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-purple-600 dark:text-purple-400"
              )} />
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-900 dark:text-blue-100"
                  : "text-purple-900 dark:text-purple-100"
              )}>
                ₹{dashboardMetrics.currentMonthPL.toFixed(2)}
              </div>
              <p className={cn(
                "text-xs mt-1",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-purple-700 dark:text-purple-300"
              )}>
                {dashboardMetrics.currentMonthPL >= 0 ? "Profit" : "Loss"} for {format(new Date(), "MMMM yyyy")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
            <TabsTrigger value="customer-ledger">Customer Ledger</TabsTrigger>
            <TabsTrigger value="customer-payment">Customer Payment</TabsTrigger>
            <TabsTrigger value="supplier-payment">Supplier Payment</TabsTrigger>
            <TabsTrigger value="employee-salary">Employee Salary</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="voucher-entry">Voucher Entry</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="pl-report">P&L Report</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
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
                      <Select value={referenceId || undefined} onValueChange={(val) => {
                        setReferenceId(val);
                        setReferenceType("customer");
                        setVoucherType("receipt");
                        setSelectedInvoiceIds([]);
                        setSelectedInvoiceId("");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent>
                          {customersWithBalance?.length === 0 && (
                            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                              No customers with outstanding balance
                            </div>
                          )}
                          {customersWithBalance?.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.customer_name} - ₹{customer.outstandingBalance.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {referenceId && referenceType === "customer" && customerBalance !== undefined && (
                        <div className="mt-2 p-3 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border border-amber-200 dark:border-amber-800 rounded-md">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            Outstanding Balance: <span className="text-lg font-bold">₹{customerBalance.toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Select Invoices (Multiple)</Label>
                      {!referenceId ? (
                        <p className="text-xs text-muted-foreground">Select a customer first</p>
                      ) : customerInvoices?.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No pending invoices for this customer</p>
                      ) : (
                        <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
                          {customerInvoices?.map((invoice) => {
                            const balance = invoice.net_amount - (invoice.paid_amount || 0);
                            const isSelected = selectedInvoiceIds.includes(invoice.id);
                            return (
                              <div 
                                key={invoice.id} 
                                className={cn(
                                  "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                                  isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                                )}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== invoice.id));
                                  } else {
                                    setSelectedInvoiceIds([...selectedInvoiceIds, invoice.id]);
                                  }
                                }}
                              >
                                <Checkbox 
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedInvoiceIds([...selectedInvoiceIds, invoice.id]);
                                    } else {
                                      setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== invoice.id));
                                    }
                                  }}
                                />
                                <div className="flex-1 flex justify-between items-center">
                                  <span className="font-medium">{invoice.sale_number}</span>
                                  <span className="text-sm text-muted-foreground">
                                    {format(new Date(invoice.sale_date), 'dd/MM/yy')}
                                  </span>
                                  <Badge variant={balance > 0 ? "destructive" : "secondary"}>
                                    ₹{balance.toFixed(2)}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
                      <Select value={paymentMethod || undefined} onValueChange={setPaymentMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="upi">UPI</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
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

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Payment description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Customer Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      {isAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => (v.reference_type === "customer" || v.reference_type === "customer_payment" || v.reference_type === "SALE") && (v.voucher_type === "receipt" || v.voucher_type === "RECEIPT"))
                      .slice(0, 10)
                      .map((voucher) => {
                        // Look up customer from sales table via reference_id (invoice id)
                        const invoice = sales?.find((s) => s.id === voucher.reference_id);
                        const customerName = invoice?.customer_name || 
                          customers?.find((c) => c.id === voucher.reference_id)?.customer_name || 
                          "-";
                        
                        return (
                          <TableRow key={voucher.id}>
                            <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                            <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                            <TableCell>{customerName}</TableCell>
                            <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                            <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                            {isAdmin && (
                              <TableCell>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Payment Receipt?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will delete receipt {voucher.voucher_number} and reverse ₹{voucher.total_amount.toFixed(2)} back to the customer's outstanding balance.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => deleteReceipt.mutate(voucher)}
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Supplier Payment Tab */}
          <TabsContent value="supplier-payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Payment (PAY)</CardTitle>
                <CardDescription>Record payment made to suppliers</CardDescription>
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
                      <Select value={referenceId || undefined} onValueChange={(val) => {
                        setReferenceId(val);
                        setReferenceType("supplier");
                        setVoucherType("payment");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers?.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.supplier_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {referenceId && referenceType === "supplier" && supplierBalance !== undefined && (
                        <div className="mt-2 p-3 bg-gradient-to-r from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 border border-rose-200 dark:border-rose-800 rounded-md">
                          <p className="text-sm font-medium text-rose-900 dark:text-rose-100">
                            Outstanding Balance: <span className="text-lg font-bold">₹{supplierBalance.toFixed(2)}</span>
                          </p>
                        </div>
                      )}
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

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Payment description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </Button>
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

          {/* Balance Sheet Tab */}
          <TabsContent value="balance-sheet" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>View assets, liabilities and equity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center text-muted-foreground">
                    Balance Sheet will show current financial position
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Receipt Dialog */}
        <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payment Receipt</DialogTitle>
              <DialogDescription>
                Payment receipt for {receiptData?.customerName}
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
              {receiptData?.customerPhone && (
                <Button onClick={handleSendWhatsApp}>
                  <Send className="mr-2 h-4 w-4" />
                  Send via WhatsApp
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
