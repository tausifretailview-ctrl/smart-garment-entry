import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Printer, RefreshCw, Download, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { useQZTray } from '@/hooks/useQZTray';
import { 
  generateTSPLBatchFromTemplate, 
  generateTSPLBatch,
  TSPL_PRESETS, 
  LabelData, 
  TSPLLabelConfig,
  TSPLTemplateConfig
} from '@/utils/tsplGenerator';
import { toast } from 'sonner';

interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  lineHeight?: number;
  row?: number;
}

interface LabelDesignConfig {
  brand: LabelFieldConfig;
  productName: LabelFieldConfig;
  color: LabelFieldConfig;
  style: LabelFieldConfig;
  size: LabelFieldConfig;
  price: LabelFieldConfig;
  barcode: LabelFieldConfig;
  barcodeText: LabelFieldConfig;
  billNumber: LabelFieldConfig;
  supplierCode: LabelFieldConfig;
  purchaseCode: LabelFieldConfig;
  fieldOrder: Array<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>>;
  barcodeHeight?: number;
  barcodeWidth?: number;
}

interface DirectPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{
    productName: string;
    brand?: string;
    size?: string;
    color?: string;
    mrp?: number;
    salePrice?: number;
    barcode?: string;
    billNumber?: string;
    purchaseCode?: string;
    supplierCode?: string;
    style?: string;
    quantity: number;
  }>;
  labelSize: string; // e.g., "thermal-50x25-1up"
  labelConfig?: LabelDesignConfig; // Template design configuration
}

export const DirectPrintDialog = ({ 
  open, 
  onOpenChange, 
  items, 
  labelSize,
  labelConfig: templateConfig 
}: DirectPrintDialogProps) => {
  const {
    isConnected,
    isConnecting,
    isQZAvailable,
    printers,
    selectedPrinter,
    error,
    connect,
    getPrinters,
    selectPrinter,
    printRaw,
  } = useQZTray();

  const [isPrinting, setIsPrinting] = useState(false);

  // Parse label size to get dimensions
  const getLabelConfig = (): TSPLLabelConfig => {
    // Extract dimensions from label size string
    const match = labelSize.match(/(\d+)x(\d+)/);
    if (match) {
      return {
        width: parseInt(match[1]),
        height: parseInt(match[2]),
        gap: 2,
      };
    }
    return TSPL_PRESETS['50x25']; // Default
  };

  const handleConnect = async () => {
    const connected = await connect();
    if (connected) {
      await getPrinters();
    }
  };

  const handleRefreshPrinters = async () => {
    await getPrinters();
    toast.success('Printer list refreshed');
  };

  const handlePrint = async () => {
    if (!selectedPrinter) {
      toast.error('Please select a printer');
      return;
    }

    setIsPrinting(true);

    try {
      const labelDimensions = getLabelConfig();
      
      // Convert items to LabelData format
      const labelItems = items.map(item => ({
        data: {
          productName: item.productName,
          brand: item.brand,
          size: item.size,
          color: item.color,
          mrp: item.mrp,
          salePrice: item.salePrice,
          barcode: item.barcode,
          billNumber: item.billNumber,
          purchaseCode: item.purchaseCode,
          supplierCode: item.supplierCode,
          style: item.style,
        } as LabelData,
        quantity: item.quantity,
      }));

      let tsplCommands: string;

      // Use template-aware generator if template config is provided
      if (templateConfig) {
        // Convert LabelDesignConfig to TSPLTemplateConfig
        const tsplTemplate: TSPLTemplateConfig = {
          brand: templateConfig.brand,
          productName: templateConfig.productName,
          color: templateConfig.color,
          style: templateConfig.style,
          size: templateConfig.size,
          price: templateConfig.price,
          barcode: templateConfig.barcode,
          barcodeText: templateConfig.barcodeText,
          billNumber: templateConfig.billNumber,
          supplierCode: templateConfig.supplierCode,
          purchaseCode: templateConfig.purchaseCode,
          fieldOrder: templateConfig.fieldOrder as string[],
          barcodeHeight: templateConfig.barcodeHeight,
          barcodeWidth: templateConfig.barcodeWidth,
        };
        
        tsplCommands = generateTSPLBatchFromTemplate(labelDimensions, tsplTemplate, labelItems);
      } else {
        // Fall back to legacy hardcoded layout
        tsplCommands = generateTSPLBatch(labelDimensions, labelItems);
      }
      
      // Send to printer
      const success = await printRaw(tsplCommands);
      
      if (success) {
        onOpenChange(false);
      }
    } catch (err) {
      console.error('Print error:', err);
      toast.error('Failed to print labels');
    } finally {
      setIsPrinting(false);
    }
  };

  const totalLabels = items.reduce((sum, item) => sum + item.quantity, 0);
  const labelDimensions = getLabelConfig();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Direct Thermal Print
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                QZ Tray {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {!isQZAvailable ? (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => window.open('https://qz.io/download/', '_blank')}
              >
                <Download className="h-4 w-4 mr-1" />
                Install QZ Tray
              </Button>
            ) : !isConnected ? (
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            ) : null}
          </div>

          {/* QZ Tray Not Installed Notice */}
          {!isQZAvailable && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                QZ Tray Required
              </p>
              <p className="text-amber-700 dark:text-amber-300 mb-2">
                QZ Tray is a free utility that enables direct printing to thermal printers without browser dialogs.
              </p>
              <ol className="list-decimal list-inside text-amber-700 dark:text-amber-300 space-y-1">
                <li>Download QZ Tray from qz.io/download</li>
                <li>Install and run QZ Tray</li>
                <li>Refresh this page and try again</li>
              </ol>
              <Button 
                size="sm" 
                variant="link" 
                className="mt-2 p-0 h-auto text-amber-800 dark:text-amber-200"
                onClick={() => window.open('https://qz.io/download/', '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Download QZ Tray
              </Button>
            </div>
          )}

          {/* Printer Selection */}
          {isConnected && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Printer</Label>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleRefreshPrinters}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              
              <Select value={selectedPrinter || ''} onValueChange={selectPrinter}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a printer..." />
                </SelectTrigger>
                <SelectContent>
                  {printers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No printers found
                    </div>
                  ) : (
                    printers.map(printer => (
                      <SelectItem key={printer} value={printer}>
                        {printer}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Print Summary */}
          {isConnected && (
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span>Label Size:</span>
                <Badge variant="secondary">{labelDimensions.width}×{labelDimensions.height}mm</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Template:</span>
                <Badge variant="outline">{templateConfig ? 'Custom Design' : 'Default'}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Products:</span>
                <span className="font-medium">{items.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Labels:</span>
                <span className="font-medium">{totalLabels}</span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handlePrint}
            disabled={!isConnected || !selectedPrinter || isPrinting || items.length === 0}
          >
            {isPrinting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Printing...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Print {totalLabels} Labels
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
