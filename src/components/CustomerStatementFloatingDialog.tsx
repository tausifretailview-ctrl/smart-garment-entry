import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Scale, Search } from "lucide-react";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useCustomerBalances } from "@/hooks/useCustomerSearch";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type CustomerRow = {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  opening_balance: number | null;
};

/** Fields required by `useCustomerBalances().getCustomerBalance` */
function toBalanceCustomer(c: CustomerRow, organizationId: string) {
  return {
    id: c.id,
    customer_name: c.customer_name,
    phone: c.phone,
    email: c.email,
    address: null as string | null,
    gst_number: c.gst_number,
    opening_balance: c.opening_balance,
    discount_percent: null as number | null,
    organization_id: organizationId,
  };
}

interface CustomerStatementFloatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function canAccessStatement(hasMenuAccess: (id: string) => boolean, permissions: unknown) {
  if (permissions === null) return true;
  return hasMenuAccess("customer_account_statement") || hasMenuAccess("customer_ledger");
}

export function CustomerStatementFloatingDialog({ open, onOpenChange }: CustomerStatementFloatingDialogProps) {
  const { currentOrganization } = useOrganization();
  const { isSchool } = useSchoolFeatures();
  const { orgNavigate } = useOrgNavigation();
  const { hasMenuAccess, permissions } = useUserPermissions();

  const [search, setSearch] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allowed = canAccessStatement(hasMenuAccess, permissions);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDueOnly(false);
      setSelectedId(null);
    }
  }, [open]);

  const { data: customers = [], isLoading: customersLoading, error: customersError } = useQuery({
    queryKey: ["customer-statement-floating-list", currentOrganization?.id],
    enabled: open && !!currentOrganization?.id && !isSchool && allowed,
    queryFn: async () => {
      const rows = await fetchAllCustomers(currentOrganization!.id);
      return rows as CustomerRow[];
    },
    staleTime: 60 * 1000,
  });

  const { getCustomerBalance, getCustomerAdvance, getCustomerCreditNote } = useCustomerBalances();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = customers;
    if (q) {
      list = customers.filter((c) => {
        const hay = [c.customer_name, c.phone ?? "", c.email ?? "", c.gst_number ?? ""].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    if (dueOnly && currentOrganization?.id) {
      const oid = currentOrganization.id;
      list = list.filter((c) => {
        const bal = getCustomerBalance(toBalanceCustomer(c, oid));
        return Math.abs(bal) >= 0.005;
      });
    }
    return list;
  }, [customers, search, dueOnly, getCustomerBalance, currentOrganization?.id]);

  const selected = useMemo(() => customers.find((c) => c.id === selectedId) ?? null, [customers, selectedId]);

  const snapshot = useCustomerBalance(selectedId, currentOrganization?.id ?? null);
  const orgId = currentOrganization?.id ?? "";

  // Use the SAME receivable basis as the left list / audit register so the
  // headline doesn't drift from the customer ledger figure.
  const auditAlignedBalance = useMemo(() => {
    if (!selected || !orgId) return 0;
    return getCustomerBalance(toBalanceCustomer(selected, orgId));
  }, [selected, orgId, getCustomerBalance]);
  const auditAlignedAdv = selected ? getCustomerAdvance(selected.id) : 0;
  const auditAlignedCn = selected ? getCustomerCreditNote(selected.id) : 0;

  const openAuditPage = () => {
    if (!selectedId) return;
    onOpenChange(false);
    orgNavigate(`/customer-account-statement-audit?customer=${encodeURIComponent(selectedId)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 flex flex-col overflow-hidden",
          isSchool || !allowed
            ? "max-w-md"
            : "max-w-4xl w-[min(96vw,56rem)] h-[min(88vh,720px)] p-0",
        )}
      >
        {isSchool ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Customer statement
              </DialogTitle>
              <DialogDescription>
                This quick lookup is for business customers. Use the school menu for student fee statements.
              </DialogDescription>
            </DialogHeader>
          </>
        ) : !allowed ? (
          <>
            <DialogHeader>
              <DialogTitle>Customer statement</DialogTitle>
              <DialogDescription>
                You do not have permission to view customer account statements.
              </DialogDescription>
            </DialogHeader>
          </>
        ) : (
          <>
            <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0 space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Customer statement — quick lookup
              </DialogTitle>
              <DialogDescription className="text-xs">
                Search customers, see receivable balance (same basis as POS customer picker). Open the full audit
                register for the selected customer.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <div className="flex flex-col border-b md:border-b-0 md:border-r min-h-0 md:w-[min(100%,22rem)] shrink-0">
            <div className="p-3 space-y-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9"
                  placeholder="Search name, phone, email, GST…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="due-only" checked={dueOnly} onCheckedChange={(v) => setDueOnly(v === true)} />
                <Label htmlFor="due-only" className="text-xs font-normal cursor-pointer">
                  Show non-zero balance only
                </Label>
              </div>
            </div>

            {customersError && (
              <div className="p-3 text-sm text-destructive">{(customersError as Error).message}</div>
            )}

            {customersLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground p-6">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading customers…</span>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-[200px] md:min-h-0">
                <div className="p-1 pr-3">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No customers match your search.</p>
                  ) : (
                    filtered.map((c) => {
                      const bal = getCustomerBalance(toBalanceCustomer(c, orgId));
                      const adv = getCustomerAdvance(c.id);
                      const cnAmt = getCustomerCreditNote(c.id);
                      const isSel = c.id === selectedId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className={cn(
                            "w-full text-left rounded-md px-2 py-2 text-xs transition-colors",
                            "hover:bg-muted/80",
                            isSel && "bg-primary/10 ring-1 ring-primary/30",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{c.customer_name}</div>
                              {c.phone && <div className="text-muted-foreground truncate">{c.phone}</div>}
                            </div>
                            <div className="shrink-0 text-right space-y-0.5">
                              {Math.abs(bal) >= 0.005 && (
                                <div
                                  className={cn(
                                    "font-semibold tabular-nums",
                                    bal > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
                                  )}
                                >
                                  ₹{inr.format(Math.abs(bal))}
                                  <span className="text-[10px] ml-0.5">{bal > 0 ? "Dr" : "Cr"}</span>
                                </div>
                              )}
                              {adv > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                                  Adv ₹{inr.format(adv)}
                                </Badge>
                              )}
                              {cnAmt > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
                                  CN ₹{inr.format(cnAmt)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}
            <div className="text-[10px] text-muted-foreground px-3 py-1.5 border-t shrink-0">
              {filtered.length} shown · {customers.length} total
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 min-w-0 p-3">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground text-center px-4">
                Select a customer to see detailed outstanding (ledger snapshot) and open the audit statement.
              </div>
            ) : (
              <div className="flex flex-col gap-3 min-h-0">
                <div>
                  <h3 className="font-semibold text-sm">{selected.customer_name}</h3>
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {selected.phone && <div>Phone: {selected.phone}</div>}
                    {selected.email && <div>Email: {selected.email}</div>}
                    {selected.gst_number && <div>GST: {selected.gst_number}</div>}
                  </div>
                </div>

                {snapshot.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading balance snapshot…
                  </div>
                ) : (
                  <Card className="shrink-0">
                    <CardContent className="p-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Outstanding (snapshot)</span>
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            auditAlignedBalance > 0.005
                              ? "text-red-600 dark:text-red-400"
                              : auditAlignedBalance < -0.005
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "",
                          )}
                        >
                          ₹{inr.format(Math.abs(auditAlignedBalance))}
                          {auditAlignedBalance > 0.005 ? " Dr" : auditAlignedBalance < -0.005 ? " Cr" : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground border-t pt-2">
                        <span>Opening</span>
                        <span className="text-right tabular-nums">₹{inr.format(snapshot.openingBalance)}</span>
                        <span>Net sales</span>
                        <span className="text-right tabular-nums">₹{inr.format(snapshot.totalSales)}</span>
                        <span>Total paid</span>
                        <span className="text-right tabular-nums">₹{inr.format(snapshot.totalPaid)}</span>
                        {auditAlignedAdv > 0.005 && (
                          <>
                            <span>Unused advance</span>
                            <span className="text-right tabular-nums">₹{inr.format(auditAlignedAdv)}</span>
                          </>
                        )}
                        {auditAlignedCn > 0.005 && (
                          <>
                            <span>Pending credit note</span>
                            <span className="text-right tabular-nums">₹{inr.format(auditAlignedCn)}</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex flex-wrap gap-2 mt-auto pt-2">
                  <Button type="button" size="sm" onClick={openAuditPage} className="gap-1.5">
                    <Scale className="h-4 w-4" />
                    Open account statement (audit)
                  </Button>
                </div>
              </div>
            )}
          </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
