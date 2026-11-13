import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";

/**
 * Line under Purchase Entry's bill fields (new bill only) saying which "our serial" the bill will
 * get: the supplier's paper invoice number, the previous auto serial, the previous bill's invoice
 * number, or just the next auto serial. Moved out of PurchaseEntry.tsx unchanged (Plan Phase 4, S4).
 */
export function PurchaseSerialHint({
  supplierPaperInvoiceNo,
  nextSerial,
  autoSerialSource,
  lastBillSupplierInvoiceNo,
}: {
  supplierPaperInvoiceNo: string | null | undefined;
  nextSerial: string | null | undefined;
  /** Highest purely numeric supplier invoice number used before, with its bill. */
  autoSerialSource: { serial: bigint; software_bill_no: string | null; bill_date: string | null } | null;
  lastBillSupplierInvoiceNo: string | null | undefined;
}) {
  return (
    <p className="text-[11px] text-muted-foreground leading-snug mt-1.5 min-h-[16px]">
      {supplierPaperInvoiceNo ? (
        <>
          Supplier&apos;s bill: <span className="font-mono">{supplierPaperInvoiceNo}</span>
          {" · "}
          our serial <span className="font-mono">{nextSerial ?? "…"}</span> is assigned when you save
        </>
      ) : autoSerialSource ? (
        <>
          Previous auto serial <span className="font-mono">{autoSerialSource.serial.toString()}</span>
          {autoSerialSource.software_bill_no ? (
            <>
              {" on "}
              <span className="font-mono">{autoSerialSource.software_bill_no}</span>
              {autoSerialSource.bill_date ? (
                <>
                  {" ("}
                  {format(new Date(autoSerialSource.bill_date), "dd MMM yyyy")}
                  {")"}
                </>
              ) : null}
            </>
          ) : null}
          {nextSerial ? (
            <>
              {" "}
              · next serial <span className="font-mono">{nextSerial}</span>
            </>
          ) : null}
        </>
      ) : lastBillSupplierInvoiceNo ? (
        <>
          Previous bill used <span className="font-mono">{lastBillSupplierInvoiceNo}</span>
          {nextSerial ? (
            <>
              {" "}
              · next serial <span className="font-mono">{nextSerial}</span>
            </>
          ) : null}
        </>
      ) : nextSerial ? (
        <>
          Auto serial <span className="font-mono">{nextSerial}</span> on save
        </>
      ) : (
        " "
      )}
    </p>
  );
}

/** "DC Purchase — GST set to 0%…" note. */
export function PurchaseDcWarning() {
  return (
    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
      <span className="text-xs text-amber-700 dark:text-amber-400">
        DC Purchase — GST set to 0% for all items. This bill will NOT appear in GST Purchase Register.
      </span>
    </div>
  );
}
