import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { loadSaleReturnNote, type SaleReturnIrnRow, type SaleReturnNoteData } from "@/utils/saleReturnEInvoice";
import { NoteIrnCell } from "@/components/einvoice/NoteIrnCell";
import { NoteEInvoicePrint } from "@/components/einvoice/NoteEInvoicePrint";
import { noteEInvoiceProblem, type NoteParty } from "../../../supabase/functions/_shared/einvoiceNote";

type Props = {
  ret: { id: string; return_number: string | null; return_date: string };
  /** Undefined while loading. */
  state: SaleReturnIrnRow | undefined;
  missingSql: boolean;
  organizationId: string;
  testMode: boolean;
  seller: NoteParty;
  onChanged: () => void;
};

/** E-invoice (CRN) cell of one sale return: Get / Cancel IRN and the e-invoice print. */
export function SaleReturnIrnCell({ ret, state, missingSql, organizationId, testMode, seller, onChanged }: Props) {
  const { toast } = useToast();
  const [printData, setPrintData] = useState<SaleReturnNoteData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `CreditNote_${ret.return_number ?? ""}`.replace(/\//g, "-"),
    pageStyle: `@page { size: A4 portrait; margin: 10mm; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}`,
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
    onAfterPrint: () => setPrintData(null),
    onPrintError: () => setPrintData(null),
  });
  const handlePrintRef = useRef(handlePrint);
  handlePrintRef.current = handlePrint;

  if (missingSql) {
    return (
      <span className="text-[11px] font-medium text-amber-700" title="Phase 2 step 2b SQL adds the IRN columns to sale returns">
        Run step 2b SQL
      </span>
    );
  }
  if (!state) return <span className="text-xs text-slate-300">…</span>;

  const precheck = async (): Promise<string | null> => {
    const res = await loadSaleReturnNote(organizationId, ret.id, seller.gstin);
    if (res.error || !res.data) return res.error || "This return could not be read.";
    if (!res.data.input) return "This return has no GST lines (challan items only), so it needs no IRN.";
    return noteEInvoiceProblem(res.data.input, seller, res.data.buyer);
  };

  const printEInvoice = async () => {
    const res = await loadSaleReturnNote(organizationId, ret.id, seller.gstin, true);
    if (res.error || !res.data?.input) {
      toast({ variant: "destructive", title: "Can't print", description: res.error || "This return has no GST lines." });
      return;
    }
    setPrintData(res.data);
    requestAnimationFrame(() => {
      waitForPrintReady(printRef, () => handlePrintRef.current(), { maxWait: 8000 });
    });
  };

  const input = printData?.input ?? null;
  return (
    <>
      <NoteIrnCell
        kind="credit"
        note={{
          id: ret.id,
          number: ret.return_number ?? "",
          date: String(ret.return_date).slice(0, 10),
          irn: state.irn,
          ackNo: state.ack_no,
          ackDate: state.ack_date,
          status: state.einvoice_status,
          error: state.einvoice_error,
          testMode: state.einvoice_test_mode,
          buyerGstin: state.buyerGstin,
        }}
        organizationId={organizationId}
        testMode={testMode}
        precheck={precheck}
        onChanged={onChanged}
        onPrint={printEInvoice}
      />
      {printData && input ? (
        <div className="invoice-print-source-screen">
          <NoteEInvoicePrint
            ref={printRef}
            title="CREDIT NOTE"
            number={printData.returnNumber}
            date={input.date}
            seller={{
              name: seller.name,
              address: seller.address,
              gstin: String(seller.gstin).toUpperCase(),
              phone: seller.phone ?? undefined,
              email: seller.email ?? undefined,
            }}
            buyer={{
              name: printData.buyer.name,
              address: printData.buyer.address || null,
              gstin: printData.buyer.gstin,
              phone: printData.buyer.phone ?? null,
            }}
            against={input.againstInvoice ?? null}
            reason="Sales return"
            notes={printData.notes}
            interState={input.interState}
            lines={input.lines.map((l) => ({
              description: l.description,
              hsn: l.hsn,
              qty: l.qty,
              rate: l.rate,
              taxable: l.taxable,
              gstPercent: l.gstPercent,
              gstAmount: l.gstAmount,
            }))}
            net={input.netAmount}
            irn={printData.irn ?? ""}
            ackNo={printData.ackNo}
            ackDate={printData.ackDate}
            qrText={printData.qr}
            testMode={printData.testMode}
          />
        </div>
      ) : null}
    </>
  );
}
