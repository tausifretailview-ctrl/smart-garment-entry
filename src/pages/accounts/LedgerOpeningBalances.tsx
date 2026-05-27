import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

interface OpeningRow {
  id: string;
  as_of_date: string;
  debit_amount: number;
  credit_amount: number;
  notes: string | null;
  account_id: string;
  chart_of_accounts: { account_code: string; account_name: string } | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export default function LedgerOpeningBalances() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [accountId, setAccountId] = useState("");
  const [side, setSide] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["opening-balance-accounts", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async (): Promise<SeededAccount[]> => seedDefaultAccounts(currentOrganization!.id, supabase),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ledger-opening-balances", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async (): Promise<OpeningRow[]> => {
      const { data, error } = await supabase
        .from("ledger_opening_balances")
        .select("id, as_of_date, debit_amount, credit_amount, notes, account_id, chart_of_accounts(account_code, account_name)")
        .eq("organization_id", currentOrganization!.id)
        .order("as_of_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpeningRow[];
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setAsOfDate(format(new Date(), "yyyy-MM-dd"));
    setAccountId("");
    setSide("debit");
    setAmount("");
    setNotes("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: OpeningRow) => {
    setEditingId(row.id);
    setAsOfDate(row.as_of_date);
    setAccountId(row.account_id);
    setSide(Number(row.debit_amount) > 0 ? "debit" : "credit");
    setAmount(String(Number(row.debit_amount) > 0 ? row.debit_amount : row.credit_amount));
    setNotes(row.notes ?? "");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("Organization required");
      if (!accountId) throw new Error("Select a ledger account");
      const amt = Math.round(Number(amount) * 100) / 100;
      if (!(amt > 0)) throw new Error("Enter a positive amount");

      const payload = {
        organization_id: currentOrganization.id,
        account_id: accountId,
        as_of_date: asOfDate,
        debit_amount: side === "debit" ? amt : 0,
        credit_amount: side === "credit" ? amt : 0,
        notes: notes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from("ledger_opening_balances").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ledger_opening_balances").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Opening balance updated" : "Opening balance saved");
      setDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["ledger-opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
    },
    onError: (err: Error) => toast.error(err.message || "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ledger_opening_balances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Opening balance removed");
      queryClient.invalidateQueries({ queryKey: ["ledger-opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Scale className="h-6 w-6 text-primary" />
              Ledger opening balances
            </h1>
            <p className="text-sm text-muted-foreground">
              Set brought-forward balances per ledger (included in GL trial balance for the as-of date range).
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>Add opening balance</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opening balances</CardTitle>
          <CardDescription>
            Use the same date as your books start. These amounts add to posted journals on the GL Trial tab when the date falls in the selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>As of date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No opening balances yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const coa = row.chart_of_accounts;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{format(new Date(row.as_of_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">{coa?.account_code}</span>{" "}
                          {coa?.account_name}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(row.debit_amount) > 0 ? fmt(Number(row.debit_amount)) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(row.credit_amount) > 0 ? fmt(Number(row.credit_amount)) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {row.notes || "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Delete this opening balance?")) deleteMutation.mutate(row.id);
                            }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit opening balance" : "Add opening balance"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>As of date</Label>
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ledger account</Label>
              <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)} disabled={!!editingId}>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Balance side</Label>
                <Select value={side} onValueChange={(v: "debit" | "credit") => setSide(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit balance</SelectItem>
                    <SelectItem value="credit">Credit balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Brought forward from Tally" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
