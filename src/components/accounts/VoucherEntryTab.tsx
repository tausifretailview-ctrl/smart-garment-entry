import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface VoucherEntryTabProps {
  vouchers: any[] | undefined;
}

export function VoucherEntryTab({ vouchers }: VoucherEntryTabProps) {
  return (
    <div className="space-y-6">
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
    </div>
  );
}
