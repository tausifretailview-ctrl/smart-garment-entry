import React, { useState, useRef, useEffect } from 'react';
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Printer, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import { thermalReceiptBrowserPageSize } from '@/utils/invoicePrintFormat';
import {
  getThermalReceiptPageStyleFragment,
  INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS,
} from '@/utils/thermalReceiptPrintDocument';
import { useIsNativeApp } from '@/hooks/useNativeApp';
import { captureElementToPdfBlob } from '@/utils/invoiceElementToPdf';
import { deliverPdfBlob } from '@/utils/mobileDocumentDelivery';
import { toast } from 'sonner';
import { waitForPrintReady } from '@/utils/printReady';
import { cn } from '@/lib/utils';

/** Map InvoiceWrapper format props to preview dialog radio values. */
function normalizePreviewFormat(format: string): 'a4' | 'a5' | 'a5-horizontal' | 'thermal' {
  if (format === 'a5-vertical' || format === 'a5') return 'a5';
  if (format === 'a5-horizontal') return 'a5-horizontal';
  if (format === 'thermal') return 'thermal';
  return 'a4';
}

function paperWidthMm(format: string, thermalPaper: '58mm' | '80mm'): number {
  if (format === 'thermal') return thermalPaper === '58mm' ? 58 : 80;
  if (format === 'a5') return 148;
  return 210;
}

function mmToCssPx(mm: number): number {
  return (mm / 25.4) * 96;
}

/** Map InvoiceWrapper format props to preview dialog radio values. */
function normalizePreviewFormat(format: string): 'a4' | 'a5' | 'a5-horizontal' | 'thermal' {
  if (format === 'a5-vertical' || format === 'a5') return 'a5';
  if (format === 'a5-horizontal') return 'a5-horizontal';
  if (format === 'thermal') return 'thermal';
  return 'a4';
}

interface PrintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderInvoice: (format: string) => React.ReactNode;
  defaultFormat?: string;
  /** 58mm vs 80mm when format is thermal (POS-58 vs standard roll). */
  thermalPaper?: '58mm' | '80mm';
  onPrint?: () => void;
  /** Full-screen sheet + scale-to-width preview (mobile / Electron sale summary). */
  compactLayout?: boolean;
}

