import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import { cn } from "@/lib/utils";
import { resolveVoucherPartyName } from "@/utils/paymentVoucherFilters";
import { filterVoucherEntryRows } from "@/utils/voucherEntryListFilter";

interface VoucherEntryTabProps {
  vouchers: any[] | undefined;
  sales?: any[];
  customers?: any[];
}

export function VoucherEntryTab({ vouchers, sales, customers }: VoucherEntryTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();

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
        sales,
        customers,
      }),
    [vouchers, searchQuery, filterDateFrom, filterDateTo, sales, customers],
  );

  const formatEntryDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy, hh:mm a");
  };

  const hasFilters = !!(searchQuery || filterDateFrom || filterDateTo);

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
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setSearchQuery("");
                  setFilterDateFrom(undefined);
                  setFilterDateTo(undefined);
                }}
              >
                Clear
              </Button>
            )}
          </>
        }
        footer={
          <div className="text-xs text-muted-foreground">
            Showing {filteredVouchers.length}
            {vouchers?.length != null ? ` of ${vouchers.length}` : ""} vouchers
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
            {filteredVouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm py-8 text-muted-foreground">
                  {hasFilters ? "No vouchers match your search." : "No voucher entries."}
                </TableCell>
              </TableRow>
            ) : (
              filteredVouchers.map((voucher) => (
                <TableRow key={voucher.id} className="hover:bg-accent/50">
                  <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                  <TableCell className="capitalize">{voucher.voucher_type}</TableCell>
                  <TableCell>
                    {voucher.voucher_date
                      ? format(new Date(voucher.voucher_date), "dd/MM/yyyy")
                      : "-"}
                  </TableCell>
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
