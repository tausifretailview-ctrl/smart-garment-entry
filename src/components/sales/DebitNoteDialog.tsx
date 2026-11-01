import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FilePlus2, Loader2, Plus, Printer, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { cn } from "@/lib/utils";
import { isInterState } from "@/utils/gstRegisterUtils";
import { filedPeriodForDate, filedPeriodLockMessage, resolveGstFilings } from "@/utils/gstFiling";
import { resolveGstFilingPrefs } from "@/utils/gstReadiness";
import { invalidateMoneyViewsAfterMutation } from "@/utils/moneyViewFreshnessInvalidation";
import { invalidateOrgLedgerReferenceData } from "@/hooks/useOrgLedgerReferenceData";
import { toIsoDay } from "@/utils/industrialMode";
import {
  DEBIT_NOTE_GST_RATES,
  DEBIT_NOTE_NUMBER_PREFIX,
  DEBIT_NOTE_REASONS,
  DEBIT_NOTE_SALE_TYPE,
  buildDebitNoteDetails,
  computeDebitNote,
  debitNoteDetailsToForms,
  debitNoteReasonLine,
  isDebitNoteReason,
  newDebitNoteLineForm,
  parseDebitNoteDetails,
  validateDebitNote,
  type DebitNoteLineForm,
  type DebitNoteReason,
} from "@/utils/debitNote";

/** A saved debit note as the list and the print need it. */
export type DebitNoteRow = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  net_amount: number;
  gross_amount: number;
  round_off: number;
  paid_amount: number | null;
  payment_status: string | null;
  notes: string | null;
  debit_note_details: unknown;
};

type Party = {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Null = new debit note. */
  editing: DebitNoteRow | null;
  onSaved: (row: DebitNoteRow, opts: { print: boolean }) => void;
};

const NONE = "__none__";

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ddmmyy(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
}

function friendlySaveError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? "");
  if (/debit_note_details|sales_sale_type_check/i.test(msg)) {
    return "Run the Phase 2 step 1 SQL (debit notes) on this database first.";
  }
  return msg || "Could not save the debit note.";
}

