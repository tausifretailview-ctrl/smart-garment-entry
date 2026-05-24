import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, History, CheckCircle2, Receipt } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { resolveCnAdjustDateForSale } from "@/utils/customerAuditBundle";

interface CreditNoteHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditNoteId?: string | null;
  saleReturnId?: string | null;
  organizationId?: string | null;
}

type TimelineType = "issued" | "sale_return" | "invoice_apply" | "refund" | "direct_sr";

interface TimelineEntry {
  id: string;
  type: TimelineType;
  timestamp: string;
  icon: string;
  title: string;
  lines: string[];
}

const fmtMoney = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatTimelineDate = (ts: string) => {
  try {
    return format(new Date(ts), "dd-MMM hh:mm a");
  } catch {
    return ts;
  }
};

const formatCnStatus = (status: string | null | undefined) => {
  if (!status) return "Active";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export function CreditNoteHistoryDialog({
  open,
  onOpenChange,
  creditNoteId,
  saleReturnId,
  organizationId,
}: CreditNoteHistoryDialogProps) {
  const isMobile = useIsMobile();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["credit-note-history", organizationId, creditNoteId, saleReturnId],
    enabled: open && !!organizationId && (!!creditNoteId || !!saleReturnId),
    queryFn: async () => {
      let resolvedCreditNoteId = creditNoteId || null;
      let saleReturn: {
        id: string;
        return_number: string | null;
        return_date: string;
        customer_name: string;
        net_amount: number;
        credit_status: string | null;
        credit_note_id: string | null;
        linked_sale_id: string | null;
        refund_type: string | null;
        created_at: string;
      } | null = null;

      if (saleReturnId) {
        const { data: sr, error: srErr } = await supabase
          .from("sale_returns")
          .select(
            "id, return_number, return_date, customer_name, net_amount, credit_status, credit_note_id, linked_sale_id, refund_type, created_at"
          )
          .eq("id", saleReturnId)
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .maybeSingle();
        if (srErr) throw srErr;
        saleReturn = sr;
        if (!resolvedCreditNoteId && sr?.credit_note_id) {
          resolvedCreditNoteId = sr.credit_note_id;
        }
      }

      let creditNote: {
        id: string;
        credit_note_number: string;
        credit_amount: number;
        used_amount: number;
        status: string;
        customer_name: string;
        issue_date: string | null;
        created_at: string | null;
        notes: string | null;
        sale_id: string | null;
      } | null = null;

      if (resolvedCreditNoteId) {
        const { data: cn, error: cnErr } = await supabase
          .from("credit_notes")
          .select(
            "id, credit_note_number, credit_amount, used_amount, status, customer_name, issue_date, created_at, notes, sale_id"
          )
          .eq("id", resolvedCreditNoteId)
          .eq("organization_id", organizationId!)
          .is("deleted_at", null)
          .maybeSingle();
        if (cnErr) throw cnErr;
        creditNote = cn;
      }

      const linkedReturnsQuery = resolvedCreditNoteId
        ? supabase
            .from("sale_returns")
            .select(
              "id, return_number, return_date, customer_name, net_amount, credit_status, linked_sale_id, refund_type, created_at"
            )
            .eq("organization_id", organizationId!)
            .eq("credit_note_id", resolvedCreditNoteId)
            .is("deleted_at", null)
        : saleReturn
          ? Promise.resolve({ data: [saleReturn], error: null })
          : Promise.resolve({ data: [], error: null });

      const adjustmentsQuery = resolvedCreditNoteId
        ? supabase
            .from("invoice_adjustments")
            .select("id, invoice_id, amount_applied, adjustment_date, created_at, notes")
            .eq("organization_id", organizationId!)
            .eq("source_document_id", resolvedCreditNoteId)
            .eq("adjustment_type", "CREDIT_NOTE")
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const [linkedReturnsRes, adjustmentsRes] = await Promise.all([
        linkedReturnsQuery,
        adjustmentsQuery,
      ]);

      if (linkedReturnsRes.error) throw linkedReturnsRes.error;
      if (adjustmentsRes.error) throw adjustmentsRes.error;

      type SaleReturnRow = NonNullable<typeof saleReturn>;
      const linkedReturns = (linkedReturnsRes.data || []) as SaleReturnRow[];
      if (!saleReturn && linkedReturns.length > 0) {
        saleReturn = linkedReturns[0];
      }

      const adjustments = adjustmentsRes.data || [];
      const linkedSaleIds = [
        ...new Set(
          linkedReturns.map((r) => r.linked_sale_id).filter(Boolean) as string[],
        ),
      ];
      const invoiceIds = [
        ...new Set([
          ...adjustments.map((a) => a.invoice_id).filter(Boolean),
          ...linkedSaleIds,
        ]),
      ];
      let saleNumberMap: Record<string, string> = {};
      let billingApplies: Array<{
        sale_id: string;
        sale_number: string;
        amount: number;
        apply_date: string;
      }> = [];
      if (invoiceIds.length > 0) {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, sale_number, sale_date, sale_return_adjust")
          .in("id", invoiceIds);
        (sales || []).forEach((s) => {
          saleNumberMap[s.id] = s.sale_number;
          const sra = Number(s.sale_return_adjust || 0);
          if (sra > 0.005) {
            billingApplies.push({
              sale_id: s.id,
              sale_number: s.sale_number,
              amount: sra,
              apply_date: String(s.sale_date || "").slice(0, 10),
            });
          }
        });
      }

      const returnNumbers = [
        ...new Set(
          linkedReturns.map((r) => r?.return_number).filter(Boolean) as string[]
        ),
      ];

      let refundVouchers: {
        id: string;
        voucher_number: string;
        voucher_date: string;
        total_amount: number;
        payment_method: string | null;
        description: string | null;
        created_at: string | null;
      }[] = [];

      if (returnNumbers.length > 0) {
        const orParts = returnNumbers.flatMap((rn) => [
          `description.ilike.%${rn}%`,
          `description.ilike.%Credit note refund%${rn}%`,
        ]);
        const { data: vouchers, error: vErr } = await supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, payment_method, description, created_at"
          )
          .eq("organization_id", organizationId!)
          .eq("voucher_type", "payment")
          .is("deleted_at", null)
          .or(orParts.join(","))
          .order("created_at", { ascending: true });
        if (vErr) throw vErr;
        refundVouchers = (vouchers || []).filter((v) => {
          const d = (v.description || "").toLowerCase();
          return d.includes("credit note refund") || d.includes("refund");
        });
      }

      // CN application vouchers (receipt + credit_note_adjustment) for linked invoices
      let cnApplyVouchers: ((typeof refundVouchers)[number] & { reference_id?: string | null })[] = [];
      if (invoiceIds.length > 0) {
        const { data: applyV, error: applyErr } = await supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, payment_method, description, created_at, reference_id"
          )
          .eq("organization_id", organizationId!)
          .eq("voucher_type", "receipt")
          .eq("payment_method", "credit_note_adjustment")
          .in("reference_id", invoiceIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        if (applyErr) throw applyErr;
        cnApplyVouchers = applyV || [];
      }

      return {
        creditNote,
        saleReturn,
        linkedReturns,
        adjustments: adjustments.map((a) => ({
          ...a,
          sale_number: saleNumberMap[a.invoice_id] || null,
        })),
        billingApplies,
        refundVouchers,
        cnApplyVouchers,
      };
    },
  });

  const timeline = useMemo((): TimelineEntry[] => {
    if (!data) return [];
    const entries: TimelineEntry[] = [];
    const {
      creditNote,
      linkedReturns,
      adjustments,
      billingApplies,
      refundVouchers,
      cnApplyVouchers,
    } = data;

    const firstReturnDate = linkedReturns[0]?.return_date;
    if (creditNote) {
      const issuedTs =
        creditNote.issue_date ||
        (firstReturnDate ? `${String(firstReturnDate).slice(0, 10)}T12:00:00` : null) ||
        creditNote.created_at ||
        new Date().toISOString();
      const srNote = linkedReturns[0]?.return_number
        ? `Credit note from sale return ${linkedReturns[0].return_number}`
        : null;
      entries.push({
        id: `issued-${creditNote.id}`,
        type: "issued",
        timestamp: issuedTs,
        icon: "📋",
        title: "Credit Note Issued",
        lines: [
          `Amount: ${fmtMoney(creditNote.credit_amount || 0)}`,
          `Customer: ${creditNote.customer_name}`,
          ...(srNote ? [srNote] : []),
          ...(creditNote.notes ? [creditNote.notes] : []),
        ],
      });
    }

    for (const sr of linkedReturns) {
      if (!sr) continue;
      entries.push({
        id: `sr-${sr.id}`,
        type: "sale_return",
        timestamp: sr.return_date || sr.created_at,
        icon: "🔄",
        title: "Sale Return Linked",
        lines: [
          `${sr.return_number || "Return"} — ${fmtMoney(sr.net_amount || 0)}`,
          `Status: ${formatCnStatus(sr.credit_status)}`,
        ],
      });
    }

    const adjustmentInvoiceIds = new Set(adjustments.map((a) => a.invoice_id));
    const billingApplyKeys = new Set<string>();

    for (const ba of billingApplies || []) {
      const key = `${ba.sale_id}-${ba.amount}`;
      billingApplyKeys.add(key);
      const cnAt =
        resolveCnAdjustDateForSale(ba.sale_id, cnApplyVouchers, linkedReturns) ||
        ba.apply_date ||
        firstReturnDate;
      entries.push({
        id: `billing-${ba.sale_id}`,
        type: "invoice_apply",
        timestamp: cnAt ? `${cnAt}T12:00:00` : new Date().toISOString(),
        icon: "💳",
        title: "Applied to Invoice",
        lines: [
          `${ba.sale_number} — ${fmtMoney(ba.amount)}`,
          "CN / S-R applied at billing or linked invoice",
        ],
      });
    }

    for (const adj of adjustments) {
      entries.push({
        id: `adj-${adj.id}`,
        type: "invoice_apply",
        timestamp: adj.created_at || adj.adjustment_date,
        icon: "💳",
        title: "Applied to Invoice",
        lines: [
          `${adj.sale_number || "Invoice"} — ${fmtMoney(adj.amount_applied || 0)}`,
          ...(adj.notes ? [adj.notes] : []),
        ],
      });
    }

    for (const v of cnApplyVouchers) {
      const refId = (v as { reference_id?: string }).reference_id;
      if (refId && adjustmentInvoiceIds.has(refId)) continue;
      const amt = Number(v.total_amount || 0);
      if (refId && billingApplyKeys.has(`${refId}-${amt}`)) continue;
      entries.push({
        id: `vapply-${v.id}`,
        type: "invoice_apply",
        timestamp: v.created_at || v.voucher_date,
        icon: "💳",
        title: "Applied to Invoice",
        lines: [
          `${v.voucher_number} — ${fmtMoney(amt)}`,
          v.description || "",
        ].filter(Boolean),
      });
    }

    for (const v of refundVouchers) {
      entries.push({
        id: `refund-${v.id}`,
        type: "refund",
        timestamp: v.created_at || v.voucher_date,
        icon: "💰",
        title: "Refunded to Customer",
        lines: [
          `${v.voucher_number} — ${formatPaymentMode(v.payment_method)} ${fmtMoney(v.total_amount || 0)}`,
          ...(v.description ? [v.description] : []),
        ],
      });
    }

    return entries.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [data]);

  const balanceSummary = useMemo(() => {
    if (!data?.creditNote) {
      if (!data?.saleReturn) return null;
      const net = data.saleReturn.net_amount || 0;
      const status = (data.saleReturn.credit_status || "").toLowerCase();
      return {
        cnAmount: net,
        applied: 0,
        refunded: data.refundVouchers.reduce((s, v) => s + (v.total_amount || 0), 0),
        remaining: status === "refunded" ? 0 : net,
        settled: status === "refunded" || status === "adjusted",
        pendingCn: true,
        statusLabel: formatCnStatus(data.saleReturn.credit_status),
      };
    }
    const cn = data.creditNote;
    const cnAmount = Number(cn.credit_amount || 0);
    const usedOnRow = Number(cn.used_amount || 0);

    const seenApply = new Set<string>();
    let applied = 0;
    const addApply = (saleId: string, amount: number) => {
      const key = `${saleId}-${Math.round(amount * 100)}`;
      if (amount <= 0.005 || seenApply.has(key)) return;
      seenApply.add(key);
      applied += amount;
    };

    for (const a of data.adjustments) {
      addApply(a.invoice_id, Number(a.amount_applied || 0));
    }
    for (const ba of data.billingApplies || []) {
      addApply(ba.sale_id, ba.amount);
    }
    for (const v of data.cnApplyVouchers) {
      const refId = String((v as { reference_id?: string }).reference_id || "");
      addApply(refId, Number(v.total_amount || 0));
    }

    const refunded = data.refundVouchers.reduce((s, v) => s + (v.total_amount || 0), 0);
    const remainingFromActivity = Math.max(0, cnAmount - applied - refunded);
    const remainingFromRow = Math.max(0, cnAmount - usedOnRow);
    const remaining =
      applied > 0.005 ? remainingFromActivity : remainingFromRow;
    const settled = remaining <= 0.01;

    let statusLabel = formatCnStatus(cn.status);
    if (!settled && applied > 0.005) {
      statusLabel = "Partially Used";
    } else if (settled) {
      statusLabel = "Fully Used";
    }

    return {
      cnAmount,
      applied: applied > 0.005 ? applied : usedOnRow > refunded ? usedOnRow - refunded : 0,
      refunded,
      remaining,
      settled,
      pendingCn: false,
      statusLabel,
    };
  }, [data]);

  const creditNote = data?.creditNote;
  const saleReturn = data?.saleReturn;
  const titleText = creditNote
    ? `Credit Note ${creditNote.credit_note_number} — History`
    : saleReturn
      ? `${saleReturn.return_number || "Sale Return"} — CN History`
      : "Credit Note History";

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (isError || (!creditNote && !saleReturn)) {
      return (
        <p className="text-center text-muted-foreground py-12">
          Could not load credit note history.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
          {creditNote ? (
            <>
              <p>
                <span className="text-muted-foreground">Customer:</span>{" "}
                <span className="font-medium">{creditNote.customer_name}</span>
                {creditNote.issue_date && (
                  <>
                    <span className="text-muted-foreground mx-2">|</span>
                    <span className="text-muted-foreground">Issued:</span>{" "}
                    <span className="font-medium">
                      {format(new Date(creditNote.issue_date), "dd/MM/yyyy")}
                    </span>
                  </>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <span>
                  <span className="text-muted-foreground">CN Amount:</span>{" "}
                  <span className="font-semibold">{fmtMoney(creditNote.credit_amount || 0)}</span>
                </span>
                <Badge variant="secondary" className="text-xs h-5">
                  {balanceSummary?.statusLabel ?? formatCnStatus(creditNote.status)}
                </Badge>
                {saleReturn && (
                  <Badge variant="outline" className="text-xs h-5">
                    {saleReturn.return_number}
                  </Badge>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-700 font-medium">Credit note not generated yet</p>
              <p>
                <span className="text-muted-foreground">Return:</span>{" "}
                <span className="font-medium">{saleReturn?.return_number}</span>
                <span className="text-muted-foreground mx-2">|</span>
                <span className="text-muted-foreground">Customer:</span>{" "}
                <span className="font-medium">{saleReturn?.customer_name}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Return Amount:</span>{" "}
                <span className="font-semibold">{fmtMoney(saleReturn?.net_amount || 0)}</span>
              </p>
            </>
          )}
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Timeline
          </p>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {creditNote ? "No applications or refunds yet." : "CN will appear here once generated."}
            </p>
          ) : (
            <div className="space-y-0">
              {timeline.map((entry, idx) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-lg leading-none" aria-hidden>
                      {entry.icon}
                    </span>
                    {idx < timeline.length - 1 && (
                      <div className="w-px flex-1 bg-border min-h-[1.5rem] my-1" />
                    )}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      <span className="text-muted-foreground font-normal tabular-nums">
                        {formatTimelineDate(entry.timestamp)}
                      </span>{" "}
                      {entry.title}
                    </p>
                    {entry.lines.map((line, i) => (
                      <p key={i} className="text-xs text-muted-foreground mt-0.5">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {balanceSummary && (
          <>
            <Separator />
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Balance Summary
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {balanceSummary.pendingCn ? "Return Amount" : "CN Amount"}
                </span>
                <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.cnAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Applied to Invoice(s)</span>
                <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.applied)}</span>
              </div>
              <div className="flex justify-between text-blue-700">
                <span>Refunded to Customer</span>
                <span className="font-medium tabular-nums">{fmtMoney(balanceSummary.refunded)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between items-center font-semibold">
                <span>CN Remaining</span>
                <span
                  className={cn(
                    "tabular-nums flex items-center gap-1",
                    balanceSummary.settled ? "text-green-600" : "text-amber-600"
                  )}
                >
                  {fmtMoney(balanceSummary.remaining)}
                  {balanceSummary.settled && (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Fully Used</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b px-3 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{titleText}</h2>
            <p className="text-[11px] text-muted-foreground">Adjustments & refunds</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderBody()}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[88vh] overflow-hidden flex flex-col p-0">
        <div className="h-1 w-full bg-gradient-to-r from-purple-600 via-primary to-violet-500 rounded-t-lg flex-shrink-0" />
        <div className="p-4 pb-0 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Receipt className="h-4 w-4 text-purple-600" />
              </div>
              <div className="min-w-0">
                <div className="truncate">{titleText}</div>
                <DialogDescription className="text-xs font-normal mt-0.5">
                  Invoice adjustments and customer refunds
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>
        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="pr-3">{renderBody()}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function formatPaymentMode(method: string | null | undefined) {
  const m = (method || "").toLowerCase();
  if (!m) return "Payment";
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
