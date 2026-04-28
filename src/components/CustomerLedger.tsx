import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon, CreditCard, Banknote, Wallet, FileDown, Send, MessageCircle, Users, AlertCircle, TrendingUp, BookOpen, Undo2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useIsMobile } from "@/hooks/use-mobile";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";

interface CustomerLedgerProps {
  organizationId: string;
  paymentFilter?: string | null;
  preSelectedCustomerId?: string | null;
}

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
  unusedAdvanceTotal?: number;
  // School-specific fields
  studentId?: string;
  admissionNumber?: string;
  className?: string;
  division?: string;
}

interface Transaction {
  id: string;
  date: string;
  timestamp: string | null;
  type: 'invoice' | 'payment' | 'advance' | 'advance_application' | 'adjustment' | 'fee' | 'return' | 'refund' | 'credit_note';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  paymentStatus?: string;
  paymentBreakdown?: {
    cash?: number;
    card?: number;
    upi?: number;
    method?: string;
  };
  appliedAmount?: number;
  /** Optional display-only amounts used to show GROSS invoice or informational
   *  offset rows without changing the balance math. When undefined, falls back
   *  to debit/credit. */
  displayDebit?: number;
  displayCredit?: number;
  /** Informational/secondary row — rendered with muted styling and EXCLUDED
   *  from the totals row to avoid double-counting. */
  informational?: boolean;
}

