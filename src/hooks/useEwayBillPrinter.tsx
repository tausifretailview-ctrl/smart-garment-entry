import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { saleSupplyShortLabel, saleSupplyTypeOf } from "@/utils/industrialMode";
import { ewbHsnSummary, formatIstDateTime, type EwayBillRow } from "@/utils/ewayBill";
import { EwayBillPrint, type EwbPrintData } from "@/components/ewaybill/EwayBillPrint";

type SaleForPrint = {
  sale_number: string;
  sale_date: string;
  net_amount: number | null;
  customer_name: string | null;
  customer_address: string | null;
  irn: string | null;
  ack_no: string | null;
  b2b_details: unknown;
  customers: { gst_number: string | null; address: string | null } | null;
};

/**
 * Prints an e-way bill on A4 (Industrial mode, Phase 2 step 5a). The bill, its HSN codes and
 * the buyer are read only when Print is pressed, so lists stay as light as before.
 * Render `printNode` once on the page that uses it.
 */
export function useEwayBillPrinter(organizationId: string | undefined) {
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const [data, setData] = useState<EwbPrintData | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `EWB_${data?.ewb.ewb_no ?? ""}`,
    pageStyle: `@page { size: A4 portrait; margin: 10mm; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}`,
    expectedMaxPages: 1,
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
    // Drop the copy once printed, so it can't show up in another page's print.
    onAfterPrint: () => {
      setPrintingId(null);
      setData(null);
    },
    onPrintError: () => {
      setPrintingId(null);
      setData(null);
    },
  });
  const handlePrintRef = useRef(handlePrint);
  handlePrintRef.current = handlePrint;

  const biz = settings as {
    business_name?: string | null;
    address?: string | null;
    gst_number?: string | null;
    sale_settings?: { einvoice_settings?: { seller_gstin?: string | null } } | null;
  } | null;

  const print = useCallback(
    async (ewb: EwayBillRow & { doc_no?: string | null; doc_date?: string | null; irn?: string | null }) => {
      if (!organizationId) return;
      setPrintingId(ewb.id);
      try {
        let sale: SaleForPrint | null = null;
        let hsn: string[] = [];
        if (ewb.sale_id) {
          const [s, items] = await Promise.all([
            supabase
              .from("sales")
              .select("sale_number, sale_date, net_amount, customer_name, customer_address, irn, ack_no, b2b_details, customers:customer_id (gst_number, address)")
              .eq("id", ewb.sale_id)
              .eq("organization_id", organizationId)
              .maybeSingle(),
            supabase.from("sale_items").select("hsn_code, line_total").eq("sale_id", ewb.sale_id).is("deleted_at", null),
          ]);
          if (s.error) throw s.error;
          sale = (s.data ?? null) as unknown as SaleForPrint | null;
          hsn = ewbHsnSummary((items.data ?? []) as Array<{ hsn_code: string | null; line_total: number | null }>);
        }
        const supply = saleSupplyTypeOf(sale?.b2b_details ?? null);
        setData({
          ewb,
          doc: {
            number: sale?.sale_number || ewb.doc_no || "",
            date: String(sale?.sale_date || ewb.doc_date || "").slice(0, 10),
            value: Number(sale?.net_amount ?? 0),
            supplyLabel: supply === "B2B" ? "Regular" : saleSupplyShortLabel(supply),
            irn: sale?.irn || ewb.irn || null,
            ackNo: sale?.ack_no ?? null,
          },
          seller: {
            name: biz?.business_name || "",
            gstin: String(biz?.sale_settings?.einvoice_settings?.seller_gstin || biz?.gst_number || "").toUpperCase(),
            address: biz?.address || "",
          },
          buyer: {
            name: sale?.customer_name || "",
            gstin: String(sale?.customers?.gst_number || "").trim().toUpperCase(),
            address: sale?.customer_address || sale?.customers?.address || "",
          },
          hsn,
          printedAt: formatIstDateTime(new Date().toISOString()),
        });
        requestAnimationFrame(() => {
          waitForPrintReady(printRef, () => handlePrintRef.current(), { maxWait: 8000 });
        });
        // Clear the spinner even if the browser print dialog never reports back.
        window.setTimeout(() => setPrintingId((id) => (id === ewb.id ? null : id)), 15_000);
      } catch (e) {
        setPrintingId(null);
        toast({
          variant: "destructive",
          title: "Could not print the e-way bill",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [organizationId, biz?.business_name, biz?.address, biz?.gst_number, biz?.sale_settings?.einvoice_settings?.seller_gstin, toast],
  );

  const printNode = (
    <div className="invoice-print-source-screen">
      {data ? <EwayBillPrint ref={printRef} data={data} /> : <div ref={printRef} />}
    </div>
  );

  return { print, printingId, printNode };
}
