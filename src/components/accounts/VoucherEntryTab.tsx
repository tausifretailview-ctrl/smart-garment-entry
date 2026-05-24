import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import { cn } from "@/lib/utils";

interface VoucherEntryTabProps {
  vouchers: any[] | undefined;
}

export function VoucherEntryTab({ vouchers }: VoucherEntryTabProps) {
  const formatEntryDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy, hh:mm a");
  };

  return (
    <div className="space-y-3">
      <AccountsHistoryPanel title="All Voucher Entries">
        <Table className={accountsHistoryTableClass}>
          <TableHeader className="!static">
            <TableRow>
              <TableHead className={accountsHistoryThClass}>Voucher No</TableHead>
              <TableHead className={accountsHistoryThClass}>Type</TableHead>
              <TableHead className={accountsHistoryThClass}>Date</TableHead>
              <TableHead className={accountsHistoryThClass}>Entry Date &amp; Time</TableHead>
              <TableHead className={accountsHistoryThClass}>Reference</TableHead>
              <TableHead className={cn(accountsHistoryThClass, "text-right")}>Amount</TableHead>
              <TableHead className={accountsHistoryThClass}>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vouchers?.map((voucher) => (
              <TableRow key={voucher.id} className="hover:bg-accent/50">
                <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                <TableCell className="capitalize">{voucher.voucher_type}</TableCell>
                <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                <TableCell>{formatEntryDateTime(voucher.created_at)}</TableCell>
                <TableCell className="capitalize">{voucher.reference_type || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">₹{voucher.total_amount.toFixed(2)}</TableCell>
                <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AccountsHistoryPanel>
    </div>
  );
}
