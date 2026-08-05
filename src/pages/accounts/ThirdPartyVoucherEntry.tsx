import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Banknote, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearSeedDefaultAccountsCache,
  type AccountGroup,
  type SeededAccount,
} from "@/utils/accounting/seedDefaultAccounts";
import { postJournalEntry } from "@/utils/accounting/journalService";
import {
  allocateThirdPartyAccountCode,
  filterCashBankAccounts,
  filterThirdPartyMasters,
  isUniqueAccountCodeViolation,
  loadOrgChartAccountsForThirdParty,
  TALLY_GROUPS_BY_ACCOUNT_TYPE,
} from "@/utils/accounting/thirdPartyAccounts";
import { calculateGlAccountLedger } from "@/utils/accountingReportUtils";

type Direction = "paid_out" | "received";
type MasterAccountType = "Asset" | "Liability";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

function parseAmount(s: string): number {
  const v = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/**
 * Manual pay/receive for parties that are NOT customers or suppliers.
 * Writes only chart_of_accounts + journal_entries/lines via postJournalEntry.
 * Never touches voucher_entries or customer/supplier balance RPCs.
 */
export default function ThirdPartyVoucherEntry() {
  const { currentOrganization } = useOrganization();
  const { getOrgPath, orgNavigate } = useOrgNavigation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    orgNavigate("/accounts");
  };

  const [direction, setDirection] = useState<Direction>("paid_out");
  const [partyAccountId, setPartyAccountId] = useState("");
  const [cashBankAccountId, setCashBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [narration, setNarration] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<MasterAccountType>("Liability");
  const [newGroup, setNewGroup] = useState<AccountGroup>("Sundry Creditors");

  const [ledgerAccountId, setLedgerAccountId] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["third-party-accounts", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async (): Promise<SeededAccount[]> => {
      return loadOrgChartAccountsForThirdParty(currentOrganization!.id, supabase);
    },
  });

  const accounts = accountsQuery.data || [];
  const partyAccounts = useMemo(() => filterThirdPartyMasters(accounts), [accounts]);
  const cashBankAccounts = useMemo(() => filterCashBankAccounts(accounts), [accounts]);

  const defaultCashBankId = useMemo(() => {
    const cash = cashBankAccounts.find((a) => a.account_code === "1000");
    const bank = cashBankAccounts.find((a) => a.account_code === "1010");
    return (cash || bank || cashBankAccounts[0])?.id || "";
  }, [cashBankAccounts]);

  const effectiveCashBankId = cashBankAccountId || defaultCashBankId;
  const amountNum = parseAmount(amount);
  const party = partyAccounts.find((a) => a.id === partyAccountId);
  const cashBank = cashBankAccounts.find((a) => a.id === effectiveCashBankId);

  const previewLines = useMemo(() => {
    if (!party || !cashBank || amountNum <= 0) return [];
    if (direction === "paid_out") {
      return [
        { side: "Dr" as const, account: party, amount: amountNum },
        { side: "Cr" as const, account: cashBank, amount: amountNum },
      ];
    }
    return [
      { side: "Dr" as const, account: cashBank, amount: amountNum },
      { side: "Cr" as const, account: party, amount: amountNum },
    ];
  }, [party, cashBank, amountNum, direction]);

  const createMaster = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("Select an organization");
      const name = newName.trim();
      if (!name) throw new Error("Account name is required");
      const allowed = TALLY_GROUPS_BY_ACCOUNT_TYPE[newType];
      if (!allowed.includes(newGroup)) {
        throw new Error(`Group "${newGroup}" is not valid for ${newType}`);
      }

      let code = newCode.trim();
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (!code) {
          code = await allocateThirdPartyAccountCode(currentOrganization.id, supabase as any);
        }
        const payload = {
          organization_id: currentOrganization.id,
          account_code: code,
          account_name: name,
          account_type: newType,
          account_group: newGroup,
          parent_account_id: null,
          is_system_account: false,
        };
        const { data, error } = await (supabase as any)
          .from("chart_of_accounts")
          .insert(payload)
          .select(
            "id, organization_id, account_code, account_name, account_type, account_group, parent_account_id, is_system_account",
          )
          .single();
        if (!error && data) return data as SeededAccount;
        lastError = error;
        if (isUniqueAccountCodeViolation(error)) {
          code = "";
          continue;
        }
        throw error;
      }
      throw lastError || new Error("Could not allocate a unique account code");
    },
    onSuccess: (created) => {
      clearSeedDefaultAccountsCache(currentOrganization?.id);
      toast.success(`Created ${created.account_code} — ${created.account_name}`);
      setCreateOpen(false);
      setNewName("");
      setNewCode("");
      setPartyAccountId(created.id);
      setLedgerAccountId(created.id);
      queryClient.setQueryData<SeededAccount[]>(
        ["third-party-accounts", currentOrganization?.id],
        (prev) => {
          const list = prev || [];
          if (list.some((a) => a.id === created.id)) return list;
          return [...list, created];
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["third-party-accounts", currentOrganization?.id] });
      void queryClient.invalidateQueries({ queryKey: ["chart-of-accounts", currentOrganization?.id] });
      void queryClient.invalidateQueries({ queryKey: ["third-party-balances", currentOrganization?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to create account");
    },
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("Select an organization");
      if (!party) throw new Error("Select a third-party account");
      if (!cashBank) throw new Error("Select Cash or Bank");
      if (amountNum <= 0) throw new Error("Amount must be greater than zero");
      if (!narration.trim()) throw new Error("Narration is required");

      const lines =
        direction === "paid_out"
          ? [
              { accountId: party.id, debitAmount: amountNum, creditAmount: 0 },
              { accountId: cashBank.id, debitAmount: 0, creditAmount: amountNum },
            ]
          : [
              { accountId: cashBank.id, debitAmount: amountNum, creditAmount: 0 },
              { accountId: party.id, debitAmount: 0, creditAmount: amountNum },
            ];

      const dirLabel = direction === "paid_out" ? "Paid" : "Received";
      return postJournalEntry({
        organizationId: currentOrganization.id,
        date: entryDate,
        referenceType: "ManualJournal",
        referenceId: crypto.randomUUID(),
        description: `Third-party ${dirLabel}: ${party.account_name} — ${narration.trim()}`.slice(0, 500),
        lines,
        client: supabase,
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.status === "already_exists" ? "Entry already posted" : "Third-party voucher posted",
      );
      setAmount("");
      setNarration("");
      void queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
      void queryClient.invalidateQueries({
        queryKey: ["third-party-ledger", currentOrganization?.id, partyAccountId || ledgerAccountId],
      });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to post voucher");
    },
  });

  const ledgerQuery = useQuery({
    queryKey: ["third-party-ledger", currentOrganization?.id, ledgerAccountId],
    enabled: !!currentOrganization?.id && !!ledgerAccountId,
    queryFn: () =>
      calculateGlAccountLedger(
        currentOrganization!.id,
        ledgerAccountId,
        "2000-01-01",
        format(new Date(), "yyyy-MM-dd"),
        null,
      ),
  });

  const onTypeChange = (type: MasterAccountType) => {
    setNewType(type);
    const groups = TALLY_GROUPS_BY_ACCOUNT_TYPE[type];
    const preferred =
      type === "Liability"
        ? ("Sundry Creditors" as AccountGroup)
        : ("Sundry Debtors" as AccountGroup);
    setNewGroup(groups.includes(preferred) ? preferred : groups[0]);
  };

  const fieldLabelClass = "text-sm font-semibold text-slate-800";
  const fieldControlClass = "h-10 border-slate-200 bg-slate-50 focus:bg-white";
  const tabTriggerClass =
    "h-10 px-3 text-sm font-semibold shrink-0 rounded-md data-[state=active]:bg-teal-700 data-[state=active]:text-white data-[state=inactive]:text-slate-600";

  return (
    <div className="third-party-entry-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Banknote className="h-5 w-5 shrink-0" />
                Third-party Pay / Receive
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Sundry debtors/creditors, deposits, loans — not customer or supplier masters
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-9 text-sm border-slate-200" asChild>
              <Link to={getOrgPath("/third-party-balances")}>View balances</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-sm border-slate-200" asChild>
              <Link to={getOrgPath("/journal-vouchers")}>Day book</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-sm border-slate-200" asChild>
              <Link to={getOrgPath("/manual-journal")}>Manual journal</Link>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="entry" className="flex flex-1 flex-col min-h-0 overflow-hidden gap-2">
          <TabsList className="shrink-0 w-full h-auto p-1 bg-white border border-slate-200 rounded-lg grid grid-cols-2 gap-1">
            <TabsTrigger value="entry" className={tabTriggerClass}>
              Post entry
            </TabsTrigger>
            <TabsTrigger value="ledger" className={tabTriggerClass}>
              Account ledger
            </TabsTrigger>
          </TabsList>

          <Card className="min-h-0 flex-1 flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm p-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-3">
              <TabsContent value="entry" className="mt-0 outline-none space-y-3 data-[state=inactive]:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">Third-party voucher</h2>
                  <span className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded px-2 py-1">
                    {direction === "paid_out" ? "Payment (paid out)" : "Receipt (received)"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm px-3 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Direction</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {direction === "paid_out" ? "Money paid out" : "Money received"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm px-3 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Amount</p>
                    <p className="text-lg font-black text-slate-900 tabular-nums mt-0.5">
                      {amountNum > 0 ? fmt(amountNum) : "₹0.00"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm px-3 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Cash / Bank</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
                      {cashBank ? `${cashBank.account_code} — ${cashBank.account_name}` : "—"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3 sm:p-4 space-y-4">
                  <div className="space-y-2">
                    <Label className={fieldLabelClass}>Direction</Label>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className={cn(
                          "h-9 px-3 text-sm font-semibold rounded-md border",
                          direction === "paid_out"
                            ? "bg-teal-700 hover:bg-teal-700 text-white border-teal-700"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                        )}
                        onClick={() => setDirection("paid_out")}
                      >
                        <ArrowUpRight className="h-4 w-4 mr-1.5" />
                        Money paid out
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className={cn(
                          "h-9 px-3 text-sm font-semibold rounded-md border",
                          direction === "received"
                            ? "bg-teal-700 hover:bg-teal-700 text-white border-teal-700"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                        )}
                        onClick={() => setDirection("received")}
                      >
                        <ArrowDownLeft className="h-4 w-4 mr-1.5" />
                        Money received
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                    <div className="space-y-1.5 md:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className={fieldLabelClass}>Third-party account</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-slate-200"
                          onClick={() => setCreateOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Create new master
                        </Button>
                      </div>
                      <Select
                        value={partyAccountId || undefined}
                        onValueChange={(v) => {
                          setPartyAccountId(v);
                          setLedgerAccountId(v);
                        }}
                      >
                        <SelectTrigger className={fieldControlClass}>
                          <SelectValue placeholder={accountsQuery.isLoading ? "Loading…" : "Select account"} />
                        </SelectTrigger>
                        <SelectContent>
                          {partyAccounts.length === 0 ? (
                            <SelectItem value="__none" disabled>
                              No third-party masters yet — create one
                            </SelectItem>
                          ) : (
                            partyAccounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.account_code} — {a.account_name}
                                {a.account_group ? ` (${a.account_group})` : ""}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className={fieldLabelClass}>Date</Label>
                      <Input
                        type="date"
                        className={fieldControlClass}
                        value={entryDate}
                        onChange={(e) => setEntryDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className={fieldLabelClass}>Cash / Bank</Label>
                      <Select
                        value={effectiveCashBankId || undefined}
                        onValueChange={setCashBankAccountId}
                      >
                        <SelectTrigger className={fieldControlClass}>
                          <SelectValue placeholder="Select cash or bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {cashBankAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.account_code} — {a.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className={fieldLabelClass}>Amount (₹)</Label>
                      <Input
                        inputMode="decimal"
                        className={cn(fieldControlClass, "font-mono tabular-nums")}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <Label className={fieldLabelClass}>Narration</Label>
                      <Textarea
                        value={narration}
                        onChange={(e) => setNarration(e.target.value)}
                        placeholder="Payment note / narration"
                        rows={2}
                        className="border-slate-200 bg-slate-50 focus:bg-white min-h-[72px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Pre-post preview</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Dr / Cr lines that will be posted</p>
                  </div>
                  {previewLines.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-500">
                      Select account, cash/bank, and amount to preview Dr/Cr.
                    </p>
                  ) : (
                    <Table className="[&_td]:px-3 [&_th]:px-3">
                      <TableHeader>
                        <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                          <TableHead className="h-9 w-16 text-xs font-bold uppercase tracking-wide text-white">
                            Side
                          </TableHead>
                          <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-white">
                            Account
                          </TableHead>
                          <TableHead className="h-9 text-right text-xs font-bold uppercase tracking-wide text-white">
                            Amount
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewLines.map((line) => (
                          <TableRow key={`${line.side}-${line.account.id}`} className="border-slate-100">
                            <TableCell
                              className={cn(
                                "py-2.5 font-bold text-sm",
                                line.side === "Dr" ? "text-red-600" : "text-emerald-600",
                              )}
                            >
                              {line.side}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-slate-800">
                              {line.account.account_code} — {line.account.account_name}
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono tabular-nums text-sm font-semibold text-slate-900">
                              {fmt(line.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <div className="px-3 py-3 border-t border-slate-100 bg-slate-50/80">
                    <Button
                      className="h-10 px-4 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white"
                      onClick={() => postMutation.mutate()}
                      disabled={postMutation.isPending || previewLines.length < 2}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {postMutation.isPending ? "Posting…" : "Post voucher"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ledger" className="mt-0 outline-none space-y-3 data-[state=inactive]:hidden">
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3 sm:p-4 space-y-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Account ledger</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Running balance from journal lines for this ledger only
                    </p>
                  </div>
                  <div className="space-y-1.5 max-w-xl">
                    <Label className={fieldLabelClass}>Account</Label>
                    <Select value={ledgerAccountId || undefined} onValueChange={setLedgerAccountId}>
                      <SelectTrigger className={fieldControlClass}>
                        <SelectValue placeholder="Select third-party account" />
                      </SelectTrigger>
                      <SelectContent>
                        {partyAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.account_code} — {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {!ledgerAccountId ? (
                    <p className="px-3 py-6 text-sm text-slate-500 text-center">
                      Select an account to view its ledger.
                    </p>
                  ) : ledgerQuery.isLoading ? (
                    <p className="px-3 py-6 text-sm text-slate-500 text-center">Loading…</p>
                  ) : (ledgerQuery.data?.length || 0) === 0 ? (
                    <p className="px-3 py-6 text-sm text-slate-500 text-center">
                      No journal lines for this account yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:px-3 [&_th]:px-3">
                        <TableHeader>
                          <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                            <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-white">
                              Date
                            </TableHead>
                            <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-white">
                              Narration
                            </TableHead>
                            <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-white">
                              Type
                            </TableHead>
                            <TableHead className="h-9 text-right text-xs font-bold uppercase tracking-wide text-white">
                              Debit
                            </TableHead>
                            <TableHead className="h-9 text-right text-xs font-bold uppercase tracking-wide text-white">
                              Credit
                            </TableHead>
                            <TableHead className="h-9 text-right text-xs font-bold uppercase tracking-wide text-white">
                              Balance
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ledgerQuery.data!.map((row) => (
                            <TableRow
                              key={`${row.journalLineId || row.lineSeq}-${row.entryDate}`}
                              className="border-slate-100"
                            >
                              <TableCell className="py-2.5 whitespace-nowrap tabular-nums text-sm text-slate-800">
                                {row.entryDate}
                              </TableCell>
                              <TableCell
                                className="py-2.5 max-w-[280px] truncate text-sm text-slate-800"
                                title={row.description || ""}
                              >
                                {row.description || "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-slate-500">{row.referenceType}</TableCell>
                              <TableCell className="py-2.5 text-right font-mono tabular-nums text-sm">
                                {row.debitAmount ? fmt(row.debitAmount) : "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-right font-mono tabular-nums text-sm">
                                {row.creditAmount ? fmt(row.creditAmount) : "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-right font-mono tabular-nums text-sm font-semibold text-slate-900">
                                {fmt(row.runningBalance)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Card>
        </Tabs>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create third-party master</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className={fieldLabelClass}>Account name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Landlord — Security Deposit"
                className={fieldControlClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabelClass}>Account type</Label>
              <Select value={newType} onValueChange={(v: MasterAccountType) => onTypeChange(v)}>
                <SelectTrigger className={fieldControlClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asset">Asset (e.g. Sundry Debtors / deposit)</SelectItem>
                  <SelectItem value="Liability">Liability (e.g. Sundry Creditors / loan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabelClass}>Tally group</Label>
              <Select value={newGroup} onValueChange={(v) => setNewGroup(v as AccountGroup)}>
                <SelectTrigger className={fieldControlClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TALLY_GROUPS_BY_ACCOUNT_TYPE[newType].map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className={fieldLabelClass}>Account code (optional)</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Auto 9001–9999 if blank"
                className={cn(fieldControlClass, "font-mono")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => createMaster.mutate()}
              disabled={createMaster.isPending}
            >
              {createMaster.isPending ? "Creating…" : "Create & select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
