import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

interface AccountRow {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_account_id: string | null;
  is_system_account: boolean;
}

const ACCOUNT_TYPES: AccountType[] = ["Asset", "Liability", "Equity", "Revenue", "Expense"];

export default function ChartOfAccounts() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("Asset");
  const [parentAccountId, setParentAccountId] = useState<string>("none");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async (): Promise<AccountRow[]> => {
      const { data, error } = await (supabase as any)
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, parent_account_id, is_system_account")
        .eq("organization_id", currentOrganization!.id)
        .order("account_type", { ascending: true })
        .order("account_code", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const groupedAccounts = useMemo(() => {
    const groups = new Map<AccountType, AccountRow[]>();
    ACCOUNT_TYPES.forEach((type) => groups.set(type, []));
    accounts.forEach((acc) => {
      const list = groups.get(acc.account_type as AccountType) || [];
      list.push(acc);
      groups.set(acc.account_type as AccountType, list);
    });
    return groups;
  }, [accounts]);

  const createAccount = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("Organization is required");
      if (!accountCode.trim() || !accountName.trim()) throw new Error("Account code and account name are required");

      const payload = {
        organization_id: currentOrganization.id,
        account_code: accountCode.trim(),
        account_name: accountName.trim(),
        account_type: accountType,
        parent_account_id: parentAccountId === "none" ? null : parentAccountId,
        is_system_account: false,
      };

      const { error } = await (supabase as any).from("chart_of_accounts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ledger account created");
      setOpen(false);
      setAccountCode("");
      setAccountName("");
      setAccountType("Asset");
      setParentAccountId("none");
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts", currentOrganization?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to create account");
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold">Chart of Accounts</h1>
            <p className="text-sm text-muted-foreground">Manage ledger accounts for double-entry accounting</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Account
        </Button>
      </div>

      {ACCOUNT_TYPES.map((type) => (
        <Card key={type}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {type}s
              <Badge variant="secondary">{groupedAccounts.get(type)?.length || 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead className="text-right">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : (groupedAccounts.get(type)?.length || 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No accounts in this group</TableCell>
                    </TableRow>
                  ) : (
                    groupedAccounts.get(type)!.map((acc) => (
                      <TableRow key={acc.id}>
                        <TableCell className="font-mono">{acc.account_code}</TableCell>
                        <TableCell className="font-medium">
                          {acc.account_name}
                          {acc.is_system_account && <Badge className="ml-2" variant="outline">System</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {acc.parent_account_id ? accountById.get(acc.parent_account_id)?.account_name || "-" : "-"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{acc.account_type}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create Ledger Account</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Account Code</Label>
              <Input
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                placeholder="e.g. 1000"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={accountType} onValueChange={(v: AccountType) => setAccountType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Account Name</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. HDFC Bank - Main"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Parent Account (Optional)</Label>
              <Select value={parentAccountId} onValueChange={setParentAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Parent</SelectItem>
                  {accounts
                    .filter((a) => a.account_type === accountType)
                    .map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.account_code} - {acc.account_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createAccount.mutate()} disabled={createAccount.isPending}>
              {createAccount.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

