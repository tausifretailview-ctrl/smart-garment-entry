import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { Edit, FilePlus2, Loader2, Plus, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { useToast } from "@/hooks/use-toast";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { invalidateMoneyViewsAfterMutation } from "@/utils/moneyViewFreshnessInvalidation";
import { invalidateOrgLedgerReferenceData } from "@/hooks/useOrgLedgerReferenceData";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { ErpDashboardKpiCard } from "@/components/dashboard/ErpDashboardKpiCard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { DebitNoteDialog, type DebitNoteRow } from "@/components/sales/DebitNoteDialog";
import { NoteIrnCell } from "@/components/einvoice/NoteIrnCell";
import { NoteEInvoicePrint } from "@/components/einvoice/NoteEInvoicePrint";
import { cn } from "@/lib/utils";
import {
  DEBIT_NOTE_SALE_TYPE,
  debitNoteBalance,
  debitNotePrintItems,
  debitNotePrintNote,
  debitNoteReasonLabel,
  parseDebitNoteDetails,
} from "@/utils/debitNote";
import {
  debitNoteToNoteInput,
  noteEInvoiceProblem,
  type NoteParty,
} from "../../supabase/functions/_shared/einvoiceNote";

const DN_COLUMNS =
  "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_address, net_amount, gross_amount, round_off, paid_amount, payment_status, notes, debit_note_details, irn, ack_no, ack_date, einvoice_status, einvoice_error, einvoice_test_mode, customers:customer_id (gst_number, address)";

type PrintData = {
  row: DebitNoteRow;
  gstin: string;
  /** Signed QR text when the note prints as an e-invoice (active IRN). */
  irnQr: string | null;
  irnMode: boolean;
};

/** IRN generated and not cancelled: the note is reported and must not change. */
function irnActive(row: Pick<DebitNoteRow, "irn" | "einvoice_status">): boolean {
  return !!row.irn && row.einvoice_status === "generated";
}

function inr0(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function ddmmyy(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = String(iso).slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
}

/** Industrial mode, Phase 2 step 1: list of sales debit notes (DN/yy-yy/N). */
export default function DebitNoteDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const { data: settings } = useSettings();
  const industrial = useIndustrialMode();
  const { softDelete } = useSoftDelete();
  const openCustomerAccount = useOpenCustomerAccount();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DebitNoteRow | null>(null);
  const [toDelete, setToDelete] = useState<DebitNoteRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: notes = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["debit-notes", orgId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(DN_COLUMNS)
        .eq("organization_id", orgId)
        .eq("sale_type", DEBIT_NOTE_SALE_TYPE)
        .is("deleted_at", null)
        .gte("sale_date", dateFrom)
        .lte("sale_date", `${dateTo}T23:59:59`)
        .order("sale_date", { ascending: false })
        .order("sale_number", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as DebitNoteRow[];
    },
    enabled: !!orgId && industrial.enabled,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (onlyOpen && debitNoteBalance(n.net_amount, n.paid_amount) <= 0) return false;
      if (!q) return true;
      const d = parseDebitNoteDetails(n.debit_note_details);
      return [n.sale_number, n.customer_name, n.customer_phone, d?.against_sale_number, debitNoteReasonLabel(d?.reason)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [notes, search, onlyOpen]);

  const kpi = useMemo(() => {
    let total = 0;
    let gst = 0;
    let open = 0;
    let openCount = 0;
    for (const n of notes) {
      total += Number(n.net_amount || 0);
      gst += parseDebitNoteDetails(n.debit_note_details)?.gst_total ?? 0;
      const bal = debitNoteBalance(n.net_amount, n.paid_amount);
      open += bal;
      if (bal > 0) openCount += 1;
    }
    return { count: notes.length, total, gst, open, openCount };
  }, [notes]);

  const einvoiceSettings = (settings as { sale_settings?: { einvoice_settings?: Record<string, unknown> } } | null)
    ?.sale_settings?.einvoice_settings;
  const einvoiceOn = einvoiceSettings?.enabled === true;
  const einvoiceTestMode = einvoiceSettings?.test_mode !== false;
  const biz = settings as {
    business_name?: string | null;
    address?: string | null;
    mobile_number?: string | null;
    email_id?: string | null;
    gst_number?: string | null;
  } | null;
  const seller: NoteParty = useMemo(
    () => ({
      gstin: String(einvoiceSettings?.seller_gstin || biz?.gst_number || ""),
      name: biz?.business_name || currentOrganization?.name || "",
      address: biz?.address || "",
      phone: biz?.mobile_number,
      email: biz?.email_id,
    }),
    [einvoiceSettings?.seller_gstin, biz?.gst_number, biz?.business_name, biz?.address, biz?.mobile_number, biz?.email_id, currentOrganization?.name],
  );
  const buyerOf = (n: DebitNoteRow): NoteParty => ({
    gstin: String(n.customers?.gst_number || "").trim().toUpperCase(),
    name: n.customer_name,
    address: n.customer_address || n.customers?.address || "",
    phone: n.customer_phone,
  });
  const irnPending = useMemo(
    () => (einvoiceOn ? notes.filter((n) => !n.irn && String(n.customers?.gst_number || "").trim()).length : 0),
    [notes, einvoiceOn],
  );
  /** Same checks the e-invoice service runs, so a missing HSN or PIN shows at once. */
  const irnPrecheck = (n: DebitNoteRow) => () => {
    const input = debitNoteToNoteInput(n, n.debit_note_details);
    if (!input) return "This debit note has no GST lines saved. Open and save it again.";
    return noteEInvoiceProblem(input, seller, buyerOf(n));
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const irnLockedToast = (row: DebitNoteRow, what: string) =>
    toast({
      variant: "destructive",
      title: "IRN generated",
      description: `${row.sale_number} is reported to the GST portal, so it can't be ${what}. Cancel its IRN first (within 24 hours), or raise a credit note.`,
    });

  const openEdit = (row: DebitNoteRow) => {
    if (irnActive(row)) {
      irnLockedToast(row, "changed");
      return;
    }
    setEditing(row);
    setDialogOpen(true);
  };

  // Sale Invoice sends a debit note here as ?edit=<id>.
  const editParam = searchParams.get("edit");
  useEffect(() => {
    if (!editParam || !orgId || !industrial.enabled) return;
    let cancelled = false;
    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    };
    void (async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(DN_COLUMNS)
        .eq("id", editParam)
        .eq("organization_id", orgId)
        .eq("sale_type", DEBIT_NOTE_SALE_TYPE)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      clearParam();
      if (error || !data) {
        toast({ variant: "destructive", title: "Debit note not found", description: error?.message ?? "It may have been deleted." });
        return;
      }
      openEdit(data as unknown as DebitNoteRow);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, orgId, industrial.enabled]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `DebitNote_${printData?.row.sale_number ?? ""}`.replace(/\//g, "-"),
    pageStyle: `@page { size: A4 portrait; margin: 10mm; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}`,
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
    onAfterPrint: () => setPrintingId(null),
    onPrintError: () => setPrintingId(null),
  });
  // Latest print handle (its title follows printData), read after the note renders.
  const handlePrintRef = useRef(handlePrint);
  handlePrintRef.current = handlePrint;

  const printNote = useCallback(
    async (row: DebitNoteRow) => {
      setPrintingId(row.id);
      let gstin = String(row.customers?.gst_number || "");
      if (!gstin && row.customer_id) {
        const { data } = await supabase.from("customers").select("gst_number").eq("id", row.customer_id).maybeSingle();
        gstin = (data?.gst_number as string | null) ?? "";
      }
      // A reported note prints as the e-invoice copy (IRN + signed QR); the QR is read only here, not in the list.
      const irnMode = irnActive(row);
      let irnQr: string | null = null;
      if (irnMode) {
        const { data } = await supabase.from("sales").select("einvoice_qr_code").eq("id", row.id).maybeSingle();
        irnQr = (data?.einvoice_qr_code as string | null) ?? null;
      }
      setPrintData({ row, gstin, irnQr, irnMode });
      requestAnimationFrame(() => {
        waitForPrintReady(printRef, () => handlePrintRef.current(), { maxWait: 8000 });
      });
      // Safety: clear the spinner even if the browser print dialog never reports back.
      window.setTimeout(() => setPrintingId((id) => (id === row.id ? null : id)), 15_000);
    },
    [],
  );

  const confirmDelete = async () => {
    if (!toDelete || deleting) return;
    if (irnActive(toDelete)) {
      irnLockedToast(toDelete, "deleted");
      setToDelete(null);
      return;
    }
    if (Number(toDelete.paid_amount || 0) > 0) {
      toast({
        variant: "destructive",
        title: "Receipt linked",
        description: `${toDelete.sale_number} has ₹${Number(toDelete.paid_amount).toLocaleString("en-IN")} received against it. Delete that receipt first.`,
      });
      setToDelete(null);
      return;
    }
    setDeleting(true);
    const ok = await softDelete("sales", toDelete.id);
    setDeleting(false);
    if (ok) {
      invalidateMoneyViewsAfterMutation(queryClient, orgId, toDelete.customer_id);
      invalidateOrgLedgerReferenceData(queryClient, orgId);
      void queryClient.invalidateQueries({ queryKey: ["debit-notes", orgId] });
      toast({ title: "Debit note deleted", description: `${toDelete.sale_number} removed from ${toDelete.customer_name}'s account.` });
    }
    setToDelete(null);
  };

  const printDetails = printData ? parseDebitNoteDetails(printData.row.debit_note_details) : null;
  const invoiceTemplate = (settings as { sale_settings?: { invoice_template?: string } } | null)?.sale_settings?.invoice_template;

  if (!industrial.enabled) {
    return (
      <div className="flex h-full w-full items-start justify-center bg-slate-50 p-6">
        <Card className="max-w-lg border-slate-200 p-6 text-sm text-slate-600 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
            <FilePlus2 className="h-5 w-5 text-sky-700" />
            Debit notes
          </div>
          Debit notes are part of Industrial mode. Turn it on in Settings &gt; Product (Industrial mode) to raise rate
          difference, freight or interest notes against a sale bill.
        </Card>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "purchase-dashboard-workspace purchase-bill-dashboard flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-sky-800">
              <FilePlus2 className="h-4 w-4 shrink-0 opacity-70" />
              Debit Notes
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isLoading ? "Loading…" : "Extra charges raised on a customer after the bill (GST section 34)"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-200 text-sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button onClick={openNew} className="h-9 gap-1.5 bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800">
              <Plus className="h-4 w-4" />
              New Debit Note
            </Button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
          <ErpDashboardKpiCard
            title="Debit Notes"
            subtitle={irnPending > 0 ? `${irnPending} need IRN` : "In date range"}
            value={kpi.count.toLocaleString("en-IN")}
            shellClass="bg-sky-50 border-sky-200/70 hover:bg-sky-100/80"
            valueClass="text-sky-800"
            active={!onlyOpen}
            onClick={() => setOnlyOpen(false)}
          />
          <ErpDashboardKpiCard
            title="Total Value"
            subtitle="Incl. GST"
            value={inr0(kpi.total)}
            shellClass="bg-violet-50 border-violet-200/70 hover:bg-violet-100/80"
            valueClass="text-violet-800"
          />
          <ErpDashboardKpiCard
            title="GST"
            subtitle="Output tax added"
            value={inr0(kpi.gst)}
            shellClass="bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80"
            valueClass="text-emerald-800"
          />
          <ErpDashboardKpiCard
            title="To Collect"
            subtitle={kpi.openCount > 0 ? `${kpi.openCount} open` : "All received"}
            value={inr0(kpi.open)}
            shellClass="bg-amber-50 border-amber-200/70 hover:bg-amber-100/80"
            valueClass="text-amber-800"
            active={onlyOpen}
            onClick={() => setOnlyOpen(true)}
          />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2.5">
            <div className="relative min-w-[180px] max-w-full flex-1 sm:max-w-md md:max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="DN no, customer, invoice no, reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="no-uppercase h-9 border-slate-200 bg-slate-50 pl-9 text-sm focus:bg-white"
              />
            </div>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => e.target.value && setDateFrom(e.target.value)}
              className="h-9 w-[150px] border-slate-200 bg-slate-50 text-sm"
              aria-label="From date"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => e.target.value && setDateTo(e.target.value)}
              className="h-9 w-[150px] border-slate-200 bg-slate-50 text-sm"
              aria-label="To date"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {isLoading ? (
              <ListTableSkeleton />
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-slate-500">
                <FilePlus2 className="h-8 w-8 text-slate-300" />
                {notes.length === 0 ? "No debit notes in this period." : "No debit note matches the search."}
                {notes.length === 0 && (
                  <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={openNew}>
                    <Plus className="h-4 w-4" />
                    New Debit Note
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[130px]">DN No</TableHead>
                    <TableHead className="w-[90px]">Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Against invoice</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    {einvoiceOn ? <TableHead className="w-[150px]">E-invoice</TableHead> : null}
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((n) => {
                    const d = parseDebitNoteDetails(n.debit_note_details);
                    const bal = debitNoteBalance(n.net_amount, n.paid_amount);
                    const paid = Number(n.paid_amount || 0);
                    return (
                      <TableRow key={n.id} className="text-sm">
                        <TableCell className="font-semibold text-sky-800">
                          <button type="button" className="hover:underline" onClick={() => openEdit(n)}>
                            {n.sale_number}
                          </button>
                        </TableCell>
                        <TableCell className="tabular-nums text-slate-600">{ddmmyy(n.sale_date)}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left font-medium text-slate-800 hover:text-sky-800 hover:underline"
                            onClick={() => openCustomerAccount(n.customer_id, n.customer_name)}
                          >
                            {n.customer_name}
                          </button>
                          {n.customer_phone ? <div className="text-xs text-slate-400">{n.customer_phone}</div> : null}
                        </TableCell>
                        <TableCell className="text-slate-700">
                          {d?.against_sale_number || "—"}
                          {d?.against_sale_date ? <div className="text-xs text-slate-400">{ddmmyy(d.against_sale_date)}</div> : null}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-slate-600" title={d?.reason_note || undefined}>
                          {debitNoteReasonLabel(d?.reason) || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{inr0(Number(n.gross_amount || 0))}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{inr0(d?.gst_total ?? 0)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-slate-900">{inr0(Number(n.net_amount || 0))}</TableCell>
                        <TableCell>
                          {bal <= 0 ? (
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Received</Badge>
                          ) : paid > 0 ? (
                            <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">{inr0(bal)} due</Badge>
                          ) : (
                            <Badge className="border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50">Unpaid</Badge>
                          )}
                        </TableCell>
                        {einvoiceOn ? (
                          <TableCell>
                            <NoteIrnCell
                              kind="debit"
                              note={{
                                id: n.id,
                                number: n.sale_number,
                                date: String(n.sale_date).slice(0, 10),
                                irn: n.irn ?? null,
                                ackNo: n.ack_no ?? null,
                                ackDate: n.ack_date ?? null,
                                status: n.einvoice_status ?? null,
                                error: n.einvoice_error ?? null,
                                testMode: n.einvoice_test_mode ?? null,
                                buyerGstin: String(n.customers?.gst_number || "").trim(),
                              }}
                              organizationId={orgId}
                              testMode={einvoiceTestMode}
                              precheck={irnPrecheck(n)}
                              onChanged={() => void queryClient.invalidateQueries({ queryKey: ["debit-notes", orgId] })}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-sky-800"
                              onClick={() => void printNote(n)}
                              disabled={printingId === n.id}
                              aria-label={`Print ${n.sale_number}`}
                            >
                              {printingId === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-sky-800"
                              onClick={() => openEdit(n)}
                              aria-label={`Edit ${n.sale_number}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                              onClick={() => (irnActive(n) ? irnLockedToast(n, "deleted") : setToDelete(n))}
                              aria-label={`Delete ${n.sale_number}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>

      {orgId && (
        <DebitNoteDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          organizationId={orgId}
          editing={editing}
          onSaved={(saved, { print }) => {
            if (print) void printNote(saved);
          }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.sale_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${inr0(Number(toDelete.net_amount || 0))} comes off ${toDelete.customer_name}'s balance. ` : ""}
              It moves to the Recycle Bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="invoice-print-source-screen">
        {printData && printDetails && printData.irnMode ? (
          <NoteEInvoicePrint
            ref={printRef}
            title="DEBIT NOTE"
            number={printData.row.sale_number}
            date={String(printData.row.sale_date).slice(0, 10)}
            seller={{
              name: seller.name,
              address: seller.address,
              gstin: String(seller.gstin).toUpperCase(),
              phone: seller.phone ?? undefined,
              email: seller.email ?? undefined,
            }}
            buyer={{
              name: printData.row.customer_name,
              address: printData.row.customer_address || printData.row.customers?.address || null,
              gstin: printData.gstin.toUpperCase(),
              phone: printData.row.customer_phone,
            }}
            against={{ number: printDetails.against_sale_number, date: printDetails.against_sale_date }}
            reason={`${debitNoteReasonLabel(printDetails.reason)}${printDetails.reason_note ? ` - ${printDetails.reason_note}` : ""}`}
            notes={printData.row.notes}
            interState={printDetails.inter_state}
            lines={printDetails.lines.map((l) => ({
              description: l.description,
              hsn: l.hsn,
              qty: l.qty,
              rate: l.rate,
              taxable: l.taxable,
              gstPercent: l.gst_percent,
              gstAmount: l.gst_amount,
            }))}
            net={Number(printData.row.net_amount || 0)}
            irn={printData.row.irn ?? ""}
            ackNo={printData.row.ack_no}
            ackDate={printData.row.ack_date}
            qrText={printData.irnQr}
            testMode={printData.row.einvoice_test_mode}
          />
        ) : printData && printDetails ? (
          <InvoiceWrapper
            ref={printRef}
            billNo={printData.row.sale_number}
            date={new Date(`${String(printData.row.sale_date).slice(0, 10)}T12:00:00`)}
            customerName={printData.row.customer_name}
            customerAddress={printData.row.customer_address ?? undefined}
            customerMobile={printData.row.customer_phone ?? undefined}
            customerGSTIN={printData.gstin || undefined}
            items={debitNotePrintItems(printDetails)}
            subTotal={printDetails.taxable_total}
            discount={0}
            grandTotal={Number(printData.row.net_amount || 0)}
            billNetAmount={Number(printData.row.net_amount || 0)}
            roundOff={Number(printData.row.round_off || 0)}
            notes={debitNotePrintNote(printDetails, printData.row.notes)}
            documentTitle="DEBIT NOTE"
            taxType="exclusive"
            showHSN
            showGSTBreakdown
            showTaxDetails
            template={invoiceTemplate}
            format="a4"
          />
        ) : (
          <div ref={printRef} />
        )}
      </div>
    </div>
  );
}
