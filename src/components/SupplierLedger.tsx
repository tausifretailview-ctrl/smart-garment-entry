import { useState, useMemo, useEffect, useRef } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, FileDown, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon, AlertTriangle, Clock, Scale, BookOpen, Loader2, Workflow } from "lucide-react";
import type jsPDFType from "jspdf";
/** Lazily loaded on export — keeps jsPDF/html2canvas off this page's initial chunk. */
let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> =>
  (jsPdfPromise ??= import("jspdf").then((m) => m.default));

import { toast } from "sonner";
import { downloadJsPdf } from "@/utils/mobileDocumentDelivery";
import { useIsNarrowViewport } from "@/hooks/use-mobile";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AccountsExportButtons } from "@/components/accounts/AccountsExportButtons";
import { accountsHistorySearchWrapClass, accountsHistoryTableClass, accountsHistoryTableWrapClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import { safeMapGet, coerceToArray } from "@/lib/coerceToMap";
import {
  fetchSupplierBalanceSnapshot,
  supplierAccountAdjustmentTotal,
  supplierLedgerReconFromTransactions,
  type SupplierBalanceMapForOrg,
} from "@/utils/supplierBalanceUtils";
import { fetchSupplierDirectory } from "@/utils/fetchAllRows";
import {
  fetchSupplierLedgerTransactions,
  type SupplierLedgerTransaction,
} from "@/utils/supplierLedgerTransactions";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBusinessInfo } from "@/hooks/useSettings";
import { STALE_REFERENCE } from "@/lib/queryStaleTimes";

interface SupplierLedgerProps {
  organizationId: string;
  visitedTabs?: ReadonlySet<string>;
  supplierBalanceMap?: SupplierBalanceMapForOrg;
  preSelectedSupplierId?: string | null;
  /** When embedMode — show ledger immediately without loading the full supplier list. */
  preSelectedSupplierName?: string | null;
  preSelectedSupplierPhone?: string | null;
  /** Embedded in Supplier Balances — hide supplier picker; back returns to balances list. */
  embedMode?: boolean;
  embeddedBackLabel?: string;
  onEmbeddedBack?: () => void;
  /** Do not write supplier id into URL search params (embedded views). */
  skipUrlSync?: boolean;
}

interface Supplier {
  id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalPurchases: number;
  totalPaid: number;
  totalCreditNotes: number;
  balance: number;
}

type LedgerTab = 'all' | 'payments' | 'cn-adjusted' | 'cn-pending';

function buildEmbeddedSupplierStub(
  id: string,
  name: string,
  phone?: string | null,
  extra?: Partial<Supplier>,
): Supplier {
  return {
    id,
    supplier_name: name,
    phone: phone ?? null,
    email: extra?.email ?? null,
    address: extra?.address ?? null,
    opening_balance: extra?.opening_balance ?? 0,
    totalPurchases: extra?.totalPurchases ?? 0,
    totalPaid: extra?.totalPaid ?? 0,
    totalCreditNotes: extra?.totalCreditNotes ?? 0,
    balance: extra?.balance ?? extra?.opening_balance ?? 0,
  };
}

type Transaction = SupplierLedgerTransaction;

