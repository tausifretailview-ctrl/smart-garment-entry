import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Printer, RefreshCw, Download, Wifi, WifiOff, ExternalLink, FileText, Upload, Trash2, Plus, Eye, Settings2 } from 'lucide-react';
import { useQZTray } from '@/hooks/useQZTray';
import { 
  generateTSPLBatchFromTemplate, 
  generateTSPLBatch,
  TSPL_PRESETS, 
  LabelData, 
  TSPLLabelConfig,
  TSPLTemplateConfig
} from '@/utils/tsplGenerator';
import {
  PRNTemplate,
  SAMPLE_PRN_TEMPLATES,
  detectPlaceholders,
  generatePRNBatch,
  parsePRNFile,
  LabelDataForPRN,
} from '@/utils/prnTemplateParser';
import { toast } from 'sonner';
import { LabelFieldConfig, LabelDesignConfig } from '@/types/labelTypes';

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
  labelSize: string;
  labelConfig?: LabelDesignConfig;
  businessName?: string;
  prnTemplates?: PRNTemplate[];
  onSavePRNTemplate?: (template: PRNTemplate) => Promise<boolean>;
  onDeletePRNTemplate?: (name: string) => Promise<boolean>;
}

export const DirectPrintDialog = ({ 
  open, 
  onOpenChange, 
  items, 
  labelSize,
  labelConfig: templateConfig,
  businessName = '',
  prnTemplates = [],
  onSavePRNTemplate,
  onDeletePRNTemplate,
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
  const [printMode, setPrintMode] = useState<'template' | 'prn'>('template');
  const [selectedPRNTemplate, setSelectedPRNTemplate] = useState<string>('');
  const [customPRNContent, setCustomPRNContent] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Printer-specific settings (persisted per printer)
  interface PrinterConfig {
    dpi: number;
    speed: number;
    density: number;
    direction: 0 | 1;
    gapMode: 'gap' | 'continuous' | 'bline';
    topOffset: number; // mm - vertical offset to fix top clipping
    leftOffset: number; // mm - horizontal offset to fix right clipping
  }

  const defaultPrinterConfig: PrinterConfig = {
    dpi: 203,
    speed: 4,
    density: 8,
    direction: 1,
    gapMode: 'gap',
    topOffset: 2,
    leftOffset: 0,
  };

  // Auto-detect DPI from printer name
  const detectDPIFromPrinter = (printerName: string): number => {
    const name = printerName.toUpperCase();
    if (name.includes('D310') || name.includes('DA310') || name.includes('TDP-345')) return 300;
    if (name.includes('DA220') || name.includes('DA240') || name.includes('TE244') || name.includes('TDP-225') || name.includes('TTP-245')) return 203;
    return 203; // Default
  };

  const getPrinterConfigKey = (printer: string) => `qz_printer_config_${printer.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const loadPrinterConfig = (printer: string): PrinterConfig => {
    try {
      const saved = localStorage.getItem(getPrinterConfigKey(printer));
      if (saved) return { ...defaultPrinterConfig, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return { ...defaultPrinterConfig, dpi: detectDPIFromPrinter(printer) };
  };

  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(defaultPrinterConfig);

  // Load config when printer changes
  const handleSelectPrinter = (printer: string) => {
    selectPrinter(printer);
    const config = loadPrinterConfig(printer);
    setPrinterConfig(config);
  };

  const updatePrinterConfig = (updates: Partial<PrinterConfig>) => {
    const newConfig = { ...printerConfig, ...updates };
    setPrinterConfig(newConfig);
    if (selectedPrinter) {
      localStorage.setItem(getPrinterConfigKey(selectedPrinter), JSON.stringify(newConfig));
    }
  };

  // All available PRN templates (sample + saved)
  const allPRNTemplates = [...SAMPLE_PRN_TEMPLATES, ...prnTemplates];

  // Parse label size to get dimensions, merged with printer config
  const getLabelConfig = (): TSPLLabelConfig => {
    const customMatch = labelSize.match(/custom[_]?(\d+)x(\d+)/i);
    if (customMatch) {
      return {
        width: parseInt(customMatch[1]),
        height: parseInt(customMatch[2]),
        gap: printerConfig.gapMode === 'gap' ? 2 : 0,
        dpi: printerConfig.dpi,
        direction: printerConfig.direction,
        speed: printerConfig.speed,
        density: printerConfig.density,
        gapMode: printerConfig.gapMode,
        topOffset: printerConfig.topOffset,
        leftOffset: printerConfig.leftOffset,
      };
    }
    
    const match = labelSize.match(/(\d+)x(\d+)/);
    if (match) {
      return {
        width: parseInt(match[1]),
        height: parseInt(match[2]),
        gap: printerConfig.gapMode === 'gap' ? 2 : 0,
        dpi: printerConfig.dpi,
        direction: printerConfig.direction,
        speed: printerConfig.speed,
        density: printerConfig.density,
        gapMode: printerConfig.gapMode,
        topOffset: printerConfig.topOffset,
        leftOffset: printerConfig.leftOffset,
      };
    }
    return { 
      ...TSPL_PRESETS['50x25'], 
      dpi: printerConfig.dpi,
      direction: printerConfig.direction,
      speed: printerConfig.speed,
      density: printerConfig.density,
      gapMode: printerConfig.gapMode,
      topOffset: printerConfig.topOffset,
      leftOffset: printerConfig.leftOffset,
    };
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCustomPRNContent(content);
      
      const placeholders = detectPlaceholders(content);
      toast.success(`Template loaded with ${placeholders.length} placeholders: ${placeholders.join(', ')}`);
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectPRNTemplate = (templateName: string) => {
    setSelectedPRNTemplate(templateName);
    const template = allPRNTemplates.find(t => t.name === templateName);
    if (template) {
      setCustomPRNContent(template.content);
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!customPRNContent.trim()) {
      toast.error('Template content is empty');
      return;
    }

    const template: PRNTemplate = {
      name: newTemplateName.trim(),
      content: customPRNContent,
      placeholders: detectPlaceholders(customPRNContent),
    };

    if (onSavePRNTemplate) {
      const success = await onSavePRNTemplate(template);
      if (success) {
        toast.success('Template saved successfully');
        setNewTemplateName('');
        setShowAddTemplate(false);
      }
    } else {
      toast.error('Save function not available');
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    if (onDeletePRNTemplate) {
      const success = await onDeletePRNTemplate(name);
      if (success) {
        toast.success('Template deleted');
        if (selectedPRNTemplate === name) {
          setSelectedPRNTemplate('');
          setCustomPRNContent('');
        }
      }
    }
  };

  const handlePreview = () => {
    if (!customPRNContent) {
      toast.error('No template content to preview');
      return;
    }
    
    // Preview with first item
    if (items.length > 0) {
      const firstItem = items[0];
      const data: LabelDataForPRN = {
        productName: firstItem.productName,
        brand: firstItem.brand,
        size: firstItem.size,
        color: firstItem.color,
        mrp: firstItem.mrp,
        salePrice: firstItem.salePrice,
        barcode: firstItem.barcode,
        billNumber: firstItem.billNumber,
        purchaseCode: firstItem.purchaseCode,
        supplierCode: firstItem.supplierCode,
        style: firstItem.style,
      };
      
      // Simple placeholder replacement for preview
      let preview = customPRNContent;
      preview = preview.replace(/\{BRAND\}/gi, data.brand || '[BRAND]');
      preview = preview.replace(/\{PRODUCT\}/gi, data.productName || '[PRODUCT]');
      preview = preview.replace(/\{PRODUCTNAME\}/gi, data.productName || '[PRODUCT]');
      preview = preview.replace(/\{SIZE\}/gi, data.size || '[SIZE]');
      preview = preview.replace(/\{COLOR\}/gi, data.color || '[COLOR]');
      preview = preview.replace(/\{STYLE\}/gi, data.style || '[STYLE]');
      preview = preview.replace(/\{MRP\}/gi, data.mrp ? `₹${data.mrp}` : '[MRP]');
      preview = preview.replace(/\{PRICE\}/gi, data.salePrice ? `₹${data.salePrice}` : '[PRICE]');
      preview = preview.replace(/\{SALEPRICE\}/gi, data.salePrice ? `₹${data.salePrice}` : '[PRICE]');
      preview = preview.replace(/\{BARCODE\}/gi, data.barcode || '[BARCODE]');
      preview = preview.replace(/\{BILLNO\}/gi, data.billNumber || '[BILLNO]');
      preview = preview.replace(/\{BILLNUMBER\}/gi, data.billNumber || '[BILLNO]');
      preview = preview.replace(/\{PURCHASECODE\}/gi, data.purchaseCode || '[PURCHASECODE]');
      preview = preview.replace(/\{SUPPLIERCODE\}/gi, data.supplierCode || '[SUPPLIERCODE]');
      
      setPreviewContent(preview);
      toast.success('Preview generated with first item data');
    } else {
      setPreviewContent(customPRNContent);
    }
  };

  const handlePrint = async () => {
    if (!selectedPrinter) {
      toast.error('Please select a printer');
      return;
    }

    setIsPrinting(true);

    try {
      let commandsToSend: string;

      if (printMode === 'prn') {
        // PRN Template Mode
        if (!customPRNContent.trim()) {
          toast.error('No PRN template content. Select a template or upload a file.');
          setIsPrinting(false);
          return;
        }

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
          } as LabelDataForPRN,
          quantity: item.quantity,
        }));

        commandsToSend = generatePRNBatch(customPRNContent, labelItems);
      } else {
        // Template Mode (existing logic)
        const labelDimensions = getLabelConfig();
        
        const labelItems = items.map(item => ({
          data: {
            productName: item.productName,
            brand: item.brand,
            businessName: businessName,
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

        if (templateConfig) {
          const tsplTemplate: TSPLTemplateConfig = {
            brand: templateConfig.brand,
            businessName: templateConfig.businessName,
            productName: templateConfig.productName,
            color: templateConfig.color,
            style: templateConfig.style,
            size: templateConfig.size,
            price: templateConfig.price,
            mrp: templateConfig.mrp,
            barcode: templateConfig.barcode,
            barcodeText: templateConfig.barcodeText,
            billNumber: templateConfig.billNumber,
            supplierCode: templateConfig.supplierCode,
            purchaseCode: templateConfig.purchaseCode,
            fieldOrder: templateConfig.fieldOrder as string[],
            barcodeHeight: templateConfig.barcodeHeight,
            barcodeWidth: templateConfig.barcodeWidth,
          };
          
          commandsToSend = generateTSPLBatchFromTemplate(labelDimensions, tsplTemplate, labelItems);
        } else {
          commandsToSend = generateTSPLBatch(labelDimensions, labelItems);
        }
      }
      
      const success = await printRaw(commandsToSend);
      
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
  const detectedPlaceholders = detectPlaceholders(customPRNContent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Direct Thermal Print
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
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
                QZ Tray enables direct printing to thermal printers without browser dialogs.
              </p>
              <Button 
                size="sm" 
                variant="link" 
                className="p-0 h-auto text-amber-800 dark:text-amber-200"
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
                <Button size="sm" variant="ghost" onClick={handleRefreshPrinters}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              
              <Select value={selectedPrinter || ''} onValueChange={handleSelectPrinter}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a printer..." />
                </SelectTrigger>
                <SelectContent>
                  {printers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No printers found</div>
                  ) : (
                    printers.map(printer => (
                      <SelectItem key={printer} value={printer}>{printer}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Printer Settings (per-printer config) */}
          {isConnected && selectedPrinter && (
            <div className="space-y-2">
              <button
                onClick={() => setShowPrinterSettings(!showPrinterSettings)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings2 className="h-4 w-4" />
                Printer Settings
                <Badge variant="secondary" className="text-xs">{printerConfig.dpi} DPI</Badge>
              </button>
              
              {showPrinterSettings && (
                <div className="p-3 bg-muted rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* DPI */}
                    <div className="space-y-1">
                      <Label className="text-xs">Printer DPI</Label>
                      <Select value={String(printerConfig.dpi)} onValueChange={(v) => updatePrinterConfig({ dpi: parseInt(v) })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="203">203 DPI (TE244, DA240)</SelectItem>
                          <SelectItem value="300">300 DPI (D310, DA310)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Direction */}
                    <div className="space-y-1">
                      <Label className="text-xs">Direction</Label>
                      <Select value={String(printerConfig.direction)} onValueChange={(v) => updatePrinterConfig({ direction: parseInt(v) as 0 | 1 })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Direction 0</SelectItem>
                          <SelectItem value="1">Direction 1</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Gap Mode */}
                    <div className="space-y-1">
                      <Label className="text-xs">Gap Mode</Label>
                      <Select value={printerConfig.gapMode} onValueChange={(v) => updatePrinterConfig({ gapMode: v as 'gap' | 'continuous' | 'bline' })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gap">Gap (Die-cut)</SelectItem>
                          <SelectItem value="continuous">Continuous</SelectItem>
                          <SelectItem value="bline">Black Mark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Speed */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-xs">Speed</Label>
                      <span className="text-xs text-muted-foreground">{printerConfig.speed}</span>
                    </div>
                    <Slider
                      value={[printerConfig.speed]}
                      onValueChange={([v]) => updatePrinterConfig({ speed: v })}
                      min={1}
                      max={6}
                      step={1}
                      className="py-1"
                    />
                  </div>
                  
                  {/* Density */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-xs">Density (Darkness)</Label>
                      <span className="text-xs text-muted-foreground">{printerConfig.density}</span>
                    </div>
                    <Slider
                      value={[printerConfig.density]}
                      onValueChange={([v]) => updatePrinterConfig({ density: v })}
                      min={1}
                      max={15}
                      step={1}
                      className="py-1"
                    />
                  </div>
                  
                  {/* Top Offset */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-xs">Top Offset (mm)</Label>
                      <span className="text-xs text-muted-foreground">{printerConfig.topOffset}mm</span>
                    </div>
                    <Slider
                      value={[printerConfig.topOffset]}
                      onValueChange={([v]) => updatePrinterConfig({ topOffset: v })}
                      min={-5}
                      max={10}
                      step={0.5}
                      className="py-1"
                    />
                  </div>
                  
                  {/* Left Offset */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label className="text-xs">Left Offset (mm)</Label>
                      <span className="text-xs text-muted-foreground">{printerConfig.leftOffset}mm</span>
                    </div>
                    <Slider
                      value={[printerConfig.leftOffset]}
                      onValueChange={([v]) => updatePrinterConfig({ leftOffset: v })}
                      min={-5}
                      max={10}
                      step={0.5}
                      className="py-1"
                    />
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    Settings saved per printer. Adjust Top/Left Offset if labels shift on print.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Print Mode Tabs */}
          {isConnected && (
            <Tabs value={printMode} onValueChange={(v) => setPrintMode(v as 'template' | 'prn')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="template">Template Mode</TabsTrigger>
                <TabsTrigger value="prn">PRN File Mode</TabsTrigger>
              </TabsList>

              <TabsContent value="template" className="space-y-3 mt-3">
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
                <p className="text-xs text-muted-foreground">
                  Uses the Interactive Label Designer template to generate TSPL commands.
                </p>
              </TabsContent>

              <TabsContent value="prn" className="space-y-3 mt-3">
                {/* PRN Template Selection */}
                <div className="space-y-2">
                  <Label>Select PRN Template</Label>
                  <div className="flex gap-2">
                    <Select value={selectedPRNTemplate} onValueChange={handleSelectPRNTemplate}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Choose a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Sample Templates</div>
                        {SAMPLE_PRN_TEMPLATES.map(template => (
                          <SelectItem key={template.name} value={template.name}>
                            <div className="flex flex-col">
                              <span>{template.name}</span>
                              <span className="text-xs text-muted-foreground">{template.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                        {prnTemplates.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium mt-2">Saved Templates</div>
                            {prnTemplates.map(template => (
                              <SelectItem key={template.name} value={template.name}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".prn,.bas,.txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload PRN file"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Template Content Editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Template Content (TSPL/PRN)</Label>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={handlePreview}>
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowAddTemplate(!showAddTemplate)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Save As
                      </Button>
                    </div>
                  </div>
                  
                  <Textarea
                    value={customPRNContent}
                    onChange={(e) => setCustomPRNContent(e.target.value)}
                    placeholder={`Paste your PRN/TSPL template here or select from above...

Example:
SIZE 50 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 4,2,"2",0,1,1,"{BRAND}"
TEXT 4,18,"1",0,1,1,"{PRODUCT}"
BARCODE 30,48,"128",40,0,0,2,2,"{BARCODE}"
PRINT 1,1`}
                    className="font-mono text-xs h-32"
                  />
                </div>

                {/* Detected Placeholders */}
                {detectedPlaceholders.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">Placeholders:</span>
                    {detectedPlaceholders.map(p => (
                      <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                )}

                {/* Save Template Form */}
                {showAddTemplate && (
                  <div className="flex gap-2 p-2 bg-muted rounded-lg">
                    <Input
                      placeholder="Template name..."
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleSaveTemplate}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddTemplate(false)}>Cancel</Button>
                  </div>
                )}

                {/* Preview Output */}
                {previewContent && (
                  <div className="space-y-2">
                    <Label className="text-xs">Preview (First Label)</Label>
                    <ScrollArea className="h-24 border rounded-md p-2 bg-background">
                      <pre className="text-xs font-mono whitespace-pre-wrap">{previewContent}</pre>
                    </ScrollArea>
                  </div>
                )}

                {/* Summary */}
                <div className="p-3 bg-muted rounded-lg space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Mode:</span>
                    <Badge variant="outline">PRN File</Badge>
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

                <p className="text-xs text-muted-foreground">
                  PRN mode sends exact template commands with placeholders replaced by product data. 
                  Design in BarTender/TSC software for pixel-perfect alignment.
                </p>
              </TabsContent>
            </Tabs>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
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
