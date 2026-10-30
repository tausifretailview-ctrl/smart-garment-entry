import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import {
  ArrowDownToLine,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganizationBankAccounts } from "@/hooks/useOrganizationBankAccounts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import { formatBankAccountLabel, pickDefaultBankAccountId } from "@/utils/organizationBankAccounts";
import {
  bankPaymentMethodLabel,
  bankReferenceTypeLabel,
  deleteCashBankTransfer,
  fetchBankStatement,
  filterBankStatementRows,
  postCashBankTransfer,
  summarizeBankStatement,
  type BankDirectionFilter,
  type BankStatementRow,
  type CashBankTransferKind,
} from "@/utils/accounting/bankStatement";

const ALL_BANKS = "all";
const PAGE_SIZE = 100;

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmt = (n: number) => inr.format(n);
const drCr = (n: number) => (n > 0.005 ? "Dr" : n < -0.005 ? "Cr" : "");

const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
};

/**
 * Bank Statement: GL 1010 Bank lines per organization bank account (Settings → Company Profile),
 * with opening and running balance. Dr = money into the bank, Cr = money out.
 */
export default function BankStatementPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const { accounts: banks, isLoading: banksLoading } = useOrganizationBankAccounts(orgId);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    orgNavigate("/accounts");
  };

  const [bankFilter, setBankFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<BankDirectionFilter>("all");

  // Default bank first; "All banks" only when there is more than one.
  useEffect(() => {
    if (bankFilter || banksLoading) return;
    setBankFilter(pickDefaultBankAccountId(banks) ?? ALL_BANKS);
  }, [banks, banksLoading, bankFilter]);

  const selectedBank = banks.find((b) => b.id === bankFilter) ?? null;
  const bankIdParam = bankFilter && bankFilter !== ALL_BANKS ? bankFilter : null;

  const statementKey = ["bank-statement", orgId, bankIdParam, fromDate, toDate];
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: statementKey,
    enabled: !!orgId && !!bankFilter && !!fromDate && !!toDate && fromDate <= toDate,
    staleTime: 60_000,
    queryFn: () => fetchBankStatement(orgId!, bankIdParam, fromDate, toDate),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const splitByBank = data?.splitByBank ?? true;
  const summary = useMemo(() => summarizeBankStatement(rows), [rows]);
  const filteredRows = useMemo(
    () => filterBankStatementRows(rows, search, direction),
    [rows, search, direction],
  );
  const movementCount = rows.filter((r) => !r.isOpening).length;

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [orgId, bankIdParam, fromDate, toDate, search, direction]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  // Cash deposit / withdrawal dialog
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<CashBankTransferKind>("deposit");
  const [entryBankId, setEntryBankId] = useState<string>("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");

  const openEntry = (kind: CashBankTransferKind) => {
    setEntryKind(kind);
    setEntryBankId(bankIdParam ?? pickDefaultBankAccountId(banks) ?? "");
    setEntryDate(format(new Date(), "yyyy-MM-dd"));
    setEntryAmount("");
    setEntryNote("");
    setEntryOpen(true);
  };

  const invalidateBankViews = () => {
    void queryClient.invalidateQueries({ queryKey: ["bank-statement", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
  };

  const postEntry = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Select an organization");
      const bank = banks.find((b) => b.id === entryBankId);
      if (!bank) throw new Error("Select a bank account");
      const amount = Number(entryAmount.replace(/,/g, ""));
      return postCashBankTransfer({
        organizationId: orgId,
        bankAccountId: bank.id,
        bankLabel: formatBankAccountLabel(bank),
        kind: entryKind,
        date: entryDate,
        amount,
        note: entryNote,
      });
    },
    onSuccess: () => {
      toast.success(entryKind === "deposit" ? "Cash deposit saved" : "Cash withdrawal saved");
      setEntryOpen(false);
      invalidateBankViews();
    },
    onError: (err: Error) => toast.error(err.message || "Could not save the entry"),
  });

  const [deleteRow, setDeleteRow] = useState<BankStatementRow | null>(null);
  const deleteEntry = useMutation({
    mutationFn: async (row: BankStatementRow) => {
      if (!orgId || !row.referenceId) throw new Error("Nothing to delete");
      await deleteCashBankTransfer(orgId, row.referenceId);
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      setDeleteRow(null);
      invalidateBankViews();
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete the entry"),
  });

  const noBanks = !banksLoading && banks.length === 0;

  const emptyMessage = (() => {
    if (movementCount === 0) return "No bank transactions in this period.";
    return "No transactions match the current search / In·Out filter.";
  })();

  const subtitle = (() => {
    const who = selectedBank ? formatBankAccountLabel(selectedBank) : "All bank accounts";
    return `${who} · ${movementCount.toLocaleString("en-IN")} transactions · ${fmtDate(fromDate)} to ${fmtDate(toDate)}`;
  })();

  return (
    <div className="bank-statement-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Landmark className="h-5 w-5 shrink-0" />
                Bank Statement
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={() => openEntry("deposit")}
              disabled={noBanks}
            >
              <ArrowDownToLine className="h-4 w-4 mr-1.5" />
              Cash deposit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={() => openEntry("withdrawal")}
              disabled={noBanks}
            >
              Cash withdrawal
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="h-9 text-sm"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {noBanks && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shrink-0">
            No bank account added yet. Add your bank in Settings → Company Profile; UPI, card, cheque and bank
            transfer payments will then show here under that bank.
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => orgNavigate("/settings", { state: { settingsTab: "company" } })}
            >
              <SettingsIcon className="h-4 w-4 mr-1.5" />
              Open Company Profile
            </Button>
          </div>
        )}
        {!splitByBank && banks.length > 1 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shrink-0">
            Showing all bank accounts together. Per-bank statements start once the bank statement database update is
            applied.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full shrink-0">
          <div className="rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Opening balance</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(Math.abs(summary.opening))}
              <span className="text-xs font-semibold ml-1 opacity-90">{drCr(summary.opening)}</span>
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Money in (Dr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(summary.totalIn)}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Money out (Cr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(summary.totalOut)}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Closing balance</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(Math.abs(summary.closing))}
              <span className="text-xs font-semibold ml-1 opacity-90">{drCr(summary.closing)}</span>
            </p>
          </div>
        </div>

        <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
            {banks.length > 0 && (
              <Select value={bankFilter} onValueChange={setBankFilter}>
                <SelectTrigger className="h-10 w-[230px] text-sm border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Bank account" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {formatBankAccountLabel(b)}
                      {b.is_default ? " (default)" : ""}
                    </SelectItem>
                  ))}
                  {banks.length > 1 && <SelectItem value={ALL_BANKS}>All bank accounts</SelectItem>}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <Input
                type="date"
                aria-label="From date"
                className="h-10 w-[150px] text-sm border-slate-200 bg-slate-50"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                className="h-10 w-[150px] text-sm border-slate-200 bg-slate-50"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bill no, party, mode…"
                className="pl-10 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0">
              {(
                [
                  { value: "all" as const, label: "All" },
                  { value: "in" as const, label: "In" },
                  { value: "out" as const, label: "Out" },
                ] as const
              ).map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={direction === value ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 px-3 text-sm font-semibold",
                    direction === value
                      ? value === "in"
                        ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                        : value === "out"
                          ? "bg-red-600 hover:bg-red-600 text-white"
                          : "bg-slate-700 hover:bg-slate-700 text-white"
                      : "text-slate-600",
                  )}
                  onClick={() => setDirection(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground tabular-nums ml-auto">
              {filteredRows.filter((r) => !r.isOpening).length.toLocaleString("en-IN")} matching
            </span>
          </div>

          {error ? (
            <div className="m-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Failed to load the bank statement: {(error as Error).message}
            </div>
          ) : isLoading || banksLoading ? (
            <div className="p-2">
              <ReportSkeleton />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto bg-white tab-scroll-stable">
              <Table className="[&_td]:px-3 [&_th]:px-3">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                    <TableHead className="h-10 w-[52px] text-xs font-bold uppercase tracking-wide text-white">Sr.</TableHead>
                    <TableHead className="h-10 w-[100px] text-xs font-bold uppercase tracking-wide text-white">Date</TableHead>
                    <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">Particulars</TableHead>
                    <TableHead className="h-10 w-[110px] text-xs font-bold uppercase tracking-wide text-white">Mode</TableHead>
                    <TableHead className="h-10 w-[130px] text-right text-xs font-bold uppercase tracking-wide text-white">
                      Debit (In)
                    </TableHead>
                    <TableHead className="h-10 w-[130px] text-right text-xs font-bold uppercase tracking-wide text-white">
                      Credit (Out)
                    </TableHead>
                    <TableHead className="h-10 w-[150px] text-right text-xs font-bold uppercase tracking-wide text-white">
                      Balance
                    </TableHead>
                    <TableHead className="h-10 w-[44px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row, index) => {
                    if (row.isOpening) {
                      return (
                        <TableRow key={row.key} className="h-10 bg-slate-50 hover:bg-slate-50">
                          <TableCell className="py-2 text-sm text-muted-foreground" />
                          <TableCell className="py-2 text-sm tabular-nums text-muted-foreground">
                            {fmtDate(row.date)}
                          </TableCell>
                          <TableCell className="py-2 text-sm font-semibold text-slate-700" colSpan={4}>
                            Opening balance
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-sm font-semibold">
                            {fmtAmt(Math.abs(row.balance))} {drCr(row.balance)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    }
                    const sr = pageStart + (filteredRows[0]?.isOpening ? index : index + 1);
                    const typeLabel = bankReferenceTypeLabel(row.referenceType, row.debit);
                    const mode = bankPaymentMethodLabel(row.paymentMethod);
                    return (
                      <TableRow key={row.key} className="h-11 hover:bg-teal-50/80 dark:hover:bg-teal-950/20">
                        <TableCell className="py-2 text-sm tabular-nums text-muted-foreground font-medium">{sr}</TableCell>
                        <TableCell className="py-2 text-sm tabular-nums whitespace-nowrap">{fmtDate(row.date)}</TableCell>
                        <TableCell className="py-2 min-w-[220px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              {typeLabel}
                            </span>
                            {row.docNumber && (
                              <span className="font-mono text-sm text-muted-foreground shrink-0">{row.docNumber}</span>
                            )}
                            <span className="text-sm font-medium truncate" title={row.description}>
                              {row.partyName || row.description || "—"}
                            </span>
                          </div>
                          {row.partyName && row.description && row.description !== `Sale ${row.docNumber}` && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5" title={row.description}>
                              {row.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-sm text-muted-foreground">{mode || "—"}</TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-base font-semibold text-emerald-600 dark:text-emerald-400">
                          {row.debit ? fmtAmt(row.debit) : ""}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-base font-semibold text-red-600 dark:text-red-400">
                          {row.credit ? fmtAmt(row.credit) : ""}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-sm font-semibold whitespace-nowrap">
                          {fmtAmt(Math.abs(row.balance))}{" "}
                          <span className="text-xs text-muted-foreground">{drCr(row.balance)}</span>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          {row.referenceType === "Contra" && row.referenceId && !/daily tally/i.test(row.description) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Delete this cash deposit / withdrawal"
                              onClick={() => setDeleteRow(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredRows.every((r) => r.isOpening) && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-base text-muted-foreground px-6">
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 bg-white shrink-0">
              <span className="text-sm text-muted-foreground tabular-nums">
                Rows {(pageStart + 1).toLocaleString("en-IN")}–
                {Math.min(pageStart + PAGE_SIZE, filteredRows.length).toLocaleString("en-IN")} of{" "}
                {filteredRows.length.toLocaleString("en-IN")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm font-medium tabular-nums">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={entryOpen} onOpenChange={(open) => !postEntry.isPending && setEntryOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{entryKind === "deposit" ? "Cash deposit to bank" : "Cash withdrawal from bank"}</DialogTitle>
            <DialogDescription>
              {entryKind === "deposit"
                ? "Moves cash from Cash in Hand into the bank account."
                : "Moves money from the bank account into Cash in Hand."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {(["deposit", "withdrawal"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={entryKind === k ? "default" : "ghost"}
                  className={cn("h-8", entryKind === k && "bg-teal-700 hover:bg-teal-700 text-white")}
                  onClick={() => setEntryKind(k)}
                >
                  {k === "deposit" ? "Deposit" : "Withdrawal"}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Bank account</Label>
              <Select value={entryBankId} onValueChange={setEntryBankId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {formatBankAccountLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" className="h-10" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Amount (₹)</Label>
                <Input
                  inputMode="decimal"
                  className="h-10 text-right tabular-nums"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Textarea
                rows={2}
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
                placeholder="e.g. deposit slip no."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryOpen(false)} disabled={postEntry.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => postEntry.mutate()}
              disabled={postEntry.isPending || !entryBankId || !(Number(entryAmount.replace(/,/g, "")) > 0)}
              className="bg-teal-700 hover:bg-teal-800 text-white"
            >
              {postEntry.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteRow} onOpenChange={(open) => !open && !deleteEntry.isPending && setDeleteRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {deleteRow
                ? `${deleteRow.description} · ₹${fmtAmt(deleteRow.debit || deleteRow.credit)} on ${fmtDate(deleteRow.date)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleteEntry.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteRow && deleteEntry.mutate(deleteRow)}
              disabled={deleteEntry.isPending}
            >
              {deleteEntry.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
