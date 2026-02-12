import React, { useState, useRef, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
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
import { Printer, X } from 'lucide-react';

interface PrintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderInvoice: (format: 'a4' | 'a5' | 'a5-horizontal' | 'thermal') => React.ReactNode;
  defaultFormat?: 'a4' | 'a5' | 'a5-horizontal' | 'thermal';
  onPrint?: () => void;
}

export const PrintPreviewDialog: React.FC<PrintPreviewDialogProps> = ({
  open,
  onOpenChange,
  renderInvoice,
  defaultFormat = 'a4',
  onPrint,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal'>(defaultFormat);
  const [isLoading, setIsLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  // Sync selectedFormat with defaultFormat when it changes (async settings load)
  useEffect(() => {
    setSelectedFormat(defaultFormat);
  }, [defaultFormat]);

  // Reset loading state when dialog opens or format changes.
  // IMPORTANT: invoice templates may fetch async settings and initially render "Loading...".
  // We keep the dialog "Loading" until real content is present to avoid printing a blank/Loading page.
  useEffect(() => {
    if (!open) return;

    setIsLoading(true);

    const startedAt = Date.now();
    const MAX_WAIT_MS = 8000;
    const POLL_MS = 100;

    const isContentReady = () => {
      const el = printRef.current;
      if (!el) return false;

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

    const tick = () => {
      if (isContentReady()) {
        setIsLoading(false);
        return;
      }
      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        // Fallback: unblock UI even if content readiness cannot be detected.
        setIsLoading(false);
        return;
      }
      timerId = window.setTimeout(tick, POLL_MS);
    };

    let timerId = window.setTimeout(tick, POLL_MS);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [open, selectedFormat, renderInvoice]);

  const getPageSize = () => {
    switch (selectedFormat) {
      case 'a5':
        return 'A5 portrait';
      case 'a5-horizontal':
        return 'A5 landscape';
      case 'thermal':
        return '80mm auto';
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
        return 'width: 80mm !important; height: auto !important;';
      default:
        return 'width: 210mm !important; height: 297mm !important;';
    }
  };

  const getContainerWidth = () => {
    switch (selectedFormat) {
      case 'thermal':
        return '72mm';
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
    pageStyle: `
      @page {
        size: ${getPageSize()};
        margin: ${selectedFormat === 'thermal' ? '2mm 4mm' : selectedFormat === 'a4' ? '10mm' : '4mm'};
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
          width: 100% !important;
          max-width: 100% !important;
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

        .professional-invoice-template {
          max-height: none !important;
          overflow: visible !important;
        }
      }
    `,
    onAfterPrint: () => {
      onOpenChange(false);
      onPrint?.();
    },
  });

  const getPreviewStyles = () => {
    switch (selectedFormat) {
      case 'a5':
        return {
          width: '148mm',
          minHeight: '210mm',
          maxHeight: '210mm',
          overflow: 'auto',
        };
      case 'a5-horizontal':
        return {
          width: '210mm',
          minHeight: '148mm',
          maxHeight: '148mm',
          overflow: 'auto',
        };
      case 'thermal':
        return {
          width: '72mm',
          minHeight: 'auto',
          maxHeight: 'none',
        };
      default: // a4
        return {
          width: '210mm',
          minHeight: '297mm',
          maxHeight: '297mm',
          overflow: 'auto',
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
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Print Preview</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/30 p-4 rounded-md">
          {/* Format Selection */}
          <div className="mb-4 bg-background p-4 rounded-md border">
            <Label className="text-base font-semibold mb-3 block">Bill Format</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'a4' | 'a5' | 'a5-horizontal' | 'thermal')}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a4" id="a4" />
                <Label htmlFor="a4" className="cursor-pointer">A4 (210mm × 297mm)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a5" id="a5" />
                <Label htmlFor="a5" className="cursor-pointer">A5 Vertical (148mm × 210mm)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a5-horizontal" id="a5-horizontal" />
                <Label htmlFor="a5-horizontal" className="cursor-pointer">A5 Horizontal (210mm × 148mm)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="thermal" id="thermal" />
                <Label htmlFor="thermal" className="cursor-pointer">Thermal (80mm)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preview Container */}
          <div className="flex justify-center">
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10 rounded-md">
                <div className="text-muted-foreground">Loading preview...</div>
              </div>
            )}
            {/* Always render invoice content so async data can load */}
            <div
              ref={printRef}
              className="bg-white shadow-lg print-invoice-container"
              data-print-format={selectedFormat}
              style={{
                ...getPreviewStyles(),
                transform: selectedFormat === 'thermal' ? 'scale(0.8)' : 'scale(0.95)',
                transformOrigin: 'top center',
                visibility: isLoading ? 'hidden' : 'visible',
              }}
            >
              {renderInvoice(getFormatForInvoice() as any)}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="no-print">
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={isLoading} className="no-print">
            <Printer className="mr-2 h-4 w-4" />
            {isLoading ? 'Loading...' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
