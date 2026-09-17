import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from "date-fns";
import { ArrowLeft, CalendarIcon, Printer, IndianRupee, Clock, Receipt, TrendingDown, FileSpreadsheet, FileText, Banknote, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, Wallet } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export ΓÇö keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import type jsPDFType from "jspdf";
/** Lazily loaded on export ΓÇö keeps jsPDF/html2canvas off this page's initial chunk. */
let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> =>
  (jsPdfPromise ??= import("jspdf").then((m) => m.default));

import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { addDays, subDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { QuietRefreshBar } from "@/components/QuietRefreshBar";
import { localDayBounds } from "@/lib/localDayBounds";
import {
  getSaleReportLineDiscountAmount,
  getSaleReportGrossAmount,
  getSaleReportNetAmount,
  getSaleReportRoundOff,
} from "@/utils/cashierReportUtils";
import {
  buildCashierReceiptModeMap,
  getCashierSalePaymentModeAmounts,
  sumCashierModeAmounts,
  toCashierOverlapSaleRow,
} from "@/utils/cashierSaleModeAmounts";
import {
  computeCashierActualNetReceivable,
  createSameDaySaleReceiptOverlapTracker,
  sumCustomerAdvanceTenders,
} from "@/utils/posCashierCashIn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  aggregateCashTallyDrawerFlows,
  computeExpectedDrawerCash,
} from "@/utils/cashTallyExpectedDrawer";
import { LazyFloatingCashTally } from "@/components/lazyFloatingWidgets";

type PeriodType = "daily" | "monthly" | "quarterly";

