import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  GODOWN_TYPES,
  emptyGodownForm,
  godownFormOf,
  godownFormProblem,
  saveGodown,
  type Godown,
  type GodownForm,
  type GodownType,
} from "@/utils/godowns";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** The godown to edit, or null to add one. */
  godown: Godown | null;
  godowns: Godown[];
  /** Stock now in this godown: a godown with stock cannot be closed. */
  stockQty: number;
  onSaved: (id: string) => void;
};

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const field = "h-9 bg-white text-sm";

/** Add or edit one godown. Main keeps its type and stays open. */
export function GodownDialog({ open, onOpenChange, organizationId, godown, godowns, stockQty, onSaved }: Props) {
  const [form, setForm] = useState<GodownForm>(emptyGodownForm);
  const [problem, setProblem] = useState<{ field: keyof GodownForm | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Start once per opening; a list refresh while typing keeps what was typed.
  const godownId = godown?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setForm(godown ? godownFormOf(godown) : emptyGodownForm());
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, godownId]);

  const isMain = form.godown_type === "main";
  const jobWork = form.godown_type === "job_work";

  // Job workers come from the Supplier Master, read only when this godown is a job worker.
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["godown-job-workers", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, supplier_name")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("supplier_name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((s) => ({ value: String(s.id), label: String(s.supplier_name ?? "") }));
    },
    enabled: open && jobWork,
    staleTime: 5 * 60_000,
  });

  const set = (patch: Partial<GodownForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };

  const types = useMemo(() => GODOWN_TYPES.filter((t) => (isMain ? t.value === "main" : t.value !== "main")), [isMain]);
  const closing = !!godown && godown.is_active && !form.is_active;

  const save = async () => {
    if (busy) return;
    const bad = godownFormProblem(form, godowns);
    if (bad) {
      setProblem(bad);
      return;
    }
    if (closing && stockQty > 0) {
      setProblem({ field: "is_active", error: `Move the stock out of ${godown!.name} before closing it` });
      return;
    }
    setBusy(true);
    try {
      const id = await saveGodown(organizationId, form);
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      setProblem({ field: null, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const bad = (f: keyof GodownForm) => (problem?.field === f ? "border-red-400 ring-1 ring-red-200" : "");

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
              <Warehouse className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{godown ? `Edit ${godown.name}` : "New godown"}</DialogTitle>
              <DialogDescription className="text-xs">
                {isMain
                  ? "Your shop. It holds all stock that is not in another godown, so bills keep working as they do today."
                  : "A stock place on your GSTIN: your own godown, a job worker, or damaged goods."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="godown-name" className={label}>Name</label>
              <Input
                id="godown-name"
                className={cn(field, "no-uppercase", bad("name"))}
                value={form.name}
                maxLength={60}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Bhiwandi godown"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="godown-code" className={label}>Short code</label>
              <Input
                id="godown-code"
                className={cn(field, "uppercase")}
                value={form.code}
                maxLength={12}
                onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                placeholder="BHW"
              />
            </div>
          </div>

          <div>
            <div className={label}>Type</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {types.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={isMain}
                  onClick={() => set({ godown_type: t.value as GodownType })}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    form.godown_type === t.value
                      ? "border-teal-500 bg-teal-50/70 ring-1 ring-teal-200"
                      : "border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50",
                    isMain && "cursor-default sm:col-span-3",
                  )}
                >
                  <div className="text-sm font-semibold text-slate-800">{t.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {jobWork ? (
            <div>
              <div className={label}>Job worker (from Supplier Master)</div>
              {suppliersLoading ? (
                <div className="flex h-9 items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading suppliers…
                </div>
              ) : (
                <SearchableSelect
                  value={form.supplier_id ?? ""}
                  onValueChange={(v) => set({ supplier_id: v || null })}
                  options={suppliers}
                  allValue=""
                  allLabel="No supplier linked"
                  triggerClassName="h-9 w-full justify-between bg-white font-normal"
                />
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="godown-address" className={label}>Address</label>
              <Input
                id="godown-address"
                className={cn(field, "no-uppercase")}
                value={form.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="Plot 12, Kalher, Bhiwandi"
              />
            </div>
            <div>
              <label htmlFor="godown-pin" className={label}>PIN code</label>
              <Input
                id="godown-pin"
                inputMode="numeric"
                className={cn(field, "font-mono", bad("pincode"))}
                value={form.pincode}
                maxLength={6}
                onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder="421302"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="godown-contact" className={label}>In charge</label>
              <Input
                id="godown-contact"
                className={cn(field, "no-uppercase")}
                value={form.contact_name}
                onChange={(e) => set({ contact_name: e.target.value })}
                placeholder="Name"
              />
            </div>
            <div>
              <label htmlFor="godown-phone" className={label}>Phone</label>
              <Input
                id="godown-phone"
                inputMode="tel"
                className={field}
                value={form.contact_phone}
                maxLength={15}
                onChange={(e) => set({ contact_phone: e.target.value.replace(/[^\d+ ]/g, "") })}
                placeholder="98xxxxxxxx"
              />
            </div>
          </div>

          <div>
            <label htmlFor="godown-notes" className={label}>Notes</label>
            <Textarea
              id="godown-notes"
              className="no-uppercase min-h-[60px] bg-white text-sm"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Timing, landmark, anything the team should know"
            />
          </div>

          {godown && !isMain ? (
            <div className={cn("flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2", bad("is_active"))}>
              <div>
                <div className="text-sm font-medium text-slate-800">Open</div>
                <div className="text-[11px] text-slate-500">A closed godown takes no new stock. Move its stock out first.</div>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set({ is_active: v === true })} />
            </div>
          ) : null}
        </div>

        {problem ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {problem.error}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {godown ? "Save" : "Add godown"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
