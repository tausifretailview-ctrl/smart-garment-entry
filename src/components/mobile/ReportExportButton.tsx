import { useState, type RefObject } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { deliverFileBlob } from "@/utils/mobileDocumentDelivery";
import { captureElementToPdfBlob } from "@/utils/invoiceElementToPdf";

export function ReportExportButton({
  fileBaseName,
  buildCsv,
  tableRef,
}: {
  fileBaseName: string;
  buildCsv: () => Blob;
  /** Ref to the currently-rendered table DOM node, for PDF capture. */
  tableRef: RefObject<HTMLElement | null>;
}) {
  const [busy, setBusy] = useState(false);

  const exportCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deliverFileBlob(buildCsv(), `${fileBaseName}.csv`, "text/csv;charset=utf-8");
      toast.success("CSV exported");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast.error("Could not export CSV");
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (busy) return;
    if (!tableRef.current) {
      toast.error("Could not export PDF");
      return;
    }
    setBusy(true);
    try {
      const blob = await captureElementToPdfBlob(tableRef.current, { pageFormat: "a4" });
      await deliverFileBlob(blob, `${fileBaseName}.pdf`, "application/pdf");
      toast.success("PDF exported");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast.error("Could not export PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary touch-manipulation shrink-0"
          aria-label="Export report"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCsv}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf}>
          <FileText className="mr-2 h-4 w-4" /> Export PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
