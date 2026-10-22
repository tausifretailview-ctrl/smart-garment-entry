import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  CREDIT_STATE_LABEL,
  creditState,
  defaultValidUntil,
  formatValidUntil,
  todayIso,
  type WhatsAppCreditState,
  type WhatsAppCredits,
} from "@/utils/whatsappCredits";

interface Organization {
  id: string;
  name: string;
}

interface TopUp {
  id: string;
  messages: number;
  valid_until: string;
  balance_before: number;
  balance_after: number;
  lapsed: number;
  note: string | null;
  created_at: string;
}

const STATE_CLASS: Record<WhatsAppCreditState, string> = {
  active: "bg-green-500 hover:bg-green-600 text-white",
  low: "bg-amber-500 hover:bg-amber-600 text-white",
  empty: "bg-red-500 hover:bg-red-600 text-white",
  expired: "bg-gray-500 hover:bg-gray-600 text-white",
};

/** Platform admin: Ezzy ERP WhatsApp message balance per shop (add messages + validity). */
export function PlatformWhatsAppCredits({ organizations }: { organizations: Organization[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [messages, setMessages] = useState("1000");
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [note, setNote] = useState("");

  const { data: credits = [], isLoading, error: loadError } = useQuery({
    queryKey: ["platform-whatsapp-credits"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_message_credits" as any) as any).select("*");
      if (error) throw error;
      return (data ?? []) as WhatsAppCredits[];
    },
    staleTime: 30_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["platform-whatsapp-credit-topups", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_credit_topups" as any) as any)
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as TopUp[];
    },
    enabled: open && !!orgId,
  });

  const orgName = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);
  const rows = useMemo(
    () =>
      [...credits].sort((a, b) =>
        (orgName.get(a.organization_id) ?? "").localeCompare(orgName.get(b.organization_id) ?? ""),
      ),
    [credits, orgName],
  );
  const current = credits.find((c) => c.organization_id === orgId);

  const openFor = (id: string) => {
    setOrgId(id);
    setMessages("1000");
    setValidUntil(defaultValidUntil());
    setNote("");
    setOpen(true);
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const count = Number.parseInt(messages, 10);
      if (!orgId) throw new Error("Select an organization");
      if (!Number.isFinite(count) || count === 0) throw new Error("Enter the number of messages");
      if (!validUntil) throw new Error("Select the validity date");
      const { error } = await (supabase as any).rpc("platform_add_whatsapp_credits", {
        p_organization_id: orgId,
        p_messages: count,
        p_valid_until: validUntil,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      return count;
    },
    onSuccess: (count) => {
      toast.success(
        `${count > 0 ? "Added" : "Removed"} ${Math.abs(count).toLocaleString("en-IN")} messages for ${orgName.get(orgId) ?? "shop"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["platform-whatsapp-credits"] });
      queryClient.invalidateQueries({ queryKey: ["platform-whatsapp-credit-topups"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-message-credits"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not add balance"),
  });

  const expiredNow = current && current.valid_until && current.valid_until < todayIso() && current.balance > 0;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Ezzy ERP WhatsApp Message Balance
          </CardTitle>
          <CardDescription>
            Each message sent through Ezzy ERP WhatsApp takes 1. Shops not listed here have no limit.
          </CardDescription>
        </div>
        <Button onClick={() => openFor("")}>
          <Plus className="h-4 w-4 mr-2" />
          Add balance
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-muted-foreground py-4">
            Message balance is not set up on the database yet (run the WhatsApp message balance SQL).
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No shop has a message balance yet. Click Add balance.</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead className="text-center">Balance</TableHead>
                  <TableHead className="text-center">Used</TableHead>
                  <TableHead className="text-center">Valid until</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Last added</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const state = creditState(c);
                  return (
                    <TableRow key={c.organization_id}>
                      <TableCell className="font-medium">{orgName.get(c.organization_id) ?? "Unknown"}</TableCell>
                      <TableCell className={`text-center font-bold ${c.balance <= 0 ? "text-red-600" : ""}`}>
                        {Number(c.balance).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-center">{Number(c.used_count).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{formatValidUntil(c.valid_until)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`min-w-[96px] justify-center ${STATE_CLASS[state]}`}>{CREDIT_STATE_LABEL[state]}</Badge>
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap text-sm text-muted-foreground">
                        {c.last_topup_at ? format(new Date(c.last_topup_at), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openFor(c.organization_id)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add WhatsApp message balance</DialogTitle>
            <DialogDescription>
              Messages are added to the current balance. If the old validity is already over, the old balance lapses
              and the shop starts from the new messages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Organization</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {current && (
                <p className="text-xs text-muted-foreground">
                  Now: {Number(current.balance).toLocaleString("en-IN")} messages, valid until{" "}
                  {formatValidUntil(current.valid_until)}
                  {expiredNow ? " (expired, will lapse)" : ""}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Messages</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={messages}
                  onChange={(e) => setMessages(e.target.value.replace(/[^\d-]/g, ""))}
                  placeholder="1000"
                />
                <p className="text-[11px] text-muted-foreground">Use a minus number to correct a mistake.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Valid until</Label>
                <Input type="date" value={validUntil} min={todayIso()} onChange={(e) => setValidUntil(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Default 1 year from today.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid ₹1,000, UPI ref …" />
            </div>
            {history.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Last added</Label>
                <div className="rounded-md border text-xs divide-y">
                  {history.map((h) => (
                    <div key={h.id} className="flex flex-wrap justify-between gap-2 px-2 py-1.5">
                      <span>{format(new Date(h.created_at), "dd/MM/yyyy")}</span>
                      <span className={h.messages < 0 ? "text-red-600" : "text-green-700"}>
                        {h.messages > 0 ? "+" : ""}
                        {h.messages.toLocaleString("en-IN")}
                      </span>
                      <span>till {formatValidUntil(h.valid_until)}</span>
                      {h.lapsed > 0 && <span className="text-muted-foreground">{h.lapsed} lapsed</span>}
                      {h.note && <span className="text-muted-foreground truncate max-w-[160px]">{h.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !orgId}>
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
