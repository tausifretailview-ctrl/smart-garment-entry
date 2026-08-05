import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2, BookPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";
import { postJournalEntry } from "@/utils/accounting/journalService";
import type { JournalReferenceType } from "@/utils/accounting/accountingTypes";
import { Link } from "react-router-dom";

type LineDraft = {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

function parseAmount(s: string): number {
  const v = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export default function ManualJournalEntry() {
  const { currentOrganization } = useOrganization();
  const { getOrgPath } = useOrgNavigation();
  const queryClient = useQueryClient();
  const [voucherKind, setVoucherKind] = useState<"ManualJournal" | "Contra">("ManualJournal");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { key: crypto.randomUUID(), accountId: "", debit: "", credit: "" },
    { key: crypto.randomUUID(), accountId: "", debit: "", credit: "" },
  ]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["manual-journal-accounts", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async (): Promise<SeededAccount[]> => {
      return seedDefaultAccounts(currentOrganization!.id, supabase);
    },
  });

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += parseAmount(line.debit);
      credit += parseAmount(line.credit);
    }
    return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
  }, [lines]);

  const balanced = Math.abs(totals.debit - totals.credit) < 0.01 && totals.debit > 0;

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("Select an organization");
      if (!description.trim()) throw new Error("Description is required");
      if (!balanced) throw new Error("Debits must equal credits with a positive total");

      const journalLines = lines
        .map((l) => ({
          accountId: l.accountId,
          debitAmount: parseAmount(l.debit),
          creditAmount: parseAmount(l.credit),
        }))
        .filter((l) => l.accountId && (l.debitAmount > 0 || l.creditAmount > 0));

      if (journalLines.length < 2) throw new Error("Add at least two lines with amounts");

      if (voucherKind === "Contra") {
        const cashBank = journalLines.filter((l) => {
          const acc = accounts.find((a) => a.id === l.accountId);
          return acc && (acc.account_code.startsWith("10") || /bank|cash/i.test(acc.account_name));
        });
        if (cashBank.length < 2) {
          throw new Error("Contra vouchers should use cash/bank ledgers (e.g. 1000, 1010) on both sides");
        }
      }

      const referenceType: JournalReferenceType = voucherKind;
      const referenceId = crypto.randomUUID();

      return postJournalEntry({
        organizationId: currentOrganization.id,
        date: entryDate,
        referenceType,
        referenceId,
        description: description.trim(),
        lines: journalLines,
        client: supabase,
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.status === "already_exists" ? "Voucher already posted (duplicate id)" : "Journal voucher posted"
      );
      setDescription("");
      setLines([
        { key: crypto.randomUUID(), accountId: "", debit: "", credit: "" },
        { key: crypto.randomUUID(), accountId: "", debit: "", credit: "" },
      ]);
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to post journal"),
  });

  const addLine = () => setLines((prev) => [...prev, { key: crypto.randomUUID(), accountId: "", debit: "", credit: "" }]);

  const removeLine = (key: string) => setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const tabTriggerClass =
    "h-10 px-3 text-sm font-semibold shrink-0 rounded-md data-[state=active]:bg-teal-700 data-[state=active]:text-white data-[state=inactive]:text-slate-600";

  return (
    <div className="manual-journal-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
              <BookPlus className="h-5 w-5 shrink-0" />
              Manual journal &amp; contra
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              Post balanced double-entry vouchers to the general ledger (Tally-style journal / contra).
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-9 text-sm border-slate-200" asChild>
              <Link to={getOrgPath("/third-party-entry")}>Third-party pay/receive</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-sm border-slate-200" asChild>
              <Link to={getOrgPath("/journal-vouchers")}>View day book</Link>
            </Button>
          </div>
        </div>

        <Tabs
          value={voucherKind}
          onValueChange={(v) => setVoucherKind(v as "ManualJournal" | "Contra")}
          className="flex flex-1 flex-col min-h-0 overflow-hidden gap-2"
        >
          <TabsList className="shrink-0 w-full h-auto p-1 bg-white border border-slate-200 rounded-lg grid grid-cols-2 gap-1">
            <TabsTrigger value="ManualJournal" className={tabTriggerClass}>
              Journal voucher
            </TabsTrigger>
            <TabsTrigger value="Contra" className={tabTriggerClass}>
              Contra (cash / bank)
            </TabsTrigger>
          </TabsList>

          <Card className="min-h-0 flex-1 flex flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm p-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
              <TabsContent value="ManualJournal" className="mt-0 outline-none data-[state=inactive]:hidden">
                <div className="mb-3">
                  <h2 className="text-base font-bold text-slate-900">Journal voucher</h2>
                  <p className="text-sm text-muted-foreground">
                    Debit and credit any ledger accounts. Period lock applies to the voucher date.
                  </p>
                </div>
                {renderForm()}
              </TabsContent>

              <TabsContent value="Contra" className="mt-0 outline-none data-[state=inactive]:hidden">
                <div className="mb-3">
                  <h2 className="text-base font-bold text-slate-900">Contra voucher</h2>
                  <p className="text-sm text-muted-foreground">
                    Transfer between cash and bank ledgers (both sides must be cash/bank accounts).
                  </p>
                </div>
                {renderForm()}
              </TabsContent>
            </div>
          </Card>
        </Tabs>
      </div>
    </div>
  );

  function renderForm() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Voucher date</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Narration</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Office rent adjustment for March"
              rows={2}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Ledger account</TableHead>
                <TableHead className="text-right w-[120px]">Debit (₹)</TableHead>
                <TableHead className="text-right w-[120px]">Credit (₹)</TableHead>
                <TableHead className="w-[48px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>
                    <Select value={line.accountId || "none"} onValueChange={(v) => updateLine(line.key, { accountId: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select account</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.account_code} — {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right font-mono"
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(e) =>
                        updateLine(line.key, { debit: e.target.value, ...(e.target.value ? { credit: "" } : {}) })
                      }
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-right font-mono"
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(e) =>
                        updateLine(line.key, { credit: e.target.value, ...(e.target.value ? { debit: "" } : {}) })
                      }
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.key)} disabled={lines.length <= 2}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{fmt(totals.debit)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(totals.credit)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" />
            Add line
          </Button>
          <span className={`text-sm ${balanced ? "text-emerald-600" : "text-destructive"}`}>
            {balanced ? "Balanced — ready to post" : `Difference: ${fmt(Math.abs(totals.debit - totals.credit))}`}
          </span>
        </div>

        <Button
          type="button"
          disabled={!balanced || postMutation.isPending}
          onClick={() => postMutation.mutate()}
        >
          {postMutation.isPending ? "Posting…" : `Post ${voucherKind === "Contra" ? "contra" : "journal"}`}
        </Button>
      </div>
    );
  }
}
