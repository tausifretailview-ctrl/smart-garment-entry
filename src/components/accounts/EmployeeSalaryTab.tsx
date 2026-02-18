import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

      const { error } = await supabase
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
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Salary payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      setVoucherDate(new Date());
      setReferenceId("");
      setAmount("");
      setDescription("");
    },
    onError: (error: any) => {
      toast.error(`Failed to record salary: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSalaryVoucher.mutate();
  };

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers
                ?.filter((v) => v.reference_type === "employee" && v.voucher_type === "payment")
                .slice(0, 10)
                .map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                    <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      {employees?.find((e) => e.id === voucher.reference_id)?.employee_name || "-"}
                    </TableCell>
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