export function SupplierLedger({
  organizationId,
  visitedTabs,
  supplierBalanceMap,
  preSelectedSupplierId,
  preSelectedSupplierName,
  preSelectedSupplierPhone,
  embedMode = false,
  embeddedBackLabel,
  onEmbeddedBack,
}: SupplierLedgerProps) {
  const isMobile = useIsNarrowViewport();
  const { orgNavigate } = useOrgNavigation();
  const tabActive = visitedTabs?.has("supplier-ledger") ?? true;
  const embeddedSingleSupplier = embedMode && Boolean(preSelectedSupplierId);
  const businessInfo = useBusinessInfo();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<LedgerTab>("all");
  const pendingRestoredSupplierIdRef = useRef<string | null>(null);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.accountsSupplierLedger,
    organizationId,
    useMemo(
      () => ({
        searchQuery,
        selectedSupplierId: selectedSupplier?.id,
        paymentStatusFilter,
        startDate,
        endDate,
        activeTab,
      }),
      [searchQuery, selectedSupplier, paymentStatusFilter, startDate, endDate, activeTab],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["paymentStatusFilter", setPaymentStatusFilter],
          ["activeTab", (v) => setActiveTab(v as LedgerTab)],
        ],
        optionalDates: [
          ["startDate", setStartDate],
          ["endDate", setEndDate],
        ],
      });
      const id = typeof saved.selectedSupplierId === "string" ? saved.selectedSupplierId : null;
      if (id) pendingRestoredSupplierIdRef.current = id;
    },
  );

  // Directory only — balances from shared org-level map (Accounts.tsx).
  // Not fetchAllSuppliers (keeps opening_balance / gst off the hot path).
  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ["supplier-directory", organizationId],
    queryFn: () => fetchSupplierDirectory(organizationId),
    select: (data) => coerceToArray(data),
    enabled: !!organizationId && tabActive && !embeddedSingleSupplier,
  });

  const { data: embeddedSupplierProfile } = useQuery({
    queryKey: ["supplier-ledger-profile", organizationId, preSelectedSupplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, supplier_name, phone, email, address, opening_balance")
        .eq("organization_id", organizationId)
        .eq("id", preSelectedSupplierId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: embeddedSingleSupplier && !!organizationId && !!preSelectedSupplierId,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  const { data: embeddedSupplierSnapshot } = useQuery({
    queryKey: ["supplier-ledger-embed-snapshot", organizationId, preSelectedSupplierId],
    queryFn: () => fetchSupplierBalanceSnapshot(supabase, organizationId, preSelectedSupplierId!),
    enabled: embeddedSingleSupplier && !!organizationId && !!preSelectedSupplierId,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  const balanceSnapshotError = supplierBalanceMap?.degraded
    ? "Could not compute balances from bills and vouchers."
    : null;

  const suppliers = useMemo(() => {
    if (suppliersData === undefined) return undefined;
    const balanceMap = supplierBalanceMap?.balanceMap;
    return suppliersData.map((supplier: any) => {
      const snap = balanceMap ? safeMapGet(balanceMap, supplier.id) : undefined;
      const openingBalance = snap?.openingBalance ?? (Number(supplier.opening_balance) || 0);
      return {
        ...supplier,
        opening_balance: openingBalance,
        totalPurchases: snap?.totalPurchases ?? 0,
        totalPaid: snap?.totalPaid ?? 0,
        totalCreditNotes: (snap?.totalCreditNotesNet ?? 0) + (snap?.unreflectedReturns ?? 0),
        balance: snap?.balance ?? openingBalance,
      };
    });
  }, [suppliersData, supplierBalanceMap]);

  const isLoading = embeddedSingleSupplier
    ? !embeddedSupplierProfile
    : suppliersLoading || (!!organizationId && tabActive && supplierBalanceMap === undefined);

  useEffect(() => {
    const idToSelect = preSelectedSupplierId || pendingRestoredSupplierIdRef.current;
    if (!idToSelect || !suppliers?.length || selectedSupplier) return;
    const found = suppliers.find((s) => s.id === idToSelect);
    if (found) {
      setSelectedSupplier(found);
      pendingRestoredSupplierIdRef.current = null;
    }
  }, [suppliers, selectedSupplier, preSelectedSupplierId]);

  useEffect(() => {
    if (!embeddedSingleSupplier || selectedSupplier || !embeddedSupplierProfile || !preSelectedSupplierId) {
      return;
    }
    const snap = embeddedSupplierSnapshot;
    const openingBalance = snap?.openingBalance ?? Number(embeddedSupplierProfile.opening_balance ?? 0);
    setSelectedSupplier(
      buildEmbeddedSupplierStub(
        preSelectedSupplierId,
        embeddedSupplierProfile.supplier_name ||
          preSelectedSupplierName?.trim() ||
          "Supplier",
        preSelectedSupplierPhone ?? embeddedSupplierProfile.phone,
        {
          email: embeddedSupplierProfile.email,
          address: embeddedSupplierProfile.address,
          opening_balance: openingBalance,
          totalPurchases: snap?.totalPurchases ?? 0,
          totalPaid: snap?.totalPaid ?? 0,
          totalCreditNotes: (snap?.totalCreditNotesNet ?? 0) + (snap?.unreflectedReturns ?? 0),
          balance: snap?.balance ?? openingBalance,
        },
      ),
    );
  }, [
    embeddedSingleSupplier,
    embeddedSupplierProfile,
    embeddedSupplierSnapshot,
    preSelectedSupplierId,
    preSelectedSupplierName,
    preSelectedSupplierPhone,
    selectedSupplier,
  ]);

  const { data: selectedSupplierSnapshot } = useQuery({
    queryKey: ["supplier-balance-snapshot", organizationId, selectedSupplier?.id],
    queryFn: async () =>
      fetchSupplierBalanceSnapshot(supabase, organizationId, selectedSupplier!.id),
    enabled: !!organizationId && !!selectedSupplier?.id && tabActive,
  });

  // Fetch detailed transactions for selected supplier
  const { data: transactions } = useQuery({
    queryKey: ["supplier-transactions", selectedSupplier?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedSupplier) return [];
      return fetchSupplierLedgerTransactions(organizationId, selectedSupplier, startDate, endDate);
    },
    enabled: !!selectedSupplier?.id && tabActive,
  });

  const ledgerClosingBalance = useMemo(() => {
    if (!transactions?.length) return null;
    return transactions[transactions.length - 1]?.balance ?? 0;
  }, [transactions]);

  const tableRecon = useMemo(
    () => supplierLedgerReconFromTransactions(transactions),
    [transactions],
  );

  const cardRecon = useMemo(() => {
    if (tableRecon) return tableRecon;
    if (!selectedSupplierSnapshot) return null;
    const snap = selectedSupplierSnapshot;
    return {
      openingBalance: snap.openingBalance,
      totalPurchases: snap.totalPurchases,
      totalPaid: snap.totalPaid,
      accountAdjust: supplierAccountAdjustmentTotal(snap),
      balance: snap.balance,
      refundsReceived: snap.refundsReceived,
    };
  }, [tableRecon, selectedSupplierSnapshot]);

  const tabCounts = useMemo(() => {
    const t = transactions || [];
    return {
      all: t.length,
      payments: t.filter((x) => x.category === 'payments').length,
      'cn-adjusted': t.filter((x) => x.category === 'cn-adjusted').length,
      'cn-pending': t.filter((x) => x.category === 'cn-pending').length,
    };
  }, [transactions]);

  const visibleTransactions = useMemo(() => {
    const t = transactions || [];
    if (activeTab === 'all') return t;
    return t.filter((x) => x.category === activeTab);
  }, [transactions, activeTab]);

  // Reset to the full view whenever a different supplier is opened.
  useEffect(() => {
    setActiveTab('all');
  }, [selectedSupplier?.id]);

  // Filter suppliers based on search and payment status
  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    
    return suppliers.filter((supplier) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        supplier.supplier_name.toLowerCase().includes(searchLower) ||
        supplier.phone?.toLowerCase().includes(searchLower) ||
        supplier.email?.toLowerCase().includes(searchLower)
      );

      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = supplier.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = supplier.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = supplier.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [suppliers, searchQuery, paymentStatusFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredSuppliers) return { totalSuppliers: 0, totalOutstanding: 0, totalPayable: 0 };
    
    return {
      totalSuppliers: filteredSuppliers.length,
      totalOutstanding: filteredSuppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0),
      totalPayable: filteredSuppliers.reduce((sum, s) => sum + s.totalPurchases, 0),
    };
  }, [filteredSuppliers]);

  const { data: supplierBillPaymentDrift } = useQuery({
    queryKey: ["supplier-bill-payment-voucher-drift", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bill_payment_voucher_drift" as any)
        .select("bill_id")
        .eq("organization_id", organizationId)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!organizationId && tabActive,
  });

  const transactionTotals = useMemo(() => {
    const rows = transactions || [];
    return {
      totalDebit: rows.reduce((sum, t) => sum + t.debit, 0),
      totalCredit: rows.reduce((sum, t) => sum + t.credit, 0),
      closingBalance: rows.length > 0 ? rows[rows.length - 1].balance : 0,
    };
  }, [transactions]);

  const formatSupplierBalancePdf = (balance: number) => {
    const n = Math.abs(Math.round(balance));
    if (balance === 0) return "Rs. 0";
    return `Rs. ${n.toLocaleString("en-IN")} ${balance > 0 ? "Cr" : "Dr"}`;
  };

  const formatTransactionTypePdf = (t: Transaction) => {
    if (t.id === "opening-balance") return "B/F";
    if (t.type === "bill") return "Bill";
    if (t.type === "credit_note") return "Credit Note";
    if (t.type === "purchase_return") return "PR Pending";
    return "Payment";
  };

  const handleExportToExcel = async () => {
    if (!selectedSupplier || !transactions) return;

    const exportData = transactions.map((t) => ({
      Date: t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy"),
      Type: formatTransactionTypePdf(t),
      Reference: t.reference,
      Description: t.description,
      Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
      Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      Balance: t.balance.toFixed(2),
    }));

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Ledger");
    XLSX.writeFile(wb, `${selectedSupplier.supplier_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Supplier ledger exported to Excel");
  };

  const handleExportToPDF = async () => {
    if (!selectedSupplier || !transactions) return;

    const jsPDF = await loadJsPdf();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 16;

    // Company letterhead (Settings → Company): business name, address, mobile.
    const bizName = (businessInfo.businessName || "").trim();
    const bizAddress = (businessInfo.address || "").trim();
    const bizMobile = (businessInfo.mobileNumber || "").trim();
    if (bizName || bizAddress || bizMobile) {
      if (bizName) {
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(bizName, pageWidth / 2, yPos, { align: "center" });
        yPos += 6;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      if (bizAddress) {
        const addrLines = doc.splitTextToSize(bizAddress, pageWidth - margin * 2 - 20);
        doc.text(addrLines, pageWidth / 2, yPos, { align: "center" });
        yPos += addrLines.length * 4;
      }
      if (bizMobile) {
        doc.text(`Mobile: ${bizMobile}`, pageWidth / 2, yPos, { align: "center" });
        yPos += 4;
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos + 1, pageWidth - margin, yPos + 1);
      yPos += 7;
    }

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 118, 110);
    doc.text("Supplier Ledger", pageWidth / 2, yPos, { align: "center" });
    doc.setTextColor(0, 0, 0);
    yPos += 10;

    doc.setFontSize(12);
    doc.text(selectedSupplier.supplier_name, margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (selectedSupplier.phone) {
      doc.text(`Phone: ${selectedSupplier.phone}`, margin, yPos);
      yPos += 5;
    }
    if (selectedSupplier.email) {
      doc.text(`Email: ${selectedSupplier.email}`, margin, yPos);
      yPos += 5;
    }
    if (selectedSupplier.address) {
      const addr =
        selectedSupplier.address.length > 70
          ? `${selectedSupplier.address.substring(0, 70)}...`
          : selectedSupplier.address;
      doc.text(`Address: ${addr}`, margin, yPos);
      yPos += 5;
    }

    if (startDate || endDate) {
      doc.text(
        `Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} to ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`,
        margin,
        yPos,
      );
      yPos += 5;
    }

    doc.setFont("helvetica", "bold");
    const hdrBalance =
      selectedSupplier.balance > 0
        ? `Outstanding Payable: ${formatSupplierBalancePdf(selectedSupplier.balance)}`
        : selectedSupplier.balance < 0
          ? `Supplier Credit: ${formatSupplierBalancePdf(selectedSupplier.balance)}`
          : "Balance: Settled";
    doc.text(hdrBalance, pageWidth - margin, yPos, { align: "right" });
    yPos += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Purchases: Rs. ${Math.round(selectedSupplier.totalPurchases).toLocaleString("en-IN")}  |  Paid: Rs. ${Math.round(selectedSupplier.totalPaid).toLocaleString("en-IN")}`,
      margin,
      yPos,
    );
    yPos += 8;

    const headers = ["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"];
    const colWidths = [22, 20, 24, 46, 22, 22, 24];

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

    doc.setFont("helvetica", "normal");
    transactions.forEach((t) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      const isPendingOnly = t.type === "purchase_return" && t.debit === 0 && t.credit === 0;
      const desc = t.description.length > 30 ? `${t.description.substring(0, 30)}...` : t.description;
      const rowData = [
        t.id === "opening-balance" ? "Opening" : format(new Date(t.date), "dd/MM/yy"),
        formatTransactionTypePdf(t),
        t.reference.length > 14 ? `${t.reference.substring(0, 14)}...` : t.reference,
        desc,
        t.debit > 0 ? `Rs. ${Math.round(t.debit).toLocaleString("en-IN")}` : "",
        t.credit > 0 ? `Rs. ${Math.round(t.credit).toLocaleString("en-IN")}` : "",
        isPendingOnly ? "(unchanged)" : formatSupplierBalancePdf(t.balance),
      ];

      if (isPendingOnly) {
        doc.setFont("helvetica", "italic");
      }
      xPos = margin;
      rowData.forEach((cell, i) => {
        doc.text(cell, xPos + 1, yPos);
        xPos += colWidths[i];
      });
      if (isPendingOnly) {
        doc.setFont("helvetica", "normal");
      }
      yPos += 6;
    });

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
      formatSupplierBalancePdf(transactionTotals.closingBalance),
    ];
    totalsData.forEach((cell, i) => {
      doc.text(cell, xPos + 1, yPos);
      xPos += colWidths[i];
    });
    yPos += 12;

    if (cardRecon) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      const recon = cardRecon;
      const netPurchases =
        recon.openingBalance + recon.totalPurchases - recon.accountAdjust;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Balance Reconciliation", margin, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const reconLines: Array<[string, number]> = [
        ["Opening Balance", recon.openingBalance],
        ["(+) Total Purchases", recon.totalPurchases],
        ...(recon.accountAdjust > 0
          ? [["(-) Credit Notes / Returns Adjusted", -recon.accountAdjust] as [string, number]]
          : []),
        ["(=) Net Purchases", netPurchases],
        ["(-) Paid (Cash / Bank)", -recon.totalPaid],
        ...(recon.refundsReceived > 0
          ? [["(+) Refunds Received from Supplier", recon.refundsReceived] as [string, number]]
          : []),
      ];
      const labelX = margin + 4;
      const valueX = margin + 95;
      reconLines.forEach(([label, val]) => {
        doc.text(label, labelX, yPos);
        const sign = val < 0 ? "-" : "";
        doc.text(
          `${sign}Rs. ${Math.abs(Math.round(val)).toLocaleString("en-IN")}`,
          valueX,
          yPos,
        );
        yPos += 5;
      });
      doc.setFont("helvetica", "bold");
      const out = recon.balance;
      const finalLabel =
        out > 0 ? "Outstanding (Payable / Cr)" : out < 0 ? "Supplier Credit (Dr)" : "Settled";
      doc.text(finalLabel, labelX, yPos + 1);
      doc.text(`Rs. ${Math.abs(Math.round(out)).toLocaleString("en-IN")}`, valueX, yPos + 1);
      yPos += 8;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, margin, yPos);

    const safeName = selectedSupplier.supplier_name.replace(/[^\w\s-]/g, "").trim().slice(0, 40);
    await downloadJsPdf(doc, `${safeName || "Supplier"}_Ledger_${format(new Date(), "dd-MM-yyyy")}.pdf`);
    toast.success("Supplier ledger exported to PDF");
  };

  if (selectedSupplier && transactions === undefined) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] text-muted-foreground gap-2 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">Loading supplier ledger…</span>
      </div>
    );
  }

  if (selectedSupplier && transactions) {
    return (
      <div className="space-y-3 min-w-0 max-w-full">
        {supplierBillPaymentDrift && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Bill payment sync check</AlertTitle>
            <AlertDescription>
              At least one purchase bill has a paid amount that does not match bill-linked payment vouchers. Query the
              database view <span className="font-mono text-xs">supplier_bill_payment_voucher_drift</span> for this
              organization to review rows. Credit-note adjustments use{" "}
              <span className="font-mono text-xs">supplier_cn_bill_integrity_check</span>.
            </AlertDescription>
          </Alert>
        )}
        {balanceSnapshotError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Supplier balances could not be loaded fully</AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <span className="block font-medium">{balanceSnapshotError}</span>
              <span className="block text-muted-foreground">
                Outstanding needs purchase bills plus supplier payment/credit-note vouchers from the database. If totals stay at zero:
                run pending Supabase migrations; confirm your login is a member of this organization (User Rights / org access); in
                Supabase RLS, ensure <span className="font-mono text-xs">SELECT</span> on{" "}
                <span className="font-mono text-xs">voucher_entries</span> and{" "}
                <span className="font-mono text-xs">purchase_returns</span> for your role; check the browser console for the exact error.
              </span>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2 w-full min-w-0">
          {!embedMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full sm:w-auto shrink-0 justify-center sm:justify-start"
              onClick={() => setSelectedSupplier(null)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Suppliers
            </Button>
          )}
          
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full min-w-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-0 h-9 justify-start text-left font-normal text-sm px-2 sm:px-3">
                  <CalendarIcon className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="truncate">{startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}</span>
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
                <Button variant="outline" className="min-w-0 h-9 justify-start text-left font-normal text-sm px-2 sm:px-3">
                  <CalendarIcon className="mr-1.5 h-4 w-4 shrink-0" />
                  <span className="truncate">{endDate ? format(endDate, "dd MMM yyyy") : "End Date"}</span>
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
                className="h-9 shrink-0 col-span-2 sm:col-span-1"
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
              className="h-9 min-w-0"
              onClick={handleExportToExcel}
            >
              <Download className="mr-1.5 h-4 w-4 shrink-0" />
              {isMobile ? "Excel" : "Export to Excel"}
            </Button>
            <Button variant="outline" size="sm" className="h-9 min-w-0" onClick={handleExportToPDF}>
              <FileDown className="mr-1.5 h-4 w-4 shrink-0" />
              {isMobile ? "PDF" : "Export to PDF"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 min-w-0 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
              onClick={() => orgNavigate(`/payment-flow?type=supplier&id=${selectedSupplier.id}`)}
              title="See which payment, CN or refund settled each bill"
            >
              <Workflow className="mr-1.5 h-4 w-4 shrink-0" />
              Payment Flow
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
              <div className="space-y-2 min-w-0">
                <CardTitle className="text-2xl break-words">{selectedSupplier.supplier_name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedSupplier.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedSupplier.phone}
                    </div>
                  )}
                  {selectedSupplier.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedSupplier.email}
                    </div>
                  )}
                  {selectedSupplier.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedSupplier.address}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right w-full sm:w-auto">
                <div className="text-sm text-muted-foreground mb-1">
                  {(cardRecon?.balance ?? selectedSupplier.balance) > 0
                    ? "Outstanding Payable (Cr)"
                    : (cardRecon?.balance ?? selectedSupplier.balance) < 0
                      ? "Credit / Overpayment"
                      : "Balance"}
                </div>
                <div className={cn(
                  "text-3xl font-bold",
                  (cardRecon?.balance ?? selectedSupplier.balance) > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  ₹{Math.abs(cardRecon?.balance ?? selectedSupplier.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                {(cardRecon?.balance ?? selectedSupplier.balance) > 0 && (
                  <Badge variant="destructive" className="mt-2">Payable</Badge>
                )}
                {(cardRecon?.balance ?? selectedSupplier.balance) < 0 && (
                  <Badge variant="default" className="mt-2 bg-green-600">Supplier Credit</Badge>
                )}
                {(cardRecon?.balance ?? selectedSupplier.balance) === 0 && (
                  <Badge variant="outline" className="mt-2">Settled</Badge>
                )}
                {ledgerClosingBalance != null &&
                  selectedSupplier.balance != null &&
                  Math.abs(ledgerClosingBalance - selectedSupplier.balance) > 1 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 max-w-[260px] ml-auto text-left">
                      <span className="inline-flex items-start gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        Supplier list balance ₹
                        {Math.abs(selectedSupplier.balance).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        {selectedSupplier.balance >= 0 ? "payable" : "credit"} will match this ledger after the account snapshot refresh.
                      </span>
                    </p>
                  )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {selectedSupplier.opening_balance !== 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      selectedSupplier.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                    )}>
                      ₹{Math.abs(selectedSupplier.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedSupplier.opening_balance > 0 ? "Payable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Purchases</div>
                  <div className="text-2xl font-bold">
                    ₹{(cardRecon?.totalPurchases ?? selectedSupplier.totalPurchases).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              {((cardRecon?.accountAdjust ?? selectedSupplier.totalCreditNotes) > 0) && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Credit Notes / Returns</div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      ₹{(cardRecon?.accountAdjust ?? selectedSupplier.totalCreditNotes).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Paid</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₹{(cardRecon?.totalPaid ?? selectedSupplier.totalPaid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              {(selectedSupplierSnapshot?.unappliedCreditNotes ?? 0) > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Unapplied CN / Returns</div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      ₹{(selectedSupplierSnapshot?.unappliedCreditNotes ?? 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Payment Rate</div>
                  <div className="text-2xl font-bold">
                    {(selectedSupplier.totalPurchases + Math.max(0, selectedSupplier.opening_balance)) > 0
                      ? ((selectedSupplier.totalPaid / (selectedSupplier.totalPurchases + Math.max(0, selectedSupplier.opening_balance))) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6" />

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LedgerTab)} className="w-full">
              <TabsList className="flex w-full max-w-full flex-nowrap overflow-x-auto gap-1 mb-4 min-h-10 bg-muted/60 rounded-xl p-1">
                <TabsTrigger value="all" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <BookOpen className="h-4 w-4" />
                  Transactions
                  <Badge variant="secondary" className="ml-1">{tabCounts.all}</Badge>
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <IndianRupee className="h-4 w-4" />
                  Payment History
                  <Badge variant="secondary" className="ml-1">{tabCounts.payments}</Badge>
                </TabsTrigger>
                <TabsTrigger value="cn-adjusted" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <FileText className="h-4 w-4" />
                  CN Adjusted
                  <Badge variant="secondary" className="ml-1">{tabCounts['cn-adjusted']}</Badge>
                </TabsTrigger>
                <TabsTrigger value="cn-pending" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <Clock className="h-4 w-4" />
                  CN Pending
                  <Badge variant="secondary" className="ml-1">{tabCounts['cn-pending']}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className={accountsHistoryTableWrapClass}>
              <Table className={cn(accountsHistoryTableClass, isMobile && "!min-w-0 table-fixed")}>
                <TableHeader className="!static">
                  <TableRow>
                    <TableHead className={cn(accountsHistoryThClass, isMobile && "w-[4.75rem]")}>Date</TableHead>
                    <TableHead className={accountsHistoryThClass}>Type</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "hidden md:table-cell")}>Reference</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "hidden lg:table-cell")}>Description</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "hidden md:table-cell text-right")}>Debit (Paid)</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "hidden md:table-cell text-right")}>Credit (Bill)</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {activeTab === 'all'
                          ? 'No transactions found'
                          : activeTab === 'payments'
                            ? 'No payments / refunds recorded'
                            : activeTab === 'cn-adjusted'
                              ? 'No adjusted credit notes / purchase returns'
                              : 'No pending purchase return credit notes'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleTransactions.map((transaction) => (
                      <TableRow key={transaction.id} className={transaction.id === 'opening-balance' ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {transaction.id === 'opening-balance' 
                              ? <span className="font-semibold">Opening</span>
                              : format(new Date(transaction.date), "dd MMM yyyy")
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          {transaction.id === 'opening-balance' ? (
                            <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                              B/F
                            </Badge>
                          ) : transaction.type === 'credit_note' ? (
                            <div className="flex flex-col gap-1 min-w-0">
                            <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 w-fit">
                              <FileText className="h-3 w-3 mr-1" /> Credit Note
                            </Badge>
                            {isMobile && (
                              <div className="text-[11px] tabular-nums leading-tight">
                                {transaction.debit > 0 && (
                                  <div className="text-green-600 dark:text-green-400">
                                    Dr ₹{transaction.debit.toLocaleString("en-IN")}
                                  </div>
                                )}
                                {transaction.credit > 0 && (
                                  <div className="text-red-600 dark:text-red-400">
                                    Cr ₹{transaction.credit.toLocaleString("en-IN")}
                                  </div>
                                )}
                              </div>
                            )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 min-w-0">
                            <Badge variant={transaction.type === 'bill' ? 'default' : 'secondary'} className="w-fit">
                              {transaction.type === 'bill' ? (
                                <><FileText className="h-3 w-3 mr-1" /> Bill</>
                              ) : (
                                <><IndianRupee className="h-3 w-3 mr-1" /> Payment</>
                              )}
                            </Badge>
                            {isMobile && (
                              <div className="text-[11px] tabular-nums leading-tight">
                                {transaction.debit > 0 && (
                                  <div className="text-green-600 dark:text-green-400">
                                    Dr ₹{transaction.debit.toLocaleString("en-IN")}
                                  </div>
                                )}
                                {transaction.credit > 0 && (
                                  <div className="text-red-600 dark:text-red-400">
                                    Cr ₹{transaction.credit.toLocaleString("en-IN")}
                                  </div>
                                )}
                              </div>
                            )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-sm">{transaction.reference}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">{transaction.description}</TableCell>
                        <TableCell className="hidden md:table-cell text-right font-medium">
                          {transaction.debit > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              ₹{transaction.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right font-medium">
                          {transaction.credit > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              ₹{transaction.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          transaction.balance > 0 ? "text-red-600 dark:text-red-400" : 
                          transaction.balance < 0 ? "text-green-600 dark:text-green-400" : 
                          "text-foreground"
                        )}>
                          ₹{Math.abs(transaction.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Grand Total Row */}
                  {visibleTransactions.length > 0 && (() => {
                    const totalDebit = visibleTransactions.reduce((sum, t) => sum + t.debit, 0);
                    const totalCredit = visibleTransactions.reduce((sum, t) => sum + t.credit, 0);
                    const totalCreditNoteAdjust = visibleTransactions.filter(t => t.type === 'credit_note').reduce((sum, t) => sum + t.debit, 0);
                    const finalBalance = visibleTransactions[visibleTransactions.length - 1]?.balance || 0;
                    return (
                      <TableRow className="bg-muted/70 border-t-2 border-primary/20 font-bold">
                        <TableCell colSpan={isMobile ? 2 : 4} className="text-right text-base font-bold">
                          {isMobile ? (
                            <span className="text-sm font-semibold tabular-nums">
                              Dr ₹{totalDebit.toLocaleString("en-IN")} · Cr ₹{totalCredit.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            "Grand Total"
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-base">
                          <span className="text-green-600 dark:text-green-400">
                            ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                          {totalCreditNoteAdjust > 0 && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 font-normal mt-1">
                              (CN Adj: ₹{totalCreditNoteAdjust.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-base">
                          <span className="text-red-600 dark:text-red-400">
                            ₹{totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right text-base font-bold",
                          finalBalance > 0 ? "text-red-600 dark:text-red-400" :
                          finalBalance < 0 ? "text-green-600 dark:text-green-400" :
                          "text-foreground"
                        )}>
                          ₹{Math.abs(finalBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>

            {/* Same rows as Grand Total — not the org-wide snapshot, which can diverge. */}
            {cardRecon && (() => {
              const recon = cardRecon;
              const netPurchases =
                recon.openingBalance + recon.totalPurchases - recon.accountAdjust;
              const out = recon.balance;
              return (
                <div className="mt-4 rounded-md border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                    <Scale className="h-3.5 w-3.5" />
                    Balance Reconciliation
                  </div>
                  <div className="space-y-1.5 text-sm tabular-nums max-w-md">
                    <div className="flex justify-between">
                      <span>Opening Balance</span>
                      <span className="font-medium">₹{Math.round(recon.openingBalance).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>(+) Total Purchases</span>
                      <span className="font-medium">₹{Math.round(recon.totalPurchases).toLocaleString("en-IN")}</span>
                    </div>
                    {recon.accountAdjust > 0 && (
                      <div className="flex justify-between text-purple-700 dark:text-purple-400">
                        <span>(−) Credit Notes / Returns Adjusted</span>
                        <span className="font-medium">₹{Math.round(recon.accountAdjust).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1.5">
                      <span className="font-semibold">(=) Net Purchases</span>
                      <span className="font-semibold">₹{Math.round(netPurchases).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                      <span>(−) Paid (Cash / Bank)</span>
                      <span className="font-medium">₹{Math.round(recon.totalPaid).toLocaleString("en-IN")}</span>
                    </div>
                    {recon.refundsReceived > 0 && (
                      <div className="flex justify-between">
                        <span>(+) Refunds Received from Supplier</span>
                        <span className="font-medium">₹{Math.round(recon.refundsReceived).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className={cn(
                      "flex justify-between border-t-2 pt-2 mt-2 text-base font-bold",
                      out > 0 ? "text-red-600 dark:text-red-400" :
                      out < 0 ? "text-emerald-700 dark:text-emerald-300" :
                      "text-foreground"
                    )}>
                      <span>Outstanding ({out > 0 ? 'Payable / Cr' : out < 0 ? 'Supplier Credit / Dr' : 'Settled'})</span>
                      <span>₹{Math.abs(Math.round(out)).toLocaleString("en-IN")}</span>
                    </div>
                    {(selectedSupplierSnapshot?.unappliedCreditNotes ?? 0) > 0 && (
                      <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                        <span>Unapplied CN credit available</span>
                        <span>₹{Math.round(selectedSupplierSnapshot!.unappliedCreditNotes).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {tabCounts['cn-pending'] > 0 && (
                      <div className="text-[11px] text-orange-500 pt-0.5">
                        {tabCounts['cn-pending']} pending purchase-return CN(s) — listed in the “CN Pending” tab, not yet
                        deducted from this balance.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (embedMode && !selectedSupplier) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] text-muted-foreground gap-2 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">Loading supplier details…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0 max-w-full">
      {supplierBillPaymentDrift && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bill payment sync check</AlertTitle>
          <AlertDescription>
            At least one purchase bill has a paid amount that does not match bill-linked payment vouchers. Query the
            database view <span className="font-mono text-xs">supplier_bill_payment_voucher_drift</span> for this
            organization to review rows. Credit-note adjustments use{" "}
            <span className="font-mono text-xs">supplier_cn_bill_integrity_check</span>.
          </AlertDescription>
        </Alert>
      )}
      {balanceSnapshotError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Supplier balances could not be loaded fully</AlertTitle>
          <AlertDescription className="text-sm space-y-2">
            <span className="block font-medium">{balanceSnapshotError}</span>
            <span className="block text-muted-foreground">
              Outstanding needs purchase bills plus supplier payment/credit-note vouchers from the database. If totals stay at zero:
              run pending Supabase migrations; confirm your login is a member of this organization (User Rights / org access); in
              Supabase RLS, ensure <span className="font-mono text-xs">SELECT</span> on{" "}
              <span className="font-mono text-xs">voucher_entries</span> and{" "}
              <span className="font-mono text-xs">purchase_returns</span> for your role; check the browser console for the exact error.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-blue-500 to-blue-600"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80">Total Suppliers</p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">{summary.totalSuppliers}</div>
            <p className="text-xs text-white/65 mt-0.5">Active supplier accounts</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-red-500 to-red-600"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80">Total Payable</p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">
              ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-white/65 mt-0.5">Amount pending payment</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80">Total Purchases</p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">
              ₹{summary.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-white/65 mt-0.5">Total purchase value</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-800">Supplier Ledger</h3>
          <p className="text-xs text-slate-500 mt-0.5">Transaction history per supplier</p>
        </div>
        <div className="p-2 sm:p-3">
          <div className="flex flex-wrap items-center gap-2 mb-3 w-full">
            <div className={accountsHistorySearchWrapClass}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm border-slate-200"
              />
            </div>
            
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="w-[148px] shrink-0 h-9 text-sm">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="advance">Advance Paid</SelectItem>
              </SelectContent>
            </Select>

            {paymentStatusFilter !== "all" && (
              <Button
                variant="ghost"
                onClick={() => setPaymentStatusFilter("all")}
                className="h-9 shrink-0"
              >
                Clear
              </Button>
            )}
            <AccountsExportButtons
              className="sm:ml-auto"
              rows={filteredSuppliers}
              fileBase="Supplier_Ledger"
              sheetName="Supplier Ledger"
              title="Supplier Ledger"
              columns={[
                { header: "Supplier Name", width: 1.6, value: (s) => s.supplier_name },
                { header: "Phone", width: 1, value: (s) => s.phone || "" },
                { header: "Email", width: 1.3, value: (s) => s.email || "" },
                { header: "Total Purchases", width: 1, align: "right", value: (s) => Number(s.totalPurchases || 0).toFixed(2) },
                { header: "Total Paid", width: 1, align: "right", value: (s) => Number(s.totalPaid || 0).toFixed(2) },
                { header: "Balance", width: 1, align: "right", value: (s) => Number(s.balance || 0).toFixed(2) },
                {
                  header: "Status",
                  width: 0.8,
                  value: (s) => (s.balance > 0 ? "Payable" : s.balance < 0 ? "Advance" : "Settled"),
                },
              ]}
            />
          </div>

          {isMobile ? (
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center text-muted-foreground py-8">Loading suppliers...</div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No suppliers found</div>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <Card
                    key={supplier.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedSupplier(supplier)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-base break-words">{supplier.supplier_name}</h3>
                          {supplier.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {supplier.phone}
                            </div>
                          )}
                        </div>
                        {supplier.balance > 0 && <Badge variant="destructive" className="shrink-0">Payable</Badge>}
                        {supplier.balance < 0 && <Badge variant="default" className="bg-green-600 shrink-0">Advance</Badge>}
                        {supplier.balance === 0 && <Badge variant="outline" className="shrink-0">Settled</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                        <div className="text-center min-w-0">
                          <div className="text-xs text-muted-foreground">Purchases</div>
                          <div className="font-medium text-sm tabular-nums truncate">
                            ₹{supplier.totalPurchases.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="text-center min-w-0">
                          <div className="text-xs text-muted-foreground">Paid</div>
                          <div className="font-medium text-sm tabular-nums text-green-600 dark:text-green-400 truncate">
                            ₹{supplier.totalPaid.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="text-center min-w-0">
                          <div className="text-xs text-muted-foreground">Balance</div>
                          <div className={cn(
                            "font-bold text-sm tabular-nums truncate",
                            supplier.balance > 0 ? "text-red-600 dark:text-red-400" :
                            supplier.balance < 0 ? "text-green-600 dark:text-green-400" :
                            "text-foreground"
                          )}>
                            ₹{Math.abs(supplier.balance).toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSupplier(supplier);
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
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table className={accountsHistoryTableClass}>
              <TableHeader className="!static">
                <TableRow>
                  <TableHead className={accountsHistoryThClass}>Supplier Name</TableHead>
                  <TableHead className={accountsHistoryThClass}>Contact</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Total Purchases</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Total Paid</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Balance</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-center")}>Status</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow 
                      key={supplier.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedSupplier(supplier)}
                    >
                      <TableCell className="font-medium">{supplier.supplier_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {supplier.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {supplier.phone}
                            </div>
                          )}
                          {supplier.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {supplier.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{supplier.totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">
                        ₹{supplier.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-bold",
                        supplier.balance > 0 ? "text-red-600 dark:text-red-400" : 
                        supplier.balance < 0 ? "text-green-600 dark:text-green-400" : 
                        "text-foreground"
                      )}>
                        ₹{Math.abs(supplier.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {supplier.balance > 0 && (
                          <Badge variant="destructive">Payable</Badge>
                        )}
                        {supplier.balance < 0 && (
                          <Badge variant="default" className="bg-green-600">Advance</Badge>
                        )}
                        {supplier.balance === 0 && (
                          <Badge variant="outline">Settled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSupplier(supplier);
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
        </div>
      </div>
    </div>
  );
}
