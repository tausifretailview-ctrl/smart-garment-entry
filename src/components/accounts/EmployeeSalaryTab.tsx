import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  deleteJournalEntryByReference,
  recordSalaryVoucherJournalEntry,
} from "@/utils/accounting/journalService";

interface EmployeeSalaryTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
}

export function EmployeeSalaryTab({ organizationId, vouchers }: EmployeeSalaryTabProps) {
  const queryClient = useQueryClient();
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [referenceId, setReferenceId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [salaryDeleteTarget, setSalaryDeleteTarget] = useState<{ id: string; voucherNumber: string } | null>(
    null
  );

  const { data: employees } = useQuery({
    queryKey: ["employees", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("organization_id", organizationId)
        .order("employee_name");
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const createSalaryVoucher = useMutation({
    mutationFn: async () => {
      if (!referenceId) throw new Error("Please select an employee");
      if (!amount || parseFloat(amount) <= 0) throw new Error("Please enter a valid amount");

      const { data: voucherNumber, error: numberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: "payment", p_date: format(voucherDate, "yyyy-MM-dd") }
      );
      if (numberError) throw numberError;

      const { data: inserted, error } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "payment",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: "employee",
          reference_id: referenceId,
          description: description || `Salary Payment`,
          total_amount: parseFloat(amount),
          payment_method: paymentMethod,
        })
        .select("id")
        .single();

      if (error) throw error;

      const { data: acctSettings } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = Boolean(
        (acctSettings as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled
      );

      if (postLedger && inserted?.id) {
        try {
          await recordSalaryVoucherJournalEntry(
            inserted.id,
            organizationId,
            parseFloat(amount),
            paymentMethod,
            format(voucherDate, "yyyy-MM-dd"),
            description || "Salary Payment",
            supabase
          );
        } catch (jErr) {
          await supabase.from("voucher_entries").delete().eq("id", inserted.id);
          throw jErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Salary payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      setVoucherDate(new Date());
      setReferenceId("");
      setAmount("");
      setDescription("");
      setPaymentMethod("cash");
    },
    onError: (error: any) => {
      toast.error(`Failed to record salary: ${error.message}`);
    },
  });

  const deleteSalaryVoucher = useMutation({
    mutationFn: async (voucherId: string) => {
      const { data: acctSettings } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = Boolean(
        (acctSettings as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled
      );
      if (postLedger) {
        await deleteJournalEntryByReference(organizationId, "SalaryVoucher", voucherId, supabase);
      }
      const { error } = await supabase
        .from("voucher_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", voucherId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Salary voucher removed");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      setSalaryDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete voucher"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSalaryVoucher.mutate();
  };

  const salaryRows =
    vouchers
      ?.filter((v) => v.reference_type === "employee" && v.voucher_type === "payment" && !v.deleted_at)
      .slice(0, 10) ?? [];

  return (
    <div className="space-y-6">
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
                <Select value={referenceId || undefined} onValueChange={setReferenceId}>
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
                <Label>Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
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

            <Button type="submit" className="w-full md:w-auto" disabled={createSalaryVoucher.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createSalaryVoucher.isPending ? "Recording..." : "Record Salary Payment"}
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
                <TableHead className="w-[56px] text-center"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaryRows.map((voucher) => (
                <TableRow key={voucher.id}>
                  <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                  <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    {employees?.find((e) => e.id === voucher.reference_id)?.employee_name || "-"}
                  </TableCell>
                  <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                  <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() =>
                        setSalaryDeleteTarget({ id: voucher.id, voucherNumber: voucher.voucher_number })
                      }
                      aria-label="Delete salary voucher"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!salaryDeleteTarget} onOpenChange={(open) => !open && setSalaryDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete salary voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove voucher {salaryDeleteTarget?.voucherNumber ?? ""} and its general-ledger entry (if
              any). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSalaryVoucher.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSalaryVoucher.isPending}
              onClick={() => salaryDeleteTarget && deleteSalaryVoucher.mutate(salaryDeleteTarget.id)}
            >
              {deleteSalaryVoucher.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
