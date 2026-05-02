import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, BookText, ChevronDown, ChevronUp, Info } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { seedDefaultAccounts } from "@/utils/accounting/seedDefaultAccounts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type RefTypeFilter =
  | "all"
  | "Sale"
  | "Purchase"
  | "Payment"
  | "StudentFeeReceipt"
  | "ExpenseVoucher"
  | "SalaryVoucher"
  | "CustomerReceipt"
  | "SupplierPayment"
  | "CustomerAdvanceApplication"
  | "CustomerCreditNoteApplication"
  | "CustomerAdvanceReceipt"
  | "CustomerAdvanceRefund";

interface JournalEntryRow {
  id: string;
  date: string;
  reference_type: "Sale" | "Purchase" | "Payment" | string;
  reference_id: string | null;
  description: string | null;
  total_amount: number | null;
}

interface JournalLineRow {
  id: string;
  debit_amount: number | null;
  credit_amount: number | null;
  chart_of_accounts:
    | {
        account_name: string;
        account_code: string;
      }
    | {
        account_name: string;
        account_code: string;
      }[]
    | null;
}

const fmtAmount = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);

const toYmd = (date: Date) => format(date, "yyyy-MM-dd");

export default function JournalVouchers() {
  const { currentOrganization } = useOrganization();
  const [searchParams] = useSearchParams();
  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");
  const [fromDate, setFromDate] = useState<Date>(initialFrom ? new Date(initialFrom) : new Date());
  const [toDate, setToDate] = useState<Date>(initialTo ? new Date(initialTo) : new Date());
  const [referenceType, setReferenceType] = useState<RefTypeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: accountingSettings } = useQuery({
    queryKey: ["settings-accounting-flag", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { accounting_engine_enabled?: boolean } | null;
    },
  });

  const engineExplicitlyOff = accountingSettings?.accounting_engine_enabled === false;

  const { data: entries = [], isLoading } = useQuery({
    queryKey: [
      "journal-vouchers",
      currentOrganization?.id,
      toYmd(fromDate),
      toYmd(toDate),
      referenceType,
    ],
    enabled: !!currentOrganization?.id,
    queryFn: async (): Promise<JournalEntryRow[]> => {
      await seedDefaultAccounts(currentOrganization!.id, supabase);
      let query = (supabase as any)
        .from("journal_entries")
        .select("id, date, reference_type, reference_id, description, total_amount")
        .eq("organization_id", currentOrganization!.id)
        .gte("date", toYmd(fromDate))
        .lte("date", toYmd(toDate))
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (referenceType !== "all") {
        query = query.eq("reference_type", referenceType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lines = [], isLoading: linesLoading } = useQuery({
    queryKey: ["journal-voucher-lines", expandedId],
    enabled: !!expandedId,
    queryFn: async (): Promise<JournalLineRow[]> => {
      const { data, error } = await (supabase as any)
        .from("journal_lines")
        .select("id, debit_amount, credit_amount, chart_of_accounts(account_name, account_code)")
        .eq("journal_entry_id", expandedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const linesTotals = useMemo(() => {
    return (lines || []).reduce(
      (acc, line) => {
        acc.debit += Number(line.debit_amount || 0);
        acc.credit += Number(line.credit_amount || 0);
        return acc;
      },
      { debit: 0, credit: 0 }
    );
  }, [lines]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold">Journal Vouchers / Day Book</h1>
            <p className="text-sm text-muted-foreground">Review auto-generated double-entry postings</p>
          </div>
        </div>
      </div>

      {engineExplicitlyOff && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Accounting engine disabled for this organization</AlertTitle>
          <AlertDescription>
            Posting to the day book is turned off because <strong>accounting_engine_enabled</strong> is set to{" "}
            <strong>false</strong> in settings. Set it to <strong>true</strong> to resume automatic journals. Existing
            entries in the selected date range still appear below.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">From Date</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(fromDate, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fromDate} onSelect={(d) => d && setFromDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">To Date</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(toDate, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={toDate} onSelect={(d) => d && setToDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Reference Type</p>
              <Select value={referenceType} onValueChange={(v: RefTypeFilter) => setReferenceType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Sale">Sale</SelectItem>
                  <SelectItem value="Purchase">Purchase</SelectItem>
                  <SelectItem value="Payment">Payment</SelectItem>
                  <SelectItem value="StudentFeeReceipt">Student fee receipt</SelectItem>
                  <SelectItem value="ExpenseVoucher">Expense voucher</SelectItem>
                  <SelectItem value="SalaryVoucher">Salary voucher</SelectItem>
                  <SelectItem value="CustomerReceipt">Customer receipt</SelectItem>
                  <SelectItem value="SupplierPayment">Supplier payment</SelectItem>
                  <SelectItem value="CustomerAdvanceApplication">Customer advance application</SelectItem>
                  <SelectItem value="CustomerCreditNoteApplication">Credit note application</SelectItem>
                  <SelectItem value="CustomerAdvanceReceipt">Customer advance receipt</SelectItem>
                  <SelectItem value="CustomerAdvanceRefund">Customer advance refund</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Entries</p>
              <p className="text-lg font-semibold">{entries.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <BookText className="h-4 w-4 text-primary" />
            Journal Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher ID</TableHead>
                  <TableHead>Reference Type</TableHead>
                  <TableHead>Reference ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading journal vouchers...
                    </TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No entries found for selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const isOpen = expandedId === entry.id;
                    return (
                      <Fragment key={entry.id}>
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setExpandedId(isOpen ? null : entry.id)}
                        >
                          <TableCell className="w-[48px]">
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </TableCell>
                          <TableCell>{entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{entry.reference_type || "-"}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{entry.reference_id || "-"}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{entry.description || "-"}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {fmtAmount(Number(entry.total_amount || 0))}
                          </TableCell>
                        </TableRow>

                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/20">
                              {linesLoading ? (
                                <p className="text-sm text-muted-foreground py-2">Loading journal lines...</p>
                              ) : (
                                <div className="space-y-3 py-2">
                                  <div className="text-xs text-muted-foreground">Ledger lines</div>
                                  <div className="overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Account Name</TableHead>
                                          <TableHead className="text-right">Debit Amount</TableHead>
                                          <TableHead className="text-right">Credit Amount</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {lines.map((line) => {
                                          const account = Array.isArray(line.chart_of_accounts)
                                            ? line.chart_of_accounts[0]
                                            : line.chart_of_accounts;
                                          return (
                                            <TableRow key={line.id}>
                                              <TableCell>
                                                <div className="font-medium">{account?.account_name || "Unknown Account"}</div>
                                                <div className="text-xs text-muted-foreground">{account?.account_code || "-"}</div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {Number(line.debit_amount || 0) > 0
                                                  ? fmtAmount(Number(line.debit_amount || 0))
                                                  : "-"}
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {Number(line.credit_amount || 0) > 0
                                                  ? fmtAmount(Number(line.credit_amount || 0))
                                                  : "-"}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                        <TableRow className="bg-muted/30 font-semibold">
                                          <TableCell>Total</TableCell>
                                          <TableCell className="text-right">{fmtAmount(linesTotals.debit)}</TableCell>
                                          <TableCell className="text-right">{fmtAmount(linesTotals.credit)}</TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </div>
                                  <div
                                    className={cn(
                                      "text-xs font-medium",
                                      Math.abs(linesTotals.debit - linesTotals.credit) < 0.01
                                        ? "text-emerald-600"
                                        : "text-red-600"
                                    )}
                                  >
                                    {Math.abs(linesTotals.debit - linesTotals.credit) < 0.01
                                      ? "Balanced entry: Debits equal Credits"
                                      : "Imbalance detected: Debits and Credits do not match"}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

