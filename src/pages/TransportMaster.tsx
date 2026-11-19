import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useTransporters } from "@/components/transport/TransporterSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  EMPTY_TRANSPORTER,
  TRANSPORT_MODES,
  addTransporter,
  cleanTransporterInput,
  isMissingTransportersTable,
  removeTransporter,
  updateTransporter,
  type Transporter,
  type TransporterInput,
} from "@/lib/data/transporters";

type Draft = Record<keyof TransporterInput, string | boolean>;

function toDraft(t: TransporterInput): Draft {
  const d = {} as Draft;
  for (const key of Object.keys(EMPTY_TRANSPORTER) as Array<keyof TransporterInput>) {
    const v = t[key];
    d[key] = typeof v === "boolean" ? v : v == null ? "" : String(v);
  }
  return d;
}

function fromDraft(d: Draft): TransporterInput {
  const out = { ...EMPTY_TRANSPORTER } as Record<string, unknown>;
  for (const key of Object.keys(EMPTY_TRANSPORTER)) {
    const v = d[key as keyof TransporterInput];
    out[key] = typeof v === "boolean" ? v : v === "" ? null : v;
  }
  out.transporter_name = String(d.transporter_name ?? "");
  out.transport_mode = String(d.transport_mode || "road");
  return out as TransporterInput;
}

const FIELDS: Array<{ key: keyof TransporterInput; label: string; placeholder?: string; wide?: boolean; inputMode?: "tel" | "email" | "numeric" }> = [
  { key: "transporter_gstin", label: "Transporter GSTIN / ID", placeholder: "15 characters (for e-way bill)" },
  { key: "contact_person", label: "Contact person" },
  { key: "phone", label: "Phone", inputMode: "tel" },
  { key: "alternate_phone", label: "Alternate phone", inputMode: "tel" },
  { key: "email", label: "Email", inputMode: "email" },
  { key: "vehicle_number", label: "Vehicle number", placeholder: "e.g. MH12AB1234" },
  { key: "booking_station", label: "Booking station / branch", placeholder: "Where parcels are booked" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode", inputMode: "numeric" },
  { key: "delivery_area", label: "Delivery areas / routes", placeholder: "e.g. Gujarat, Rajasthan", wide: true },
];

/** Master → Transport Master: the shop's transporters, picked for customers in Customer Master. */
export default function TransportMaster() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const query = useTransporters(orgId);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Transporter | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(EMPTY_TRANSPORTER));
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Transporter | null>(null);

  const notSetUp = query.error != null && isMissingTransportersTable(query.error as { message?: string });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = query.data ?? [];
    if (!q) return list;
    return list.filter((t) =>
      [t.transporter_name, t.transporter_gstin, t.contact_person, t.phone, t.city, t.state, t.booking_station]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [query.data, search]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["transporters", orgId] });

  const save = useMutation({
    mutationFn: async () => {
      const checked = cleanTransporterInput(fromDraft(draft));
      if (checked.ok === false) throw new Error(checked.error);
      if (editing) await updateTransporter(orgId!, editing.id, checked.value);
      else await addTransporter(orgId!, checked.value, user?.id);
      return checked.value.transporter_name;
    },
    onSuccess: (name) => {
      toast.success(editing ? `${name} saved` : `${name} added`);
      setOpen(false);
      void refresh();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Could not save"),
  });

  const remove = useMutation({
    mutationFn: (t: Transporter) => removeTransporter(orgId!, t.id),
    onSuccess: (_d, t) => {
      toast.success(`${t.transporter_name} removed`);
      setRemoving(null);
      void refresh();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not remove"),
  });

  const openAdd = () => {
    setEditing(null);
    setDraft(toDraft(EMPTY_TRANSPORTER));
    setError(null);
    setOpen(true);
  };
  const openEdit = (t: Transporter) => {
    setEditing(t);
    setDraft(toDraft(t));
    setError(null);
    setOpen(true);
  };
  const set = (key: keyof TransporterInput, value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="shrink-0 space-y-1">
          <div className="[&_button]:mb-0">
            <BackToDashboard />
          </div>
          <h1 className="text-2xl font-bold leading-none tracking-tight text-blue-700">Transport Master</h1>
          <p className="text-sm text-muted-foreground">
            Transporters and couriers you send goods with. Pick one for a customer in Customer Master.
          </p>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5">
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium tabular-nums text-slate-600">
              {rows.length} transporter{rows.length === 1 ? "" : "s"}
            </span>
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, GSTIN, phone, city…"
                className="h-9 pl-9"
                aria-label="Search transporters"
              />
            </div>
            <Button size="sm" className="h-9" onClick={openAdd} disabled={!orgId || notSetUp}>
              <Plus className="mr-1 h-4 w-4" /> Add transporter
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {notSetUp ? (
              <p className="m-4 rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Transport Master is not set up on this database yet. Run the migration
                20270507120000_transport_master.sql, then open this page again.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transporter</TableHead>
                    <TableHead>GSTIN / ID</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>City / State</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onDoubleClick={() => openEdit(t)}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-semibold text-slate-900">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          {t.transporter_name}
                        </div>
                        {t.booking_station ? <div className="text-xs text-muted-foreground">{t.booking_station}</div> : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.transporter_gstin || "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{t.contact_person || "—"}</div>
                        {t.phone ? (
                          <a className="text-xs text-primary" href={`tel:${t.phone}`} onClick={(e) => e.stopPropagation()}>
                            {t.phone}
                          </a>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{[t.city, t.state].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {TRANSPORT_MODES.find((m) => m.id === t.transport_mode)?.label.split(" (")[0] ?? t.transport_mode}
                      </TableCell>
                      <TableCell>
                        {t.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${t.transporter_name}`} onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`Remove ${t.transporter_name}`}
                          onClick={() => setRemoving(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        {query.isLoading ? "Loading…" : search ? "No transporter matches your search." : "No transporters yet. Add your first one."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit transporter" : "Add transporter"}</DialogTitle>
            <DialogDescription>Only the name is required.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              save.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="tr-name">Transporter name *</Label>
                <Input
                  id="tr-name"
                  autoFocus
                  value={String(draft.transporter_name)}
                  onChange={(e) => set("transporter_name", e.target.value)}
                  placeholder="e.g. VRL Logistics"
                />
              </div>
              <div>
                <Label htmlFor="tr-mode">Mode</Label>
                <Select value={String(draft.transport_mode || "road")} onValueChange={(v) => set("transport_mode", v)}>
                  <SelectTrigger id="tr-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSPORT_MODES.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {FIELDS.map((f) => (
                <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={`tr-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`tr-${f.key}`}
                    inputMode={f.inputMode}
                    value={String(draft[f.key] ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className={f.key === "email" ? "no-uppercase" : undefined}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="tr-address">Address</Label>
                <Textarea id="tr-address" rows={2} value={String(draft.address ?? "")} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="tr-notes">Notes</Label>
                <Textarea
                  id="tr-notes"
                  rows={2}
                  value={String(draft.notes ?? "")}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Rates, booking timings, anything staff should know"
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Switch checked={draft.is_active !== false} onCheckedChange={(v) => set("is_active", v)} />
                Active (shown in the Customer Master list)
              </label>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : editing ? "Save" : "Add transporter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing != null} onOpenChange={(next) => !next && setRemoving(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {removing?.transporter_name}?</DialogTitle>
            <DialogDescription>
              It leaves this list and the Customer Master dropdown. Customers that used it keep the transport text on
              their bills.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
