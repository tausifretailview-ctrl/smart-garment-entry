import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  isQZReady,
  ensureQZConnection,
  printViaQZTray,
  extractInvoiceHTML,
} from '@/utils/directInvoicePrint';
import {
  appPrint,
  isDesktopAutoPrintEnabled,
  isDesktopSilentPrintConfigured,
  isElectron,
} from '@/utils/appPrint';

interface DirectPrintSettings {
  enable_direct_print?: boolean;
  direct_print_sale_printer?: string;
  direct_print_sale_paper?: string;
  direct_print_pos_printer?: string;
  direct_print_pos_paper?: string;
  direct_print_auto_print?: boolean;
  direct_print_copies?: number;
}

interface DirectPrintOptions {
  context: 'pos' | 'sale';
  paperSize?: '58mm' | '80mm' | 'A4' | 'A5';
  /** Called when falling back to browser print */
  onFallback?: () => void;
  onSuccess?: () => void;
}

export const useDirectPrint = (billBarcodeSettings?: DirectPrintSettings | null) => {
  const isPrintingRef = useRef(false);

  const isQzDirectPrintEnabled = billBarcodeSettings?.enable_direct_print === true;
  const isDirectPrintEnabled =
    isQzDirectPrintEnabled || isDesktopSilentPrintConfigured();
  const isAutoPrintEnabled =
    billBarcodeSettings?.direct_print_auto_print === true || isDesktopAutoPrintEnabled();

  const getPrinterForContext = useCallback(
    (context: 'pos' | 'sale'): string | null => {
      if (!billBarcodeSettings) return null;
      return context === 'pos'
        ? billBarcodeSettings.direct_print_pos_printer || null
        : billBarcodeSettings.direct_print_sale_printer || null;
    },
    [billBarcodeSettings],
  );

  const directPrint = useCallback(
    async (
      invoiceRef: HTMLDivElement | null,
      options: DirectPrintOptions,
    ): Promise<boolean> => {
      if (isPrintingRef.current) return false;
      isPrintingRef.current = true;

      try {
        if (!isDirectPrintEnabled) {
          options.onFallback?.();
          return false;
        }

        const savedPaperSize =
          options.context === 'pos'
            ? billBarcodeSettings?.direct_print_pos_paper
            : billBarcodeSettings?.direct_print_sale_paper;
        const resolvedPaperSize = (options.paperSize || savedPaperSize || 'A4') as
          | '58mm'
          | '80mm'
          | 'A4'
          | 'A5';

        if (!invoiceRef) {
          console.error('Direct print: invoiceRef is null - invoice not rendered yet');
          toast.error('Invoice not rendered yet. Please try again.');
          options.onFallback?.();
          return false;
        }

        if (invoiceRef.innerHTML.length < 50) {
          console.error('Direct print: invoice content appears empty');
          toast.error('Invoice content not ready. Please try again.');
          options.onFallback?.();
          return false;
        }

        const html = extractInvoiceHTML(invoiceRef);

        // Windows desktop app — silent print via Electron (Settings → Desktop Print)
        if (isElectron() && isDesktopSilentPrintConfigured()) {
          const printType =
            resolvedPaperSize === '80mm' || resolvedPaperSize === '58mm'
              ? 'receipt'
              : 'invoice';
          const result = await appPrint({
            type: printType,
            html,
            thermalPaper:
              resolvedPaperSize === '58mm' || resolvedPaperSize === '80mm'
                ? resolvedPaperSize
                : '80mm',
          });
          if (result.success) {
            toast.success('Invoice sent to printer');
            options.onSuccess?.();
            return true;
          }
          if (result.error) {
            console.warn('Electron silent print failed:', result.error);
          }
        }

        // QZ Tray (Bill & Barcode direct print settings)
        if (!isQzDirectPrintEnabled) {
          options.onFallback?.();
          return false;
        }

        const printerName = getPrinterForContext(options.context);
        if (!printerName) {
          toast.warning('No printer configured for direct printing. Using browser print.');
          options.onFallback?.();
          return false;
        }

        if (!isQZReady()) {
          const connected = await ensureQZConnection();
          if (!connected) {
            toast.warning('QZ Tray not available. Using browser print.');
            options.onFallback?.();
            return false;
          }
        }

        const success = await printViaQZTray(html, {
          printerName,
          paperSize: resolvedPaperSize,
          copies: billBarcodeSettings?.direct_print_copies || 1,
        });

        if (success) {
          toast.success('Invoice sent to printer');
          options.onSuccess?.();
          return true;
        }

        options.onFallback?.();
        return false;
      } catch (err) {
        console.error('Direct print error:', err);
        options.onFallback?.();
        return false;
      } finally {
        isPrintingRef.current = false;
      }
    },
    [isDirectPrintEnabled, isQzDirectPrintEnabled, getPrinterForContext, billBarcodeSettings],
  );

  return {
    isDirectPrintEnabled,
    isAutoPrintEnabled,
    directPrint,
    getPrinterForContext,
  };
};
