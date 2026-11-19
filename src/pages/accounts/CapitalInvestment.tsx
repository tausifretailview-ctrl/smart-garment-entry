import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Landmark, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rollbackStep } from "@/lib/rollbackStep";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearSeedDefaultAccountsCache, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";
import { deleteJournalEntryByReference, recordThirdPartyVoucherJournalEntry } from "@/utils/accounting/journalService";
import {
  paymentMethodFromCashBankAccount,
  THIRD_PARTY_JOURNAL_REFERENCE_TYPE,
  THIRD_PARTY_VOUCHER_REFERENCE_TYPE,
  voucherTypeForThirdPartyDirection,
} from "@/utils/accounting/thirdPartyVoucherCash";
import {
  filterCashBankAccounts,
  isUniqueAccountCodeViolation,
  loadOrgChartAccountsForThirdParty,
} from "@/utils/accounting/thirdPartyAccounts";
import {
  formatThirdPartyPaymentMethod,
  loadThirdPartyJournalCashBankAccountId,
  loadThirdPartyVoucherHistory,
  type ThirdPartyHistoryVoucher,
} from "@/utils/accounting/thirdPartyVoucherHistory";
import {
  CAPITAL_ACCOUNT_GROUP,
  DEFAULT_CAPITAL_ACCOUNT,
  buildCapitalVoucherDescription,
  capitalDirectionFromVoucherType,
  capitalToThirdPartyDirection,
  defaultCapitalNarration,
  filterCapitalLedgers,
  nextCapitalAccountCode,
  parseCapitalNarration,
  summarizeCapital,
  type CapitalDirection,
} from "@/utils/accounting/capitalAccounts";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

/** Whole rupees for the compact owners table. */
const fmt0 = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

