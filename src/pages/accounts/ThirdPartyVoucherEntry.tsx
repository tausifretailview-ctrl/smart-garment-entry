import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, BookOpen, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  clearSeedDefaultAccountsCache,
  seedDefaultAccounts,
  type AccountGroup,
  type SeededAccount,
} from "@/utils/accounting/seedDefaultAccounts";
import { postJournalEntry } from "@/utils/accounting/journalService";
import {
  allocateThirdPartyAccountCode,
  filterCashBankAccounts,
  filterThirdPartyMasters,
  isUniqueAccountCodeViolation,
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
  const { getOrgPath } = useOrgNavigation();
  const queryClient = useQueryClient();

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
      return seedDefaultAccounts(currentOrganization!.id, supabase);
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
      void queryClient.invalidateQueries({ queryKey: ["third-party-accounts", currentOrganization?.id] });
      void queryClient.invalidateQueries({ queryKey: ["chart-of-accounts", currentOrganization?.id] });
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold">Third-party Pay / Receive</h1>
            <p className="text-sm text-muted-foreground">
              Sundry debtors/creditors, deposits, loans — not customer or supplier masters
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to={getOrgPath("/third-party-balances")}>View balances</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={getOrgPath("/journal-vouchers")}>Day book</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={getOrgPath("/manual-journal")}>Manual journal</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="entry" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entry">Post entry</TabsTrigger>
          <TabsTrigger value="ledger">Account ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Direction</CardTitle>
              <CardDescription>Money leaving or entering the business via cash/bank</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={direction === "paid_out" ? "default" : "outline"}
                onClick={() => setDirection("paid_out")}
              >
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Money paid out
              </Button>
              <Button
                type="button"
                variant={direction === "received" ? "default" : "outline"}
                onClick={() => setDirection("received")}
              >
                <ArrowDownLeft className="h-4 w-4 mr-2" />
                Money received
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Voucher details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Third-party account</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
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
                  <SelectTrigger>
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

              <div className="space-y-2">
                <Label>Cash / Bank</Label>
                <Select
                  value={effectiveCashBankId || undefined}
                  onValueChange={setCashBankAccountId}
                >
                  <SelectTrigger>
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

              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input
                  inputMode="decimal"
                  className="font-mono tabular-nums"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Narration</Label>
                <Textarea
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="e.g. Rent deposit paid to landlord"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Pre-post preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Select account, cash/bank, and amount to preview Dr/Cr.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Side</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewLines.map((line) => (
                      <TableRow key={`${line.side}-${line.account.id}`}>
                        <TableCell className="font-semibold">{line.side}</TableCell>
                        <TableCell>
                          {line.account.account_code} — {line.account.account_name}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(line.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => postMutation.mutate()}
                  disabled={postMutation.isPending || previewLines.length < 2}
                >
                  {postMutation.isPending ? "Posting…" : "Post voucher"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Account ledger (read-only)</CardTitle>
              <CardDescription>
                Running balance = sum(debit − credit) from journal lines for this ledger only
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xl">
                <Label>Account</Label>
                <Select
                  value={ledgerAccountId || undefined}
                  onValueChange={setLedgerAccountId}
                >
                  <SelectTrigger>
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

              {!ledgerAccountId ? (
                <p className="text-sm text-muted-foreground">Select an account to view its ledger.</p>
              ) : ledgerQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (ledgerQuery.data?.length || 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No journal lines for this account yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Narration</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerQuery.data!.map((row) => (
                        <TableRow key={`${row.journalLineId || row.lineSeq}-${row.entryDate}`}>
                          <TableCell className="whitespace-nowrap">{row.entryDate}</TableCell>
                          <TableCell className="max-w-[280px] truncate" title={row.description || ""}>
                            {row.description || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">{row.referenceType}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {row.debitAmount ? fmt(row.debitAmount) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {row.creditAmount ? fmt(row.creditAmount) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-medium">
                            {fmt(row.runningBalance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create third-party master</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Account name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Landlord — Security Deposit"
              />
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <Select value={newType} onValueChange={(v: MasterAccountType) => onTypeChange(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asset">Asset (e.g. Sundry Debtors / deposit)</SelectItem>
                  <SelectItem value="Liability">Liability (e.g. Sundry Creditors / loan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tally group</Label>
              <Select
                value={newGroup}
                onValueChange={(v) => setNewGroup(v as AccountGroup)}
              >
                <SelectTrigger>
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
            <div className="space-y-2 md:col-span-2">
              <Label>Account code (optional)</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Auto 9001–9999 if blank"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMaster.mutate()} disabled={createMaster.isPending}>
              {createMaster.isPending ? "Creating…" : "Create & select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