/** Industrial mode: new / edit sales debit note (rate difference, freight, interest...). */
export function DebitNoteDialog({ open, onOpenChange, organizationId, editing, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();

  const [noteDate, setNoteDate] = useState(() => toIsoDay(new Date()));
  const [party, setParty] = useState<Party | null>(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partySearch, setPartySearch] = useState("");
  const [againstId, setAgainstId] = useState<string | null>(null);
  const [againstNo, setAgainstNo] = useState("");
  const [againstDate, setAgainstDate] = useState<string | null>(null);
  const [reason, setReason] = useState<DebitNoteReason>("rate_difference");
  const [reasonNote, setReasonNote] = useState("");
  const [interState, setInterState] = useState(false);
  const [interStateTouched, setInterStateTouched] = useState(false);
  const [lines, setLines] = useState<DebitNoteLineForm[]>(() => [newDebitNoteLineForm({ description: debitNoteReasonLine("rate_difference") })]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const orgGstin = ((settings as { gst_number?: string | null } | null)?.gst_number ?? "") || "";
  const { filteredCustomers, isLoading: partiesLoading } = useCustomerSearch(partySearch, { enabled: partyOpen });

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const details = editing ? parseDebitNoteDetails(editing.debit_note_details) : null;
    setNoteDate(editing?.sale_date ? editing.sale_date.slice(0, 10) : toIsoDay(new Date()));
    setParty(
      editing?.customer_id
        ? {
            id: editing.customer_id,
            customer_name: editing.customer_name,
            phone: editing.customer_phone,
            address: editing.customer_address,
            gst_number: null,
          }
        : null,
    );
    setPartySearch("");
    setAgainstId(details?.against_sale_id ?? null);
    setAgainstNo(details?.against_sale_number ?? "");
    setAgainstDate(details?.against_sale_date ?? null);
    setReason(details?.reason ?? "rate_difference");
    setReasonNote(details?.reason_note ?? "");
    setInterState(details?.inter_state ?? false);
    setInterStateTouched(!!details);
    setLines(
      details && details.lines.length > 0
        ? debitNoteDetailsToForms(details)
        : [newDebitNoteLineForm({ description: debitNoteReasonLine("rate_difference") })],
    );
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  // GSTIN for the picked party (edit opens with only the id) decides IGST vs CGST + SGST.
  const { data: partyGstin } = useQuery({
    queryKey: ["debit-note-party-gstin", organizationId, party?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("gst_number").eq("id", party!.id).maybeSingle();
      if (error) throw error;
      return (data?.gst_number as string | null) ?? null;
    },
    enabled: open && !!party?.id && party.gst_number === null,
    staleTime: 60_000,
  });
  const customerGstin = party?.gst_number ?? partyGstin ?? null;

  useEffect(() => {
    if (!open || interStateTouched) return;
    setInterState(isInterState(orgGstin || null, customerGstin));
  }, [open, interStateTouched, orgGstin, customerGstin]);

  // The party's recent bills, to pick the invoice this note is raised against.
  const { data: partyBills, isFetching: billsLoading } = useQuery({
    queryKey: ["debit-note-party-bills", organizationId, party?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount")
        .eq("organization_id", organizationId)
        .eq("customer_id", party!.id)
        .in("sale_type", ["invoice", "pos"])
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .neq("payment_status", "hold")
        .order("sale_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!party?.id,
    staleTime: 30_000,
  });

  const totals = useMemo(() => computeDebitNote(lines, interState), [lines, interState]);

  const setLine = (key: string, patch: Partial<DebitNoteLineForm>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const changeReason = (next: string) => {
    if (!isDebitNoteReason(next)) return;
    const oldLine = debitNoteReasonLine(reason);
    setReason(next);
    // Carry the reason into the first line while it still shows the old default text.
    setLines((prev) =>
      prev.map((l, i) =>
        i === 0 && (l.description.trim() === "" || l.description === oldLine)
          ? { ...l, description: debitNoteReasonLine(next) }
          : l,
      ),
    );
  };

  const pickBill = (id: string) => {
    if (id === NONE) {
      setAgainstId(null);
      return;
    }
    const bill = (partyBills ?? []).find((b) => b.id === id);
    if (!bill) return;
    setAgainstId(bill.id);
    setAgainstNo(bill.sale_number);
    setAgainstDate(bill.sale_date ? String(bill.sale_date).slice(0, 10) : null);
  };

  const pickParty = (c: Party) => {
    setParty(c);
    setPartyOpen(false);
    setAgainstId(null);
    setAgainstNo("");
    setAgainstDate(null);
    setInterStateTouched(false);
  };

  const save = async (print: boolean) => {
    if (saving) return;
    const problem = validateDebitNote({ customerId: party?.id, againstSaleNumber: againstNo, reason, forms: lines });
    if (problem) {
      toast({ variant: "destructive", title: "Check the debit note", description: problem });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(noteDate)) {
      toast({ variant: "destructive", title: "Check the debit note", description: "Pick the note date." });
      return;
    }
    const gstSettings = settings as { report_settings?: unknown } | null;
    const filings = resolveGstFilings(gstSettings);
    const scheme = resolveGstFilingPrefs(gstSettings).scheme;
    // Both the new date and (on edit) the date it was filed under must be open.
    const filedLock =
      filedPeriodForDate(filings, scheme, noteDate) ||
      (editing ? filedPeriodForDate(filings, scheme, editing.sale_date) : null);
    if (filedLock) {
      toast({ variant: "destructive", title: "GST period already filed", description: filedPeriodLockMessage(editing?.sale_number ?? "This debit note", filedLock) });
      return;
    }
    const paid = Number(editing?.paid_amount ?? 0);
    if (editing && paid > totals.net + 0.005) {
      toast({
        variant: "destructive",
        title: "Amount too low",
        description: `₹${paid.toLocaleString("en-IN")} is already received against this note, so its total can't go below that.`,
      });
      return;
    }

    const details = buildDebitNoteDetails({
      againstSaleId: againstId,
      againstSaleNumber: againstNo,
      againstSaleDate: againstDate,
      reason,
      reasonNote,
      interState,
      totals,
    });
    const money = {
      sale_date: noteDate,
      due_date: noteDate,
      gross_amount: totals.taxable,
      discount_amount: 0,
      flat_discount_percent: 0,
      flat_discount_amount: 0,
      other_charges: 0,
      round_off: totals.roundOff,
      net_amount: totals.net,
      tax_type: "exclusive",
      notes: notes.trim() || null,
      debit_note_details: details as unknown as Json,
    };

    setSaving(true);
    try {
      let saved: DebitNoteRow;
      if (editing) {
        const { data, error } = await supabase
          .from("sales")
          .update({ ...money, updated_at: new Date().toISOString() })
          .eq("id", editing.id)
          .eq("organization_id", organizationId)
          .eq("sale_type", DEBIT_NOTE_SALE_TYPE)
          .select(
            "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_address, net_amount, gross_amount, round_off, paid_amount, payment_status, notes, debit_note_details",
          )
          .single();
        if (error) throw error;
        saved = data as unknown as DebitNoteRow;
      } else {
        const { data: number, error: numberError } = await supabase.rpc("generate_sale_number_atomic", {
          p_organization_id: organizationId,
          p_prefix: DEBIT_NOTE_NUMBER_PREFIX,
        });
        if (numberError) throw numberError;
        if (!number) throw new Error("Could not get the next debit note number.");
        const { data, error } = await supabase
          .from("sales")
          .insert([
            {
              ...money,
              organization_id: organizationId,
              sale_number: String(number),
              sale_type: DEBIT_NOTE_SALE_TYPE,
              customer_id: party!.id,
              customer_name: party!.customer_name,
              customer_phone: party!.phone || null,
              customer_address: party!.address || null,
              payment_method: "pay_later",
              payment_status: "pending",
              paid_amount: 0,
              cash_amount: 0,
              card_amount: 0,
              upi_amount: 0,
            },
          ])
          .select(
            "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_address, net_amount, gross_amount, round_off, paid_amount, payment_status, notes, debit_note_details",
          )
          .single();
        if (error) throw error;
        saved = data as unknown as DebitNoteRow;
      }

      invalidateMoneyViewsAfterMutation(queryClient, organizationId, party?.id ?? null);
      invalidateOrgLedgerReferenceData(queryClient, organizationId);
      void queryClient.invalidateQueries({ queryKey: ["debit-notes", organizationId] });
      toast({
        title: editing ? "Debit note updated" : "Debit note saved",
        description: `${saved.sale_number} · ${inr(Number(saved.net_amount))} added to ${saved.customer_name}'s account.`,
      });
      onSaved(saved, { print });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Debit note not saved", description: friendlySaveError(err) });
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 p-0 sm:p-0">
        <DialogHeader className="border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FilePlus2 className="h-5 w-5 text-sky-700" />
            {editing ? `Debit note ${editing.sale_number}` : "New debit note"}
          </DialogTitle>
          <DialogDescription>
            Charges the customer more after the bill: rate difference, freight, short billing or interest. It adds to the
            party's balance like a credit bill and moves no stock.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="dn-date" className={labelCls}>
                Note date
              </Label>
              <Input id="dn-date" type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-1 lg:col-span-2">
              <Label className={labelCls}>Customer</Label>
              {editing ? (
                <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800">
                  {party?.customer_name}
                  {party?.phone ? <span className="ml-2 font-normal text-slate-500">{party.phone}</span> : null}
                </div>
              ) : (
                <Popover open={partyOpen} onOpenChange={setPartyOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                      <span className={cn("truncate", !party && "text-muted-foreground")}>
                        {party ? `${party.customer_name}${party.phone ? ` - ${party.phone}` : ""}` : "Search customer..."}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[380px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Name, phone or GSTIN..." value={partySearch} onValueChange={setPartySearch} />
                      <CommandList>
                        <CommandEmpty>{partiesLoading ? "Loading..." : "No customer found."}</CommandEmpty>
                        <CommandGroup>
                          {(filteredCustomers ?? []).map((c: Party) => (
                            <CommandItem key={c.id} value={c.id} onSelect={() => pickParty(c)}>
                              <span className="font-medium">{c.customer_name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                              {c.gst_number ? <span className="ml-auto font-mono text-[11px] text-slate-500">{c.gst_number}</span> : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div>
              <Label className={labelCls}>Tax</Label>
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-slate-200 px-3">
                <span className="text-sm font-semibold text-slate-700">{interState ? "IGST (other state)" : "CGST + SGST"}</span>
                <Switch
                  checked={interState}
                  onCheckedChange={(v) => {
                    setInterState(v);
                    setInterStateTouched(true);
                  }}
                  aria-label="Inter-state (IGST)"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label className={labelCls}>Against invoice</Label>
              <Select value={againstId ?? NONE} onValueChange={pickBill} disabled={!party}>
                <SelectTrigger className="h-9 bg-white text-sm">
                  <SelectValue placeholder={party ? "Pick the original bill" : "Pick the customer first"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>{billsLoading ? "Loading bills..." : "Not in the list (type it)"}</SelectItem>
                  {(partyBills ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.sale_number} · {ddmmyy(String(b.sale_date))} · ₹{Number(b.net_amount || 0).toLocaleString("en-IN")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dn-against-no" className={labelCls}>
                Invoice no
              </Label>
              <Input
                id="dn-against-no"
                value={againstNo}
                maxLength={40}
                onChange={(e) => {
                  setAgainstNo(e.target.value);
                  setAgainstId(null);
                }}
                placeholder="INV/26-27/112"
                className="h-9 bg-white text-sm no-uppercase"
              />
            </div>
            <div>
              <Label htmlFor="dn-against-date" className={labelCls}>
                Invoice date
              </Label>
              <Input
                id="dn-against-date"
                type="date"
                value={againstDate ?? ""}
                onChange={(e) => {
                  setAgainstDate(e.target.value || null);
                  setAgainstId(null);
                }}
                className="h-9 bg-white text-sm"
              />
            </div>
            <div className="lg:col-span-2">
              <Label className={labelCls}>Reason</Label>
              <Select value={reason} onValueChange={changeReason}>
                <SelectTrigger className="h-9 bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEBIT_NOTE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="dn-reason-note" className={labelCls}>
                Reason detail
              </Label>
              <Input
                id="dn-reason-note"
                value={reasonNote}
                maxLength={200}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Revised price list from 1 Oct"
                className="h-9 bg-white text-sm no-uppercase"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-2">#</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="w-28 px-2 py-2">HSN / SAC</th>
                  <th className="w-20 px-2 py-2 text-right">Qty</th>
                  <th className="w-28 px-2 py-2 text-right">Rate</th>
                  <th className="w-24 px-2 py-2">GST %</th>
                  <th className="w-28 px-2 py-2 text-right">Taxable</th>
                  <th className="w-24 px-2 py-2 text-right">GST</th>
                  <th className="w-8 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const qty = Number(l.qty) || 0;
                  const rate = Number(l.rate) || 0;
                  const taxable = Math.round(qty * rate * 100) / 100;
                  const gst = Math.round(((taxable * (Number(l.gst_percent) || 0)) / 100) * 100) / 100;
                  return (
                    <tr key={l.key} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5 pt-3 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={l.description}
                          maxLength={120}
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                          placeholder="Rate difference on MS Pipe 25mm"
                          className="h-8 text-sm no-uppercase"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={l.hsn}
                          inputMode="numeric"
                          maxLength={8}
                          onChange={(e) => setLine(l.key, { hsn: e.target.value.replace(/\D/g, "") })}
                          placeholder="7306"
                          className="h-8 font-mono text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={l.qty}
                          inputMode="decimal"
                          onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^0-9.]/g, "").slice(0, 10) })}
                          className="h-8 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={l.rate}
                          inputMode="decimal"
                          onChange={(e) => setLine(l.key, { rate: e.target.value.replace(/[^0-9.]/g, "").slice(0, 12) })}
                          placeholder="0.00"
                          className="h-8 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={l.gst_percent} onValueChange={(v) => setLine(l.key, { gst_percent: v })}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEBIT_NOTE_GST_RATES.map((r) => (
                              <SelectItem key={r} value={String(r)}>
                                {r}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5 pt-3 text-right tabular-nums text-slate-800">{taxable ? inr(taxable) : "—"}</td>
                      <td className="px-2 py-1.5 pt-3 text-right tabular-nums text-slate-600">{gst ? inr(gst) : "—"}</td>
                      <td className="px-1 py-1.5 pt-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          disabled={lines.length === 1}
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                          aria-label={`Remove line ${i + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 bg-white px-2 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-sky-800"
                disabled={lines.length >= 30}
                onClick={() => setLines((prev) => [...prev, newDebitNoteLineForm({ gst_percent: prev[prev.length - 1]?.gst_percent ?? "18" })])}
              >
                <Plus className="h-4 w-4" />
                Add line
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
            <div>
              <Label htmlFor="dn-notes" className={labelCls}>
                Notes (printed)
              </Label>
              <Input
                id="dn-notes"
                value={notes}
                maxLength={300}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm no-uppercase"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm">
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>Taxable value</span>
                <span className="tabular-nums">{inr(totals.taxable)}</span>
              </div>
              {interState ? (
                <div className="flex justify-between py-0.5 text-slate-600">
                  <span>IGST</span>
                  <span className="tabular-nums">{inr(totals.igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between py-0.5 text-slate-600">
                    <span>CGST</span>
                    <span className="tabular-nums">{inr(totals.cgst)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-slate-600">
                    <span>SGST</span>
                    <span className="tabular-nums">{inr(totals.sgst)}</span>
                  </div>
                </>
              )}
              {Math.abs(totals.roundOff) > 0.004 && (
                <div className="flex justify-between py-0.5 text-slate-500">
                  <span>Round off</span>
                  <span className="tabular-nums">{totals.roundOff > 0 ? "+" : ""}{totals.roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
                <span>Debit note total</span>
                <span className="tabular-nums">₹{totals.net.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-white px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => void save(true)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Save &amp; print
          </Button>
          <Button className="gap-1.5 bg-sky-700 text-white hover:bg-sky-800" onClick={() => void save(false)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing ? "Update" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
