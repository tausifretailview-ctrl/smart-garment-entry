import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountsExportButtons } from "@/components/accounts/AccountsExportButtons";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import { cn } from "@/lib/utils";
import { isCustomerReceiptVoucher, resolveVoucherPartyName } from "@/utils/paymentVoucherFilters";
import {
  filterVoucherEntryRows,
  formatVoucherEntryDate,
  type VoucherEntryKind,
} from "@/utils/voucherEntryListFilter";

const VOUCHER_ENTRY_PAGE = 500;

interface VoucherEntryTabProps {
  vouchers: any[] | undefined;
  sales?: any[];
  customers?: any[];
  isLoading?: boolean;
  errorMessage?: string | null;
}

export function VoucherEntryTab({
  vouchers,
  sales,
  customers,
  isLoading = false,
  errorMessage = null,
}: VoucherEntryTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [entryKind, setEntryKind] = useState<VoucherEntryKind>("all");
  const [visibleCount, setVisibleCount] = useState(VOUCHER_ENTRY_PAGE);

  const partyCtx = useMemo(
    () => ({ tab: "customer-payment" as const, sales, customers }),
    [sales, customers],
  );

  const filteredVouchers = useMemo(
    () =>
      filterVoucherEntryRows({
        vouchers,
        searchQuery,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        entryKind,
        sales,
        customers,
      }),
    [vouchers, searchQuery, filterDateFrom, filterDateTo, entryKind, sales, customers],
  );

  const receiptCount = useMemo(
    () => (vouchers || []).filter((row) => isCustomerReceiptVoucher(row)).length,
    [vouchers],
  );

  useEffect(() => {
    setVisibleCount(VOUCHER_ENTRY_PAGE);
  }, [searchQuery, filterDateFrom, filterDateTo, entryKind]);

  const visibleVouchers = filteredVouchers.slice(0, visibleCount);
  const waiting = isLoading && vouchers == null;

  const formatEntryDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy, hh:mm a");
  };

  const hasFilters = !!(searchQuery || filterDateFrom || filterDateTo || entryKind !== "all");

  return (
    <div className="space-y-3">
      <AccountsHistoryPanel
        title="All Voucher Entries"
        searchPlaceholder="Search customer name, date, voucher no…"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        filters={
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 text-sm gap-1.5 border-slate-200 bg-slate-50 hover:bg-white">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {filterDateFrom ? format(filterDateFrom, "dd/MM") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 text-sm gap-1.5 border-slate-200 bg-slate-50 hover:bg-white">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {filterDateTo ? format(filterDateTo, "dd/MM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant={entryKind === "all" ? "default" : "outline"}
              className="h-9 text-sm"
              onClick={() => setEntryKind("all")}
            >
              All entries
            </Button>
            <Button
              type="button"
              variant={entryKind === "payment-receipts" ? "default" : "outline"}
              className="h-9 text-sm"
              onClick={() => setEntryKind("payment-receipts")}
            >
              Payment receipts
            </Button>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setSearchQuery("");
                  setFilterDateFrom(undefined);
                  setFilterDateTo(undefined);
                  setEntryKind("all");
                }}
              >
                Clear
              </Button>
            )}
          </>
        }
        actions={
          <AccountsExportButtons
            rows={filteredVouchers}
            fileBase="Voucher_Entries"
            sheetName="Voucher Entries"
            title="Voucher Entries"
            columns={[
              { header: "Voucher No", width: 1.1, value: (v) => v.voucher_number || "" },
              { header: "Type", width: 0.8, value: (v) => v.voucher_type || "" },
              {
                header: "Date",
                width: 0.9,
                value: (v) => formatVoucherEntryDate(v.voucher_date),
              },
              { header: "Entry Date & Time", width: 1.4, value: (v) => formatEntryDateTime(v.created_at) },
              { header: "Party", width: 1.4, value: (v) => resolveVoucherPartyName(v, partyCtx) },
              { header: "Reference", width: 1, value: (v) => v.reference_type || "" },
              {
                header: "Amount",
                width: 0.9,
                align: "right",
                value: (v) => Number(v.total_amount || 0).toFixed(2),
              },
              { header: "Description", width: 2, value: (v) => v.description || "" },
            ]}
          />
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {entryKind === "payment-receipts"
                ? `Showing ${Math.min(visibleCount, filteredVouchers.length)} of ${filteredVouchers.length} payment receipts`
                : `Showing ${Math.min(visibleCount, filteredVouchers.length)} of ${filteredVouchers.length} vouchers · ${receiptCount} payment receipts`}
            </span>
            {visibleCount < filteredVouchers.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setVisibleCount((count) => count + VOUCHER_ENTRY_PAGE)}
              >
                Show more
              </Button>
            ) : null}
          </div>
        }
      >
        <Table className={accountsHistoryTableClass}>
          <TableHeader className="!static">
            <TableRow>
              <TableHead className={accountsHistoryThClass}>Voucher No</TableHead>
              <TableHead className={accountsHistoryThClass}>Type</TableHead>
              <TableHead className={accountsHistoryThClass}>Date</TableHead>
              <TableHead className={accountsHistoryThClass}>Entry Date &amp; Time</TableHead>
              <TableHead className={accountsHistoryThClass}>Party</TableHead>
              <TableHead className={accountsHistoryThClass}>Reference</TableHead>
              <TableHead className={cn(accountsHistoryThClass, "text-right")}>Amount</TableHead>
              <TableHead className={accountsHistoryThClass}>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waiting ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm py-8 text-muted-foreground">
                  Loading voucher entries…
                </TableCell>
              </TableRow>
            ) : errorMessage ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm py-8 text-destructive">
                  {errorMessage}
                </TableCell>
              </TableRow>
            ) : filteredVouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm py-8 text-muted-foreground">
                  {hasFilters ? "No vouchers match your search." : "No voucher entries."}
                </TableCell>
              </TableRow>
            ) : (
              visibleVouchers.map((voucher) => (
                <TableRow key={voucher.id} className="hover:bg-accent/50">
                  <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                  <TableCell className="capitalize">{voucher.voucher_type}</TableCell>
                  <TableCell>{formatVoucherEntryDate(voucher.voucher_date)}</TableCell>
                  <TableCell>{formatEntryDateTime(voucher.created_at)}</TableCell>
                  <TableCell className="max-w-[160px] truncate">
                    {resolveVoucherPartyName(voucher, partyCtx)}
                  </TableCell>
                  <TableCell className="capitalize">{voucher.reference_type || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(voucher.total_amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </AccountsHistoryPanel>
    </div>
  );
}
