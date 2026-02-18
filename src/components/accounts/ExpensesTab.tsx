import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExpensesTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
}

export function ExpensesTab({ organizationId, vouchers }: ExpensesTabProps) {
  const queryClient = useQueryClient();
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const createExpenseVoucher = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error("Please enter an expense category");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Please enter a valid amount");

      const { data: voucherNumber, error: numberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: "expense", p_date: format(voucherDate, "yyyy-MM-dd") }
      );
      if (numberError) throw numberError;

      const { error } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "expense",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: "expense",
          description: category,
          total_amount: parseFloat(amount),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      setVoucherDate(new Date());
      setCategory("");
      setAmount("");
    },
    onError: (error: any) => {
      toast.error(`Failed to record expense: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createExpenseVoucher.mutate();
  };

  return (
    <div className="space-y-6">
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
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
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

            <Button type="submit" className="w-full md:w-auto" disabled={createExpenseVoucher.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createExpenseVoucher.isPending ? "Recording..." : "Record Expense"}
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
    </div>
  );
}