function parseAmount(s: string): number {
  const v = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

const COA_SELECT =
  "id, organization_id, account_code, account_name, account_type, account_group, parent_account_id, is_system_account";

/**
 * Capital & Investment: money the owner or partners put into the business (investment)
 * or take back out (withdrawal). Posts Dr Cash/Bank, Cr Capital (or the reverse) and
 * keeps a voucher row, so cash tallies, the Day Book, the Trial Balance and the Balance
 * Sheet all show it. See src/utils/accounting/capitalAccounts.ts.
 */
export default function CapitalInvestment() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { getOrgPath, orgNavigate } = useOrgNavigation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<CapitalDirection>("investment");
  const [capitalAccountId, setCapitalAccountId] = useState("");
  const [cashBankAccountId, setCashBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [narration, setNarration] = useState("");
  const [editingVoucher, setEditingVoucher] = useState<ThirdPartyHistoryVoucher | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ThirdPartyHistoryVoucher | null>(null);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [search, setSearch] = useState("");

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) navigate(-1);
    else orgNavigate("/accounts");
  };

  const accountsQuery = useQuery({
    queryKey: ["third-party-accounts", orgId],
    enabled: !!orgId,
    queryFn: () => loadOrgChartAccountsForThirdParty(orgId!, supabase),
  });
  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);
  const capitalLedgers = useMemo(() => filterCapitalLedgers(accounts), [accounts]);
  const cashBankAccounts = useMemo(() => filterCashBankAccounts(accounts), [accounts]);
  const capitalIds = useMemo(() => new Set(capitalLedgers.map((a) => a.id)), [capitalLedgers]);

  const vouchersQuery = useQuery({
    queryKey: ["third-party-vouchers", orgId],
    enabled: !!orgId,
    queryFn: () => loadThirdPartyVoucherHistory(orgId!, supabase),
  });
  const capitalVouchers = useMemo(
    () => (vouchersQuery.data || []).filter((v) => v.reference_id && capitalIds.has(v.reference_id)),
    [vouchersQuery.data, capitalIds],
  );
  const summary = useMemo(() => summarizeCapital(capitalLedgers, capitalVouchers), [capitalLedgers, capitalVouchers]);

  const effectiveCapitalId = capitalAccountId || (capitalLedgers.length === 1 ? capitalLedgers[0].id : "");
  const defaultCashBankId = useMemo(() => {
    const cash = cashBankAccounts.find((a) => a.account_code === "1000");
    const bank = cashBankAccounts.find((a) => a.account_code === "1010");
    return (cash || bank || cashBankAccounts[0])?.id || "";
  }, [cashBankAccounts]);
  const effectiveCashBankId = cashBankAccountId || defaultCashBankId;
  const capital = capitalLedgers.find((a) => a.id === effectiveCapitalId);
  const cashBank = cashBankAccounts.find((a) => a.id === effectiveCashBankId);
  const amountNum = parseAmount(amount);
  const narrationText = narration.trim() || defaultCapitalNarration(direction);

  const previewLines =
    capital && cashBank && amountNum > 0
      ? direction === "investment"
        ? [
            { side: "Dr", account: cashBank, amount: amountNum },
            { side: "Cr", account: capital, amount: amountNum },
          ]
        : [
            { side: "Dr", account: capital, amount: amountNum },
            { side: "Cr", account: cashBank, amount: amountNum },
          ]
      : [];

  const invalidate = () => {
    for (const key of [
      ["third-party-vouchers", orgId],
      ["third-party-accounts", orgId],
      ["third-party-balances", orgId],
      ["chart-of-accounts", orgId],
      ["journal-vouchers"],
      ["voucher-entries"],
      ["accounting-reports"],
      ["daily-tally-vouchers"],
      ["cashier-report-third-party"],
      ["cashier-report-receipts"],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const createOwner = useMutation({
    mutationFn: async (name: string): Promise<SeededAccount> => {
      if (!orgId) throw new Error("Select an organization");
      const clean = name.trim();
      if (!clean) throw new Error("Enter the owner or partner name");
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: codes, error: codeErr } = await supabase
          .from("chart_of_accounts")
          .select("account_code")
          .eq("organization_id", orgId)
          .like("account_code", "30%");
        if (codeErr) throw codeErr;
        const code = nextCapitalAccountCode(((codes || []) as Array<{ account_code: string }>).map((r) => r.account_code));
        const { data, error } = await supabase
          .from("chart_of_accounts")
          .insert({
            organization_id: orgId,
            account_code: code,
            account_name: clean,
            account_type: "Equity",
            account_group: CAPITAL_ACCOUNT_GROUP,
            parent_account_id: null,
            is_system_account: false,
          })
          .select(COA_SELECT)
          .single();
        if (!error && data) return data as SeededAccount;
        lastError = error;
        if (isUniqueAccountCodeViolation(error)) continue;
        throw error;
      }
      throw lastError || new Error("Could not create the capital account");
    },
    onSuccess: (created) => {
      clearSeedDefaultAccountsCache(orgId);
      queryClient.setQueryData<SeededAccount[]>(["third-party-accounts", orgId], (prev) =>
        prev?.some((a) => a.id === created.id) ? prev : [...(prev || []), created],
      );
      setCapitalAccountId(created.id);
      setOwnerDialogOpen(false);
      setOwnerName("");
      toast.success(`Capital account created: ${created.account_name}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err?.message || "Could not create the capital account"),
  });

  const resetForm = () => {
    setAmount("");
    setNarration("");
    setEditingVoucher(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Select an organization");
      if (!capital) throw new Error("Select the owner / partner capital account");
      if (!cashBank) throw new Error(direction === "investment" ? "Select where the money was received" : "Select where the money was paid from");
      if (amountNum <= 0) throw new Error("Amount must be greater than zero");

      const thirdPartyDirection = capitalToThirdPartyDirection(direction);
      const voucherType = voucherTypeForThirdPartyDirection(thirdPartyDirection);
      const description = buildCapitalVoucherDescription(direction, capital.account_name, narrationText);
      const paymentMethod = paymentMethodFromCashBankAccount(cashBank);

      if (editingVoucher) {
        const { error } = await supabase
          .from("voucher_entries")
          .update({
            voucher_type: voucherType,
            voucher_date: entryDate,
            reference_id: capital.id,
            description,
            payment_method: paymentMethod,
            total_amount: amountNum,
          })
          .eq("id", editingVoucher.id)
          .eq("organization_id", orgId)
          .eq("reference_type", THIRD_PARTY_VOUCHER_REFERENCE_TYPE)
          .is("deleted_at", null);
        if (error) throw error;
        await deleteJournalEntryByReference(orgId, THIRD_PARTY_JOURNAL_REFERENCE_TYPE, editingVoucher.id, supabase);
        await recordThirdPartyVoucherJournalEntry(
          editingVoucher.id,
          orgId,
          thirdPartyDirection,
          capital.id,
          cashBank.id,
          amountNum,
          entryDate,
          description,
          supabase,
        );
        return { number: editingVoucher.voucher_number, updated: true };
      }

      const { data: voucherNumber, error: numberError } = await supabase.rpc("generate_voucher_number", {
        p_type: voucherType,
        p_date: entryDate,
      });
      if (numberError) throw numberError;

      const { data: inserted, error: insertError } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: orgId,
          voucher_number: voucherNumber,
          voucher_type: voucherType,
          voucher_date: entryDate,
          reference_type: THIRD_PARTY_VOUCHER_REFERENCE_TYPE,
          reference_id: capital.id,
          description,
          payment_method: paymentMethod,
          total_amount: amountNum,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      if (!inserted?.id) throw new Error("Could not save the entry");

      try {
        await recordThirdPartyVoucherJournalEntry(
          inserted.id,
          orgId,
          thirdPartyDirection,
          capital.id,
          cashBank.id,
          amountNum,
          entryDate,
          description,
          supabase,
        );
      } catch (journalErr) {
        await rollbackStep("capital-voucher:voucher", () => supabase.from("voucher_entries").delete().eq("id", inserted.id), {
          organizationId: orgId,
          recordId: inserted.id,
        });
        throw journalErr;
      }
      return { number: String(voucherNumber || ""), updated: false };
    },
    onSuccess: (res) => {
      toast.success(
        res.updated
          ? `Updated ${res.number}`
          : `${direction === "investment" ? "Investment" : "Withdrawal"} saved${res.number ? ` · ${res.number}` : ""}`,
      );
      resetForm();
      invalidate();
    },
    onError: (err: Error) => toast.error(err?.message || "Could not save the entry"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (voucher: ThirdPartyHistoryVoucher) => {
      if (!orgId) throw new Error("Select an organization");
      await deleteJournalEntryByReference(orgId, THIRD_PARTY_JOURNAL_REFERENCE_TYPE, voucher.id, supabase);
      const { error } = await supabase
        .from("voucher_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", voucher.id)
        .eq("organization_id", orgId)
        .eq("reference_type", THIRD_PARTY_VOUCHER_REFERENCE_TYPE)
        .is("deleted_at", null);
      if (error) throw error;
    },
    onSuccess: (_v, voucher) => {
      toast.success(`Deleted ${voucher.voucher_number}`);
      if (editingVoucher?.id === voucher.id) resetForm();
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err?.message || "Could not delete"),
  });

  const startEdit = async (v: ThirdPartyHistoryVoucher) => {
    setEditingVoucher(v);
    setDirection(capitalDirectionFromVoucherType(v.voucher_type));
    setCapitalAccountId(v.reference_id || "");
    setEntryDate(v.voucher_date);
    setAmount(String(v.total_amount ?? ""));
    setNarration(parseCapitalNarration(v.description));
    if (orgId && v.reference_id) {
      try {
        const cashId = await loadThirdPartyJournalCashBankAccountId(orgId, v.id, v.reference_id, supabase);
        if (cashId) setCashBankAccountId(cashId);
      } catch (err) {
        toast.error((err as Error)?.message || "Could not load cash/bank for this entry");
      }
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const historyRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return capitalVouchers;
    const nameById = new Map(capitalLedgers.map((a) => [a.id, a.account_name.toLowerCase()]));
    return capitalVouchers.filter(
      (v) =>
        (v.voucher_number || "").toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q) ||
        (nameById.get(v.reference_id || "") || "").includes(q),
    );
  }, [capitalVouchers, capitalLedgers, search]);

  const isInvestment = direction === "investment";
  const loading = accountsQuery.isLoading || vouchersQuery.isLoading;

  return (
    <div className="capital-investment-workspace flex flex-col gap-3 bg-slate-50 px-2 sm:px-3 py-2 min-h-0 w-full" data-testid="capital-investment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-indigo-700 tracking-tight leading-none flex items-center gap-2">
              <Landmark className="h-5 w-5 shrink-0" />
              Capital &amp; Investment
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              Money the owner or partners put into the business, or take back out
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="h-9 text-sm" asChild>
            <Link to={getOrgPath("/accounting-reports")}>Balance sheet</Link>
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-sm" asChild>
            <Link to={getOrgPath("/journal-vouchers")}>Day book</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="capital-summary">
        <Card className="p-3 border-emerald-200 bg-gradient-to-b from-emerald-50 to-white">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Total invested</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900" data-testid="capital-total-invested">{fmt(summary.invested)}</div>
        </Card>
        <Card className="p-3 border-amber-200 bg-gradient-to-b from-amber-50 to-white">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Total withdrawn</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900" data-testid="capital-total-withdrawn">{fmt(summary.withdrawn)}</div>
        </Card>
        <Card className="p-3 border-indigo-200 bg-gradient-to-b from-indigo-50 to-white">
          <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Net capital introduced</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900" data-testid="capital-total-net">{fmt(summary.net)}</div>
          <div className="text-[11px] text-muted-foreground">From this screen; opening capital stays in the ledger</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="p-3 sm:p-4 space-y-3 lg:col-span-3" data-testid="capital-form">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              {editingVoucher ? `Edit ${editingVoucher.voucher_number}` : "New entry"}
            </h2>
            {editingVoucher ? (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Entry type">
            <button
              type="button"
              onClick={() => setDirection("investment")}
              aria-pressed={isInvestment}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors",
                isInvestment ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-emerald-50",
              )}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Investment (money in)
            </button>
            <button
              type="button"
              onClick={() => setDirection("withdrawal")}
              aria-pressed={!isInvestment}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors",
                !isInvestment ? "border-amber-600 bg-amber-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-amber-50",
              )}
            >
              <ArrowUpRight className="h-4 w-4" />
              Withdrawal (money out)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Owner / partner</Label>
              {capitalLedgers.length === 0 && !loading ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-start gap-2 border-dashed"
                  onClick={() => createOwner.mutate(DEFAULT_CAPITAL_ACCOUNT.name)}
                  disabled={createOwner.isPending}
                >
                  <Plus className="h-4 w-4" />
                  Create "{DEFAULT_CAPITAL_ACCOUNT.name}" account
                </Button>
              ) : (
                <div className="flex gap-1.5">
                  <Select value={effectiveCapitalId} onValueChange={setCapitalAccountId}>
                    <SelectTrigger className="h-10" aria-label="Owner / partner">
                      <SelectValue placeholder="Select owner / partner" />
                    </SelectTrigger>
                    <SelectContent>
                      {capitalLedgers.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_name} <span className="text-muted-foreground">({a.account_code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setOwnerDialogOpen(true)} aria-label="Add owner / partner" title="Add owner / partner">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">{isInvestment ? "Received into" : "Paid from"}</Label>
              <Select value={effectiveCashBankId} onValueChange={setCashBankAccountId}>
                <SelectTrigger className="h-10" aria-label={isInvestment ? "Received into" : "Paid from"}>
                  <SelectValue placeholder="Cash or bank" />
                </SelectTrigger>
                <SelectContent>
                  {cashBankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold" htmlFor="capital-amount">Amount (₹)</Label>
              <Input
                id="capital-amount"
                inputMode="decimal"
                className="h-10 text-lg font-bold tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold" htmlFor="capital-date">Date</Label>
              <Input id="capital-date" type="date" className="h-10" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold" htmlFor="capital-narration">Narration</Label>
            <Textarea
              id="capital-narration"
              rows={2}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder={defaultCapitalNarration(direction)}
            />
          </div>

          {previewLines.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" data-testid="capital-preview">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Accounting entry</div>
              {previewLines.map((l) => (
                <div key={l.side} className="flex items-baseline gap-2">
                  <span className={cn("w-7 font-bold", l.side === "Dr" ? "text-emerald-700" : "text-amber-700")}>{l.side}</span>
                  <span className="flex-1 truncate">{l.account.account_name}</span>
                  <span className="font-mono font-semibold tabular-nums">{fmt(l.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}

          <Button
            type="button"
            className={cn("h-11 w-full text-base font-bold", isInvestment ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500")}
            disabled={saveMutation.isPending || !capital || !cashBank || amountNum <= 0}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending
              ? "Saving…"
              : editingVoucher
                ? "Update entry"
                : isInvestment
                  ? "Save investment"
                  : "Save withdrawal"}
          </Button>
        </Card>

        <Card className="p-3 sm:p-4 lg:col-span-2" data-testid="capital-owners">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Owners &amp; partners</h2>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setOwnerDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {summary.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No capital accounts yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100" data-testid="capital-owner-rows">
              {summary.rows.map((r) => (
                <li key={r.accountId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-slate-800" title={`Ledger ${r.code}`}>{r.name}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900">{fmt0(r.net)}</span>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs tabular-nums text-muted-foreground">
                    <span>
                      In <b className="text-emerald-700">{fmt0(r.invested)}</b>
                    </span>
                    <span>
                      Out <b className="text-amber-700">{fmt0(r.withdrawn)}</b>
                    </span>
                    <span className="ml-auto">{r.entries} entr{r.entries === 1 ? "y" : "ies"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-3 sm:p-4" data-testid="capital-history">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">History</h2>
          <Input className="h-9 w-56" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search history" />
        </div>
        {historyRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No investments or withdrawals yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Owner / partner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyRows.map((v) => {
                  const inv = capitalDirectionFromVoucherType(v.voucher_type) === "investment";
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap">{v.voucher_date}</TableCell>
                      <TableCell className="font-mono text-xs">{v.voucher_number}</TableCell>
                      <TableCell>{capitalLedgers.find((a) => a.id === v.reference_id)?.account_name || "—"}</TableCell>
                      <TableCell>
                        <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", inv ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                          {inv ? "Investment" : "Withdrawal"}
                        </span>
                      </TableCell>
                      <TableCell>{formatThirdPartyPaymentMethod(v.payment_method)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(Number(v.total_amount) || 0)}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-muted-foreground">{parseCapitalNarration(v.description)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void startEdit(v)} aria-label={`Edit ${v.voucher_number}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(v)} aria-label={`Delete ${v.voucher_number}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={ownerDialogOpen} onOpenChange={setOwnerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add owner / partner</DialogTitle>
            <DialogDescription>
              Creates a capital account (Equity · Capital Account) for this person. Their investments and withdrawals post to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="capital-owner-name">Name</Label>
            <Input
              id="capital-owner-name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Rahim Khan Capital"
              onKeyDown={(e) => {
                if (e.key === "Enter") createOwner.mutate(ownerName);
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createOwner.mutate(ownerName)} disabled={createOwner.isPending || !ownerName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.voucher_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {capitalDirectionFromVoucherType(deleteTarget?.voucher_type) === "investment" ? "investment" : "withdrawal"} of{" "}
              {fmt(Number(deleteTarget?.total_amount) || 0)} and its accounting entry. Cash and capital balances change back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