export const PrintPreviewDialog: React.FC<PrintPreviewDialogProps> = ({
  open,
  onOpenChange,
  renderInvoice,
  defaultFormat = 'a4',
  thermalPaper = '80mm',
  onPrint,
  compactLayout = false,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<string>(
    normalizePreviewFormat(defaultFormat),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [previewScale, setPreviewScale] = useState(compactLayout ? 0.42 : 0.95);
  const [sheetSize, setSheetSize] = useState({ width: 0, height: 0 });
  const printRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleWrapRef = useRef<HTMLDivElement>(null);
  const isNative = useIsNativeApp();

  // Sync selectedFormat with defaultFormat when it changes (async settings load)
  useEffect(() => {
    setSelectedFormat(normalizePreviewFormat(defaultFormat));
  }, [defaultFormat]);

  // Reset loading state when dialog opens or format changes.
  // IMPORTANT: invoice templates may fetch async settings and initially render "Loading...".
  // We keep the dialog "Loading" until real content is present to avoid printing a blank/Loading page.
  // Do NOT depend on renderInvoice identity — callers often pass inline lambdas that change every parent render.
  useEffect(() => {
    if (!open) return;

    setIsLoading(true);

    const startedAt = Date.now();
    const MAX_WAIT_MS = 6000;
    const POLL_MS = 150;
    let cancelled = false;
    // Browser setTimeout returns number; Node DOM typings use Timeout — keep number for Vite/DOM.
    let timerId: number | undefined;
    let observer: MutationObserver | undefined;

    const isContentReady = () => {
      const el = printRef.current;
      if (!el) return false;

      // Check for data-invoice-loading attribute (InvoiceWrapper still fetching settings)
      if (el.querySelector('[data-invoice-loading]')) return false;

      // Has at least one rendered element
      const hasChildren = el.childElementCount > 0;
      if (!hasChildren) return false;

      const text = (el.textContent || '').trim();
      if (!text) return false;

      // Common placeholder states
      if (/^loading\.?\.?\.?$/i.test(text)) return false;
      if (/loading preview/i.test(text)) return false;

      // Also guard against templates returning a single "Loading..." div.
      if (text.toLowerCase().includes('loading') && text.length <= 32) return false;

      return true;
    };

    const stopWaiting = () => {
      if (cancelled) return true;
      cancelled = true;
      observer?.disconnect();
      if (timerId !== undefined) window.clearTimeout(timerId);
      setIsLoading(false);
      return true;
    };

    const checkReady = () => {
      if (cancelled) return true;
      if (isContentReady()) return stopWaiting();
      if (Date.now() - startedAt >= MAX_WAIT_MS) return stopWaiting();
      return false;
    };

    const tick = () => {
      if (checkReady()) return;
      timerId = window.setTimeout(tick, POLL_MS);
    };

    const attachObserver = () => {
      const el = printRef.current;
      if (!el || cancelled) return;
      observer = new MutationObserver(() => {
        checkReady();
      });
      observer.observe(el, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-invoice-loading'],
      });
    };

    timerId = window.setTimeout(() => {
      attachObserver();
      tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [open, selectedFormat]);

  useEffect(() => {
    if (!open) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateScale = () => {
      const paperPx = mmToCssPx(paperWidthMm(selectedFormat, thermalPaper));
      const pad = compactLayout ? 12 : 24;
      const available = Math.max(120, viewport.clientWidth - pad);
      const maxScale = compactLayout ? 1 : 0.95;
      setPreviewScale(Math.max(0.22, Math.min(maxScale, available / paperPx)));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [open, selectedFormat, thermalPaper, compactLayout]);

  useEffect(() => {
    if (!open) return;
    const el = printRef.current;
    if (!el) return;
    const measure = () => {
      setSheetSize({ width: el.scrollWidth, height: el.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, selectedFormat, isLoading]);

  const getPageSize = () => {
    switch (selectedFormat) {
      case 'a5':
        return 'A5 portrait';
      case 'a5-horizontal':
        return 'A5 landscape';
      case 'thermal':
        return thermalReceiptBrowserPageSize(thermalPaper);
      default:
        return 'A4 portrait';
    }
  };

  const getBodyDimensions = () => {
    switch (selectedFormat) {
      case 'a5':
        return 'width: 148mm !important; height: 210mm !important;';
      case 'a5-horizontal':
        return 'width: 210mm !important; height: 148mm !important;';
      case 'thermal':
        return thermalPaper === '58mm'
          ? 'width: 58mm !important; height: auto !important;'
          : 'width: 80mm !important; height: auto !important;';
      default:
        return 'width: 210mm !important; height: 297mm !important;';
    }
  };

  const getContainerWidth = () => {
    switch (selectedFormat) {
      case 'thermal':
        return thermalPaper === '58mm' ? '48mm' : '72mm';
      case 'a5':
        return '148mm'; // Full A5 width
      case 'a5-horizontal':
        return '210mm'; // Full A5 landscape width
      default:
        return '210mm'; // Full A4 width
    }
  };

  const getContainerHeight = () => {
    switch (selectedFormat) {
      case 'thermal':
        return 'auto';
      case 'a5':
        return '200mm'; // A5 height minus margins
      case 'a5-horizontal':
        return '140mm'; // A5 landscape height minus margins
      default:
        return '287mm'; // A4 height minus margins
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Invoice',
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
    pageStyle: `
      @page {
        size: ${getPageSize()};
        margin: ${selectedFormat === 'thermal' ? '0' : selectedFormat === 'a4' ? '10mm' : '4mm'};
      }
      @media print {
        /* Hide all non-print elements */
        .no-print,
        header:not(.invoice-header),
        nav,
        aside,
        footer:not(.invoice-footer),
        .sidebar,
        [data-sidebar],
        [data-sonner-toaster],
        button:not(.print-include) {
          display: none !important;
          visibility: hidden !important;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          ${getBodyDimensions()}
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .print-invoice-container {
          width: ${selectedFormat === 'thermal' ? (thermalPaper === '58mm' ? '58mm' : '80mm') : '100%'} !important;
          max-width: ${selectedFormat === 'thermal' ? (thermalPaper === '58mm' ? '58mm' : '80mm') : '100%'} !important;
          height: auto !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
          overflow: visible !important;
          box-shadow: none !important;
          border: none !important;
        }

        .print-invoice-container > * {
          transform: none !important;
          max-height: none !important;
          overflow: visible !important;
        }

        .print-dialog,
        .print-dialog .print-invoice-container,
        .print-dialog .invoice-print-root,
        .print-dialog .retail-tax-ezzy-print-root,
        .print-dialog .thermal-print-80mm,
        .print-dialog .thermal-receipt-container,
        .print-dialog .modern-thermal-receipt {
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          transform: none !important;
          max-height: none !important;
          overflow: visible !important;
        }

        .professional-invoice-template,
        .invoice-print-root,
        .print-invoice-container {
          max-height: none !important;
          overflow: visible !important;
          visibility: visible !important;
          opacity: 1 !important;
          display: block !important;
          transform: none !important;
        }
      }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
      ${selectedFormat === 'thermal' ? getThermalReceiptPageStyleFragment(thermalPaper) : ''}
    `,
    onAfterPrint: () => {
      onOpenChange(false);
      onPrint?.();
    },
  });

  const getPdfPageFormat = (): 'a4' | 'a5' | 'thermal' => {
    if (selectedFormat === 'thermal') return 'thermal';
    if (selectedFormat === 'a5' || selectedFormat === 'a5-horizontal') return 'a5';
    return 'a4';
  };

  const handleSaveOrSharePdf = async () => {
    if (!printRef.current || isLoading || isSavingPdf) return;
    setIsSavingPdf(true);
    const wrap = scaleWrapRef.current;
    const prevTransform = wrap?.style.transform ?? '';
    try {
      if (wrap) wrap.style.transform = 'none';
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const blob = await captureElementToPdfBlob(printRef.current, {
        pageFormat: getPdfPageFormat(),
        thermalPaper,
        mobileOptimized: compactLayout || isNative || window.innerWidth < 768,
      });
      const fileName = `Invoice_${format(new Date(), 'ddMMyyyy_HHmm')}.pdf`;
      const result = await deliverPdfBlob(blob, fileName, { preferDownload: true });
      if (result === 'shared') {
        toast.success('Invoice shared');
      } else {
        toast.success('Invoice PDF downloaded');
      }
      onOpenChange(false);
      onPrint?.();
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      console.error('Print preview PDF failed:', error);
      toast.error('Could not save invoice PDF');
    } finally {
      if (wrap) wrap.style.transform = prevTransform;
      setIsSavingPdf(false);
    }
  };

  const getPreviewStyles = (): React.CSSProperties => {
    switch (selectedFormat) {
      case 'a5':
        return {
          width: '148mm',
          minHeight: '210mm',
          maxHeight: 'none',
          overflow: 'visible',
        };
      case 'a5-horizontal':
        return {
          width: '210mm',
          minHeight: '148mm',
          maxHeight: 'none',
          overflow: 'visible',
        };
      case 'thermal':
        return {
          width: thermalPaper === '58mm' ? '58mm' : '80mm',
          minHeight: 'auto',
          maxHeight: 'none',
          overflow: 'visible',
        };
      default:
        return {
          width: '210mm',
          minHeight: '297mm',
          maxHeight: 'none',
          overflow: 'visible',
        };
    }
  };

  // Map print dialog format selection to invoice template format
  const getFormatForInvoice = (): 'a4' | 'a5-vertical' | 'a5-horizontal' | 'thermal' => {
    switch (selectedFormat) {
      case 'a5':
        return 'a5-vertical';
      case 'a5-horizontal':
        return 'a5-horizontal';
      case 'thermal':
        return 'thermal';
      case 'a4':
      default:
        return 'a4';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'print-dialog max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col',
          selectedFormat === 'thermal' && thermalPaper === '58mm' ? ' thermal-paper-58' : '',
          compactLayout &&
            'h-[100dvh] max-h-[100dvh] w-[100vw] max-w-[100vw] gap-2 rounded-none p-3 sm:rounded-lg',
        )}
      >
        <DialogHeader className={compactLayout ? 'text-left pr-8' : undefined}>
          <DialogTitle>Print Preview</DialogTitle>
        </DialogHeader>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-muted/30',
            compactLayout ? 'p-2' : 'p-4',
          )}
        >
          <div className={cn('shrink-0 rounded-md border bg-background', compactLayout ? 'mb-2 p-3' : 'mb-4 p-4')}>
            <Label className={cn('mb-3 block font-semibold', compactLayout ? 'text-sm' : 'text-base')}>
              Bill Format
            </Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'a4' | 'a5' | 'a5-horizontal' | 'thermal')}
              className={compactLayout ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-4'}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a4" id="a4" />
                <Label htmlFor="a4" className="cursor-pointer text-sm">
                  {compactLayout ? 'A4' : 'A4 (210mm × 297mm)'}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a5" id="a5" />
                <Label htmlFor="a5" className="cursor-pointer text-sm">
                  {compactLayout ? 'A5 Vertical' : 'A5 Vertical (148mm × 210mm)'}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a5-horizontal" id="a5-horizontal" />
                <Label htmlFor="a5-horizontal" className="cursor-pointer text-sm">
                  {compactLayout ? 'A5 Horizontal' : 'A5 Horizontal (210mm × 148mm)'}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="thermal" id="thermal" />
                <Label htmlFor="thermal" className="cursor-pointer text-sm">
                  {compactLayout ? 'Thermal 80mm' : 'Thermal (80mm)'}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-muted/50">
                <div className="text-muted-foreground">Loading preview...</div>
              </div>
            )}
            <div
              className="mx-auto"
              style={{
                width: sheetSize.width ? sheetSize.width * previewScale : '100%',
                height: sheetSize.height ? sheetSize.height * previewScale : undefined,
                minHeight: 240,
              }}
            >
              <div
                ref={scaleWrapRef}
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  ref={printRef}
                  className="print-invoice-container bg-white shadow-lg"
                  data-print-format={selectedFormat}
                  style={{
                    ...getPreviewStyles(),
                    visibility: isLoading ? 'hidden' : 'visible',
                  }}
                >
                  {renderInvoice(getFormatForInvoice() as any)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter
          className={cn(
            'no-print gap-2',
            compactLayout && 'flex flex-col gap-2 space-x-0 sm:flex-col sm:space-x-0',
          )}
        >
          {compactLayout ? (
            <>
              <Button
                onClick={handleSaveOrSharePdf}
                disabled={isLoading || isSavingPdf}
                className="no-print h-11 w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                {isSavingPdf ? 'Preparing…' : 'Download PDF'}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="no-print h-11 w-full">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="no-print">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              {isNative ? (
                <Button
                  onClick={handleSaveOrSharePdf}
                  disabled={isLoading || isSavingPdf}
                  className="no-print"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isSavingPdf ? 'Preparing…' : 'Download PDF'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSaveOrSharePdf}
                    disabled={isLoading || isSavingPdf}
                    className="no-print"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isSavingPdf ? 'Preparing…' : 'Download PDF'}
                  </Button>
                  <Button onClick={handlePrint} disabled={isLoading} className="no-print">
                    <Printer className="mr-2 h-4 w-4" />
                    {isLoading ? 'Loading...' : 'Print'}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