const DailyCashierReport = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  // Calendar-day default ΓÇö query keys use YMD strings (not raw Date) so remount reuses cache.
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [salesCreditOpen, setSalesCreditOpen] = useState(true);
  const [otherMoneyOpen, setOtherMoneyOpen] = useState(false);
  const [cashTallyOpen, setCashTallyOpen] = useState(false);

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.dailyCashierReport,
    currentOrganization?.id,
    useMemo(() => ({ selectedDate, period }), [selectedDate, period]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [["period", (v) => setPeriod(v as PeriodType)]],
        requiredDates: [["selectedDate", setSelectedDate]],
      });
    },
  );

  const cashierFiltersDirty =
    format(selectedDate, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd") ||
    period !== "daily";

  const resetCashierFilters = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setPeriod("daily");
    clearPersistedFilters();
  };

  // Calculate date range based on period
  const getDateRange = () => {
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case "monthly":
        startDate = startOfMonth(selectedDate);
        endDate = endOfMonth(selectedDate);
        break;
      case "quarterly":
        startDate = startOfQuarter(selectedDate);
        endDate = endOfQuarter(selectedDate);
        break;
      default: // daily
        startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  };

  const { startDate, endDate } = getDateRange();
  const rangeStartYmd = format(startDate, "yyyy-MM-dd");
  const rangeEndYmd = format(endDate, "yyyy-MM-dd");

  // Fetch sales ΓÇö same local-day bounds as Floating POS cashier (includes early-morning POS bills)
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["cashier-report-sales-v2", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { startIso, endIso } = localDayBounds(rangeStartYmd, rangeEndYmd);
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sale_date, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, round_off, net_amount, paid_amount, cash_amount, card_amount, upi_amount, payment_method, payment_status, sale_return_adjust, refund_amount, sale_type, is_cancelled"
        )
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startIso)
        .lte("sale_date", endIso)
        .is("deleted_at", null);

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30_000,
  });

  // Fetch payment receipts (RCP) for selected period using range pagination
  const { data: receiptData, isLoading: receiptsLoading } = useQuery({
    queryKey: ["cashier-report-receipts", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      const { fetchAllVouchersWithFilters } = await import("@/utils/fetchAllRows");
      const allReceipts = await fetchAllVouchersWithFilters(currentOrganization.id, {
        startDate: startDateStr,
        endDate: endDateStr,
        voucherType: "receipt",
      });
      
      return allReceipts;
    },
    enabled: !!currentOrganization?.id,
  });

  // POS / Accounts advance bookings — not voucher_entries, so RCP queries miss them
  const { data: advancesData, isLoading: advancesLoading } = useQuery({
    queryKey: ["cashier-report-advances-range", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("customer_advances")
        .select("id, amount, payment_method, advance_date")
        .eq("organization_id", currentOrganization.id)
        .gte("advance_date", rangeStartYmd)
        .lte("advance_date", rangeEndYmd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Full-day voucher set for Expected drawer cash (same inputs as FloatingCashTally)
  const { data: drawerVouchersData, isLoading: drawerVouchersLoading } = useQuery({
    queryKey: ["cashier-report-drawer-vouchers", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("voucher_entries")
        .select(
          "id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, reference_id, category, payment_method",
        )
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("voucher_date", rangeStartYmd)
        .lte("voucher_date", rangeEndYmd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: drawerSaleReturnsData, isLoading: drawerSaleReturnsLoading } = useQuery({
    queryKey: ["cashier-report-drawer-sale-returns", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      try {
        const { data, error } = await supabase
          .from("sale_returns")
          .select("id, net_amount, return_date, refund_type")
          .eq("organization_id", currentOrganization.id)
          .gte("return_date", rangeStartYmd)
          .lte("return_date", rangeEndYmd)
          .is("deleted_at", null);
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: drawerAdvanceRefundsData, isLoading: drawerAdvanceRefundsLoading } = useQuery({
    queryKey: ["cashier-report-drawer-advance-refunds", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      try {
        const { data, error } = await supabase
          .from("advance_refunds")
          .select("id, refund_amount, payment_method, refund_date")
          .eq("organization_id", currentOrganization.id)
          .gte("refund_date", rangeStartYmd)
          .lte("refund_date", rangeEndYmd);
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!currentOrganization?.id,
  });

  // Opening float — same snapshot FloatingCashTally uses (Daily view only)
  const drawerOpeningDateYmd = period === "daily" ? rangeStartYmd : null;
  const drawerYesterdayYmd = useMemo(() => {
    if (!drawerOpeningDateYmd) return null;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    return format(d, "yyyy-MM-dd");
  }, [drawerOpeningDateYmd, selectedDate]);

  const { data: drawerDaySnapshot } = useQuery({
    queryKey: ["cashier-report-drawer-snapshot", currentOrganization?.id, drawerOpeningDateYmd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("opening_cash, leave_in_drawer, physical_cash")
        .eq("organization_id", currentOrganization!.id)
        .eq("tally_date", drawerOpeningDateYmd!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && !!drawerOpeningDateYmd,
  });

  const { data: drawerYesterdaySnapshot } = useQuery({
    queryKey: ["cashier-report-drawer-snapshot", currentOrganization?.id, drawerYesterdayYmd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("physical_cash, leave_in_drawer")
        .eq("organization_id", currentOrganization!.id)
        .eq("tally_date", drawerYesterdayYmd!)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!currentOrganization?.id && !!drawerYesterdayYmd && !drawerDaySnapshot,
  });

  // Fetch student fee collections for selected period (school ERP)
  const { data: feeCollectionData, isLoading: feesLoading } = useQuery({
    queryKey: ["cashier-report-fee-collections", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      try {
        const { data, error } = await supabase
          .from("student_fees")
          .select("id, paid_amount, paid_date, payment_method, payment_receipt_id, students!inner(student_name)")
          .eq("organization_id", currentOrganization.id)
          .gte("paid_date", startDateStr + "T00:00:00")
          .lte("paid_date", endDateStr + "T23:59:59")
          .in("status", ["paid", "partial"]);
        if (error) { console.error("Fee collection query error:", error); return []; }
        return data || [];
      } catch (e) { console.error("Fee collection query failed:", e); return []; }
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch cash refund sale returns for selected period
  const { data: cashRefundData, isLoading: refundsLoading } = useQuery({
    queryKey: ["cashier-report-cash-refunds", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      try {
        const { data, error } = await supabase
          .from("sale_returns")
          .select("id, net_amount, return_date, refund_type")
          .eq("organization_id", currentOrganization.id)
          .eq("refund_type", "cash_refund")
          .gte("return_date", startDateStr)
          .lte("return_date", endDateStr)
          .is("deleted_at", null);

        if (error) {
          console.error("Cash refund query error:", error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.error("Cash refund query failed:", e);
        return [];
      }
    },
    enabled: !!currentOrganization?.id,
  });

  // Customer overpayment / CN cash refunds (payment vouchers) ΓÇö drawer outflow by mode
  const { data: customerRefundVouchers, isLoading: customerRefundsLoading } = useQuery({
    queryKey: ["cashier-report-customer-refunds", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const startDateStr = format(startDate, "yyyy-MM-dd");
      const endDateStr = format(endDate, "yyyy-MM-dd");
      try {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, payment_method, description, reference_type",
          )
          .eq("organization_id", currentOrganization.id)
          .eq("voucher_type", "payment")
          .eq("reference_type", "customer")
          .gte("voucher_date", startDateStr)
          .lte("voucher_date", endDateStr)
          .is("deleted_at", null);
        if (error) {
          console.error("Customer refund voucher query error:", error);
          return [];
        }
        const { isPosExchangeRefundPaymentVoucher } = await import("@/utils/saleSettlement");
        const { isAdvanceRefundPaymentVoucher } = await import("@/utils/advanceRefundVoucher");
        const { isSaleReturnRefundPaymentVoucher } = await import("@/utils/cashierSaleReturnRefunds");
        return (data || []).filter(
          (v) =>
            !isPosExchangeRefundPaymentVoucher(v) &&
            !isAdvanceRefundPaymentVoucher(v) &&
            !isSaleReturnRefundPaymentVoucher(v),
        );
      } catch (e) {
        console.error("Customer refund voucher query failed:", e);
        return [];
      }
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch expense vouchers for selected period
  const { data: expenseData, isLoading: expensesLoading } = useQuery({
    queryKey: ["cashier-report-expenses", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      try {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("id, total_amount, payment_method, category, description")
          .eq("organization_id", currentOrganization.id)
          .eq("voucher_type", "expense")
          .gte("voucher_date", startDateStr)
          .lte("voucher_date", endDateStr)
          .is("deleted_at", null);
        if (error) { console.error("Expense query error:", error); return []; }
        return data || [];
      } catch (e) { console.error("Expense query failed:", e); return []; }
    },
    enabled: !!currentOrganization?.id,
  });

  // Third-party cash/bank outflows (payment vouchers — separate from shop expenses)
  const { data: thirdPartyOutflowData, isLoading: thirdPartyOutflowLoading } = useQuery({
    queryKey: ["cashier-report-third-party", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const startDateStr = format(startDate, "yyyy-MM-dd");
      const endDateStr = format(endDate, "yyyy-MM-dd");
      try {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("id, total_amount, payment_method, description")
          .eq("organization_id", currentOrganization.id)
          .eq("voucher_type", "payment")
          .eq("reference_type", "third_party")
          .gte("voucher_date", startDateStr)
          .lte("voucher_date", endDateStr)
          .is("deleted_at", null);
        if (error) {
          console.error("Third-party outflow query error:", error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.error("Third-party outflow query failed:", e);
        return [];
      }
    },
    enabled: !!currentOrganization?.id,
  });

  const isLoading = salesLoading || receiptsLoading || refundsLoading || customerRefundsLoading || feesLoading || expensesLoading || thirdPartyOutflowLoading || advancesLoading || drawerVouchersLoading || drawerSaleReturnsLoading || drawerAdvanceRefundsLoading;

  const { data: settings } = useSettings();

  // Calculate totals including payment receipts
  const calculateTotals = () => {
    const hasNoData =
      (!salesData || salesData.length === 0) &&
      (!receiptData || receiptData.length === 0) &&
      (!advancesData || advancesData.length === 0) &&
      (!cashRefundData || cashRefundData.length === 0) &&
      (!customerRefundVouchers || customerRefundVouchers.length === 0);
    
    if (hasNoData) {
      return {
        grossSale: 0,
        totalDiscount: 0,
        totalRoundOff: 0,
        totalSRAdjusted: 0,
        totalSale: 0,
        netReceivable: 0,
        cashSale: 0,
        cardSale: 0,
        upiSale: 0,
        creditSale: 0,
        totalPaid: 0,
        totalBalance: 0,
        totalRefund: 0,
        totalBills: 0,
        cashBills: 0,
        cardBills: 0,
        upiBills: 0,
        creditBills: 0,
        mixBills: 0,
        mixPaymentSale: 0,
        // Receipt collections
        rcpCashCollection: 0,
        rcpUpiCollection: 0,
        rcpCardCollection: 0,
        rcpOtherCollection: 0,
        rcpTotalCollection: 0,
        rcpCount: 0,
        oldBalanceReceiptTotal: 0,
        oldBalanceReceiptCount: 0,
        actualNetReceivable: 0,
        // Cash refunds from sale returns + customer overpayment/CN payment vouchers
        cashRefundTotal: 0,
        cashRefundCount: 0,
        customerRefundCash: 0,
        customerRefundUpi: 0,
        customerRefundCard: 0,
        customerRefundOther: 0,
        customerRefundTotal: 0,
        customerRefundCount: 0,
        advanceReceived: 0,
        advanceCash: 0,
        advanceUpi: 0,
        advanceCard: 0,
        advanceCount: 0,
      };
    }

    let grossSale = 0;
    let totalDiscount = 0;
    let totalRoundOff = 0;
    let totalSRAdjusted = 0;
    let totalSale = 0;
    let cashSale = 0;
    let cardSale = 0;
    let upiSale = 0;
    let creditSale = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let totalRefund = 0;
    let cashBills = 0;
    let cardBills = 0;
    let upiBills = 0;
    let creditBills = 0;
    let mixBills = 0;
    let mixPaymentSale = 0;

    const receiptModeBySale = buildCashierReceiptModeMap(
      (salesData || [])
        .filter((s: any) => s?.id)
        .map((s: any) => ({
          id: s.id as string,
          sale_number: s.sale_number,
          customer_id: s.customer_id,
          net_amount: s.net_amount,
          sale_return_adjust: s.sale_return_adjust,
        })),
      (receiptData || []).map((r: any) => ({
        reference_id: r.reference_id,
        reference_type: r.reference_type,
        total_amount: r.total_amount,
        discount_amount: r.discount_amount,
        payment_method: r.payment_method,
        description: r.description,
      })),
    );

    const displayModesBySaleId = new Map<
      string,
      ReturnType<typeof getCashierSalePaymentModeAmounts>
    >();

    const isHoldLikeSale = (sale: any) => {
      if (sale?.payment_status === "hold") return true;
      return sale?.payment_status === "pending" && String(sale?.sale_number || "").startsWith("Hold/");
    };

    const getEffectiveNet = (sale: any) => getSaleReportNetAmount(sale);

    const eligibleSales = (salesData || []).filter((sale: any) => {
      if (sale?.is_cancelled) return false;
      if (sale?.payment_status === "cancelled") return false;
      return !isHoldLikeSale(sale);
    });

    // Process sales data
    if (eligibleSales.length) {
      eligibleSales.forEach((sale) => {
        // NOTE: Refund-only sales (negative net_amount from S/R Adjust > bill) are
        // INCLUDED here. Their cash_amount/upi_amount/card_amount are stored as
        // NEGATIVE on the sale row, so they naturally subtract from cashSale/upiSale/
        // cardSale below ΓÇö no separate "Less: Refund" subtraction is needed.
        grossSale += getSaleReportGrossAmount(sale);
        // Discount-only (POS / NPA convention). Round-off is a separate line.
        totalDiscount += getSaleReportLineDiscountAmount(sale);
        totalRoundOff += getSaleReportRoundOff(sale);
        totalSRAdjusted += Number(sale.sale_return_adjust) || 0;
        const effectiveNet = getEffectiveNet(sale);
        totalSale += effectiveNet;

        const paidAmount = Number(sale.paid_amount) || 0;
        const refundAmt = Number(sale.refund_amount) || 0;
        // Balance Pending uses reported net (includes round-off; corrects inverted-sign rows).
        const balance = effectiveNet - paidAmount;
        const netAmount = effectiveNet;
        
        totalPaid += paidAmount;
        totalBalance += balance;
        totalRefund += refundAmt;

        const receiptModes = sale.id ? receiptModeBySale.get(sale.id) : undefined;
        const displayModes = getCashierSalePaymentModeAmounts(sale, receiptModes);
        if (sale.id) {
          displayModesBySaleId.set(sale.id, displayModes);
        }

        if (sale.payment_method === "multiple") {
          cashSale += displayModes.cash;
          cardSale += displayModes.card;
          upiSale += displayModes.upi;
          mixPaymentSale += sumCashierModeAmounts(displayModes);
          mixBills++;
        } else if (sale.payment_method === "pay_later") {
          creditSale += netAmount;
          creditBills++;
        } else {
          cashSale += displayModes.cash;
          cardSale += displayModes.card;
          upiSale += displayModes.upi;
          switch (sale.payment_method) {
            case "cash":
              cashBills++;
              break;
            case "card":
              cardBills++;
              break;
            case "upi":
              upiBills++;
              break;
            default:
              cashBills++;
          }
        }
      });
    }

    // Process receipt data (RCP) - use actual voucher payment_method first, then fallback to description.
    // Strip same-day sale RCP already covered by tenders (historical POS Dashboard dual-write).
    let rcpCashCollection = 0;
    let rcpUpiCollection = 0;
    let rcpCardCollection = 0;
    let rcpOtherCollection = 0;

    const receiptOverlap = createSameDaySaleReceiptOverlapTracker(
      (salesData || [])
        .filter(
          (s: any) =>
            s?.id &&
            !s?.is_cancelled &&
            s?.payment_status !== "cancelled" &&
            !(
              s?.payment_status === "hold" ||
              (s?.payment_status === "pending" && String(s?.sale_number || "").startsWith("Hold/"))
            ),
        )
        .map((s: any) => {
          const displayModes =
            displayModesBySaleId.get(s.id) ??
            getCashierSalePaymentModeAmounts(
              s,
              receiptModeBySale.get(s.id),
            );
          return toCashierOverlapSaleRow(s, displayModes);
        }),
      (receiptData || []).map((r: any) => ({
        voucher_type: "receipt",
        reference_type: r.reference_type,
        reference_id: r.reference_id,
        total_amount: r.total_amount,
      })),
    );
    
    if (receiptData) {
      receiptData.forEach((receipt) => {
        const amount = receiptOverlap.countableAmount({
          voucher_type: "receipt",
          reference_type: receipt.reference_type,
          reference_id: receipt.reference_id,
          total_amount: receipt.total_amount,
        });
        if (amount <= 0) return;
        const method = (receipt.payment_method || "").toLowerCase().trim();
        const desc = (receipt.description || '').toLowerCase();

        // Primary source: explicit payment_method stored on voucher entry.
        if (method === "upi") {
          rcpUpiCollection += amount;
        } else if (method === "card") {
          rcpCardCollection += amount;
        } else if (method === "cash") {
          rcpCashCollection += amount;
        } else if (method.includes("bank") || method === "cheque" || method === "other") {
          rcpOtherCollection += amount;
        // Fallback for legacy receipts where payment_method was not stored.
        } else if (desc.includes('upi')) {
          rcpUpiCollection += amount;
        } else if (desc.includes('card')) {
          rcpCardCollection += amount;
        } else if (desc.includes('cheque') || desc.includes('bank') || desc.includes('transfer')) {
          rcpOtherCollection += amount;
        } else {
          // Final fallback: treat as cash.
          rcpCashCollection += amount;
        }
      });
    }

    const rcpTotalCollection = rcpCashCollection + rcpUpiCollection + rcpCardCollection + rcpOtherCollection;

    // Process student fee collections
    let feeCashCollection = 0;
    let feeUpiCollection = 0;
    let feeCardCollection = 0;
    let feeBankCollection = 0;
    let feeTotalCollection = 0;
    
    if (feeCollectionData) {
      feeCollectionData.forEach((fee: any) => {
        const amount = Number(fee.paid_amount) || 0;
        const method = (fee.payment_method || '').toLowerCase();
        if (method === 'upi') feeUpiCollection += amount;
        else if (method === 'card') feeCardCollection += amount;
        else if (method === 'bank transfer') feeBankCollection += amount;
        else feeCashCollection += amount;
      });
      feeTotalCollection = feeCashCollection + feeUpiCollection + feeCardCollection + feeBankCollection;
    }

    // Calculate cash refund total from sale returns (refund_type=cash_refund)
    let cashRefundTotal = 0;
    if (cashRefundData) {
      cashRefundData.forEach((refund: any) => {
        cashRefundTotal += Number(refund.net_amount) || 0;
      });
    }

    // Customer overpayment / pending-CN refunds paid from drawer (by payment mode)
    let customerRefundCash = 0;
    let customerRefundUpi = 0;
    let customerRefundCard = 0;
    let customerRefundOther = 0;
    if (customerRefundVouchers) {
      customerRefundVouchers.forEach((v: any) => {
        const amt = Number(v.total_amount) || 0;
        const method = String(v.payment_method || "cash").toLowerCase().trim();
        if (method === "upi") customerRefundUpi += amt;
        else if (method === "card" || method === "bank" || method === "cheque") customerRefundCard += amt;
        else if (method === "cash" || !method) customerRefundCash += amt;
        else customerRefundOther += amt;
      });
    }
    const customerRefundTotal =
      customerRefundCash + customerRefundUpi + customerRefundCard + customerRefundOther;
    // Keep legacy cashRefundTotal as S/R cash_refund rows + cash-mode customer refunds
    // so Net Cash Collection subtracts drawer cash outflows.
    cashRefundTotal += customerRefundCash;

    // Calculate expense totals by payment method and category
    let expenseCash = 0;
    let expenseUpi = 0;
    let expenseCard = 0;
    let expenseOther = 0;
    const expenseByCategory: Record<string, { cash: number; upi: number; card: number; other: number; total: number }> = {};

    if (expenseData) {
      expenseData.forEach((exp: any) => {
        const amt = Number(exp.total_amount) || 0;
        const method = (exp.payment_method || "cash").toLowerCase();
        const cat = exp.category || exp.description || "Miscellaneous";

        if (!expenseByCategory[cat]) expenseByCategory[cat] = { cash: 0, upi: 0, card: 0, other: 0, total: 0 };
        expenseByCategory[cat].total += amt;

        if (method === "cash") { expenseCash += amt; expenseByCategory[cat].cash += amt; }
        else if (method === "upi") { expenseUpi += amt; expenseByCategory[cat].upi += amt; }
        else if (method === "card") { expenseCard += amt; expenseByCategory[cat].card += amt; }
        else { expenseOther += amt; expenseByCategory[cat].other += amt; }
      });
    }
    const expenseTotal = expenseCash + expenseUpi + expenseCard + expenseOther;

    let thirdPartyOutflowCash = 0;
    let thirdPartyOutflowUpi = 0;
    let thirdPartyOutflowCard = 0;
    let thirdPartyOutflowOther = 0;
    if (thirdPartyOutflowData) {
      thirdPartyOutflowData.forEach((row: any) => {
        const amt = Number(row.total_amount) || 0;
        const method = (row.payment_method || "cash").toLowerCase();
        if (method === "cash") thirdPartyOutflowCash += amt;
        else if (method === "upi") thirdPartyOutflowUpi += amt;
        else if (method === "card") thirdPartyOutflowCard += amt;
        else thirdPartyOutflowOther += amt;
      });
    }
    const thirdPartyOutflowTotal =
      thirdPartyOutflowCash + thirdPartyOutflowUpi + thirdPartyOutflowCard + thirdPartyOutflowOther;

    // Net Receivable = Net Sale (net_amount already includes S/R deduction from POS save logic)
    const netReceivable = totalSale;

    const receivableTotals = computeCashierActualNetReceivable({
      sales: eligibleSales.map((sale: any) => ({
        id: sale.id as string,
        net_amount: sale.net_amount,
        paid_amount: sale.paid_amount,
        cash_amount: sale.cash_amount,
        card_amount: sale.card_amount,
        upi_amount: sale.upi_amount,
        payment_status: sale.payment_status,
        sale_number: sale.sale_number,
        is_cancelled: sale.is_cancelled,
      })),
      receipts: (receiptData || []).map((r: any) => ({
        voucher_type: "receipt",
        total_amount: r.total_amount,
        payment_method: r.payment_method,
        description: r.description,
        reference_type: r.reference_type,
        reference_id: r.reference_id,
      })),
      resolveNet: (sale) => getSaleReportNetAmount(sale),
      feeTotal: feeTotalCollection,
    });

    const advanceTenders = sumCustomerAdvanceTenders(advancesData || []);

    return {
      grossSale,
      totalDiscount,
      totalRoundOff,
      totalSRAdjusted,
      totalSale,
      netReceivable,
      cashSale,
      cardSale,
      upiSale,
      creditSale,
      totalPaid,
      totalBalance,
      totalRefund,
      totalBills: eligibleSales.length,
      cashBills,
      cardBills,
      upiBills,
      creditBills,
      mixBills,
      mixPaymentSale,
      // Receipt collections
      rcpCashCollection,
      rcpUpiCollection,
      rcpCardCollection,
      rcpOtherCollection,
      rcpTotalCollection,
      rcpCount: receiptData?.length || 0,
      oldBalanceReceiptTotal: receivableTotals.oldBalanceReceiptTotal,
      oldBalanceReceiptCount: receivableTotals.oldBalanceReceiptCount,
      actualNetReceivable: receivableTotals.actualNetReceivable,
      // Cash refunds (S/R cash_refund rows + customer overpayment/CN cash vouchers)
      cashRefundTotal,
      cashRefundCount:
        (cashRefundData?.length || 0) +
        (customerRefundVouchers || []).filter((v: any) => {
          const m = String(v.payment_method || "cash").toLowerCase();
          return m === "cash" || !m;
        }).length,
      customerRefundCash,
      customerRefundUpi,
      customerRefundCard,
      customerRefundOther,
      customerRefundTotal,
      customerRefundCount: customerRefundVouchers?.length || 0,
      // Student fee collections
      feeCashCollection,
      feeUpiCollection,
      feeCardCollection,
      feeBankCollection,
      feeTotalCollection,
      feeCount: feeCollectionData?.length || 0,
      // Expense outflows
      expenseCash,
      expenseUpi,
      expenseCard,
      expenseOther,
      expenseTotal,
      expenseByCategory,
      expenseCount: expenseData?.length || 0,
      thirdPartyOutflowCash,
      thirdPartyOutflowUpi,
      thirdPartyOutflowCard,
      thirdPartyOutflowOther,
      thirdPartyOutflowTotal,
      thirdPartyOutflowCount: thirdPartyOutflowData?.length || 0,
      advanceReceived: advanceTenders.advanceReceived,
      advanceCash: advanceTenders.advanceCash,
      advanceUpi: advanceTenders.advanceUpi,
      advanceCard: advanceTenders.advanceCard,
      advanceCount: advancesData?.length || 0,
    };
  };

  const totals = calculateTotals();

  // Expected cash in drawer — same identity as FloatingCashTally (do not reimplement).
  const drawerOpeningCash = useMemo(() => {
    if (period !== "daily") return 0;
    if (drawerDaySnapshot) return Number(drawerDaySnapshot.opening_cash) || 0;
    return Number(drawerYesterdaySnapshot?.leave_in_drawer) || 0;
  }, [period, drawerDaySnapshot, drawerYesterdaySnapshot]);

  const drawerFlows = useMemo(
    () =>
      aggregateCashTallyDrawerFlows({
        sales: salesData,
        vouchers: drawerVouchersData,
        advances: advancesData,
        saleReturns: drawerSaleReturnsData,
        advanceRefunds: drawerAdvanceRefundsData,
      }),
    [salesData, drawerVouchersData, advancesData, drawerSaleReturnsData, drawerAdvanceRefundsData],
  );

  const expectedDrawerCash = useMemo(
    () => computeExpectedDrawerCash(drawerOpeningCash, drawerFlows.cashIn, drawerFlows.cashOut),
    [drawerOpeningCash, drawerFlows.cashIn, drawerFlows.cashOut],
  );

  // Payment In (Dr) / Payment Out (Cr) — side-by-side ledger for quick reconcile.
  // In uses gross collections (before expense/refund deduct); Out lists those deducts so totals do not double-count.
  const paymentInRows = useMemo(() => {
    const cashIn =
      (Number(totals.cashSale) || 0) +
      (Number(totals.advanceCash) || 0) +
      (Number(totals.rcpCashCollection) || 0);
    const cardIn =
      (Number(totals.cardSale) || 0) +
      (Number(totals.advanceCard) || 0) +
      (Number(totals.rcpCardCollection) || 0);
    const upiIn =
      (Number(totals.upiSale) || 0) +
      (Number(totals.advanceUpi) || 0) +
      (Number(totals.rcpUpiCollection) || 0);
    const rows: { label: string; amount: number; tone?: string }[] = [
      { label: "Cash (Sales + Advance + RCP)", amount: cashIn, tone: "text-emerald-700" },
      { label: "Card (Sales + Advance + RCP)", amount: cardIn, tone: "text-blue-700" },
      { label: "UPI (Sales + Advance + RCP)", amount: upiIn, tone: "text-violet-700" },
    ];
    if ((Number(totals.rcpOtherCollection) || 0) > 0) {
      rows.push({ label: "RCP Other (Cheque/Bank)", amount: totals.rcpOtherCollection, tone: "text-violet-800" });
    }
    if ((Number(totals.totalSRAdjusted) || 0) > 0) {
      rows.push({ label: "S/R Adjusted", amount: totals.totalSRAdjusted, tone: "text-teal-700" });
    }
    if ((Number(totals.feeTotalCollection) || 0) > 0) {
      rows.push({
        label: `Fee Collection (${totals.feeCount})`,
        amount: totals.feeTotalCollection,
        tone: "text-amber-800",
      });
    }
    return rows;
  }, [
    totals.cashSale,
    totals.advanceCash,
    totals.rcpCashCollection,
    totals.cardSale,
    totals.advanceCard,
    totals.rcpCardCollection,
    totals.upiSale,
    totals.advanceUpi,
    totals.rcpUpiCollection,
    totals.rcpOtherCollection,
    totals.totalSRAdjusted,
    totals.feeTotalCollection,
    totals.feeCount,
  ]);

  const paymentOutRows = useMemo(() => {
    const rows: { label: string; amount: number; tone?: string }[] = [];
    if (totals.cashRefundTotal > 0) {
      rows.push({
        label: `Cash Refunds S/R + Customer (${totals.cashRefundCount})`,
        amount: totals.cashRefundTotal,
        tone: "text-red-600",
      });
    }
    if (totals.customerRefundUpi > 0) {
      rows.push({ label: "Customer Refund UPI", amount: totals.customerRefundUpi, tone: "text-red-600" });
    }
    if (totals.customerRefundCard > 0) {
      rows.push({ label: "Customer Refund Card/Bank", amount: totals.customerRefundCard, tone: "text-red-600" });
    }
    if (totals.customerRefundOther > 0) {
      rows.push({ label: "Customer Refund Other", amount: totals.customerRefundOther, tone: "text-red-600" });
    }
    if (totals.expenseCash > 0) {
      rows.push({ label: "Expense — Cash", amount: totals.expenseCash, tone: "text-red-700" });
    }
    if (totals.expenseUpi > 0) {
      rows.push({ label: "Expense — UPI", amount: totals.expenseUpi, tone: "text-red-700" });
    }
    if (totals.expenseCard > 0) {
      rows.push({ label: "Expense — Card", amount: totals.expenseCard, tone: "text-red-700" });
    }
    if (totals.expenseOther > 0) {
      rows.push({ label: "Expense — Other", amount: totals.expenseOther, tone: "text-red-700" });
    }
    if (totals.thirdPartyOutflowCash > 0) {
      rows.push({ label: "Third-party Out — Cash", amount: totals.thirdPartyOutflowCash, tone: "text-orange-700" });
    }
    if (totals.thirdPartyOutflowUpi > 0) {
      rows.push({ label: "Third-party Out — UPI", amount: totals.thirdPartyOutflowUpi, tone: "text-orange-700" });
    }
    if (totals.thirdPartyOutflowCard > 0) {
      rows.push({ label: "Third-party Out — Card", amount: totals.thirdPartyOutflowCard, tone: "text-orange-700" });
    }
    if (totals.thirdPartyOutflowOther > 0) {
      rows.push({ label: "Third-party Out — Other", amount: totals.thirdPartyOutflowOther, tone: "text-orange-700" });
    }
    if (rows.length === 0) {
      rows.push({ label: "No outflows in this period", amount: 0, tone: "text-muted-foreground" });
    }
    return rows;
  }, [
    totals.cashRefundTotal,
    totals.cashRefundCount,
    totals.customerRefundUpi,
    totals.customerRefundCard,
    totals.customerRefundOther,
    totals.expenseCash,
    totals.expenseUpi,
    totals.expenseCard,
    totals.expenseOther,
    totals.thirdPartyOutflowCash,
    totals.thirdPartyOutflowUpi,
    totals.thirdPartyOutflowCard,
    totals.thirdPartyOutflowOther,
  ]);

  const paymentInTotal = useMemo(
    () => paymentInRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [paymentInRows],
  );
  const paymentOutTotal = useMemo(
    () => paymentOutRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [paymentOutRows],
  );
  const paymentNet = paymentInTotal - paymentOutTotal;

  // Mode strip: sale tender + advance + mode RCP − mode refunds − shop expenses by mode.
  const modeStrip = useMemo(() => {
    const cash =
      (Number(totals.cashSale) || 0) +
      (Number(totals.advanceCash) || 0) +
      (Number(totals.rcpCashCollection) || 0) -
      (Number(totals.cashRefundTotal) || 0) -
      (Number(totals.expenseCash) || 0);
    const card =
      (Number(totals.cardSale) || 0) +
      (Number(totals.advanceCard) || 0) +
      (Number(totals.rcpCardCollection) || 0) -
      (Number(totals.customerRefundCard) || 0) -
      (Number(totals.expenseCard) || 0);
    const upi =
      (Number(totals.upiSale) || 0) +
      (Number(totals.advanceUpi) || 0) +
      (Number(totals.rcpUpiCollection) || 0) -
      (Number(totals.customerRefundUpi) || 0) -
      (Number(totals.expenseUpi) || 0);
    return { cash, card, upi };
  }, [
    totals.cashSale,
    totals.advanceCash,
    totals.rcpCashCollection,
    totals.cashRefundTotal,
    totals.expenseCash,
    totals.cardSale,
    totals.advanceCard,
    totals.rcpCardCollection,
    totals.customerRefundCard,
    totals.expenseCard,
    totals.upiSale,
    totals.advanceUpi,
    totals.rcpUpiCollection,
    totals.customerRefundUpi,
    totals.expenseUpi,
  ]);

  const eligibleSalesForList = useMemo(() => {
    const isHoldLikeSale = (sale: any) => {
      if (sale?.payment_status === "hold") return true;
      return sale?.payment_status === "pending" && String(sale?.sale_number || "").startsWith("Hold/");
    };
    return (salesData || []).filter((sale: any) => {
      if (sale?.is_cancelled) return false;
      if (sale?.payment_status === "cancelled") return false;
      return !isHoldLikeSale(sale);
    });
  }, [salesData]);

  const getSaleDiscount = (sale: any) =>
    (Number(sale.discount_amount) || 0) +
    (Number(sale.flat_discount_amount) || 0) +
    (Number(sale.points_redeemed_amount) || 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    // Calculate grand totals with RCP, net of expenses by payment mode
    const grandCashCollection = totals.cashSale + totals.rcpCashCollection + (totals.advanceCash || 0) - (totals.expenseCash || 0);
    const grandCardCollection = totals.cardSale + totals.rcpCardCollection + (totals.advanceCard || 0) - (totals.expenseCard || 0);
    const grandUpiCollection = totals.upiSale + totals.rcpUpiCollection + (totals.advanceUpi || 0) - (totals.expenseUpi || 0);
    const grandTotalCollection = totals.cashSale + totals.cardSale + totals.upiSale + totals.totalSRAdjusted + totals.rcpTotalCollection + (totals.advanceReceived || 0);
    
    const data = [
      ["Cashier Report - " + getPeriodLabel()],
      [settings?.business_name || "Business Name"],
      [],
      ["Sales Summary"],
      ["Gross Sale", totals.grossSale],
      ["Less: Discount", totals.totalDiscount],
      ["Round off", totals.totalRoundOff],
      ["Net Sale", totals.totalSale],
      ["S/R Adjusted (included in Net Sale)", totals.totalSRAdjusted],
      ["Net Receivable", totals.netReceivable],
      [],
      ["Sales Payment Breakdown"],
      ["Payment Method", "Bills", "Amount"],
      ["Cash", totals.cashBills, totals.cashSale],
      ["Card", totals.cardBills, totals.cardSale],
      ["UPI", totals.upiBills, totals.upiSale],
      ["Mix Payment", totals.mixBills, totals.mixPaymentSale || "-"],
      ["Credit (Pay Later)", totals.creditBills, totals.creditSale],
      ["Total", totals.totalBills, totals.totalSale],
      [],
      ["Receipt Collections (RCP) - Opening Balance / Invoice Payments"],
      ["Type", "Receipts", "Amount"],
      ["RCP Cash", totals.rcpCount > 0 ? "-" : 0, totals.rcpCashCollection],
      ["RCP UPI", "-", totals.rcpUpiCollection],
      ["RCP Card", "-", totals.rcpCardCollection],
      ["RCP Other (Cheque/Bank)", "-", totals.rcpOtherCollection],
      ["Total RCP", totals.rcpCount, totals.rcpTotalCollection],
      [],
      ["Advance Bookings (POS / Accounts)"],
      ["Type", "Entries", "Amount"],
      ["Advance Cash", totals.advanceCount || 0, totals.advanceCash || 0],
      ["Advance UPI", "-", totals.advanceUpi || 0],
      ["Advance Card", "-", totals.advanceCard || 0],
      ["Total Advance", totals.advanceCount || 0, totals.advanceReceived || 0],
      [],
      ["TOTAL COLLECTION SUMMARY"],
      ["Cash (Sales + RCP + Advance)", grandCashCollection],
      ["Card (Sales + RCP)", grandCardCollection],
      ["UPI (Sales + RCP)", grandUpiCollection],
      ["S/R Adjusted", totals.totalSRAdjusted],
      ["Total Collection", grandTotalCollection],
      ["Refund (already in Cash)", totals.totalRefund],
      ["Less: Cash Refunds (S/R + Customer cash)", totals.cashRefundTotal],
      ["Customer Refund Cash", totals.customerRefundCash],
      ["Customer Refund UPI", totals.customerRefundUpi],
      ["Customer Refund Card/Bank", totals.customerRefundCard],
      ["Customer Refund Other", totals.customerRefundOther],
      ["Net Cash Collection", grandCashCollection - totals.cashRefundTotal],
      [],
      ["Outstanding"],
      ["Credit (Pay Later)", totals.creditSale],
      ["Balance Pending", totals.totalBalance],
    ];

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cashier Report");
    XLSX.writeFile(wb, `Cashier_Report_${format(selectedDate, "yyyy-MM-dd")}.xlsx`);
  };

  const handleExportPDF = async () => {
    const jsPDF = await loadJsPdf();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Calculate grand totals with RCP, net of expenses by payment mode
    const grandCashCollection = totals.cashSale + totals.rcpCashCollection + (totals.advanceCash || 0) - (totals.expenseCash || 0);
    const grandCardCollection = totals.cardSale + totals.rcpCardCollection + (totals.advanceCard || 0) - (totals.expenseCard || 0);
    const grandUpiCollection = totals.upiSale + totals.rcpUpiCollection + (totals.advanceUpi || 0) - (totals.expenseUpi || 0);
    
    // Header
    doc.setFontSize(16);
    doc.text(settings?.business_name || "Business Name", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(getReportTitle(), pageWidth / 2, 30, { align: "center" });
    doc.text(`Period: ${getPeriodLabel()}`, pageWidth / 2, 38, { align: "center" });

    let y = 55;
    doc.setFontSize(11);
    
    // Summary
    doc.setFont("helvetica", "bold");
    doc.text("Sales Summary", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    doc.text(`Gross Sale: ${formatCurrency(totals.grossSale)}`, 20, y);
    y += 7;
    doc.text(`Less: Discount: ${formatCurrency(totals.totalDiscount)}`, 20, y);
    y += 7;
    doc.text(`Round off: ${formatCurrency(totals.totalRoundOff)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Net Sale: ${formatCurrency(totals.totalSale)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(`S/R Adjusted (included): ${formatCurrency(totals.totalSRAdjusted)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Net Receivable: ${formatCurrency(totals.netReceivable)}`, 20, y);
    doc.setFont("helvetica", "normal");

    // Sales Collection Breakdown
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.text("Sales Collection", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    
    doc.text("Cash: " + formatCurrency(totals.cashSale), 20, y);
    y += 7;
    doc.text("Card: " + formatCurrency(totals.cardSale), 20, y);
    y += 7;
    doc.text("UPI: " + formatCurrency(totals.upiSale), 20, y);

    // Receipt Collections (RCP)
    if (totals.rcpTotalCollection > 0) {
      y += 15;
      doc.setFont("helvetica", "bold");
      doc.text(`Receipt Collections (RCP) - ${totals.rcpCount} receipts`, 20, y);
      doc.setFont("helvetica", "normal");
      y += 10;
      
      doc.text("RCP Cash: " + formatCurrency(totals.rcpCashCollection), 20, y);
      y += 7;
      doc.text("RCP UPI: " + formatCurrency(totals.rcpUpiCollection), 20, y);
      y += 7;
      doc.text("RCP Card: " + formatCurrency(totals.rcpCardCollection), 20, y);
      y += 7;
      doc.text("RCP Other: " + formatCurrency(totals.rcpOtherCollection), 20, y);
    }

    if ((totals.advanceReceived || 0) > 0) {
      y += 15;
      doc.setFont("helvetica", "bold");
      doc.text(`Advance Bookings - ${totals.advanceCount} entries`, 20, y);
      doc.setFont("helvetica", "normal");
      y += 10;
      doc.text("Advance Cash: " + formatCurrency(totals.advanceCash || 0), 20, y);
      y += 7;
      doc.text("Advance UPI: " + formatCurrency(totals.advanceUpi || 0), 20, y);
      y += 7;
      doc.text("Advance Card: " + formatCurrency(totals.advanceCard || 0), 20, y);
      y += 7;
      doc.setFont("helvetica", "bold");
      doc.text("Total Advance: " + formatCurrency(totals.advanceReceived || 0), 20, y);
      doc.setFont("helvetica", "normal");
    }

    // Grand Total Collection
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL COLLECTION", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    doc.text("Cash (Sales + RCP + Advance): " + formatCurrency(grandCashCollection), 20, y);
    y += 7;
    doc.text("Card (Sales + RCP): " + formatCurrency(grandCardCollection), 20, y);
    y += 7;
    doc.text("UPI (Sales + RCP): " + formatCurrency(grandUpiCollection), 20, y);
    y += 7;
    doc.text("Refund (already in Cash): " + formatCurrency(totals.totalRefund), 20, y);
    y += 7;
    if (totals.cashRefundTotal > 0) {
      doc.text("Less: S/R Cash Refund (" + totals.cashRefundCount + "): " + formatCurrency(totals.cashRefundTotal), 20, y);
      y += 7;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Net Cash Collection: " + formatCurrency(grandCashCollection - totals.cashRefundTotal), 20, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.text("Credit Outstanding: " + formatCurrency(totals.creditSale), 20, y);
    y += 7;
    doc.text("Balance Pending: " + formatCurrency(totals.totalBalance), 20, y);

    // Footer
    y += 20;
    doc.setFontSize(9);
    doc.text(`Generated on ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth / 2, y, { align: "center" });

    doc.save(`Cashier_Report_${format(selectedDate, "yyyy-MM-dd")}.pdf`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getPeriodLabel = () => {
    switch (period) {
      case "monthly":
        return format(selectedDate, "MMMM yyyy");
      case "quarterly":
        return `Q${Math.ceil((selectedDate.getMonth() + 1) / 3)} ${format(selectedDate, "yyyy")}`;
      default:
        return format(selectedDate, "dd MMM yyyy");
    }
  };

  const getReportTitle = () => {
    switch (period) {
      case "monthly":
        return "MONTHLY CASHIER REPORT";
      case "quarterly":
        return "QUARTERLY CASHIER REPORT";
      default:
        return "DAILY CASHIER REPORT";
    }
  };
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader title="Cashier Report" backTo="/" subtitle={getPeriodLabel()} />

        {/* Date navigator */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => setSelectedDate(d => subDays(d, 1))}
            className="w-10 h-10 bg-card rounded-xl border border-border flex items-center justify-center active:scale-90 touch-manipulation">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setSelectedDate(new Date())}
            className="flex-1 h-10 bg-primary/10 rounded-xl text-xs font-semibold text-primary active:scale-95 touch-manipulation">
            Today
          </button>
          <button onClick={() => setSelectedDate(d => addDays(d, 1))}
            className="w-10 h-10 bg-card rounded-xl border border-border flex items-center justify-center active:scale-90 touch-manipulation">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 space-y-4 pb-4">
          {/* Expected drawer headline */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
            <p className="text-xs font-medium opacity-90 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Expected cash in drawer
            </p>
            {isLoading ? <Skeleton className="h-8 w-32 bg-white/20 mt-1" />
              : <p className="text-2xl font-bold tabular-nums mt-1">{formatCurrency(expectedDrawerCash)}</p>}
            <button
              type="button"
              onClick={() => setCashTallyOpen(true)}
              className="mt-3 text-xs font-semibold underline underline-offset-2 opacity-90"
            >
              Enter physical count / open–close
            </button>
          </div>

          {/* Mode strip */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {label:"Cash (all sources)", value: modeStrip.cash, color:"text-emerald-600", bg:"bg-emerald-50"},
              {label:"Card", value: modeStrip.card, color:"text-blue-600", bg:"bg-blue-50"},
              {label:"UPI", value: modeStrip.upi, color:"text-purple-600", bg:"bg-purple-50"},
            ].map((p) => (
              <div key={p.label} className={cn("rounded-xl p-3", p.bg)}>
                <p className="text-[10px] font-medium text-muted-foreground leading-tight">{p.label}</p>
                {isLoading ? <Skeleton className="h-5 w-16 mt-1" />
                  : <p className={cn("text-sm font-bold tabular-nums mt-0.5", p.color)}>{formatCurrency(p.value)}</p>}
              </div>
            ))}
          </div>


          {/* Payment In (Dr) / Payment Out (Cr) */}
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                <p className="text-xs font-bold text-emerald-900 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-white text-[10px] font-bold">Dr</span>
                  Payment In
                </p>
                <p className="text-sm font-bold tabular-nums text-emerald-800">{formatCurrency(paymentInTotal)}</p>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {paymentInRows.map((row) => (
                  <div key={row.label} className="flex justify-between items-center gap-2">
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className={cn("text-xs font-semibold tabular-nums", row.tone)}>{formatCurrency(row.amount)}</p>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-1 border-t border-border/40">
                  <p className="text-xs font-bold">Total</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-800">{formatCurrency(paymentInTotal)}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-rose-50 border-b border-rose-100">
                <p className="text-xs font-bold text-rose-900 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-white text-[10px] font-bold">Cr</span>
                  Payment Out
                </p>
                <p className="text-sm font-bold tabular-nums text-rose-800">{formatCurrency(paymentOutTotal)}</p>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {paymentOutRows.map((row) => (
                  <div key={row.label} className="flex justify-between items-center gap-2">
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className={cn("text-xs font-semibold tabular-nums", row.tone)}>{formatCurrency(row.amount)}</p>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-1 border-t border-border/40">
                  <p className="text-xs font-bold">Total</p>
                  <p className="text-sm font-bold tabular-nums text-rose-800">{formatCurrency(paymentOutTotal)}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border/40 px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs font-semibold">Net (In − Out)</p>
              <p className={cn("text-sm font-bold tabular-nums", paymentNet >= 0 ? "text-emerald-700" : "text-rose-700")}>
                {formatCurrency(paymentNet)}
              </p>
            </div>
          </div>

          {/* Sales & credit — open by default */}
          <Collapsible open={salesCreditOpen} onOpenChange={setSalesCreditOpen}>
            <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left">
                  <p className="text-xs font-semibold">Sales & credit detail</p>
                  <ChevronDown className={`h-4 w-4 transition-transform ${salesCreditOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white">
                  <p className="text-xs font-medium opacity-90">Gross Sale</p>
                  {isLoading ? <Skeleton className="h-8 w-32 bg-white/20 mt-1" />
                    : <p className="text-2xl font-bold tabular-nums mt-1">{formatCurrency(totals.grossSale)}</p>}
                  <p className="text-xs opacity-75 mt-1">{totals.totalBills} bills</p>
                </div>
                <div className="px-4 py-3 space-y-2 border-b border-border/40">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Less: Discount</p>
                    {isLoading ? <Skeleton className="h-5 w-20" />
                      : <p className="text-sm font-bold tabular-nums text-red-600">−{formatCurrency(totals.totalDiscount)}</p>}
                  </div>
                  {totals.totalRoundOff !== 0 && (
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground">Round off</p>
                      <p className="text-sm font-bold tabular-nums text-slate-700">
                        {totals.totalRoundOff > 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(totals.totalRoundOff))}
                      </p>
                    </div>
                  )}
                  {totals.totalSRAdjusted > 0 && (
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground">S/R Adjusted</p>
                      <p className="text-sm font-bold tabular-nums text-amber-600">−{formatCurrency(totals.totalSRAdjusted)}</p>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Net Sale</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-700">{formatCurrency(totals.totalSale)}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Balance Pending</p>
                    <p className="text-sm font-bold tabular-nums text-amber-600">{formatCurrency(totals.totalBalance)}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Old Payment Receipts</p>
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(totals.oldBalanceReceiptTotal)}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Actual Net Receivable</p>
                    <p className="text-sm font-bold tabular-nums text-green-700">{formatCurrency(totals.actualNetReceivable)}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Outstanding */}
          <div className="bg-card rounded-2xl border border-border/40 p-4">
            <p className="text-xs font-semibold text-foreground mb-3">Outstanding</p>
            <div className="space-y-2">
              {[
                {label:"Balance Pending", value: totals.totalBalance, color:"text-amber-600"},
                {label:"Credit Sales", value: totals.creditSale, color:"text-rose-600"},
                {label:"Receipt Collection", value: totals.rcpTotalCollection, color:"text-emerald-600"},
                {label:"Advance Booking", value: totals.advanceReceived || 0, color:"text-teal-600"},
              ].map((r) => (
                <div key={r.label} className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                  <p className={cn("text-sm font-bold tabular-nums", r.color)}>{formatCurrency(r.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Today's invoices */}
          <div className="bg-card rounded-2xl border border-border/40 p-4">
            <p className="text-xs font-semibold text-foreground mb-3">Invoices</p>
            <div className="space-y-2">
              {isLoading ? Array.from({length:4}).map((_,i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              )) : eligibleSalesForList.slice(0, 30).map((sale: any) => {
                const billDiscount = getSaleDiscount(sale);
                return (
                <div key={sale.id} className="flex justify-between items-start py-1.5 border-b border-border/30 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{sale.sale_number}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{sale.customer_name || 'Walk-in'}</p>
                    {billDiscount > 0 && (
                      <p className="text-[10px] text-red-600 mt-0.5">
                        Gross {formatCurrency(Number(sale.gross_amount) || 0)} - Disc {formatCurrency(billDiscount)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-bold tabular-nums">{formatCurrency(Number(sale.net_amount) || 0)}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{sale.payment_method?.replace("_", " ")}</p>
                  </div>
                </div>
              );})}
            </div>
          </div>
        </div>

        <LazyFloatingCashTally open={cashTallyOpen} onOpenChange={setCashTallyOpen} />
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div
      id="cashier-report-root"
      className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full print:p-2 print:bg-white print:h-auto print:overflow-visible"
    >
      <QuietRefreshBar
        queryKeys={[
          ["cashier-report-sales-v2"],
          ["cashier-report-receipts"],
          ["cashier-report-fee-collections"],
          ["cashier-report-cash-refunds"],
          ["cashier-report-customer-refunds"],
          ["cashier-report-expenses"],
          ["cashier-report-third-party"],
          ["cashier-report-advances-range"],
          ["cashier-report-drawer-vouchers"],
          ["cashier-report-drawer-sale-returns"],
          ["cashier-report-drawer-advance-refunds"],
          ["cashier-report-drawer-snapshot"],
        ]}
      />

      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="print:hidden no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Wallet className="h-5 w-5 shrink-0" />
                Cashier Report
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Sales summary by payment method
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Select value={period} onValueChange={(value: PeriodType) => setPeriod(value)}>
              <SelectTrigger className="h-9 w-[130px] text-sm border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-[180px] justify-start text-left font-normal text-sm border-slate-200 bg-white",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {getPeriodLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <ResetPersistedFiltersButton
              visible={cashierFiltersDirty}
              onReset={resetCashierFilters}
            />

            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="h-9 text-sm border-slate-200 bg-white"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              size="sm"
              className="h-9 text-sm border-slate-200 bg-white"
            >
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              className="h-9 text-sm border-slate-200 bg-white"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <div className="hidden print:block mb-4 text-center border-b pb-4 shrink-0">
          <h1 className="text-xl font-bold">{settings?.business_name || "Business Name"}</h1>
          <p className="text-sm">{settings?.address}</p>
          <p className="text-sm">Ph: {settings?.mobile_number}</p>
          <h2 className="text-lg font-semibold mt-4">{getReportTitle()}</h2>
          <p className="text-sm">Period: {getPeriodLabel()}</p>
        </div>

        {isLoading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2 print:overflow-visible print:h-auto pb-2">
            {/* HEADLINE: Expected cash in drawer */}
            <Card className="shrink-0 border-0 shadow-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white print:border print:shadow-none print:bg-white print:text-foreground">
              <CardContent className="pt-5 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/80 print:text-muted-foreground flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Expected cash in drawer
                    </p>
                    <p className="text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight mt-1 print:text-foreground">
                      {formatCurrency(expectedDrawerCash)}
                    </p>
                    <p className="text-xs text-white/60 mt-2 print:text-muted-foreground max-w-xl">
                      Opening float + cash in − cash out (sales, advances, receipts including RCP, less cash outflows).
                      {period === "daily" ? "" : " Opening float applies on Daily view only."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="print:hidden shrink-0 bg-white/15 hover:bg-white/25 text-white border-0"
                    onClick={() => setCashTallyOpen(true)}
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Enter physical count / open–close
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* MODE STRIP */}
            <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Card className="border shadow-sm">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-medium text-muted-foreground">Cash in drawer (all sources)</p>
                  <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                    {formatCurrency(modeStrip.cash)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Sale + advance + RCP − cash refunds − cash expenses</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-medium text-muted-foreground">Card</p>
                  <p className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400 mt-1">
                    {formatCurrency(modeStrip.card)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Sale + advance + RCP − card refunds − card expenses</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-medium text-muted-foreground">UPI</p>
                  <p className="text-xl font-bold tabular-nums text-violet-700 dark:text-violet-400 mt-1">
                    {formatCurrency(modeStrip.upi)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Sale + advance + RCP − UPI refunds − UPI expenses</p>
                </CardContent>
              </Card>
            </div>

            {/* Payment In (Dr) / Payment Out (Cr) — high on page for quick check */}
            <div className="shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
              <Card className="border shadow-sm overflow-hidden">
                <CardHeader className="py-2.5 px-3 bg-emerald-50 border-b">
                  <CardTitle className="text-sm font-bold text-emerald-900 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-emerald-600 text-white text-xs font-bold">Dr</span>
                      Payment In
                    </span>
                    <span className="tabular-nums text-emerald-800">{formatCurrency(paymentInTotal)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Payment mode</TableHead>
                        <TableHead className="h-8 text-xs text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentInRows.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="py-1.5 text-sm font-medium">{row.label}</TableCell>
                          <TableCell className={cn("py-1.5 text-right tabular-nums font-semibold text-sm", row.tone)}>
                            {formatCurrency(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-emerald-50/80 hover:bg-emerald-50">
                        <TableCell className="py-2 text-sm font-bold">Total Payment In</TableCell>
                        <TableCell className="py-2 text-right tabular-nums font-bold text-emerald-800">
                          {formatCurrency(paymentInTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="border shadow-sm overflow-hidden">
                <CardHeader className="py-2.5 px-3 bg-rose-50 border-b">
                  <CardTitle className="text-sm font-bold text-rose-900 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-rose-600 text-white text-xs font-bold">Cr</span>
                      Payment Out
                    </span>
                    <span className="tabular-nums text-rose-800">{formatCurrency(paymentOutTotal)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Payment mode</TableHead>
                        <TableHead className="h-8 text-xs text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentOutRows.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="py-1.5 text-sm font-medium">{row.label}</TableCell>
                          <TableCell className={cn("py-1.5 text-right tabular-nums font-semibold text-sm", row.tone)}>
                            {formatCurrency(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-rose-50/80 hover:bg-rose-50">
                        <TableCell className="py-2 text-sm font-bold">Total Payment Out</TableCell>
                        <TableCell className="py-2 text-right tabular-nums font-bold text-rose-800">
                          {formatCurrency(paymentOutTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <p className="text-sm font-semibold text-slate-700">Net (Payment In − Payment Out)</p>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  paymentNet >= 0 ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {formatCurrency(paymentNet)}
              </p>
            </div>

            {/* Sales & credit detail — colorful KPI cards */}
            <Collapsible open={salesCreditOpen} onOpenChange={setSalesCreditOpen} className="shrink-0">
              <Card>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left print:hidden"
                  >
                    <div>
                      <p className="text-sm font-semibold">Sales & credit detail</p>
                      <p className="text-xs text-muted-foreground">
                        Gross, discount, net, S/R, balance, old receipts, actual net receivable
                      </p>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${salesCreditOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <div className="hidden print:block px-4 pt-3 pb-2 font-semibold text-sm">Sales & credit detail</div>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2">
                      <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <Receipt className="h-3.5 w-3.5" />
                            Gross Sale
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.grossSale)}</p>
                          <p className="text-[10px] text-white/70">{totals.totalBills} Bills</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <TrendingDown className="h-3.5 w-3.5" />
                            Total Discount
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.totalDiscount)}</p>
                          <p className="text-[10px] text-white/70">Line + bill + points</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-slate-500 to-slate-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <IndianRupee className="h-3.5 w-3.5" />
                            Round Off
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.totalRoundOff)}</p>
                          <p className="text-[10px] text-white/70">Not included in Discount</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <IndianRupee className="h-3.5 w-3.5" />
                            Net Sale
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.totalSale)}</p>
                          <p className="text-[10px] text-white/70">After disc, round-off & S/R</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-teal-500 to-teal-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <RotateCcw className="h-3.5 w-3.5" />
                            S/R Adjusted
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.totalSRAdjusted)}</p>
                          <p className="text-[10px] text-white/70">Return credit used</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            Balance Pending
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.totalBalance)}</p>
                          <p className="text-[10px] text-white/70">Outstanding</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 border-0 shadow-lg">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <Banknote className="h-3.5 w-3.5" />
                            Old Payment Receipts
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.oldBalanceReceiptTotal)}</p>
                          <p className="text-[10px] text-white/70">
                            {totals.oldBalanceReceiptCount} Receipt{totals.oldBalanceReceiptCount === 1 ? "" : "s"} · Against existing balance
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-green-600 to-green-700 border-0 shadow-lg ring-2 ring-green-400/50">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs font-medium text-white/90 flex items-center gap-1.5">
                            <Receipt className="h-3.5 w-3.5" />
                            Actual Net Receivable
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                          <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(totals.actualNetReceivable)}</p>
                          <p className="text-[10px] text-white/70">Settled today + old balance receipts + fees</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible open={otherMoneyOpen} onOpenChange={setOtherMoneyOpen} className="shrink-0">
              <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden bg-white">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left border-b border-slate-100 print:hidden"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 leading-tight">Other money movement</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Fees, expenses, third-party outflows, customer refunds by mode
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${otherMoneyOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <div className="hidden print:block px-3 py-2 border-b border-slate-100 font-bold text-sm text-slate-800">
                  Other money movement
                </div>
                <CollapsibleContent>
                  <div className="overflow-x-auto">
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {totals.customerRefundTotal > 0 && (
                          <>
                            <TableRow className="bg-rose-50/80">
                              <TableCell colSpan={2} className="font-semibold text-rose-800">
                                Customer refunds (overpayment / CN) — {totals.customerRefundCount} vouchers
                              </TableCell>
                            </TableRow>
                            {totals.customerRefundCash > 0 && (
                              <TableRow>
                                <TableCell className="pl-8 text-sm">Cash</TableCell>
                                <TableCell className="text-right font-semibold text-red-600 tabular-nums">
                                  {formatCurrency(totals.customerRefundCash)}
                                </TableCell>
                              </TableRow>
                            )}
                            {totals.customerRefundUpi > 0 && (
                              <TableRow>
                                <TableCell className="pl-8 text-sm">UPI</TableCell>
                                <TableCell className="text-right font-semibold text-red-600 tabular-nums">
                                  {formatCurrency(totals.customerRefundUpi)}
                                </TableCell>
                              </TableRow>
                            )}
                            {totals.customerRefundCard > 0 && (
                              <TableRow>
                                <TableCell className="pl-8 text-sm">Card / Bank</TableCell>
                                <TableCell className="text-right font-semibold text-red-600 tabular-nums">
                                  {formatCurrency(totals.customerRefundCard)}
                                </TableCell>
                              </TableRow>
                            )}
                            {totals.customerRefundOther > 0 && (
                              <TableRow>
                                <TableCell className="pl-8 text-sm">Other</TableCell>
                                <TableCell className="text-right font-semibold text-red-600 tabular-nums">
                                  {formatCurrency(totals.customerRefundOther)}
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        )}
                        {totals.feeTotalCollection > 0 && (
                          <>
                            <TableRow className="bg-amber-50/80">
                              <TableCell colSpan={2} className="font-semibold text-amber-900">
                                Student Fee Collections - {totals.feeCount} receipts
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="pl-8">Fee Cash</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(totals.feeCashCollection)}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="pl-8">Fee UPI</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(totals.feeUpiCollection)}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="pl-8">Fee Card</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(totals.feeCardCollection)}</TableCell>
                            </TableRow>
                            {totals.feeBankCollection > 0 && (
                              <TableRow>
                                <TableCell className="pl-8">Fee Bank Transfer</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.feeBankCollection)}</TableCell>
                              </TableRow>
                            )}
                            <TableRow className="bg-amber-50/80">
                              <TableCell className="font-bold">Total Fee Collection</TableCell>
                              <TableCell className="text-right font-bold tabular-nums">
                                {formatCurrency(totals.feeTotalCollection)}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                        {totals.thirdPartyOutflowTotal > 0 && (
                          <>
                            <TableRow className="bg-orange-50/80">
                              <TableCell colSpan={2} className="font-semibold text-destructive">
                                Third-party Payments — {totals.thirdPartyOutflowCount} entries
                              </TableCell>
                            </TableRow>
                            <TableRow className="bg-orange-50/80">
                              <TableCell className="font-bold text-destructive">
                                Total Third-party Outflows
                              </TableCell>
                              <TableCell className="text-right font-bold text-destructive tabular-nums">
                                {formatCurrency(totals.thirdPartyOutflowTotal)}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                        {totals.expenseTotal > 0 && (
                          <>
                            <TableRow className="bg-red-50/80">
                              <TableCell colSpan={2} className="font-semibold text-destructive">
                                Expense Outflows — {totals.expenseCount} entries
                              </TableCell>
                            </TableRow>
                            {Object.entries(totals.expenseByCategory)
                              .sort(([, a], [, b]) => b.total - a.total)
                              .map(([cat, vals]) => (
                                <TableRow key={cat} >
                                  <TableCell className="pl-8 text-xs">
                                    {cat}
                                    {vals.cash > 0 && (
                                      <span className="ml-2 text-muted-foreground">Cash: {formatCurrency(vals.cash)}</span>
                                    )}
                                    {vals.upi > 0 && (
                                      <span className="ml-2 text-muted-foreground">UPI: {formatCurrency(vals.upi)}</span>
                                    )}
                                    {vals.card > 0 && (
                                      <span className="ml-2 text-muted-foreground">Card: {formatCurrency(vals.card)}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-destructive tabular-nums">
                                    {formatCurrency(vals.total)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            <TableRow className="bg-red-50/80">
                              <TableCell className="font-bold text-destructive">
                                Total Expenses
                              </TableCell>
                              <TableCell className="text-right font-bold text-destructive tabular-nums">
                                {formatCurrency(totals.expenseTotal)}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            <Card className="shrink-0 print:border print:shadow-none">
              <CardHeader className="py-3 px-3">
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-0 pb-0">
              <div className="px-3 py-2 space-y-1 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span>Gross Sale</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(totals.grossSale)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 text-red-600">
                  <span>Less: Discount</span>
                  <span className="font-semibold tabular-nums">- {formatCurrency(totals.totalDiscount)}</span>
                </div>
                {totals.totalRoundOff !== 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-100 text-slate-700">
                    <span>Round off</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(totals.totalRoundOff)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-slate-100 text-base font-bold">
                  <span>Net Sale</span>
                  <span className="tabular-nums">{formatCurrency(totals.totalSale)}</span>
                </div>
                {totals.totalSRAdjusted > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-100 text-teal-700 text-xs">
                    <span>(Includes S/R Adjusted)</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(totals.totalSRAdjusted)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-slate-100 text-base font-bold text-blue-800">
                  <span>Net Receivable</span>
                  <span className="tabular-nums">{formatCurrency(totals.netReceivable)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 text-amber-700">
                  <span>Less: Balance Pending</span>
                  <span className="font-semibold tabular-nums">- {formatCurrency(totals.totalBalance)}</span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-double text-base font-bold bg-emerald-50 px-2 -mx-2 rounded">
                  <span className="text-emerald-800">Actual Net Receivable</span>
                  <span className="text-emerald-800 tabular-nums">{formatCurrency(totals.actualNetReceivable)}</span>
                </div>
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Collection</span>
                    <span className="tabular-nums">{formatCurrency(totals.cashSale)}</span>
                  </div>
                  {(totals.advanceReceived || 0) > 0 && (
                    <div className="flex justify-between text-teal-700">
                      <span className="text-muted-foreground">Advance Booking ({totals.advanceCount})</span>
                      <span className="tabular-nums">{formatCurrency(totals.advanceReceived)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Card Collection</span>
                    <span className="tabular-nums">{formatCurrency(totals.cardSale)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UPI Collection</span>
                    <span className="tabular-nums">{formatCurrency(totals.upiSale)}</span>
                  </div>
                  <div className="flex justify-between text-teal-700">
                    <span className="text-muted-foreground">S/R Adjusted</span>
                    <span className="tabular-nums">{formatCurrency(totals.totalSRAdjusted)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span className="text-muted-foreground">Less: Refund</span>
                    <span className="tabular-nums">- {formatCurrency(totals.totalRefund)}</span>
                  </div>
                  {totals.cashRefundTotal > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span className="text-muted-foreground">Less: Cash Refunds ({totals.cashRefundCount})</span>
                      <span className="tabular-nums">- {formatCurrency(totals.cashRefundTotal)}</span>
                    </div>
                  )}
                  {(totals.customerRefundUpi || 0) + (totals.customerRefundCard || 0) + (totals.customerRefundOther || 0) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span className="text-muted-foreground">Less: Customer Refund UPI/Card/Other</span>
                      <span className="tabular-nums">
                        -{" "}
                        {formatCurrency(
                          (totals.customerRefundUpi || 0) +
                            (totals.customerRefundCard || 0) +
                            (totals.customerRefundOther || 0),
                        )}
                      </span>
                    </div>
                  )}
                  {totals.feeTotalCollection > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span className="text-muted-foreground">Fee Collection ({totals.feeCount})</span>
                      <span className="tabular-nums">{formatCurrency(totals.feeTotalCollection)}</span>
                    </div>
                  )}
                </div>
                {totals.thirdPartyOutflowTotal > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-100 text-destructive">
                    <span className="text-muted-foreground">Third-party Payments ({totals.thirdPartyOutflowCount})</span>
                    <span className="font-semibold tabular-nums">- {formatCurrency(totals.thirdPartyOutflowTotal)}</span>
                  </div>
                )}
                {totals.expenseTotal > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-100 text-destructive">
                    <span className="text-muted-foreground">Total Expenses ({totals.expenseCount})</span>
                    <span className="font-semibold tabular-nums">- {formatCurrency(totals.expenseTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t border-slate-200 mt-2 font-bold text-emerald-700">
                  <span>Total Collected</span>
                  <span className="tabular-nums">
                    {formatCurrency(
                      totals.cashSale +
                        totals.cardSale +
                        totals.upiSale +
                        totals.totalSRAdjusted +
                        totals.rcpTotalCollection +
                        (totals.advanceReceived || 0) +
                        totals.feeTotalCollection -
                        totals.totalRefund -
                        totals.cashRefundTotal -
                        (totals.customerRefundUpi || 0) -
                        (totals.customerRefundCard || 0) -
                        (totals.customerRefundOther || 0) -
                        totals.expenseTotal -
                        totals.thirdPartyOutflowTotal,
                    )}
                  </span>
                </div>
                <div className="pt-2 space-y-1 border-t border-slate-200 mt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credit (Outstanding)</span>
                    <span className="tabular-nums">{formatCurrency(totals.creditSale)}</span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span className="text-muted-foreground">Balance Pending</span>
                    <span className="tabular-nums">{formatCurrency(totals.totalBalance)}</span>
                  </div>
                </div>
              </div>
              </CardContent>
            </Card>

            <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
              <p>Generated on {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
              <p className="mt-2">--- End of Report ---</p>
            </div>
            <div aria-hidden className="h-8 lg:h-10 print:hidden shrink-0" />
          </div>
        )}
      </div>

      <LazyFloatingCashTally open={cashTallyOpen} onOpenChange={setCashTallyOpen} />

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #cashier-report-root, #cashier-report-root * {
            visibility: visible;
          }
          #cashier-report-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};


export default DailyCashierReport;
