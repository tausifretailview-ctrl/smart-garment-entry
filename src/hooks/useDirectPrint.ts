import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { 
  isQZReady, 
  ensureQZConnection, 
  printViaQZTray, 
  extractInvoiceHTML 
} from '@/utils/directInvoicePrint';

interface DirectPrintSettings {
  enable_direct_print?: boolean;
  direct_print_sale_printer?: string;
  direct_print_pos_printer?: string;
  direct_print_auto_print?: boolean;
}

interface DirectPrintOptions {
  context: 'pos' | 'sale';
  paperSize?: '58mm' | '80mm' | 'A4' | 'A5';
  onFallback?: () => void; // Called when falling back to browser print
  onSuccess?: () => void;
}

export const useDirectPrint = (billBarcodeSettings?: DirectPrintSettings | null) => {
  const isPrintingRef = useRef(false);

  const isDirectPrintEnabled = billBarcodeSettings?.enable_direct_print === true;
  const isAutoPrintEnabled = billBarcodeSettings?.direct_print_auto_print === true;

  const getPrinterForContext = useCallback((context: 'pos' | 'sale'): string | null => {
    if (!billBarcodeSettings) return null;
    return context === 'pos' 
      ? billBarcodeSettings.direct_print_pos_printer || null
      : billBarcodeSettings.direct_print_sale_printer || null;
  }, [billBarcodeSettings]);

  /**
   * Attempt direct print via QZ Tray. Falls back to browser print if QZ unavailable.
   * @param invoiceRef - ref to the rendered invoice DOM element
   * @param options - context, paper size, callbacks
   * @returns true if direct print succeeded, false if fallback was triggered
   */
  const directPrint = useCallback(async (
    invoiceRef: HTMLDivElement | null,
    options: DirectPrintOptions
  ): Promise<boolean> => {
    // Prevent double printing
    if (isPrintingRef.current) return false;
    isPrintingRef.current = true;

    try {
      // Check if direct printing is enabled
      if (!isDirectPrintEnabled) {
        options.onFallback?.();
        return false;
      }

      // Get printer name for context
      const printerName = getPrinterForContext(options.context);
      if (!printerName) {
        toast.warning('No printer configured for direct printing. Using browser print.');
        options.onFallback?.();
        return false;
      }

      // Check QZ Tray availability
      if (!isQZReady()) {
        const connected = await ensureQZConnection();
        if (!connected) {
          toast.warning('QZ Tray not available. Using browser print.');
          options.onFallback?.();
          return false;
        }
      }

      // Extract HTML from invoice ref
      if (!invoiceRef) {
        console.error('Direct print: invoiceRef is null - invoice not rendered yet');
        toast.error('Invoice not rendered yet. Please try again.');
        options.onFallback?.();
        return false;
      }

      console.log('Direct print: extracting HTML from invoice ref, children:', invoiceRef.childNodes.length, 'innerHTML length:', invoiceRef.innerHTML.length);
      
      if (invoiceRef.innerHTML.length < 50) {
        console.error('Direct print: invoice content appears empty');
        toast.error('Invoice content not ready. Please try again.');
        options.onFallback?.();
        return false;
      }

      const html = extractInvoiceHTML(invoiceRef);

      // Send to QZ Tray
      const success = await printViaQZTray(html, {
        printerName,
        paperSize: options.paperSize,
      });

      if (success) {
        toast.success('Invoice sent to printer');
        options.onSuccess?.();
        return true;
      } else {
        options.onFallback?.();
        return false;
      }
    } catch (err) {
      console.error('Direct print error:', err);
      options.onFallback?.();
      return false;
    } finally {
      isPrintingRef.current = false;
    }
  }, [isDirectPrintEnabled, getPrinterForContext]);

  return {
    isDirectPrintEnabled,
    isAutoPrintEnabled,
    directPrint,
    getPrinterForContext,
  };
};
