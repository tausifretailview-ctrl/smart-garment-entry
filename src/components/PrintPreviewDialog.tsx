import React, { useState, useRef } from 'react';
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
  renderInvoice: (format: 'a4' | 'a5' | 'thermal') => React.ReactNode;
  defaultFormat?: 'a4' | 'a5' | 'thermal';
  onPrint?: () => void;
}

export const PrintPreviewDialog: React.FC<PrintPreviewDialogProps> = ({
  open,
  onOpenChange,
  renderInvoice,
  defaultFormat = 'a4',
  onPrint,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'a4' | 'a5' | 'thermal'>(defaultFormat);
  const [isLoading, setIsLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  // Reset loading state when dialog opens or format changes
  React.useEffect(() => {
    if (open) {
      setIsLoading(true);
      // Give time for invoice to render
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [open, selectedFormat]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Invoice',
    pageStyle: `
      @page {
        size: ${selectedFormat === 'a5' ? 'A5 portrait' : selectedFormat === 'thermal' ? '80mm auto' : 'A4 portrait'};
        margin: ${selectedFormat === 'thermal' ? '5mm' : '10mm'};
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
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
        };
      case 'thermal':
        return {
          width: '80mm',
          minHeight: 'auto',
        };
      default: // a4
        return {
          width: '210mm',
          minHeight: '297mm',
        };
    }
  };

  const getFormatForInvoice = () => {
    switch (selectedFormat) {
      case 'a5':
        return 'a5-vertical';
      case 'thermal':
        return 'thermal';
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
              onValueChange={(value) => setSelectedFormat(value as 'a4' | 'a5' | 'thermal')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a4" id="a4" />
                <Label htmlFor="a4" className="cursor-pointer">A4 (210mm × 297mm)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="a5" id="a5" />
                <Label htmlFor="a5" className="cursor-pointer">A5 (148mm × 210mm)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="thermal" id="thermal" />
                <Label htmlFor="thermal" className="cursor-pointer">Thermal (80mm)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preview Container */}
          <div className="flex justify-center">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="text-muted-foreground">Loading preview...</div>
              </div>
            ) : (
              <div
                ref={printRef}
                className="bg-white shadow-lg print-invoice-container"
                data-print-format={selectedFormat}
                style={{
                  ...getPreviewStyles(),
                  transform: selectedFormat === 'thermal' ? 'scale(0.8)' : 'scale(0.95)',
                  transformOrigin: 'top center',
                }}
              >
                {renderInvoice(getFormatForInvoice() as any)}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={isLoading}>
            <Printer className="mr-2 h-4 w-4" />
            {isLoading ? 'Loading...' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