export function CustomerLedger({ organizationId, paymentFilter, preSelectedCustomerId }: CustomerLedgerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(paymentFilter || "all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = useState("transactions");
  const [customerPage, setCustomerPage] = useState(0);
  const CUSTOMERS_PER_PAGE = 20;
  
  const isMobile = useIsMobile();
  const { sendWhatsApp } = useWhatsAppSend();
  const { isSchool } = useSchoolFeatures();
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [customerForHistory, setCustomerForHistory] = useState<{ id: string; name: string } | null>(null);
  const [showOverpaymentRefundDialog, setShowOverpaymentRefundDialog] = useState(false);
  const [overpaymentRefundAmount, setOverpaymentRefundAmount] = useState('');
  const [overpaymentRefundMode, setOverpaymentRefundMode] = useState('cash');
  const [overpaymentRefundNote, setOverpaymentRefundNote] = useState('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const queryClient = useQueryClient();
  const { balance: authoritativeBalance } = useCustomerBalance(
    selectedCustomer?.id || null,
    organizationId || null
  );

  const openHistory = (id: string, name: string) => {
    setCustomerForHistory({ id, name });
    setShowCustomerHistory(true);
  };


  // Sync external filter with internal state
  useEffect(() => {
    if (paymentFilter !== undefined) {
      setPaymentStatusFilter(paymentFilter || "all");
    }
  }, [paymentFilter]);


  // Fetch all customers with their transaction summary using pagination
  const { data: customers, isLoading } = useQuery({
    queryKey: ["customer-ledger", organizationId, isSchool],
    queryFn: async () => {
      // Fetch ALL customers using range pagination (bypasses 1000-row limit)
      const customersData = await fetchAllCustomers(organizationId);

      // For school orgs, fetch linked student data
      let studentMap = new Map<string, any>(); // customer_id -> student record
      if (isSchool) {
        const { data: students } = await supabase
          .from('students')
          .select('id, customer_id, admission_number, closing_fees_balance, class_id, division, school_classes(class_name)')
          .eq('organization_id', organizationId)
          .is('deleted_at', null);
        
        students?.forEach((s: any) => {
          if (s.customer_id) {
            studentMap.set(s.customer_id, s);
          }
        });

        // Fetch current academic year
        const { data: currentYear } = await supabase
          .from('academic_years')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_current', true)
          .single();

        // Fetch fee structures for current year to determine expected totals per class
        let classExpectedMap = new Map<string, number>();
        if (currentYear?.id) {
          const { data: feeStructures } = await supabase
            .from('fee_structures')
            .select('class_id, amount, frequency')
            .eq('organization_id', organizationId)
            .eq('academic_year_id', currentYear.id);

          feeStructures?.forEach((s: any) => {
            const mult = s.frequency === 'monthly' ? 12 : s.frequency === 'quarterly' ? 4 : 1;
            const total = s.amount * mult;
            classExpectedMap.set(s.class_id, (classExpectedMap.get(s.class_id) || 0) + total);
          });
        }

        // Fetch ALL fee payments (no year filter) so we can scope per student type
        const { data: feeTotals } = await supabase
          .from('student_fees')
          .select('student_id, paid_amount, academic_year_id, status')
          .eq('organization_id', organizationId)
          .neq('status', 'deleted');

        // Build two maps: year-scoped (for structure students) and all-time (for imported balance students)
        const studentPaidInYear = new Map<string, number>();
        const studentPaidAll = new Map<string, number>();
        feeTotals?.forEach((f: any) => {
          if (f.status === 'balance_adjustment') return; // exclude manual adjustments
          const amt = f.paid_amount || 0;
          studentPaidAll.set(f.student_id, (studentPaidAll.get(f.student_id) || 0) + amt);
          if (currentYear?.id && f.academic_year_id === currentYear.id) {
            studentPaidInYear.set(f.student_id, (studentPaidInYear.get(f.student_id) || 0) + amt);
          }
        });

        // Build school customer totals — mirror fee collection logic:
        // If fee structures exist for student's class, use structure total as expected
        // Otherwise fall back to closing_fees_balance
        const customerTotals = customersData.map((customer: any) => {
          const student = studentMap.get(customer.id);
          if (student) {
            const structureTotal = classExpectedMap.get(student.class_id) || 0;
            const hasStructures = structureTotal > 0;
            const importedBalance = student.closing_fees_balance || 0;
            // Structure students: count only current year payments; imported balance: count ALL payments
            const totalPaid = hasStructures
              ? (studentPaidInYear.get(student.id) || 0)
              : (studentPaidAll.get(student.id) || 0);

            // Match fee collection logic: structures OR imported balance, never both
            const expectedTotal = hasStructures ? structureTotal : importedBalance;
            const openingBalance = hasStructures ? 0 : importedBalance;
            const balance = Math.round(expectedTotal - totalPaid);

            return {
              ...customer,
              opening_balance: Math.round(openingBalance),
              totalSales: Math.round(expectedTotal),
              totalPaid: Math.round(totalPaid),
              balance,
              studentId: student.id,
              admissionNumber: student.admission_number,
              className: (student as any).school_classes?.class_name || '',
              division: student.division || '',
              hasStructures,
            };
          }
          // Non-student customer in school org - show with zero balance
          return {
            ...customer,
            opening_balance: Math.round(customer.opening_balance || 0),
            totalSales: 0,
            totalPaid: 0,
            balance: Math.round(customer.opening_balance || 0),
          };
        });

        return customerTotals;
      }

      // --- Business org logic ---
      // Fetch ALL sales using range pagination (bypasses 1000-row limit)
      const salesData = await fetchAllSalesSummary(organizationId);

      // Fetch ALL voucher payments (both opening balance and invoice payments)
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount, voucher_type, description, payment_method')
        .eq('organization_id', organizationId)
        .in('voucher_type', ['receipt', 'payment'])
        .is('deleted_at', null);

      if (voucherError) {
        console.error('Error fetching voucher payments:', voucherError);
      }

      // Fetch ALL balance adjustments
      const { data: allAdjustments, error: adjError } = await supabase
        .from('customer_balance_adjustments')
        .select('customer_id, outstanding_difference')
        .eq('organization_id', organizationId);

      if (adjError) console.error('Error fetching adjustments:', adjError);

      // Build adjustment totals per customer
      const customerAdjustments = new Map<string, number>();
      allAdjustments?.forEach((adj: any) => {
        customerAdjustments.set(adj.customer_id, 
          (customerAdjustments.get(adj.customer_id) || 0) + (adj.outstanding_difference || 0));
      });

      // Fetch ALL unused advances
      const { data: allAdvances, error: advError } = await supabase
        .from('customer_advances')
        .select('customer_id, amount, used_amount')
        .eq('organization_id', organizationId)
        .in('status', ['active', 'partially_used']);

      if (advError) console.error('Error fetching advances:', advError);

      // Build unused advance totals per customer
      const customerUnusedAdvances = new Map<string, number>();
      allAdvances?.forEach((adv: any) => {
        const unused = Math.max(0, (adv.amount || 0) - (adv.used_amount || 0));
        if (unused > 0) {
          customerUnusedAdvances.set(adv.customer_id, 
            (customerUnusedAdvances.get(adv.customer_id) || 0) + unused);
        }
      });

      // Fetch advance refunds to reduce unused advance credit
      const advanceIdsAll = allAdvances?.map((a: any) => a.id) || [];
      const customerAdvanceRefunds = new Map<string, number>();
      if (advanceIdsAll.length > 0) {
        const { data: advRefunds } = await supabase
          .from('advance_refunds')
          .select('advance_id, refund_amount')
          .in('advance_id', advanceIdsAll);
        
        // Map advance_id -> customer_id
        const advToCustomer = new Map<string, string>();
        allAdvances?.forEach((a: any) => advToCustomer.set(a.id, a.customer_id));
        
        advRefunds?.forEach((r: any) => {
          const custId = advToCustomer.get(r.advance_id);
          if (custId) {
            customerAdvanceRefunds.set(custId, (customerAdvanceRefunds.get(custId) || 0) + (r.refund_amount || 0));
          }
        });
      }

      // Fetch refund payment vouchers per customer
      const { data: refundVouchers } = await supabase
        .from('voucher_entries')
        .select('reference_id, total_amount, description, payment_method')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'payment')
        .eq('reference_type', 'customer')
        .is('deleted_at', null);

      const customerRefundsPaid = new Map<string, number>();
      refundVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        // Exclude exchange-refund vouchers (POS refund + round-off). Those refunds
        // settle the SR-overflow that is ALREADY captured via creditNoteTotal +
        // GROSS sales math; counting them again would create a phantom debit.
        const desc = (v.description || '').toLowerCase();
        const isExchangeRefund =
          desc.includes('refund paid for pos exchange') ||
          desc.includes('round off adjustment for pos exchange') ||
          v.payment_method === 'round_off';
        if (isExchangeRefund) return;
        customerRefundsPaid.set(v.reference_id, (customerRefundsPaid.get(v.reference_id) || 0) + (v.total_amount || 0));
      });

      // Build sale_id -> customer_id map for invoice vouchers
      const saleToCustomerMap = new Map<string, string>();
      salesData.forEach((s: any) => {
        if (s.customer_id) {
          saleToCustomerMap.set(s.id, s.customer_id);
        }
      });

      // Separate opening-balance payments from invoice payments.
      // Per master reconciliation rules:
      //  - True cash receipts go in invoiceVoucherPayments (used in Math.max drift check)
      //  - Advance + CN adjustment receipts go in invoiceAdvCnPortions and are
      //    SUBTRACTED from sale.paid_amount before the Math.max drift check, so
      //    they aren't double-counted (advances handled via customerUnusedAdvances,
      //    CN handled via customerCreditNotes).
      //  - Opening-balance receipts are tracked separately and added to totalPaid.
      const openingBalancePayments = new Map<string, number>(); // customer_id -> amount
      const invoiceVoucherPayments = new Map<string, number>(); // sale_id -> cash amount
      const invoiceAdvPortions = new Map<string, number>();     // sale_id -> advance amount
      const invoiceCnPortions = new Map<string, number>();      // sale_id -> credit note amount

      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        // Only consider receipt-type vouchers as customer payments here.
        // Payment-type vouchers (refunds TO customer) are handled via refundsPaidTotal.
        if (v.voucher_type !== 'receipt') return;

        const desc = (v.description || '').toLowerCase();
        const isAdv = v.payment_method === 'advance_adjustment'
          || desc.includes('adjusted from advance balance')
          || desc.includes('advance adjusted');
        const isCn = v.payment_method === 'credit_note_adjustment'
          || desc.includes('credit note adjusted')
          || desc.includes('cn adjusted');

        // ID-match classification (legacy-safe): if reference_id points to a known
        // sale, treat as invoice payment regardless of reference_type string.
        const isSaleRef = saleToCustomerMap.has(v.reference_id);
        if (isSaleRef) {
          if (isAdv) {
            invoiceAdvPortions.set(v.reference_id,
              (invoiceAdvPortions.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
          } else if (isCn) {
            invoiceCnPortions.set(v.reference_id,
              (invoiceCnPortions.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
          } else {
            invoiceVoucherPayments.set(v.reference_id,
              (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
          }
        } else if (v.reference_type === 'customer') {
          // True opening-balance payment (reference_id is the customer id).
          // Skip adv/CN adjustment rows since those are accounted separately.
          if (!isAdv && !isCn) {
            openingBalancePayments.set(v.reference_id,
              (openingBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
          }
        }
      });

      // Fetch all sale returns (credit notes) for this org
      const { data: allCreditNotes } = await supabase
        .from("sale_returns")
        .select("customer_id, net_amount")
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      const customerCreditNotes = new Map<string, number>();
      (allCreditNotes || []).forEach((sr: any) => {
        if (sr.customer_id)
          customerCreditNotes.set(sr.customer_id, (customerCreditNotes.get(sr.customer_id) || 0) + (sr.net_amount || 0));
      });

      

      // Calculate totals per customer using Math.max to avoid double-counting
      const customerTotals = customersData.map((customer: any) => {
        const customerSales = salesData.filter((s: any) => s.customer_id === customer.id && s.payment_status !== 'cancelled' && s.payment_status !== 'hold');
        // Mamta Footwear customer balance reconciliation - Apr 2026:
        // Keep totalSales as invoice net_amount only (single source display rule),
        // then subtract sale returns/credit notes separately via creditNoteTotal.
        const totalSales = customerSales.reduce(
          (sum: number, s: any) => sum + (s.net_amount || 0),
          0
        );
        
        let totalPaidOnSales = 0;
        let totalAdvanceApplied = 0;
        let totalCnApplied = 0;
        customerSales.forEach((sale: any) => {
          const salePaidAmount = sale.paid_amount || 0;
          const cashVoucher = invoiceVoucherPayments.get(sale.id) || 0;
          const advVoucher = invoiceAdvPortions.get(sale.id) || 0;
          const cnVoucher = invoiceCnPortions.get(sale.id) || 0;
          const advCnVoucher = advVoucher + cnVoucher;
          // sale.paid_amount typically includes advance + CN-adjusted portions.
          // Subtract them before the drift check so we only count true cash here.
          // Mirrors reconcile_customer_balances RPC GREATEST(...) logic.
          // Advance + CN applied are added back below; sale returns are handled
          // via creditNoteTotal in the final balance formula.
          const actualPaid = Math.max(salePaidAmount - advCnVoucher, cashVoucher);
          totalPaidOnSales += actualPaid;
          totalAdvanceApplied += advVoucher;
          totalCnApplied += cnVoucher;
        });
        
        const openingBalancePaymentTotal = openingBalancePayments.get(customer.id) || 0;
        // totalPaid = cash on sales + advance applied + CN applied + opening-balance receipts.
        const totalPaid = totalPaidOnSales + totalAdvanceApplied + totalCnApplied + openingBalancePaymentTotal;
        const openingBalance = customer.opening_balance || 0;
        const adjustmentTotal = customerAdjustments.get(customer.id) || 0;
        const unusedAdvanceTotal = customerUnusedAdvances.get(customer.id) || 0;
        const advanceRefundTotal = customerAdvanceRefunds.get(customer.id) || 0;
        const effectiveUnusedAdvances = Math.max(0, unusedAdvanceTotal - advanceRefundTotal);
        const creditNoteTotal = customerCreditNotes.get(customer.id) || 0;
        // Fix Apr 2026: subtract sale_return_adjust to match per-invoice outstanding.
        // Test case: Mamta Footwear-Kandivali W (1ce7dbea-...) outstanding = ₹15,054
        const totalSaleReturnAdjust = customerSales.reduce(
          (sum: number, s: any) => sum + (Number(s.sale_return_adjust) || 0),
          0
        );
        const refundsPaidTotal = customerRefundsPaid.get(customer.id) || 0;
        // Balance = Opening + Sales - Paid + Adjustments - Effective Unused Advances - Credit Notes + Refunds Paid
        // refundsPaidTotal uses + sign because cash refunds paid OUT cancel the credit liability from sale returns
        const balance = Math.round(
          openingBalance + totalSales - totalPaid + adjustmentTotal
          - effectiveUnusedAdvances - creditNoteTotal - totalSaleReturnAdjust + refundsPaidTotal
        );

        return {
          ...customer,
          opening_balance: Math.round(openingBalance),
          totalSales: Math.round(totalSales),
          totalPaid: Math.round(totalPaid),
          balance,
          unusedAdvanceTotal: Math.round(effectiveUnusedAdvances),
        };
      });

      return customerTotals;
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Auto-select customer when preSelectedCustomerId is provided and data is loaded
  useEffect(() => {
    if (preSelectedCustomerId && customers && customers.length > 0 && !selectedCustomer) {
      const found = customers.find((c: Customer) => c.id === preSelectedCustomerId);
      if (found) {
        setSelectedCustomer(found);
      }
    }
  }, [preSelectedCustomerId, customers, selectedCustomer]);

  // Fetch detailed transactions for selected customer
  const { data: transactions } = useQuery({
    queryKey: ["customer-transactions", selectedCustomer?.id, startDate, endDate, isSchool],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // --- School org: student fee-based transactions ---
      if (isSchool && selectedCustomer.studentId) {
        const studentId = selectedCustomer.studentId;
        const hasStructures = (selectedCustomer as any).hasStructures;

        // Fetch current academic year
        const { data: currentYear } = await supabase
          .from('academic_years')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_current', true)
          .single();

        // Fetch fee structures for the student's class (to show as debit entries)
        let feeStructureDebits: Array<{ head_name: string; total: number }> = [];
        if (hasStructures && selectedCustomer.className && currentYear?.id) {
          // Get the class_id from the student record
          const { data: studentRec } = await supabase
            .from('students')
            .select('class_id')
            .eq('id', studentId)
            .single();
          
          if (studentRec?.class_id) {
            const { data: structures } = await supabase
              .from('fee_structures')
              .select('amount, frequency, fee_heads(head_name)')
              .eq('organization_id', organizationId)
              .eq('academic_year_id', currentYear.id)
              .eq('class_id', studentRec.class_id);

            feeStructureDebits = (structures || []).map((s: any) => {
              const mult = s.frequency === 'monthly' ? 12 : s.frequency === 'quarterly' ? 4 : 1;
              return {
                head_name: s.fee_heads?.head_name || 'Fee',
                total: s.amount * mult,
              };
            });
          }
        }

        // Fetch student fees (payments)
        let feesQuery = supabase
          .from('student_fees')
          .select('*, fee_heads(head_name)')
          .eq('student_id', studentId)
          .eq('organization_id', organizationId)
          .neq('status', 'deleted');
        
        if (startDate) feesQuery = feesQuery.gte('created_at', format(startDate, 'yyyy-MM-dd'));
        if (endDate) feesQuery = feesQuery.lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59');
        
        const { data: feesData, error: feesError } = await feesQuery.order('created_at', { ascending: true });
        if (feesError) throw feesError;

        const allTransactions: Transaction[] = [];
        const openingBalance = selectedCustomer.opening_balance || 0;
        let runningBalance = 0;

        // Opening balance entry - only when NO fee structures exist
        if (!hasStructures && openingBalance !== 0) {
          runningBalance = openingBalance;
        allTransactions.push({
            id: 'opening-balance',
            date: '1900-01-01',
            timestamp: null,
            type: 'fee',
            reference: 'Opening',
            description: 'Opening Fees Balance (Carried Forward)',
            debit: openingBalance > 0 ? openingBalance : 0,
            credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
            balance: runningBalance,
          });
        }

        if (hasStructures && feeStructureDebits.length > 0) {
          // Show fee structure totals as debit entries (the expected fees)
          feeStructureDebits.forEach((structure, idx) => {
            runningBalance += structure.total;
            allTransactions.push({
              id: `structure-${idx}`,
              date: currentYear?.id ? '' : '',
              timestamp: null,
              type: 'fee',
              reference: 'Fee Structure',
              description: structure.head_name,
              debit: structure.total,
              credit: 0,
              balance: runningBalance,
            });
          });
        } else if (!hasStructures) {
          // No structures - fee records act as both charge and payment
          const sortedFees = [...(feesData || [])].sort((a: any, b: any) => {
            const dateA = a.paid_date || a.created_at?.substring(0, 10) || '2000-01-01';
            const dateB = b.paid_date || b.created_at?.substring(0, 10) || '2000-01-01';
            return new Date(dateA).getTime() - new Date(dateB).getTime();
          });

          // Show payments as credits against opening balance
          sortedFees.forEach((fee: any) => {
            const paidAmount = fee.paid_amount || 0;
            if (paidAmount > 0) {
              runningBalance -= paidAmount;
              const feeHeadName = fee.fee_heads?.head_name || 'Fee';
              const methodText = fee.payment_method ? ` - ${fee.payment_method.charAt(0).toUpperCase() + fee.payment_method.slice(1)}` : '';
              allTransactions.push({
                id: `${fee.id}-payment`,
                date: fee.paid_date || fee.created_at?.substring(0, 10) || '',
                timestamp: fee.created_at || null,
                type: 'payment',
                reference: fee.payment_receipt_id || '-',
                description: `Fee Payment${methodText} - ${feeHeadName}`,
                debit: 0,
                credit: paidAmount,
                balance: runningBalance,
                paymentBreakdown: fee.payment_method ? { method: fee.payment_method } : undefined,
              });
            }
          });

          return allTransactions;
        }

        // When structures exist: show payments as credits
        const sortedFees = [...(feesData || [])].sort((a: any, b: any) => {
          const dateA = a.paid_date || a.created_at?.substring(0, 10) || '2000-01-01';
          const dateB = b.paid_date || b.created_at?.substring(0, 10) || '2000-01-01';
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });

        sortedFees.forEach((fee: any) => {
          const paidAmount = fee.paid_amount || 0;
          if (paidAmount > 0) {
            runningBalance -= paidAmount;
            const feeHeadName = fee.fee_heads?.head_name || 'Fee';
            const methodText = fee.payment_method ? ` - ${fee.payment_method.charAt(0).toUpperCase() + fee.payment_method.slice(1)}` : '';
            allTransactions.push({
              id: `${fee.id}-payment`,
              date: fee.paid_date || fee.created_at?.substring(0, 10) || '',
              timestamp: fee.created_at || null,
              type: 'payment',
              reference: fee.payment_receipt_id || '-',
              description: `Fee Payment${methodText} - ${feeHeadName}`,
              debit: 0,
              credit: paidAmount,
              balance: runningBalance,
              paymentBreakdown: fee.payment_method ? { method: fee.payment_method } : undefined,
            });
          }
        });

        return allTransactions;
      }


      // First, get ALL sales for this customer (without date filter) to get all possible reference_ids
      const { data: allCustomerSales, error: allSalesError } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null)
        .neq("payment_status", "hold");

      if (allSalesError) throw allSalesError;

      const allSaleIds = allCustomerSales?.map(s => s.id) || [];

      // Build date filter for displayed sales
      let salesQuery = supabase
        .from("sales")
        .select("*, created_at")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null)
        .neq("payment_status", "hold")
        .eq("is_cancelled", false);

      // Apply date filters - normalize dates to yyyy-MM-dd format for accurate comparison
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.gte("sale_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.lte("sale_date", endDateStr);
      }

      const { data: salesData, error: salesError } = await salesQuery.order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Build voucher query - fetch all payments for ANY of this customer's invoices
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null)
        .in("reference_id", allSaleIds.length > 0 ? allSaleIds : ['00000000-0000-0000-0000-000000000000']);

      // Apply date filters to vouchers
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.gte("voucher_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.lte("voucher_date", endDateStr);
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

      if (vouchersError) throw vouchersError;

      // Also fetch opening balance payments (reference_type = 'customer')
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "customer")
        .eq("reference_id", selectedCustomer.id)
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: true });

      if (openingError) throw openingError;

      // Merge invoice payments and opening balance payments
      // Exclude payment-type (refund) vouchers for sale returns — they are already
      // represented by the Sale Return entry with "(Cash Refunded)" label
      const allVouchers = [...(vouchersData || []), ...(openingBalancePayments || [])]
        .filter((v: any) => {
          // Keep all receipt vouchers EXCEPT credit note adjustments linked to sale returns
          if (v.voucher_type === 'receipt') {
            const desc = (v.description || '').toLowerCase();
            // Credit note adjustments are already represented by the Sale Return entry (cn_adjustment)
            if (desc.includes('credit note adjusted') || desc.includes('cn adjusted')) {
              return false;
            }
            return true;
          }
          // For payment vouchers (refunds to customer): exclude sale return refunds
          // as the sale_returns entry already shows the credit with "(Cash Refunded)"
          if (v.voucher_type === 'payment' && v.reference_type === 'customer') {
            const desc = (v.description || '').toLowerCase();
            if (desc.includes('refund paid for sale return') || desc.includes('refund for sale return')) {
              return false;
            }
          }
          return true;
        });

      // Fetch customer advances
      let advancesQuery = supabase
        .from("customer_advances")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId);

      if (startDate) {
        advancesQuery = advancesQuery.gte("advance_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        advancesQuery = advancesQuery.lte("advance_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: advancesData, error: advancesError } = await advancesQuery.order("advance_date", { ascending: true });

      if (advancesError) throw advancesError;

      // Fetch balance adjustments
      let adjustmentsQuery = (supabase as any)
        .from("customer_balance_adjustments")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId);

      if (startDate) {
        adjustmentsQuery = adjustmentsQuery.gte("adjustment_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        adjustmentsQuery = adjustmentsQuery.lte("adjustment_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: adjustmentsData, error: adjustmentsError } = await adjustmentsQuery.order("created_at", { ascending: true });

      if (adjustmentsError) throw adjustmentsError;

      // Fetch ALL sale returns for this customer (all statuses)
      let saleReturnsQuery = supabase
        .from("sale_returns")
        .select("id, return_number, return_date, net_amount, credit_status, linked_sale_id, refund_type, created_at")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (startDate) {
        saleReturnsQuery = saleReturnsQuery.gte("return_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        saleReturnsQuery = saleReturnsQuery.lte("return_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: saleReturnsData, error: saleReturnsError } = await saleReturnsQuery.order("return_date", { ascending: true });
      if (saleReturnsError) throw saleReturnsError;

      // Get linked sale numbers for display
      const linkedSaleIds = (saleReturnsData || []).filter((sr: any) => sr.linked_sale_id).map((sr: any) => sr.linked_sale_id);
      let linkedSaleMap: Record<string, string> = {};
      if (linkedSaleIds.length > 0) {
        const { data: linkedSales } = await supabase
          .from("sales")
          .select("id, sale_number")
          .in("id", linkedSaleIds);
        linkedSales?.forEach((s: any) => { linkedSaleMap[s.id] = s.sale_number; });
      }

      // Build applied-CN map: sale_return_id -> { saleId, saleNumber, applied }[]
      // by reading credit_note_adjustment vouchers that target each linked sale.
      // We sum CN-adjustment voucher amounts per linked_sale_id, and attribute
      // them to the SR that links to that sale. If multiple SRs link to the
      // same sale, applied amount is allocated in chronological order up to
      // each SR's net_amount.
      const cnVoucherBySaleId: Record<string, number> = {};
      (vouchersData || []).forEach((v: any) => {
        if (v.voucher_type !== 'receipt') return;
        const desc = (v.description || '').toLowerCase();
        const isCn = v.payment_method === 'credit_note_adjustment'
          || desc.includes('credit note adjusted')
          || desc.includes('cn adjusted');
        if (!isCn || !v.reference_id) return;
        cnVoucherBySaleId[v.reference_id] =
          (cnVoucherBySaleId[v.reference_id] || 0) + (Number(v.total_amount) || 0);
      });

      // Allocate applied amount per SR (chronological by return_date)
      const srAppliedMap: Record<string, { saleId: string; saleNumber: string | null; applied: number }> = {};
      const remainingBySale: Record<string, number> = { ...cnVoucherBySaleId };
      const sortedSRs = [...(saleReturnsData || [])]
        .filter((sr: any) => sr.linked_sale_id)
        .sort((a: any, b: any) =>
          new Date(a.return_date).getTime() - new Date(b.return_date).getTime()
          || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      sortedSRs.forEach((sr: any) => {
        const saleId = sr.linked_sale_id;
        const remaining = remainingBySale[saleId] || 0;
        if (remaining <= 0) return;
        const applied = Math.min(remaining, Number(sr.net_amount) || 0);
        srAppliedMap[sr.id] = {
          saleId,
          saleNumber: linkedSaleMap[saleId] || null,
          applied,
        };
        remainingBySale[saleId] = remaining - applied;
      });

      // Pass 2: Distribute any leftover voucher balance to UNLINKED SRs of this
      // customer (chronological). This handles cases where multiple SRs were
      // applied via sales.sale_return_adjust at billing time but only one was
      // recorded with linked_sale_id, leaving the rest "phantom pending".
      const unlinkedSRs = [...(saleReturnsData || [])]
        .filter((sr: any) => !sr.linked_sale_id)
        .sort((a: any, b: any) =>
          new Date(a.return_date).getTime() - new Date(b.return_date).getTime()
          || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      const saleIdsWithRemainder = Object.keys(remainingBySale).filter(
        (sid) => (remainingBySale[sid] || 0) > 0
      );
      for (const sr of unlinkedSRs) {
        let srRemaining = Number(sr.net_amount) || 0;
        if (srRemaining <= 0) continue;
        for (const sid of saleIdsWithRemainder) {
          const avail = remainingBySale[sid] || 0;
          if (avail <= 0) continue;
          const take = Math.min(avail, srRemaining);
          if (take <= 0) continue;
          // Use first sale we attribute against (most common case is one sale)
          if (!srAppliedMap[sr.id]) {
            srAppliedMap[sr.id] = {
              saleId: sid,
              saleNumber: linkedSaleMap[sid] || null,
              applied: take,
            };
          } else {
            srAppliedMap[sr.id].applied += take;
          }
          remainingBySale[sid] = avail - take;
          srRemaining -= take;
          if (srRemaining <= 0) break;
        }
      }

      // Fetch advance refunds for this customer
      const customerAdvanceIds = (advancesData || []).map((a: any) => a.id);
      let filteredAdvanceRefunds: any[] = [];
      if (customerAdvanceIds.length > 0) {
        const { data: advanceRefundsData } = await supabase
          .from("advance_refunds")
          .select("id, advance_id, refund_amount, refund_date, payment_method, reason, created_at")
          .eq("organization_id", organizationId)
          .in("advance_id", customerAdvanceIds)
          .order("refund_date", { ascending: true });
        filteredAdvanceRefunds = advanceRefundsData || [];
      }

      // Fetch credit notes for this customer
      let creditNotesQuery = supabase
        .from("credit_notes")
        .select("id, credit_note_number, issue_date, credit_amount, used_amount, status, notes, sale_id, created_at")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (startDate) {
        creditNotesQuery = creditNotesQuery.gte("issue_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        creditNotesQuery = creditNotesQuery.lte("issue_date", format(endDate, 'yyyy-MM-dd') + 'T23:59:59');
      }

      const { data: creditNotesData } = await creditNotesQuery.order("issue_date", { ascending: true });


      // Calculate total voucher payments per sale to exclude from "payment at sale"
      const voucherPaymentsBySaleId: Record<string, number> = {};
      (vouchersData || []).forEach((voucher) => {
        if (voucher.reference_id) {
          voucherPaymentsBySaleId[voucher.reference_id] = 
            (voucherPaymentsBySaleId[voucher.reference_id] || 0) + (voucher.total_amount || 0);
        }
      });

      // Combine and sort transactions
      const allTransactions: Transaction[] = [];

      // When a date filter is active, compute the balance brought forward
      // from all transactions BEFORE startDate so the running balance starts correctly.
      let effectiveOpeningBalance = selectedCustomer.opening_balance || 0;

      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');

        // Sales prior to startDate
        const { data: priorSales } = await supabase
          .from('sales')
          .select('id, net_amount, paid_amount, sale_return_adjust, payment_status, is_cancelled')
          .eq('customer_id', selectedCustomer.id)
          .is('deleted_at', null)
          .neq('payment_status', 'hold')
          .eq('is_cancelled', false)
          .lt('sale_date', startDateStr);

        const priorSaleIds = (priorSales || []).map((s: any) => s.id);

        if (priorSaleIds.length > 0) {
          const { data: priorVouchers } = await supabase
            .from('voucher_entries')
            .select('reference_id, total_amount, payment_method, description')
            .in('reference_id', priorSaleIds)
            .eq('voucher_type', 'receipt')
            .is('deleted_at', null);

          const priorCashVouchers: Record<string, number> = {};
          (priorVouchers || []).forEach((v: any) => {
            if (v.reference_id)
              priorCashVouchers[v.reference_id] =
                (priorCashVouchers[v.reference_id] || 0) + (v.total_amount || 0);
          });

          (priorSales || []).forEach((sale: any) => {
            effectiveOpeningBalance += (sale.net_amount || 0) + (sale.sale_return_adjust || 0);
            const cashVoucher = priorCashVouchers[sale.id] || 0;
            const paidAtSale = Math.max(0, (sale.paid_amount || 0) - cashVoucher);
            effectiveOpeningBalance -= paidAtSale + cashVoucher;
          });
        }

        // Prior advances reduce balance (credit)
        const { data: priorAdv } = await supabase
          .from('customer_advances')
          .select('amount')
          .eq('customer_id', selectedCustomer.id)
          .eq('organization_id', organizationId)
          .lt('advance_date', startDateStr);
        (priorAdv || []).forEach((a: any) => { effectiveOpeningBalance -= a.amount || 0; });

        // Prior actioned sale returns reduce balance
        const { data: priorReturns } = await supabase
          .from('sale_returns')
          .select('net_amount, credit_status')
          .eq('customer_id', selectedCustomer.id)
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .neq('credit_status', 'pending')
          .lt('return_date', startDateStr);
        (priorReturns || []).forEach((sr: any) => { effectiveOpeningBalance -= sr.net_amount || 0; });
      }

      // Start with opening balance (computed B/F when date-filtered)
      const openingBalance = effectiveOpeningBalance;
      let runningBalance = openingBalance;

      // Add opening balance as first entry if it exists
      if (openingBalance !== 0) {
        allTransactions.push({
          id: 'opening-balance',
          date: '1900-01-01',
          timestamp: null,
          type: 'invoice',
          reference: 'Opening',
          description: startDate ? 'Balance B/F (as of filter start date)' : 'Opening Balance (Carried Forward)',
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          balance: runningBalance,
        });
      }

      // Merge sales, payments, and advances chronologically
      const combined = [
        ...salesData.map((sale) => ({
          date: sale.sale_date,
          timestamp: sale.created_at,
          type: 'invoice' as const,
          data: sale,
        })),
        // Include all vouchers including advance-application entries
        ...allVouchers
          .map((voucher: any) => ({
            date: voucher.voucher_date,
            timestamp: voucher.created_at,
            type: (
              voucher.payment_method === 'advance_adjustment' ||
              (voucher.description && (
                voucher.description.toLowerCase().includes('adjusted from advance balance') ||
                voucher.description.toLowerCase().includes('advance adjusted')
              ))
            ) ? 'advance_application' as const : 'payment' as const,
            data: voucher,
          })),
        ...(advancesData || []).map((advance) => ({
          date: advance.advance_date,
          timestamp: advance.created_at,
          type: 'advance' as const,
          data: advance,
        })),
        ...(adjustmentsData || []).map((adj: any) => ({
          date: adj.adjustment_date,
          timestamp: adj.created_at,
          type: 'adjustment' as const,
          data: adj,
        })),
        ...(saleReturnsData || []).map((sr: any) => ({
          date: sr.return_date,
          timestamp: sr.created_at,
          type: 'cn_adjustment' as const,
          data: { ...sr, linkedSaleNumber: linkedSaleMap[sr.linked_sale_id] || null },
        })),
        ...(filteredAdvanceRefunds || []).map((refund: any) => ({
          date: refund.refund_date,
          timestamp: refund.created_at,
          type: 'refund' as const,
          data: refund,
        })),
        ...(creditNotesData || [])
          .filter((cn: any) => !cn.sale_id || !(saleReturnsData || []).some((sr: any) => sr.linked_sale_id === cn.sale_id))
          .map((cn: any) => ({
            date: cn.issue_date ? cn.issue_date.substring(0, 10) : '',
            timestamp: cn.created_at,
            type: 'credit_note' as const,
            data: cn,
          })),
      ].sort((a, b) => {
        // Primary sort by transaction date (not created_at) for correct chronological order
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        // Secondary sort by created_at for same-date entries
        const tsA = a.timestamp ? new Date(a.timestamp).getTime() : dateA;
        const tsB = b.timestamp ? new Date(b.timestamp).getTime() : dateB;
        if (tsA !== tsB) return tsA - tsB;
        // Tertiary tiebreaker by type
        const typeOrder: Record<string, number> = { invoice: 0, cn_adjustment: 1, advance: 1, refund: 1, credit_note: 1, advance_application: 1.5, payment: 2, adjustment: 3 };
        return (typeOrder[a.type] ?? 1) - (typeOrder[b.type] ?? 1);
      });

      combined.forEach((item) => {
        if (item.type === 'invoice') {
          const sale = item.data as any;
          const isCancelled = sale.payment_status === 'cancelled';
          const saleReturnAdjust = sale.sale_return_adjust || 0;
          const isExchangeCoveredByReturn = saleReturnAdjust > 0 && sale.net_amount > 0 && saleReturnAdjust >= sale.net_amount;
          // net_amount is already the post-return amount saved at POS.
          // The sale return entry is a separate credit row — do NOT add
          // sale_return_adjust here or it double-counts the return.
          const invoiceDebit = sale.net_amount;
          if (!isCancelled) {
            runningBalance += invoiceDebit;
          }
          
          // Build payment breakdown for display
          const paymentBreakdown: any = {};
          if (sale.cash_amount && sale.cash_amount > 0) paymentBreakdown.cash = sale.cash_amount;
          if (sale.card_amount && sale.card_amount > 0) paymentBreakdown.card = sale.card_amount;
          if (sale.upi_amount && sale.upi_amount > 0) paymentBreakdown.upi = sale.upi_amount;

          // ── Display strategy ────────────────────────────────────────────
          // BALANCE MATH unchanged: only `net_amount` debits the running balance.
          // DISPLAY: when sale_return_adjust > 0, show GROSS in the Debit column
          // so the customer sees the full bill value, then add an inline
          // informational sub-row that visibly credits the S/R offset. The
          // sub-row has balanceEffect = 0 (debit=0, credit=0 for math/totals)
          // so the running balance is unchanged.
          const grossAmount = isExchangeCoveredByReturn ? (sale.net_amount || 0) : (sale.net_amount || 0) + saleReturnAdjust;
          const showGross = saleReturnAdjust > 0 && !isCancelled;
          const invoiceDescription = showGross
            ? `${sale.sale_type === 'pos' ? 'POS' : 'Invoice'} - ${sale.payment_status} (Gross ₹${grossAmount.toLocaleString('en-IN')}; less S/R ₹${saleReturnAdjust.toLocaleString('en-IN')}; Net ₹${(grossAmount - saleReturnAdjust).toLocaleString('en-IN')})`
            : `${sale.sale_type === 'pos' ? 'POS' : 'Invoice'} - ${sale.payment_status}`;

          allTransactions.push({
            id: sale.id,
            date: sale.sale_date,
            timestamp: item.timestamp || null,
            type: 'invoice',
            reference: sale.sale_number,
            description: invoiceDescription,
            // `debit` drives both the running balance addition (already done
            // above) AND the totals row. Keep it = net_amount so totals match
            // the balance math. `displayDebit` overrides the rendered value.
            debit: isCancelled ? 0 : invoiceDebit,
            credit: 0,
            displayDebit: isCancelled ? 0 : (showGross ? grossAmount : invoiceDebit),
            balance: runningBalance,
            paymentStatus: sale.payment_status,
            paymentBreakdown: Object.keys(paymentBreakdown).length > 0 ? paymentBreakdown : undefined,
          });

          // Inline informational row showing the S/R offset that brought
          // gross down to net. No balance impact (already inside net_amount).
          if (showGross) {
            allTransactions.push({
              id: `${sale.id}-sr-note`,
              date: sale.sale_date,
              timestamp: item.timestamp || null,
              type: 'invoice',
              reference: sale.sale_number,
              description: `↳ Less: S/R Adjustment applied to ${sale.sale_number}`,
              debit: 0,
              credit: 0,
              displayDebit: 0,
              displayCredit: saleReturnAdjust,
              balance: runningBalance,
              informational: true,
            });
          }

          // Skip payment processing for cancelled invoices
          if (isCancelled) return;

          // Calculate "payment at sale" - exclude amounts paid via vouchers (recorded payments)
          // Total paid_amount includes all payments, but voucher payments are recorded separately
          const totalPaidOnSale = isExchangeCoveredByReturn ? 0 : (sale.paid_amount || 0);
          const voucherPayments = voucherPaymentsBySaleId[sale.id] || 0;
          const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);
          
          if (paidAtSale > 0) {
            runningBalance -= paidAtSale;
            
            // Build payment description with breakdown
            const paymentParts: string[] = [];
            if (sale.cash_amount > 0) paymentParts.push(`Cash: ₹${sale.cash_amount.toLocaleString('en-IN')}`);
            if (sale.card_amount > 0) paymentParts.push(`Card: ₹${sale.card_amount.toLocaleString('en-IN')}`);
            if (sale.upi_amount > 0) paymentParts.push(`UPI: ₹${sale.upi_amount.toLocaleString('en-IN')}`);
            
            allTransactions.push({
              id: `${sale.id}-payment-at-sale`,
              date: sale.sale_date,
              timestamp: item.timestamp || null,
              type: 'payment',
              reference: sale.sale_number,
              description: `Payment at sale${paymentParts.length > 0 ? ' - ' + paymentParts.join(', ') : ''}`,
              debit: 0,
              credit: paidAtSale,
              balance: runningBalance,
              paymentBreakdown: {
                cash: sale.cash_amount || 0,
                card: sale.card_amount || 0,
                upi: sale.upi_amount || 0,
              },
            });
          }

          // ── Refund outflow row ────────────────────────────────────────
          // For invoices saved with refund_amount > 0 (negative-net Mix
          // refund where cash was paid OUT of the drawer to the customer),
          // record an offsetting DEBIT so the customer balance doesn't
          // double-count the SR credit. Detected via negative cash/upi/card
          // (set by POSSales handleMixPaymentSave) — falls back to
          // refund_amount for legacy data with mode=cash.
          const refundAmt = Number(sale.refund_amount) || 0;
          if (refundAmt > 0) {
            const negCash = sale.cash_amount < 0 ? Math.abs(sale.cash_amount) : 0;
            const negUpi = sale.upi_amount < 0 ? Math.abs(sale.upi_amount) : 0;
            const negCard = sale.card_amount < 0 ? Math.abs(sale.card_amount) : 0;
            const refundOut = negCash + negUpi + negCard || refundAmt;
            const refundParts: string[] = [];
            if (negCash > 0) refundParts.push(`Cash: ₹${negCash.toLocaleString('en-IN')}`);
            if (negUpi > 0) refundParts.push(`UPI: ₹${negUpi.toLocaleString('en-IN')}`);
            if (negCard > 0) refundParts.push(`Bank: ₹${negCard.toLocaleString('en-IN')}`);
            const refundDesc = `Refund paid for ${sale.sale_number}${refundParts.length > 0 ? ' - ' + refundParts.join(', ') : ''}`;
            runningBalance += refundOut;
            allTransactions.push({
              id: `${sale.id}-refund-out`,
              date: sale.sale_date,
              timestamp: item.timestamp || null,
              type: 'refund',
              reference: sale.sale_number,
              description: refundDesc,
              debit: refundOut,
              credit: 0,
              balance: runningBalance,
            });
          }
        } else if (item.type === 'advance') {
          // Handle advance booking entries
          const advance = item.data as any;
          const availableAmount = (advance.amount || 0) - (advance.used_amount || 0);
          
          // Advances reduce the customer's balance (credit)
          runningBalance -= advance.amount;
          
          const paymentMethodText = advance.payment_method 
            ? advance.payment_method.charAt(0).toUpperCase() + advance.payment_method.slice(1)
            : 'Cash';
          
          let description = `Advance Booking - ${paymentMethodText}`;
          if (advance.description) {
            description += ` - ${advance.description}`;
          }
          if (advance.status === 'fully_used') {
            description += ' — Fully Applied to Invoice(s)';
          } else if (advance.used_amount > 0) {
            description += ` — Partially Applied (₹${advance.used_amount.toLocaleString('en-IN')} used, ₹${availableAmount.toLocaleString('en-IN')} remaining)`;
          } else {
            description += ' — Available for Invoice Settlement';
          }
          
          allTransactions.push({
            id: advance.id,
            date: advance.advance_date,
            timestamp: item.timestamp || null,
            type: 'advance',
            reference: advance.advance_number,
            description: description,
            debit: 0,
            credit: advance.amount,
            balance: runningBalance,
            paymentBreakdown: advance.payment_method ? { method: advance.payment_method } : undefined,
          });
        } else if (item.type === 'advance_application') {
          // Advance applied to invoice — display-only, no balance impact
          // (advance already credited when received, this is just re-allocation)
          const voucher = item.data as any;
          const amount = Number(voucher.total_amount) || 0;

          // Resolve linked invoice number from reference_id when possible,
          // otherwise fall back to parsing the voucher description.
          let linkedSaleNumber = '';
          if (voucher.reference_id) {
            const linkedSale = (salesData || []).find((s: any) => s.id === voucher.reference_id);
            if (linkedSale) linkedSaleNumber = linkedSale.sale_number;
          }
          if (!linkedSaleNumber) {
            linkedSaleNumber = voucher.description?.replace('Adjusted from advance balance for ', '') || '';
          }

          const description = linkedSaleNumber
            ? `Advance ₹${amount.toLocaleString('en-IN')} applied to ${linkedSaleNumber} (info only)`
            : `Advance Applied — ₹${amount.toLocaleString('en-IN')} (info only)`;

          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            timestamp: item.timestamp || null,
            type: 'advance_application',
            reference: voucher.voucher_number || 'ADV-APP',
            description,
            // Balance math unchanged (already reflected via advance + invoice rows).
            // Real ledger impact remains 0; we expose the amount via display-only fields.
            debit: 0,
            credit: 0,
            displayDebit: amount,   // visible reduction of the customer's credit
            displayCredit: 0,
            informational: true,    // muted/italic styling, excluded from totals
            balance: runningBalance,
            appliedAmount: amount,
          });
        } else if (item.type === 'adjustment') {
          const adj = item.data as any;
          const outDiff = adj.outstanding_difference || 0;
          const advDiff = adj.advance_difference || 0;
          // When advance is reduced (advDiff < 0), show as debit (advance credit reversed)
          // When advance is increased (advDiff > 0), skip here (new advance record handles it)
          const advanceConsumed = advDiff < 0 ? Math.abs(advDiff) : 0;
          const netDebit = (outDiff > 0 ? outDiff : 0) + advanceConsumed;
          const netCredit = outDiff < 0 ? Math.abs(outDiff) : 0;
          runningBalance += netDebit - netCredit;
          
          let adjDescription = `Balance Adjustment: ${adj.reason}`;
          if (advanceConsumed > 0) {
            adjDescription += ` (Advance Refund: ₹${advanceConsumed.toLocaleString('en-IN')})`;
          }
          
          allTransactions.push({
            id: adj.id,
            date: adj.adjustment_date,
            timestamp: item.timestamp || null,
            type: 'adjustment',
            reference: 'ADJ',
            description: adjDescription,
            debit: netDebit,
            credit: netCredit,
            balance: runningBalance,
          });
        } else if (item.type === 'cn_adjustment') {
          const sr = item.data as any;
          const amount = sr.net_amount || 0;
          const appliedInfo = srAppliedMap[sr.id];
          const appliedAmount = appliedInfo?.applied || 0;
          const unusedAmount = Math.max(0, amount - appliedAmount);

          // ONE consolidated row per SR. Balance math unchanged — the full
          // SR net_amount is credited (= old applied + unused split summed).
          // The description lists how the SR was applied / its status.
          if (amount > 0) {
            runningBalance -= amount;

            let status: string;
            if (appliedAmount > 0 && unusedAmount === 0) status = 'Fully Adjusted';
            else if (appliedAmount > 0 && unusedAmount > 0)
              status = `Partial — ₹${unusedAmount.toLocaleString('en-IN')} pending`;
            else if (sr.credit_status === 'refunded') status = 'Cash Refunded';
            else if (sr.credit_status === 'adjusted_outstanding') status = 'Adjusted to Outstanding';
            else if (sr.credit_status === 'adjusted' && sr.linkedSaleNumber)
              status = `Adjusted via CN against ${sr.linkedSaleNumber}`;
            else status = 'Pending';

            const appliedSummary = appliedAmount > 0 && appliedInfo?.saleNumber
              ? ` — ₹${appliedAmount.toLocaleString('en-IN')} applied to ${appliedInfo.saleNumber}`
              : '';

            const desc = `Sale Return [${status}]${appliedSummary}`;

            allTransactions.push({
              id: `cn-${sr.id}`,
              date: sr.return_date,
              timestamp: item.timestamp || null,
              type: 'return' as const,
              reference: sr.return_number,
              description: desc,
              debit: 0,
              credit: amount,
              balance: runningBalance,
            });
          }
        } else if (item.type === 'refund') {
          const refund = item.data as any;
          const amount = refund.refund_amount || 0;
          runningBalance += amount;

          const methodText = refund.payment_method
            ? refund.payment_method.charAt(0).toUpperCase() + refund.payment_method.slice(1)
            : 'Cash';
          let description = `Advance Refund - ${methodText}`;
          if (refund.reason) description += ` (${refund.reason})`;

          allTransactions.push({
            id: `refund-${refund.id}`,
            date: refund.refund_date,
            timestamp: refund.created_at || null,
            type: 'refund',
            reference: 'REFUND',
            description,
            debit: amount,
            credit: 0,
            balance: runningBalance,
          });
        } else if (item.type === 'credit_note') {
          const cn = item.data as any;
          const amount = cn.credit_amount || 0;
          runningBalance -= amount;

          const usedText = cn.used_amount > 0
            ? ` (Used: ₹${cn.used_amount.toLocaleString('en-IN')}, Remaining: ₹${(amount - cn.used_amount).toLocaleString('en-IN')})`
            : '';

          allTransactions.push({
            id: `cn-${cn.id}`,
            date: cn.issue_date ? cn.issue_date.substring(0, 10) : '',
            timestamp: cn.created_at || null,
            type: 'credit_note',
            reference: cn.credit_note_number,
            description: `Credit Note${cn.notes ? ` - ${cn.notes}` : ''}${usedText}`,
            debit: 0,
            credit: amount,
            balance: runningBalance,
          });
        } else {
          const voucher = item.data as any;
          const discountAmount = voucher.discount_amount || 0;
          const totalCredit = voucher.total_amount + discountAmount;
          if (voucher.voucher_type === 'payment' && voucher.reference_type === 'customer') {
            runningBalance += totalCredit;
            allTransactions.push({
              id: voucher.id,
              date: voucher.voucher_date,
              timestamp: item.timestamp || null,
              type: 'refund',
              reference: voucher.voucher_number,
              description: voucher.description || 'Payment / refund paid to customer',
              debit: totalCredit,
              credit: 0,
              balance: runningBalance,
              paymentBreakdown: voucher.payment_method ? { method: voucher.payment_method } : undefined,
            });
            return;
          }
          runningBalance -= totalCredit;
          
          // Determine if this is an opening balance payment or invoice payment
          const isOpeningBalancePayment = voucher.reference_type === 'customer';
          const relatedSale = !isOpeningBalancePayment ? salesData.find(s => s.id === voucher.reference_id) : null;
          const invoiceRef = relatedSale ? ` - for ${relatedSale.sale_number}` : '';
          
          // Build description including discount if any
          let description = isOpeningBalancePayment 
            ? (voucher.description || 'Opening balance payment')
            : (voucher.description || 'Payment received') + invoiceRef;
          
          if (discountAmount > 0) {
            description += ` (incl. Discount: ₹${discountAmount.toLocaleString('en-IN')}${voucher.discount_reason ? ` - ${voucher.discount_reason}` : ''})`;
          }
          
          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            timestamp: item.timestamp || null,
            type: 'payment',
            reference: voucher.voucher_number,
            description: description,
            debit: 0,
            credit: totalCredit,
            balance: runningBalance,
            paymentBreakdown: voucher.metadata?.paymentMethod ? { method: voucher.metadata.paymentMethod } : undefined,
          });
        }
      });

      // FIX 1 — Suppress "ghost" adjustment rows that have no debit, no credit
      // and leave the running balance unchanged. They clutter the ledger
      // without conveying any information.
      const cleanedTransactions = allTransactions.filter((t, i, arr) => {
        if (
          t.type === 'adjustment' &&
          (t.debit || 0) === 0 &&
          (t.credit || 0) === 0 &&
          i > 0 &&
          t.balance === arr[i - 1].balance
        ) {
          return false;
        }
        return true;
      });

      return cleanedTransactions;
    },
    enabled: !!selectedCustomer?.id,
  });

  // Fetch payment history for selected customer
  const { data: paymentHistory } = useQuery({
    queryKey: ["customer-payment-history", selectedCustomer?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // Get all sales for this customer to get reference IDs
      const { data: customerSales, error: salesError } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, paid_amount, cash_amount, card_amount, upi_amount, sale_date, payment_method, payment_status, sale_return_adjust")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null)
        .neq("payment_status", "hold")
        .eq("is_cancelled", false);

      if (salesError) throw salesError;

      const saleIds = customerSales?.map(s => s.id) || [];
      const saleMap = new Map(customerSales?.map(s => [s.id, s]) || []);

      // Fetch voucher payments (recorded via Record Payment)
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null)
        .in("reference_id", saleIds.length > 0 ? saleIds : ['00000000-0000-0000-0000-000000000000']);

      if (startDate) {
        vouchersQuery = vouchersQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        vouchersQuery = vouchersQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: false });

      if (vouchersError) throw vouchersError;

      // Fetch opening balance payments (reference_type = 'customer')
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "customer")
        .eq("reference_id", selectedCustomer.id)
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: false });

      if (openingError) throw openingError;

      // Calculate total voucher payments per sale to exclude from "payment at sale"
      const voucherPaymentsBySaleId: Record<string, number> = {};
      vouchersData?.forEach((voucher) => {
        if (voucher.reference_id) {
          voucherPaymentsBySaleId[voucher.reference_id] = 
            (voucherPaymentsBySaleId[voucher.reference_id] || 0) + (voucher.total_amount || 0);
        }
      });

      // Build payment history list
      const payments: any[] = [];

      // Add payments from voucher entries (invoice payments)
      vouchersData?.forEach((voucher) => {
        const relatedSale = saleMap.get(voucher.reference_id || '');
        payments.push({
          id: voucher.id,
          date: voucher.voucher_date,
          voucherNumber: voucher.voucher_number,
          invoiceNumber: relatedSale?.sale_number || 'N/A',
          invoiceAmount: relatedSale?.net_amount || 0,
          amount: voucher.total_amount,
          method: 'recorded',
          description: voucher.description || 'Payment recorded',
          cash: 0,
          card: 0,
          upi: 0,
          source: 'voucher',
        });
      });

      // Add opening balance payments
      openingBalancePayments?.forEach((voucher) => {
        payments.push({
          id: voucher.id,
          date: voucher.voucher_date,
          voucherNumber: voucher.voucher_number,
          invoiceNumber: 'Opening Balance',
          invoiceAmount: selectedCustomer.opening_balance || 0,
          amount: voucher.total_amount,
          method: 'recorded',
          description: voucher.description || 'Opening balance payment',
          cash: 0,
          card: 0,
          upi: 0,
          source: 'opening_balance',
        });
      });

      // Add payments made at time of sale (exclude amounts paid via vouchers)
      customerSales?.forEach((sale) => {
        const totalPaidOnSale = sale.paid_amount || 0;
        const voucherPayments = voucherPaymentsBySaleId[sale.id] || 0;
        const saleReturnAdjust = sale.sale_return_adjust || 0;
        const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);
        
        if (paidAtSale > 0) {
          // Check date filter
          if (startDate && new Date(sale.sale_date) < startDate) return;
          if (endDate && new Date(sale.sale_date) > endDate) return;
          
          payments.push({
            id: `${sale.id}-sale-payment`,
            date: sale.sale_date,
            voucherNumber: 'At Sale',
            invoiceNumber: sale.sale_number,
            invoiceAmount: sale.net_amount,
            amount: paidAtSale,
            method: sale.payment_method || 'mixed',
            description: 'Payment at time of sale',
            cash: sale.cash_amount || 0,
            card: sale.card_amount || 0,
            upi: sale.upi_amount || 0,
            source: 'sale',
          });
        }
      });

      // Sort by date descending
      payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return payments;
    },
    enabled: !!selectedCustomer?.id,
  });

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!paymentHistory) return { total: 0, cash: 0, card: 0, upi: 0, count: 0 };
    return {
      total: paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0),
      cash: paymentHistory.reduce((sum, p) => sum + (p.cash || 0), 0),
      card: paymentHistory.reduce((sum, p) => sum + (p.card || 0), 0),
      upi: paymentHistory.reduce((sum, p) => sum + (p.upi || 0), 0),
      count: paymentHistory.length,
    };
  }, [paymentHistory]);

  // Filter customers based on search, payment status, and date range
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    
    return customers.filter((customer) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        customer.customer_name.toLowerCase().includes(searchLower) ||
        customer.phone?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower)
      );

      // Payment status filter
      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = customer.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = customer.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = customer.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [customers, searchQuery, paymentStatusFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCustomerPage(0);
  }, [searchQuery, paymentStatusFilter]);

  // Paginated customers
  const paginatedCustomers = useMemo(() => {
    const start = customerPage * CUSTOMERS_PER_PAGE;
    return filteredCustomers.slice(start, start + CUSTOMERS_PER_PAGE);
  }, [filteredCustomers, customerPage]);

  const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE);

  const effectiveBalance = useMemo(() => {
    if (!selectedCustomer) return 0;
    // Keep header/summary aligned with the visible statement rows:
    // use the last running balance from current (date-filtered) transactions.
    if (transactions && transactions.length > 0) {
      return Number(transactions[transactions.length - 1].balance || 0);
    }
    // Fallback when transaction list is empty/loading.
    return authoritativeBalance;
  }, [selectedCustomer, transactions, authoritativeBalance]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredCustomers) return { totalCustomers: 0, totalOutstanding: 0, totalReceivable: 0 };
    
    return {
      totalCustomers: filteredCustomers.length,
      totalOutstanding: filteredCustomers.reduce((sum, c) => sum + Math.max(0, c.balance), 0),
      totalReceivable: filteredCustomers.reduce((sum, c) => sum + c.totalSales, 0),
    };
  }, [filteredCustomers]);

  // Export customer list to Excel
  const handleExportCustomerListExcel = useCallback(() => {
    if (!filteredCustomers.length) return;
    const rows = filteredCustomers.map((c) => ({
      "Customer Name": c.customer_name,
      "Phone": c.phone || "",
      "Email": c.email || "",
      "Opening Balance": Math.round(c.opening_balance || 0),
      "Total Sales": Math.round(c.totalSales),
      "Total Paid": Math.round(c.totalPaid),
      "Balance": Math.round(c.balance),
      "Status": c.balance > 0 ? "Outstanding" : c.balance < 0 ? "Advance" : "Settled",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `Customer_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Customer ledger exported to Excel");
  }, [filteredCustomers]);

  // Export customer list to PDF
  const handleExportCustomerListPDF = useCallback(() => {
    if (!filteredCustomers.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text("Customer Ledger Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`Date: ${format(new Date(), "dd/MM/yyyy")}  |  Customers: ${filteredCustomers.length}  |  Outstanding: ₹${Math.round(summary.totalOutstanding).toLocaleString("en-IN")}`, 14, 22);

    const cols = ["#", "Customer Name", "Phone", "Total Sales", "Total Paid", "Balance", "Status"];
    const colWidths = [10, 70, 35, 40, 40, 40, 30];
    let y = 30;

    // Header
    doc.setFillColor(41, 98, 255);
    doc.rect(14, y - 5, pageWidth - 28, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    let x = 14;
    cols.forEach((col, i) => {
      doc.text(col, x + 2, y);
      x += colWidths[i];
    });
    y += 6;
    doc.setTextColor(0, 0, 0);

    filteredCustomers.forEach((c, idx) => {
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = 15;
        // Re-draw header
        doc.setFillColor(41, 98, 255);
        doc.rect(14, y - 5, pageWidth - 28, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        let hx = 14;
        cols.forEach((col, i) => {
          doc.text(col, hx + 2, y);
          hx += colWidths[i];
        });
        y += 6;
        doc.setTextColor(0, 0, 0);
      }

      if (idx % 2 === 0) {
        doc.setFillColor(245, 247, 250);
        doc.rect(14, y - 4, pageWidth - 28, 6, "F");
      }

      doc.setFontSize(7.5);
      x = 14;
      const row = [
        String(idx + 1),
        c.customer_name.substring(0, 35),
        (c.phone || "").substring(0, 15),
        `₹${Math.round(c.totalSales).toLocaleString("en-IN")}`,
        `₹${Math.round(c.totalPaid).toLocaleString("en-IN")}`,
        `₹${Math.round(c.balance).toLocaleString("en-IN")}`,
        c.balance > 0 ? "Outstanding" : c.balance < 0 ? "Advance" : "Settled",
      ];
      row.forEach((val, i) => {
        doc.text(val, x + 2, y);
        x += colWidths[i];
      });
      y += 6;
    });

    // Footer totals
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Sales: ₹${Math.round(summary.totalReceivable).toLocaleString("en-IN")}   |   Total Outstanding: ₹${Math.round(summary.totalOutstanding).toLocaleString("en-IN")}`, 14, y);

    doc.save(`Customer_Ledger_${format(new Date(), "dd-MM-yyyy")}.pdf`);
    toast.success("Customer ledger exported to PDF");
  }, [filteredCustomers, summary]);

  const transactionTotals = useMemo(() => {
    if (!transactions) return { totalDebit: 0, totalCredit: 0 };

    // Sum the DISPLAYED amounts (e.g. invoice GROSS for visible columns) but
    // skip informational rows so the S/R offset isn't double-counted in the
    // totals row.
    return transactions.reduce((acc, t) => {
      if (t.informational) return acc;
      const d = (t.displayDebit ?? t.debit) || 0;
      const c = (t.displayCredit ?? t.credit) || 0;
      return {
        totalDebit: acc.totalDebit + d,
        totalCredit: acc.totalCredit + c,
      };
    }, { totalDebit: 0, totalCredit: 0 });
  }, [transactions]);

  // Reconciliation summary for the footer box. Numbers are derived directly
  // from the transaction list so they always tally with what the user sees.
  const reconciliation = useMemo(() => {
    const empty = {
      opening: 0,
      grossInvoiced: 0,
      saleReturns: 0,
      netInvoiced: 0,
      payments: 0,
      advanceApplied: 0,
      advanceCredit: 0,
      adjustments: 0,
      finalBalance: 0,
    };
    if (!transactions || transactions.length === 0) return empty;

    let opening = 0;
    let grossInvoiced = 0;
    let saleReturns = 0;
    let netInvoiced = 0;
    let payments = 0;
    let advanceApplied = 0;
    let advanceCredit = 0;
    let adjustments = 0;

    for (const t of transactions) {
      if (t.id === 'opening-balance') {
        opening = (t.debit || 0) - (t.credit || 0);
        continue;
      }
      if (t.informational) continue;
      if (t.type === 'invoice') {
        // Mamta Footwear customer balance reconciliation - Apr 2026:
        // reconciliation must use true debit (net_amount), not displayDebit.
        grossInvoiced += t.debit ?? 0;
      } else if (t.type === 'return') {
        saleReturns += t.credit || 0;
      } else if (t.type === 'payment') {
        payments += t.credit || 0;
      } else if (t.type === 'advance_application') {
        advanceApplied += t.appliedAmount || 0;
      } else if (t.type === 'advance') {
        advanceCredit += t.credit || 0;
      } else if (t.type === 'adjustment') {
        adjustments += (t.debit || 0) - (t.credit || 0);
      }
    }

    const finalBalance = transactions[transactions.length - 1]?.balance ?? 0;
    netInvoiced = grossInvoiced - saleReturns;
    return {
      opening,
      grossInvoiced,
      saleReturns,
      netInvoiced,
      payments,
      advanceApplied,
      advanceCredit,
      adjustments,
      finalBalance,
    };
  }, [transactions]);

  // FIX 5 — Single, unambiguous "Returns / CR" stat. We classify each Sale
  // Return row from the rendered ledger as either Pending or Adjusted by
  // reading the status hint already embedded in the description by the
  // queryFn ("Sale Return [Pending]" / "[Fully Adjusted]" / "[Adjusted to
  // Outstanding]" / "[Cash Refunded]" / "Partial — ₹X pending").
  const saleReturnsSummary = useMemo(() => {
    const summary = { pending: 0, adjusted: 0, partialPending: 0 };
    if (!transactions) return summary;
    for (const t of transactions) {
      if (t.type !== 'return') continue;
      const amount = t.credit || 0;
      const desc = t.description || '';
      if (/\[Pending\]/i.test(desc)) {
        summary.pending += amount;
      } else if (/Partial.*pending/i.test(desc)) {
        // Extract the pending portion from "Partial — ₹X pending"
        const m = desc.match(/Partial\s*—\s*₹([\d,]+(?:\.\d+)?)\s*pending/i);
        const pendingPortion = m ? Number(m[1].replace(/,/g, '')) : 0;
        summary.partialPending += pendingPortion;
        summary.adjusted += Math.max(0, amount - pendingPortion);
      } else {
        // Fully Adjusted, Adjusted to Outstanding, Cash Refunded, etc.
        summary.adjusted += amount;
      }
    }
    return summary;
  }, [transactions]);

  // Send ledger summary via WhatsApp
  const handleSendLedgerWhatsApp = useCallback(() => {
    if (!selectedCustomer) return;
    if (!selectedCustomer.phone) {
      return;
    }

    const openingBalance = selectedCustomer.opening_balance || 0;
    const dateRange = (startDate || endDate) 
      ? `\n📅 Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} - ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`
      : "";

    // Build pending invoices from transaction data — use running balance approach
    // For each invoice, sum all credits (payments) that reference it to get remaining balance
    const allTxns = transactions || [];
    const invoiceTxns = allTxns.filter(t => t.type === 'invoice' && t.debit > 0 && t.id !== 'opening-balance');
    
    // Sum all credits per invoice ID from payment transactions
    const totalPaidPerInvoice = new Map<string, number>();
    allTxns.forEach(t => {
      if (t.credit > 0 && t.type === 'payment' && t.reference) {
        // Payment transactions share the same reference (sale_number) as the invoice
        // Find the invoice with matching reference to get its ID
        const matchingInvoice = invoiceTxns.find(inv => inv.reference === t.reference);
        if (matchingInvoice) {
          totalPaidPerInvoice.set(matchingInvoice.id, (totalPaidPerInvoice.get(matchingInvoice.id) || 0) + t.credit);
        }
      }
    });
    
    // Also account for sale return adjustments (cn_adjustment type)
    allTxns.forEach(t => {
      if (t.credit > 0 && (t.type as string) === 'cn_adjustment' && t.reference) {
        const matchingInvoice = invoiceTxns.find(inv => inv.reference === t.reference);
        if (matchingInvoice) {
          totalPaidPerInvoice.set(matchingInvoice.id, (totalPaidPerInvoice.get(matchingInvoice.id) || 0) + t.credit);
        }
      }
    });
    
    const pendingInvoices = invoiceTxns
      .map(t => {
        const totalPaid = totalPaidPerInvoice.get(t.id) || 0;
        const remaining = Math.round(t.debit - totalPaid);
        return { ...t, remaining };
      })
      .filter(t => t.remaining > 0);

    let txnSummary = "";
    const billWisePending = pendingInvoices.reduce((sum, t) => sum + t.remaining, 0);
    if (pendingInvoices.length > 0) {
      txnSummary = "\n\n📋 *Pending Invoices:*";
      pendingInvoices.forEach((t) => {
        const dateStr = format(new Date(t.date), "dd/MM/yy");
        txnSummary += `\n${dateStr} | ${t.reference} | ₹${Math.round(t.debit).toLocaleString("en-IN")} | Bal: ₹${t.remaining.toLocaleString("en-IN")}`;
      });
    }

    // For school non-structure students, opening_balance and totalSales are the same — avoid showing both
    const showOpeningInMsg = !isSchool || (selectedCustomer as any).hasStructures !== false;
    const feesLabel = isSchool ? ((selectedCustomer as any).hasStructures === false ? 'Opening Balance' : 'Total Fees') : 'Total Sales';
    const paidLabel = isSchool ? 'Fees Paid' : 'Total Paid';

    const balanceBreakdown = openingBalance > 0
      ? `\n📋 Bill-wise Pending: ₹${Math.round(billWisePending).toLocaleString("en-IN")}\n💰 Opening Balance: ₹${Math.round(openingBalance).toLocaleString("en-IN")}`
      : '';

    const message = `📊 *Account Statement*

👤 *${selectedCustomer.customer_name}*${dateRange}
${showOpeningInMsg ? `\n💰 Opening Balance: ₹${Math.round(openingBalance).toLocaleString("en-IN")}` : ''}
📈 ${feesLabel}: ₹${Math.round(selectedCustomer.totalSales).toLocaleString("en-IN")}
✅ ${paidLabel}: ₹${Math.round(selectedCustomer.totalPaid).toLocaleString("en-IN")}
────────────────${balanceBreakdown}
💵 *Outstanding: ₹${Math.abs(Math.round(effectiveBalance)).toLocaleString("en-IN")}${effectiveBalance < 0 ? " (Advance)" : ""}*${txnSummary}

Please clear your dues at the earliest. Thank you!`;

    sendWhatsApp(selectedCustomer.phone, message);
  }, [selectedCustomer, transactions, startDate, endDate, sendWhatsApp]);

  const handleExportToExcel = () => {
    if (!selectedCustomer || !transactions) return;

    const exportData = transactions.map((t) => {
      const dateStr = t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy");
      const timeStr = t.timestamp ? format(new Date(t.timestamp), "hh:mm a") : '';
      const row: any = {
        Date: dateStr,
        Time: timeStr,
        Type: t.type === 'invoice' ? 'Invoice' : t.type === 'return' ? 'Sale Return' : t.type === 'advance' ? 'Advance' : t.type === 'adjustment' ? 'Adjustment' : 'Payment',
        Reference: t.reference,
        Description: t.description,
        Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
        Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      };

      // Add payment breakdown columns if available
      if (t.paymentBreakdown) {
        if (t.paymentBreakdown.cash !== undefined && t.paymentBreakdown.cash > 0) {
          row['Cash Amount'] = t.paymentBreakdown.cash.toFixed(2);
        }
        if (t.paymentBreakdown.card !== undefined && t.paymentBreakdown.card > 0) {
          row['Card Amount'] = t.paymentBreakdown.card.toFixed(2);
        }
        if (t.paymentBreakdown.upi !== undefined && t.paymentBreakdown.upi > 0) {
          row['UPI Amount'] = t.paymentBreakdown.upi.toFixed(2);
        }
        if (t.paymentBreakdown.method) {
          row['Payment Method'] = t.paymentBreakdown.method.toUpperCase();
        }
      }

      row.Balance = t.balance.toFixed(2);
      return row;
    });

    // Add totals row
    exportData.push({
      Date: '',
      Type: '',
      Reference: '',
      Description: 'TOTAL',
      Debit: transactionTotals.totalDebit.toFixed(2),
      Credit: transactionTotals.totalCredit.toFixed(2),
      Balance: transactions.length > 0 ? transactions[transactions.length - 1].balance.toFixed(2) : '0.00',
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  const handleExportToPDF = () => {
    if (!selectedCustomer || !transactions) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Customer Ledger", pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    // Customer Info
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(selectedCustomer.customer_name, margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (selectedCustomer.phone) {
      doc.text(`Phone: ${selectedCustomer.phone}`, margin, yPos);
      yPos += 5;
    }
    if (selectedCustomer.address) {
      doc.text(`Address: ${selectedCustomer.address}`, margin, yPos);
      yPos += 5;
    }

    // Date range if filtered
    if (startDate || endDate) {
      const dateRange = `Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} to ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`;
      doc.text(dateRange, margin, yPos);
      yPos += 5;
    }

    // Outstanding Balance with Dr/Cr
    doc.setFont("helvetica", "bold");
    const hdrBalance = effectiveBalance < 0
      ? `Advance Balance: Rs. ${Math.abs(effectiveBalance).toLocaleString("en-IN")} Cr`
      : `Outstanding Balance: Rs. ${effectiveBalance.toLocaleString("en-IN")} Dr`;
    doc.text(hdrBalance, pageWidth - margin, yPos, { align: "right" });
    yPos += 10;

    // Table Headers
    const headers = ["Date & Time", "Type", "Reference", "Description", "Debit", "Credit", "Balance"];
    const colWidths = [28, 16, 22, 48, 22, 22, 22];
    
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPos, pageWidth - margin * 2, 8, "F");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let xPos = margin;
    headers.forEach((header, i) => {
      doc.text(header, xPos + 1, yPos + 5);
      xPos += colWidths[i];
    });
    yPos += 10;

    // Table Rows
    doc.setFont("helvetica", "normal");
    transactions.forEach((t) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      xPos = margin;
      const dateTimeStr = t.id === 'opening-balance' 
        ? 'Opening' 
        : format(new Date(t.date), "dd/MM/yy") + (t.timestamp ? ' ' + format(new Date(t.timestamp), "hh:mm a") : '');
      const bNum = Math.round(t.balance);
      const bStr = bNum === 0 ? "Rs. 0" : `Rs. ${Math.abs(bNum).toLocaleString("en-IN")} ${bNum < 0 ? "Cr" : "Dr"}`;
      const dispDebit = t.displayDebit ?? t.debit ?? 0;
      const dispCredit = t.displayCredit ?? t.credit ?? 0;
      const desc = t.informational ? `(info) ${t.description}` : t.description;
      const rowData = [
        dateTimeStr,
        t.type === 'invoice' ? 'Invoice' : t.type === 'return' ? 'Sale Return' : t.type === 'advance' ? 'Advance' : t.type === 'advance_application' ? 'Adv Adj' : t.type === 'adjustment' ? 'Adjustment' : 'Payment',
        t.reference,
        desc.length > 28 ? desc.substring(0, 28) + "..." : desc,
        dispDebit > 0 ? `Rs. ${Math.round(dispDebit).toLocaleString("en-IN")}` : "",
        dispCredit > 0 ? `Rs. ${Math.round(dispCredit).toLocaleString("en-IN")}` : "",
        // Informational rows: balance unchanged → suppress to avoid the
        // visual confusion of two consecutive identical balance values.
        t.informational ? '' : bStr,
      ];

      if (t.informational) {
        doc.setFont("helvetica", "italic");
      }
      rowData.forEach((cell, i) => {
        doc.text(cell, xPos + 1, yPos);
        xPos += colWidths[i];
      });
      if (t.informational) {
        doc.setFont("helvetica", "normal");
      }
      yPos += 6;
    });

    // Totals Row
    yPos += 2;
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, yPos - 4, pageWidth - margin * 2, 8, "F");
    
    doc.setFont("helvetica", "bold");
    xPos = margin;
    const totalsData = [
      "",
      "",
      "",
      "TOTAL",
      `Rs. ${Math.round(transactionTotals.totalDebit).toLocaleString("en-IN")}`,
      `Rs. ${Math.round(transactionTotals.totalCredit).toLocaleString("en-IN")}`,
      `Rs. ${transactions.length > 0 ? Math.abs(Math.round(transactions[transactions.length - 1].balance)).toLocaleString("en-IN") : "0"}`,
    ];

    totalsData.forEach((cell, i) => {
      doc.text(cell, xPos + 1, yPos);
      xPos += colWidths[i];
    });

    // Reconciliation block
    yPos += 12;
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Balance Reconciliation", margin, yPos);
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const reconLines: Array<[string, number]> = [
      ["Opening Balance", reconciliation.opening],
      ["(+) Total Invoiced", reconciliation.grossInvoiced],
      ["(-) Sale Returns", -reconciliation.saleReturns],
      ["(=) Net Invoiced", reconciliation.netInvoiced],
      ["(-) Cash / UPI / Card Payments", -reconciliation.payments],
    ];
    if (reconciliation.advanceCredit > 0) {
      reconLines.push(["(-) Advance Received", -reconciliation.advanceCredit]);
    }
    if (reconciliation.adjustments !== 0) {
      reconLines.push(["(+/-) Balance Adjustments", reconciliation.adjustments]);
    }
    const labelX = margin + 4;
    const valueX = margin + 90;
    reconLines.forEach(([label, val]) => {
      doc.text(label, labelX, yPos);
      const sign = val < 0 ? "-" : "";
      doc.text(`${sign}Rs. ${Math.abs(Math.round(val)).toLocaleString("en-IN")}`, valueX, yPos, { align: "left" });
      yPos += 5;
    });
    doc.setFont("helvetica", "bold");
    const finalLabel = reconciliation.finalBalance > 0 ? "Outstanding (Dr)" : reconciliation.finalBalance < 0 ? "Advance (Cr)" : "Settled";
    doc.text(finalLabel, labelX, yPos + 1);
    doc.text(`Rs. ${Math.abs(Math.round(reconciliation.finalBalance)).toLocaleString("en-IN")}`, valueX, yPos + 1);
    yPos += 8;

    // Footer
    yPos += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, margin, yPos);

    doc.save(`${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  if (selectedCustomer && transactions) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedCustomer(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
              >
                Clear
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToExcel}
              className={isMobile ? "flex-1" : ""}
            >
              <Download className="mr-2 h-4 w-4" />
              {isMobile ? "Excel" : "Export Excel"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToPDF}
              className={isMobile ? "flex-1" : ""}
            >
              <FileDown className="mr-2 h-4 w-4" />
              {isMobile ? "PDF" : "Export PDF"}
            </Button>

            {selectedCustomer.phone && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSendLedgerWhatsApp}
                className={cn("bg-green-600 hover:bg-green-700", isMobile ? "flex-1" : "")}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                {isMobile ? "WhatsApp" : "Send on WhatsApp"}
              </Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1.5 bg-gradient-to-r from-primary via-blue-500 to-accent" />
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">
                  <button
                    className="text-foreground hover:text-primary cursor-pointer bg-transparent border-none p-0 text-2xl font-bold tracking-tight transition-colors"
                    onClick={() => openHistory(selectedCustomer.id, selectedCustomer.customer_name)}
                  >
                    {selectedCustomer.customer_name}
                  </button>
                </CardTitle>
                <div className="flex flex-wrap gap-2 mt-1">
                  {isSchool && selectedCustomer.admissionNumber && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span>Adm: {selectedCustomer.admissionNumber}</span>
                    </div>
                  )}
                  {isSchool && selectedCustomer.className && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <span>Class: {selectedCustomer.className}{selectedCustomer.division ? ` - ${selectedCustomer.division}` : ''}</span>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{selectedCustomer.phone}</span>
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span>{selectedCustomer.email}</span>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{selectedCustomer.address}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className={cn(
                "text-right px-5 py-4 rounded-xl min-w-[160px]",
                effectiveBalance > 0
                  ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800"
                  : effectiveBalance < 0
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800"
                  : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              )}>
                <div className="text-sm text-muted-foreground mb-1">
                  {effectiveBalance > 0 ? "Outstanding (Dr)" : effectiveBalance < 0 ? "Advance Balance (Cr)" : "Balance"}
                </div>
                <div className={cn(
                  "text-3xl font-bold tabular-nums",
                  effectiveBalance > 0 ? "text-red-600 dark:text-red-400"
                  : effectiveBalance < 0 ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
                )}>
                  ₹{Math.abs(effectiveBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-2">
                  {effectiveBalance > 0 && (
                    <Badge variant="destructive">Customer Owes</Badge>
                  )}
                  {effectiveBalance < 0 && (
                    <Badge className="bg-green-100 text-green-800">In Advance / Overpaid</Badge>
                  )}
                  {effectiveBalance === 0 && (
                    <Badge variant="outline">Fully Settled</Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-0">
              {/* For school non-structure students, opening_balance IS totalSales — show only once as "Opening Balance" */}
              {selectedCustomer.opening_balance !== 0 && !(isSchool && (selectedCustomer as any).hasStructures === false) && (
                <Card className="border-l-4 border-l-orange-400 overflow-hidden">
                  <CardContent className="p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-xl font-bold tabular-nums",
                      selectedCustomer.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      ₹{Math.abs(selectedCustomer.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedCustomer.opening_balance > 0 ? "Receivable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className="border-l-4 border-l-blue-400 overflow-hidden">
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {isSchool ? ((selectedCustomer as any).hasStructures === false ? 'Opening Balance' : 'Total Fees') : 'Total Sales'}
                  </div>
                  <div className="text-xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                    ₹{selectedCustomer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-400 overflow-hidden">
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {isSchool ? 'Fees Paid' : 'Total Paid'}
                  </div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ₹{selectedCustomer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-violet-400 overflow-hidden">
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Collection Rate</div>
                  <div className="text-xl font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                    {(() => {
                      // For school: totalSales already represents full expected (structures OR imported balance)
                      // For business: total expected = totalSales + opening_balance
                      const totalExpected = isSchool
                        ? selectedCustomer.totalSales
                        : selectedCustomer.totalSales + Math.max(0, selectedCustomer.opening_balance);
                      return totalExpected > 0
                        ? ((selectedCustomer.totalPaid / totalExpected) * 100).toFixed(1)
                        : '0.0';
                    })()}%
                  </div>
                </CardContent>
              </Card>
              {/* FIX 5 — Single, unambiguous Returns / CR card */}
              <Card className="border-l-4 border-l-amber-400 overflow-hidden">
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Returns / CR</div>
                  {saleReturnsSummary.pending + saleReturnsSummary.partialPending > 0 ? (
                    <>
                      <div className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        ₹{(saleReturnsSummary.pending + saleReturnsSummary.partialPending).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Pending adjustment</div>
                    </>
                  ) : saleReturnsSummary.adjusted > 0 ? (
                    <>
                      <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        ₹{saleReturnsSummary.adjusted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Adjusted ✓</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-bold text-muted-foreground tabular-nums">₹0.00</div>
                      <div className="text-xs text-muted-foreground mt-0.5">No returns</div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Refund shortcut - shows when customer has credit balance */}
            {effectiveBalance < 0 && (
              <div className="mt-3 mb-1 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    ₹{Math.abs(effectiveBalance).toLocaleString("en-IN")} credit balance — refund to customer
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {(selectedCustomer.unusedAdvanceTotal || 0) > 0
                      ? `₹${(selectedCustomer.unusedAdvanceTotal || 0).toLocaleString('en-IN')} from unused advance bookings · remaining is overpayment`
                      : 'Customer has overpaid — process a cash/UPI refund'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(selectedCustomer.unusedAdvanceTotal || 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const orgSlug = window.location.pathname.split('/')[1];
                        window.location.href = `/${orgSlug}/advance-booking-dashboard?search=${encodeURIComponent(selectedCustomer.customer_name || '')}`;
                      }}
                    >
                      <Undo2 className="h-4 w-4 mr-1" />
                      Refund Advance
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-400 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50"
                    disabled={!selectedCustomer?.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setOverpaymentRefundAmount('');
                      setOverpaymentRefundNote('');
                      setOverpaymentRefundMode('cash');
                      setShowOverpaymentRefundDialog(true);
                    }}
                  >
                    <IndianRupee className="h-4 w-4 mr-1" />
                    Refund Overpayment
                  </Button>
                </div>
              </div>
            )}

            <div className="my-4" />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4 h-10 bg-muted/60 rounded-xl p-1">
                <TabsTrigger value="transactions" className="flex items-center gap-2 rounded-lg text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Transactions
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex items-center gap-2 rounded-lg text-sm font-medium">
                  <IndianRupee className="h-4 w-4" />
                  Payment History
                </TabsTrigger>
                <TabsTrigger value="unapplied" className="flex items-center gap-2 rounded-lg text-sm font-medium">
                  <AlertCircle className="h-4 w-4" />
                  Unapplied
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transactions">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-900/60 border-b-2">
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 w-[120px]">Date</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Type</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Reference</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Description</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-red-500">Debit</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-emerald-600">Credit</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-slate-500">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                         transactions.map((transaction) => (
                           <TableRow key={transaction.id} className={cn(
                             transaction.id === 'opening-balance'
                               ? 'bg-orange-50/60 dark:bg-orange-950/20 border-l-4 border-l-orange-400'
                               : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/30',
                             transaction.informational && 'italic text-muted-foreground bg-muted/20'
                           )}>
                            <TableCell>
                              {transaction.id === 'opening-balance'
                                ? <span className="font-bold text-orange-600 dark:text-orange-400 text-sm">B/F Opening</span>
                                : <div>
                                    <div className="text-sm font-medium tabular-nums">
                                      {format(new Date(transaction.date), "dd MMM yyyy")}
                                    </div>
                                    {transaction.timestamp && (
                                      <div className="text-xs text-muted-foreground tabular-nums">
                                        {format(new Date(transaction.timestamp), "hh:mm a")}
                                      </div>
                                    )}
                                  </div>
                              }
                            </TableCell>
                            <TableCell>
                              {transaction.id === 'opening-balance' ? (
                                <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                                  B/F
                                </Badge>
                              ) : (
                                <div className="flex items-center gap-1">
                                  {transaction.type === 'advance' ? (
                                    <Badge className="bg-primary/20 text-primary border-primary/30">
                                      <Wallet className="h-3 w-3 mr-1" /> ADVANCE
                                    </Badge>
                                  ) : transaction.type === 'advance_application' ? (
                                    <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-300 text-xs">
                                      <TrendingUp className="h-3 w-3 mr-1" /> Advance Applied
                                    </Badge>
                                  ) : transaction.type === 'adjustment' ? (
                                    <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30">
                                      ADJ
                                    </Badge>
                                  ) : transaction.type === 'fee' ? (
                                    <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">
                                      <FileText className="h-3 w-3 mr-1" /> FEE
                                    </Badge>
                                  ) : transaction.type === 'return' ? (
                                    <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs">
                                      Sale Return
                                    </Badge>
                                  ) : transaction.type === 'refund' ? (
                                    <Badge className="bg-red-100 text-red-700 border border-red-300 text-xs">
                                      Adv. Refund
                                    </Badge>
                                  ) : transaction.type === 'credit_note' ? (
                                    <Badge className="bg-purple-100 text-purple-700 border border-purple-300 text-xs">
                                      Credit Note
                                    </Badge>
                                  ) : (
                                    <>
                                      {transaction.type === 'invoice' ? (
                                        <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-0 text-xs">
                                          <FileText className="h-3 w-3 mr-1" /> Invoice
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 text-xs">
                                          <IndianRupee className="h-3 w-3 mr-1" /> Payment
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus === 'completed' && (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs ml-1">
                                      ✓ Paid
                                    </Badge>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus !== 'completed' && effectiveBalance < 0 && (
                                    <Badge className="bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] ml-1">
                                      ⚡ Advance available
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                                {transaction.reference}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-muted-foreground">{transaction.description}</div>
                                {transaction.paymentBreakdown && (
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {transaction.paymentBreakdown.cash !== undefined && transaction.paymentBreakdown.cash > 0 && (
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                        Cash: ₹{transaction.paymentBreakdown.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.card !== undefined && transaction.paymentBreakdown.card > 0 && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                        Card: ₹{transaction.paymentBreakdown.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.upi !== undefined && transaction.paymentBreakdown.upi > 0 && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                        UPI: ₹{transaction.paymentBreakdown.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.method && (
                                      <Badge variant="outline" className="text-xs">
                                        {transaction.paymentBreakdown.method.toUpperCase()}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {(() => {
                                const dispDebit = transaction.displayDebit ?? transaction.debit;
                                if (!dispDebit || dispDebit <= 0) return null;
                                return (
                                  <span className={cn(
                                    "text-red-600 dark:text-red-400",
                                    transaction.informational && "italic font-normal"
                                  )}>
                                    ₹{dispDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {(() => {
                                const dispCredit = transaction.displayCredit ?? transaction.credit;
                                if (!dispCredit || dispCredit <= 0) return null;
                                return (
                                  <span className={cn(
                                    "text-emerald-700 dark:text-emerald-300 font-semibold",
                                    transaction.informational && "italic font-normal"
                                  )}>
                                    ₹{dispCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </span>
                                );
                              })()}
                              {transaction.type === 'advance_application' && transaction.credit === 0 && (transaction.appliedAmount || 0) > 0 && (
                                <span className="text-xs italic text-muted-foreground">
                                  (₹{(transaction.appliedAmount || 0).toLocaleString("en-IN")} applied)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={`font-semibold text-sm ${transaction.balance > 0 ? "text-red-600" : transaction.balance < 0 ? "text-green-700" : "text-slate-500"}`}>
                                  ₹{Math.abs(Math.round(transaction.balance)).toLocaleString("en-IN")}
                                </span>
                                {transaction.balance > 0 && <Badge variant="destructive" className="text-[9px] h-4 px-1">Dr</Badge>}
                                {transaction.balance < 0 && <Badge className="text-[9px] h-4 px-1 bg-green-100 text-green-800 border border-green-300">Cr</Badge>}
                                {transaction.balance === 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">Settled</Badge>}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {/* Totals Row */}
                      {transactions.length > 0 && (
                        <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                          <TableCell colSpan={4} className="text-right text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                            Totals
                          </TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">
                            ₹{transactionTotals.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-emerald-700 dark:text-emerald-300 font-semibold">
                            ₹{transactionTotals.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right",
                            transactions[transactions.length - 1].balance > 0 ? "text-red-600 dark:text-red-400" : 
                            transactions[transactions.length - 1].balance < 0 ? "text-emerald-700 dark:text-emerald-300" : 
                            "text-foreground"
                          )}>
                            ₹{Math.abs(transactions[transactions.length - 1].balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Balance Reconciliation Box — derived from rendered transactions */}
                {transactions.length > 0 && (
                  <div className="mt-4 rounded-md border bg-muted/30 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                      Balance Reconciliation
                    </div>
                    <div className="space-y-1.5 text-sm tabular-nums max-w-md">
                      <div className="flex justify-between">
                        <span>Opening Balance</span>
                        <span className="font-medium">₹{Math.round(reconciliation.opening).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>(+) Total Invoiced</span>
                        <span className="font-medium">₹{Math.round(reconciliation.grossInvoiced).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                        <span>(−) Sale Returns</span>
                        <span className="font-medium">₹{Math.round(reconciliation.saleReturns).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1.5">
                        <span className="font-semibold">(=) Net Invoiced</span>
                        <span className="font-semibold">₹{Math.round(reconciliation.netInvoiced).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                        <span>(−) Cash / UPI / Card Payments</span>
                        <span className="font-medium">₹{Math.round(reconciliation.payments).toLocaleString("en-IN")}</span>
                      </div>
                      {reconciliation.advanceCredit > 0 && (
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span>(−) Advance Received</span>
                          <span className="font-medium">₹{Math.round(reconciliation.advanceCredit).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {reconciliation.adjustments !== 0 && (
                        <div className="flex justify-between">
                          <span>(±) Balance Adjustments</span>
                          <span className="font-medium">₹{Math.round(reconciliation.adjustments).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className={cn(
                        "flex justify-between border-t-2 pt-2 mt-2 text-base font-bold",
                        reconciliation.finalBalance > 0 ? "text-red-600 dark:text-red-400" :
                        reconciliation.finalBalance < 0 ? "text-emerald-700 dark:text-emerald-300" :
                        "text-foreground"
                      )}>
                        <span>Outstanding ({reconciliation.finalBalance > 0 ? 'Dr' : reconciliation.finalBalance < 0 ? 'Cr' : 'Settled'})</span>
                        <span>₹{Math.abs(Math.round(reconciliation.finalBalance)).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments">
                {/* Payment Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <Card className="border-l-4 border-l-emerald-500 overflow-hidden">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">Total Received</div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ₹{paymentSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-muted-foreground">{paymentSummary.count} payments</div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-400 overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Banknote className="h-3 w-3" /> Cash
                      </div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ₹{paymentSummary.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-blue-400 overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <CreditCard className="h-3 w-3" /> Card
                      </div>
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        ₹{paymentSummary.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-violet-400 overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Wallet className="h-3 w-3" /> UPI
                      </div>
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        ₹{paymentSummary.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-slate-400 overflow-hidden">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">Recorded Separately</div>
                      <div className="text-lg font-bold">
                        ₹{(paymentSummary.total - paymentSummary.cash - paymentSummary.card - paymentSummary.upi).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-900/60 border-b-2">
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Date</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Voucher No.</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice No.</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice Amount</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-green-600">Cash</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-blue-600">Card</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-violet-600">UPI</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-emerald-600">Total Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!paymentHistory || paymentHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No payment history found
                          </TableCell>
                        </TableRow>
                      ) : (
                        paymentHistory.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {format(new Date(payment.date), "dd MMM yyyy")}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {payment.voucherNumber !== '-' ? (
                                <Badge className="bg-primary/10 text-primary border-primary/20 font-mono text-xs">
                                  {payment.voucherNumber}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">At Sale</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{payment.invoiceNumber}</TableCell>
                            <TableCell>
                              ₹{payment.invoiceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.cash > 0 && (
                                <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                  ₹{payment.cash.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.card > 0 && (
                                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                  ₹{payment.card.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.upi > 0 && (
                                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                  ₹{payment.upi.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                              ₹{payment.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="unapplied">
                {(() => {
                  // Find payments not linked to any specific invoice (reference_type='customer' or unlinked)
                  const unappliedPayments = (paymentHistory || []).filter(p => 
                    p.source === 'opening_balance' || p.invoiceNumber === 'Opening Balance'
                  );
                  
                  // Also find voucher entries with reference_type='customer' (opening balance payments)
                  const unappliedVouchers = transactions?.filter(t => 
                    t.type === 'payment' && t.credit > 0 && 
                    (t.description?.includes('Opening balance') || t.description?.includes('Opening Balance'))
                  ) || [];

                  // Find invoices with advance available but showing as pending
                  const pendingInvoicesWithAdvance = transactions?.filter(t => 
                    t.type === 'invoice' && t.debit > 0 && t.id !== 'opening-balance' && 
                    t.paymentStatus !== 'completed'
                  ) || [];

                  const hasAdvanceBalance = effectiveBalance < 0;
                  const advanceAmount = hasAdvanceBalance ? Math.abs(effectiveBalance) : 0;

                  return (
                    <div className="space-y-4">
                      {/* Advance balance warning */}
                      {hasAdvanceBalance && pendingInvoicesWithAdvance.length > 0 && (
                        <div className="p-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-900 dark:text-amber-100">
                                Advance Balance: ₹{Math.round(advanceAmount).toLocaleString('en-IN')} — {pendingInvoicesWithAdvance.length} invoice(s) pending
                              </p>
                              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                This customer has advance balance that can be allocated to pending invoices. Go to Accounts → Customer Payment to apply.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Unapplied opening balance payments */}
                      {unappliedPayments.length > 0 ? (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead className="text-xs font-bold uppercase">Date</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Reference</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Description</TableHead>
                                <TableHead className="text-right text-xs font-bold uppercase">Amount</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {unappliedPayments.map(payment => (
                                <TableRow key={payment.id}>
                                  <TableCell className="text-sm">{format(new Date(payment.date), 'dd MMM yyyy')}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="font-mono text-xs">{payment.voucherNumber}</Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{payment.description}</TableCell>
                                  <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                                    ₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className="bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                      Not Linked to Invoice
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : !hasAdvanceBalance ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">No unapplied payments</p>
                          <p className="text-xs mt-1">All payments are linked to specific invoices ✅</p>
                        </div>
                      ) : null}

                      {/* Pending invoices that could use advance */}
                      {pendingInvoicesWithAdvance.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Pending Invoices — Advance Available
                          </h4>
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/40">
                                  <TableHead className="text-xs font-bold uppercase">Date</TableHead>
                                  <TableHead className="text-xs font-bold uppercase">Invoice</TableHead>
                                  <TableHead className="text-right text-xs font-bold uppercase">Amount</TableHead>
                                  <TableHead className="text-xs font-bold uppercase">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pendingInvoicesWithAdvance.map(inv => (
                                  <TableRow key={inv.id}>
                                    <TableCell className="text-sm">{format(new Date(inv.date), 'dd MMM yyyy')}</TableCell>
                                    <TableCell>
                                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{inv.reference}</span>
                                    </TableCell>
                                    <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                                      ₹{Math.round(inv.debit).toLocaleString('en-IN')}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1.5">
                                        <Badge variant={inv.paymentStatus === 'partial' ? 'secondary' : 'destructive'} className="text-xs">
                                          {inv.paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                                        </Badge>
                                        {hasAdvanceBalance && (
                                          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                                            Advance available
                                          </Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        {customerForHistory && (
          <CustomerHistoryDialog
            open={showCustomerHistory}
            onOpenChange={setShowCustomerHistory}
            customerId={customerForHistory.id}
            customerName={customerForHistory.name}
            organizationId={organizationId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-blue-500 overflow-hidden"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isSchool ? 'Total Students' : 'Total Customers'}
                </p>
                <div className="text-3xl font-bold text-blue-700 dark:text-blue-300 tabular-nums mt-1">
                  {summary.totalCustomers}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSchool ? 'Active student accounts' : 'Active customer accounts'}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-red-500 overflow-hidden"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isSchool ? 'Total Fees Due' : 'Total Outstanding'}
                </p>
                <div className="text-3xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-1">
                  ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSchool ? 'Fees pending collection' : 'Amount pending collection'}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-emerald-500 overflow-hidden"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isSchool ? 'Total Fees Charged' : 'Total Receivable'}
                </p>
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
                  ₹{summary.totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSchool ? 'Total fees value' : 'Total sales value'}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            {isSchool ? 'Student Account Ledger' : 'Customer Ledger'}
          </CardTitle>
          <CardDescription>
            {isSchool ? 'View detailed fee and payment history for each student' : 'View detailed transaction history for each customer'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="advance">Advance</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate || paymentStatusFilter !== "all") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setPaymentStatusFilter("all");
                }}
                className="w-full md:w-auto"
              >
                Clear Filters
              </Button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handleExportCustomerListExcel}>
                <Download className="mr-2 h-4 w-4" />
                {isMobile ? "Excel" : "Export Excel"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCustomerListPDF}>
                <FileDown className="mr-2 h-4 w-4" />
                {isMobile ? "PDF" : "Export PDF"}
              </Button>
            </div>
          </div>

          {/* Mobile Card View */}
          {isMobile ? (
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center text-muted-foreground py-8">
                  Loading customers...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No customers found
                </div>
              ) : (
                paginatedCustomers.map((customer) => (
                  <Card 
                    key={customer.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base">
                            <button
                              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-semibold text-base"
                              onClick={(e) => {
                                e.stopPropagation();
                                openHistory(customer.id, customer.customer_name);
                              }}
                            >
                              {customer.customer_name}
                            </button>
                          </h3>
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                        {customer.balance > 0 && (
                          <Badge variant="destructive" className="ml-2">Outstanding</Badge>
                        )}
                        {customer.balance < 0 && (
                          <Badge variant="default" className="bg-green-600 ml-2">Advance</Badge>
                        )}
                        {customer.balance === 0 && (
                          <Badge variant="outline" className="ml-2">Settled</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">{isSchool ? 'Fees' : 'Sales'}</div>
                          <div className="font-medium text-sm">₹{customer.totalSales.toLocaleString("en-IN")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Paid</div>
                          <div className="font-medium text-sm text-green-600 dark:text-green-400">₹{customer.totalPaid.toLocaleString("en-IN")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Balance</div>
                          <div className={cn(
                            "font-bold text-sm",
                            customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                            customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                            "text-foreground"
                          )}>
                            ₹{Math.abs(customer.balance).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomer(customer);
                          }}
                        >
                          View Ledger
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            /* Desktop Table View */
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isSchool ? 'Student Name' : 'Customer Name'}</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">{isSchool ? 'Total Fees' : 'Total Sales'}</TableHead>
                    <TableHead className="text-right">{isSchool ? 'Fees Paid' : 'Total Paid'}</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading customers...
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No customers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <TableRow 
                        key={customer.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <TableCell className="font-medium">
                          <button
                            className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              openHistory(customer.id, customer.customer_name);
                            }}
                          >
                            {customer.customer_name}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {customer.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{customer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          ₹{customer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                          customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                          "text-foreground"
                        )}>
                          ₹{Math.abs(customer.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {customer.balance > 0 && (
                            <Badge variant="destructive">Outstanding</Badge>
                          )}
                          {customer.balance < 0 && (
                            <Badge variant="default" className="bg-green-600">Advance</Badge>
                          )}
                          {customer.balance === 0 && (
                            <Badge variant="outline">Settled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(customer);
                            }}
                          >
                            View Ledger
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">
                Showing {customerPage * CUSTOMERS_PER_PAGE + 1}–{Math.min((customerPage + 1) * CUSTOMERS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={customerPage === 0}
                  onClick={() => setCustomerPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {customerPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={customerPage >= totalPages - 1}
                  onClick={() => setCustomerPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {customerForHistory && (
        <CustomerHistoryDialog
          open={showCustomerHistory}
          onOpenChange={setShowCustomerHistory}
          customerId={customerForHistory.id}
          customerName={customerForHistory.name}
          organizationId={organizationId}
        />
      )}

      {/* Overpayment Refund Dialog */}
      <Dialog open={showOverpaymentRefundDialog} onOpenChange={setShowOverpaymentRefundDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund Overpayment</DialogTitle>
            <DialogDescription>
              Record a cash/UPI refund to {selectedCustomer?.customer_name} for ₹{Math.abs(selectedCustomer?.balance || 0).toLocaleString('en-IN')} overpaid balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Refund Amount (₹)</Label>
              <Input
                type="number"
                value={overpaymentRefundAmount}
                onChange={(e) => setOverpaymentRefundAmount(e.target.value)}
                placeholder={Math.abs(selectedCustomer?.balance || 0).toString()}
                className="no-uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Max refundable: ₹{Math.abs(selectedCustomer?.balance || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={overpaymentRefundMode} onValueChange={setOverpaymentRefundMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Textarea
                value={overpaymentRefundNote}
                onChange={(e) => setOverpaymentRefundNote(e.target.value)}
                placeholder="Reason for refund..."
                rows={2}
                className="no-uppercase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverpaymentRefundDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isProcessingRefund || !overpaymentRefundAmount || parseFloat(overpaymentRefundAmount) <= 0}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!selectedCustomer || !organizationId) {
                  toast.error("No customer selected");
                  return;
                }
                const amount = parseFloat(overpaymentRefundAmount);
                if (!amount || amount <= 0) {
                  toast.error("Please enter a valid refund amount");
                  return;
                }
                setIsProcessingRefund(true);
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  const voucherNum = `REFUND-${Date.now()}`;
                  const { error } = await supabase
                    .from('voucher_entries')
                    .insert({
                      organization_id: organizationId,
                      voucher_type: 'payment',
                      voucher_number: voucherNum,
                      voucher_date: new Date().toISOString().split('T')[0],
                      reference_type: 'customer',
                      reference_id: selectedCustomer.id,
                      total_amount: amount,
                      payment_method: overpaymentRefundMode,
                      description: overpaymentRefundNote || `Overpayment refund to ${selectedCustomer.customer_name}`,
                      created_by: user?.id || null,
                    });
                  if (error) throw error;
                  toast.success(`Refund of ₹${amount.toLocaleString('en-IN')} recorded successfully`);
                  setShowOverpaymentRefundDialog(false);
                  setOverpaymentRefundAmount('');
                  setOverpaymentRefundNote('');
                  queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
                  queryClient.invalidateQueries({ queryKey: ['customer-balance'] });
                  queryClient.invalidateQueries({ queryKey: ['customer-transactions'] });
                  queryClient.invalidateQueries({ queryKey: ['customers-with-balance'] });
                } catch (err: any) {
                  console.error('Refund error:', err);
                  toast.error(`Refund failed: ${err.message || 'Unknown error'}`);
                } finally {
                  setIsProcessingRefund(false);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isProcessingRefund ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : 'Record Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
