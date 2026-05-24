import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Printer,
  RotateCcw,
  SkipBack,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AccountsPaymentTabId } from "@/hooks/useAccountsVoucherData";
import {
  filterVouchersForPaymentTab,
  resolveVoucherPartyName,
  sortVouchersNewestFirst,
  type PaymentVoucherRow,
} from "@/utils/paymentVoucherFilters";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";

const TAB_LABELS: Record<AccountsPaymentTabId, string> = {
  "customer-payment": "Customer receipts",
  "supplier-payment": "Supplier payments",
  expenses: "Expenses",
  "employee-salary": "Salary payments",
};

interface PaymentTransactionHistoryPanelProps {
  tab: AccountsPaymentTabId;
  vouchers: PaymentVoucherRow[] | undefined;
  sales?: any[];
  customers?: any[];
  suppliers?: any[];
  employees?: any[];
  navIndex: number | null;
  onNavIndexChange: (index: number | null) => void;
  onShowReceipt?: (data: any) => void;
  onEditPayment?: (voucher: PaymentVoucherRow) => void;
}

export function PaymentTransactionHistoryPanel({
  tab,
  vouchers,
  sales,
  customers,
  suppliers,
  employees,
  navIndex,
  onNavIndexChange,
  onShowReceipt,
  onEditPayment,
}: PaymentTransactionHistoryPanelProps) {
  const { isAdmin } = useUserRoles();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let rows = sortVouchersNewestFirst(filterVouchersForPaymentTab(tab, vouchers));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((v) => {
        const party = resolveVoucherPartyName(v, { tab, sales, customers, suppliers, employees });
        return (
          (v.voucher_number || "").toLowerCase().includes(q) ||
          party.toLowerCase().includes(q) ||
          (v.description || "").toLowerCase().includes(q) ||
          (v.payment_method || "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [tab, vouchers, search, sales, customers, suppliers, employees]);

  const selected =
    navIndex !== null && navIndex >= 0 && navIndex < filtered.length ? filtered[navIndex] : null;

  const goToIndex = (idx: number) => {
    if (idx < 0 || idx >= filtered.length) return;
    onNavIndexChange(idx);
  };

  const handleLast = () => {
    if (filtered.length > 0) goToIndex(0);
  };
  const handlePrevious = () => {
    if (navIndex === null) {
      if (filtered.length > 0) goToIndex(0);
      return;
    }
    goToIndex(Math.min(filtered.length - 1, navIndex + 1));
  };
  const handleNext = () => {
    if (navIndex === null) return;
    goToIndex(Math.max(0, navIndex - 1));
  };

  const buildCustomerReceipt = (voucher: PaymentVoucherRow) => {
    if (!onShowReceipt || tab !== "customer-payment") return;
    const invoice = sales?.find((s) => s.id === voucher.reference_id);
    const customer =
      voucher.reference_type === "customer"
        ? customers?.find((c) => c.id === voucher.reference_id)
        : invoice?.customer_id
          ? customers?.find((c) => c.id === invoice.customer_id)
          : null;
    const customerName = resolveVoucherPartyName(voucher, {
      tab,
      sales,
      customers,
      suppliers,
      employees,
    });
    const paid = Number(voucher.total_amount) || 0;
    const discAmt = Number(voucher.discount_amount) || 0;
    const discReason = String(voucher.discount_reason || "");
    const invNet = invoice?.net_amount != null ? Number(invoice.net_amount) : paid + discAmt;
    onShowReceipt({
      voucherNumber: voucher.voucher_number,
      voucherDate: voucher.voucher_date,
      customerName,
      customerPhone: customer?.phone || "",
      customerAddress: customer?.address || "",
      invoiceNumber: voucher.description?.includes("Against Invoice")
        ? voucher.description.replace("Against Invoice: ", "")
        : voucher.description || "-",
      invoiceDate: invoice?.sale_date || voucher.voucher_date,
      invoiceAmount: invNet,
      paidAmount: paid,
      discountAmount: discAmt,
      discountReason: discReason,
      paymentMethod: voucher.payment_method || "cash",
      previousBalance: 0,
      currentBalance: 0,
    });
  };

  const canEdit =
    isAdmin && onEditPayment && (tab === "customer-payment" || tab === "supplier-payment");

  return (
    <div className="flex flex-col h-full min-h-0 border-t border-slate-200 bg-slate-50/50">
      <AccountsHistoryPanel
        title={TAB_LABELS[tab]}
        className="rounded-none border-0 shadow-none flex-1 min-h-0 flex flex-col [&>div:last-child]:flex-1"
        searchPlaceholder="Search voucher, party, description…"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          onNavIndexChange(null);
        }}
        toolbar={
          <>
            <Badge variant="secondary" className="text-xs font-normal">
              {filtered.length} record{filtered.length === 1 ? "" : "s"}
            </Badge>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1 border-slate-200 bg-white"
                onClick={handleLast}
                disabled={filtered.length === 0}
                title="Newest transaction"
              >
                <SkipBack className="h-3.5 w-3.5" />
                Last
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-slate-200 bg-white"
                onClick={handlePrevious}
                disabled={filtered.length === 0 || navIndex === null || navIndex >= filtered.length - 1}
                title="Older"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium tabular-nums min-w-[4.5rem] text-center text-slate-600">
                {filtered.length === 0
                  ? "—"
                  : navIndex !== null
                    ? `${navIndex + 1} / ${filtered.length}`
                    : "—"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-slate-200 bg-white"
                onClick={handleNext}
                disabled={filtered.length === 0 || navIndex === null || navIndex <= 0}
                title="Newer"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => onNavIndexChange(null)}
                title="Clear selection"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        }
      >
        {selected && (
          <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-blue-50/80 flex flex-wrap items-center gap-3 text-sm">
            <div>
              <span className="font-mono font-bold">{selected.voucher_number}</span>
              <span className="text-muted-foreground mx-2">·</span>
              <span>{format(new Date(selected.voucher_date || selected.created_at || 0), "dd MMM yyyy")}</span>
            </div>
            <div className="font-semibold tabular-nums">
              ₹{Number(selected.total_amount || 0).toLocaleString("en-IN")}
            </div>
            <Badge variant="outline" className="uppercase text-[10px]">
              {selected.payment_method || "—"}
            </Badge>
            <span className="text-muted-foreground truncate max-w-[200px]">
              {resolveVoucherPartyName(selected, { tab, sales, customers, suppliers, employees })}
            </span>
            <span className="text-muted-foreground truncate flex-1 min-w-[120px]">
              {selected.description || "—"}
            </span>
            <div className="flex gap-1 ml-auto">
              {canEdit && (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onEditPayment(selected)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
              {tab === "customer-payment" && onShowReceipt && (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => buildCustomerReceipt(selected)}>
                  <Printer className="h-3.5 w-3.5 mr-1" />
                  Print
                </Button>
              )}
            </div>
          </div>
        )}

        <Table className={accountsHistoryTableClass}>
          <TableHeader className="!static">
            <TableRow>
              <TableHead className={accountsHistoryThClass}>Voucher</TableHead>
              <TableHead className={accountsHistoryThClass}>Date</TableHead>
              <TableHead className={accountsHistoryThClass}>Party</TableHead>
              <TableHead className={cn(accountsHistoryThClass, "text-right")}>Amount</TableHead>
              <TableHead className={accountsHistoryThClass}>Method</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((v, idx) => (
                <TableRow
                  key={v.id}
                  className={cn(
                    "cursor-pointer hover:bg-accent/50",
                    navIndex === idx && "bg-primary/10 hover:bg-primary/10",
                  )}
                  onClick={() => onNavIndexChange(idx)}
                >
                  <TableCell className="font-mono text-sm font-medium">{v.voucher_number}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(v.voucher_date || v.created_at || 0), "dd/MM/yy")}
                  </TableCell>
                  <TableCell className="text-sm max-w-[140px] truncate">
                    {resolveVoucherPartyName(v, { tab, sales, customers, suppliers, employees })}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    ₹{Number(v.total_amount || 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-sm uppercase">{v.payment_method || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </AccountsHistoryPanel>
    </div>
  );
}
