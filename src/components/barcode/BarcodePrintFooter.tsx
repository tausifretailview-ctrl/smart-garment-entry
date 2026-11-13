import type { ReactNode } from "react";
import { Download, Eye, Loader2, Printer, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

const OUTLINE = "barcode-print-footer-btn-outline h-9";

/**
 * Barcode Printing sticky footer: Preview, Print (with loading / printing state), Retry
 * settings, Test Label, Direct Print, PDF, Save Default, and a slot for the Calibrate dialog.
 * Moved out of BarcodePrinting.tsx (Plan Phase 4, S4).
 */
export function BarcodePrintFooter({
  onPreview,
  onPrint,
  printDisabled,
  settingsLoading,
  printing,
  settingsStale,
  onRetrySettings,
  onTestLabel,
  onDirectPrint,
  onPdf,
  saveDefault,
  calibrate,
}: {
  onPreview: () => void;
  onPrint: () => void;
  printDisabled: boolean;
  /** Print settings still loading. */
  settingsLoading: boolean;
  /** A Precision Pro print is running. */
  printing: boolean;
  /** Presets / barcode settings did not finish loading: show Retry settings. */
  settingsStale: boolean;
  onRetrySettings: () => void;
  /** Shown when set (Precision Pro / designer, not footwear). */
  onTestLabel?: () => void;
  /** Shown when set (thermal 1-up, Precision Pro TSC, custom). */
  onDirectPrint?: () => void;
  onPdf: () => void;
  /** Shown on the Standard tab. */
  saveDefault?: { isDefault: boolean; onClick: () => void };
  /** Calibrate button + dialog (Precision Pro / designer). */
  calibrate?: ReactNode;
}) {
  return (
    <footer className="barcode-print-footer shrink-0 border-t-2 border-emerald-500/50 bg-slate-900 text-white px-3 py-2 flex flex-wrap items-center gap-2 shadow-[0_-6px_24px_rgba(0,0,0,0.35)]">
      <Button
        onClick={onPreview}
        variant="secondary"
        size="sm"
        className="barcode-print-footer-btn h-9 font-semibold bg-slate-600 text-white hover:bg-slate-500 border-slate-500"
      >
        <Eye className="h-4 w-4 mr-1.5" />
        Preview
      </Button>
      <Button
        onClick={onPrint}
        size="sm"
        className="barcode-print-footer-btn h-9 font-bold bg-emerald-600 hover:bg-emerald-500 text-white min-w-[108px] shadow-sm"
        disabled={printDisabled}
        title={
          settingsLoading
            ? "Loading print settings…"
            : settingsStale
              ? "Print settings may be incomplete — use Retry if labels look wrong"
              : "Print labels"
        }
      >
        {settingsLoading || printing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            {printing ? "Printing…" : "Loading…"}
          </>
        ) : (
          <>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </>
        )}
      </Button>
      {settingsStale ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${OUTLINE} border-amber-400/70 text-amber-100 bg-amber-950/40 hover:bg-amber-900/60 hover:text-amber-50`}
          onClick={onRetrySettings}
          title="Printer presets or barcode settings did not finish loading"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Retry settings
        </Button>
      ) : null}
      {onTestLabel && (
        <Button
          variant="outline"
          size="sm"
          className={`${OUTLINE} border-amber-400/70 text-amber-100 bg-amber-950/40 hover:bg-amber-900/60 hover:text-amber-50`}
          onClick={onTestLabel}
        >
          Test Label
        </Button>
      )}
      {onDirectPrint && (
        <Button
          size="sm"
          variant="outline"
          className={`${OUTLINE} border-emerald-400/80 text-emerald-100 bg-emerald-950/40 hover:bg-emerald-900/60 hover:text-emerald-50`}
          onClick={onDirectPrint}
        >
          Direct Print
        </Button>
      )}
      <Button
        onClick={onPdf}
        variant="outline"
        size="sm"
        className={`${OUTLINE} border-sky-400/70 text-sky-100 bg-sky-950/40 hover:bg-sky-900/60 hover:text-sky-50`}
      >
        <Download className="h-4 w-4 mr-1.5" />
        PDF
      </Button>
      {saveDefault && (
        <Button
          onClick={saveDefault.onClick}
          variant="outline"
          size="sm"
          className={`${OUTLINE} border-violet-400/70 text-violet-100 bg-violet-950/40 hover:bg-violet-900/60 hover:text-violet-50 ml-auto`}
        >
          <Save className="h-4 w-4 mr-1.5" />
          {saveDefault.isDefault ? "Default ✓" : "Save Default"}
        </Button>
      )}
      {calibrate}
    </footer>
  );
}
