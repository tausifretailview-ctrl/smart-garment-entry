import { useState } from "react";
import { format } from "date-fns";
import { Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  downloadTabularExcel,
  downloadTabularPdf,
  type TabularColumn,
} from "@/utils/accountsTabularExport";

type AccountsExportButtonsProps<T> = {
  rows: T[];
  columns: TabularColumn<T>[];
  /** File name without extension. Today's date is appended. */
  fileBase: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  className?: string;
};

export function AccountsExportButtons<T>({
  rows,
  columns,
  fileBase,
  sheetName,
  title,
  subtitle,
  disabled,
  className,
}: AccountsExportButtonsProps<T>) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);

  const run = async (kind: "excel" | "pdf") => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    const stamp = format(new Date(), "yyyy-MM-dd");
    setBusy(kind);
    try {
      if (kind === "excel") {
        await downloadTabularExcel({
          filename: `${fileBase}_${stamp}.xlsx`,
          sheetName,
          columns,
          rows,
        });
        toast.success("Exported to Excel");
      } else {
        await downloadTabularPdf({
          filename: `${fileBase}_${stamp}.pdf`,
          title,
          subtitle: subtitle ?? `${rows.length} row${rows.length === 1 ? "" : "s"} · ${format(new Date(), "dd/MM/yyyy")}`,
          columns,
          rows,
        });
        toast.success("Exported to PDF");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5 shrink-0", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 text-sm border-slate-200 bg-slate-50 hover:bg-white"
        disabled={disabled || busy !== null}
        onClick={() => void run("excel")}
      >
        {busy === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Excel
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 text-sm border-slate-200 bg-slate-50 hover:bg-white"
        disabled={disabled || busy !== null}
        onClick={() => void run("pdf")}
      >
        {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
        PDF
      </Button>
    </div>
  );
}
