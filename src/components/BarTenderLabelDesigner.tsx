import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Eye, ZoomIn, ZoomOut, AlignLeft, AlignCenter, AlignRight, 
  Bold, Type, Maximize2, Move, Save, Trash2, FolderOpen,
  LayoutGrid, Printer, Rows
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { toast } from "sonner";
import { LabelFieldConfig, LabelDesignConfig, LabelItem, LabelTemplate, FieldKey } from "@/types/labelTypes";

interface BarTenderLabelDesignerProps {
  labelConfig: LabelDesignConfig;
  setLabelConfig: React.Dispatch<React.SetStateAction<LabelDesignConfig>>;
  businessName: string;
  sampleItem?: LabelItem | null;
  labelWidth: number;
  labelHeight: number;
  columns?: number;
  savedTemplates?: LabelTemplate[];
  onSaveTemplate?: (template: LabelTemplate) => Promise<boolean>;
  onDeleteTemplate?: (templateName: string) => Promise<boolean>;
}

const fieldLabels: Record<FieldKey, string> = {
  brand: 'Brand Name',
  productName: 'Product Name',
  color: 'Color',
  style: 'Style',
  size: 'Size',
  price: 'Sale Price',
  mrp: 'MRP',
  customText: 'Custom Text',
  barcode: 'Barcode',
  barcodeText: 'Barcode Number',
  billNumber: 'Bill Number',
  supplierCode: 'Supplier Code',
  purchaseCode: 'Purchase Code',
};

// Draggable Field Component for Canvas
interface DraggableFieldProps {
  fieldKey: FieldKey;
  field: LabelFieldConfig;
  isSelected: boolean;
  content: string;
  labelConfig: LabelDesignConfig;
  onSelect: () => void;
  onDrag: (deltaX: number, deltaY: number) => void;
  onDragEnd: () => void;
  scale: number;
  labelWidthMm: number;
  labelHeightMm: number;
}

function DraggableField({ 
  fieldKey, 
  field, 
  isSelected, 
  content, 
  labelConfig, 
  onSelect,
  onDrag,
  onDragEnd,
  scale,
  labelWidthMm,
  labelHeightMm
}: DraggableFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaX = (e.clientX - dragRef.current.startX) / scale;
      const deltaY = (e.clientY - dragRef.current.startY) / scale;
      dragRef.current = { startX: e.clientX, startY: e.clientY };
      onDrag(deltaX, deltaY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      onDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onDrag, onDragEnd, scale]);

  // Scale font size properly - use a more conservative scaling
  const scaledFontSize = Math.max(6, Math.min(field.fontSize * (scale * 0.28), 24));
  const xPx = (field.x ?? 0) * scale;
  const yPx = (field.y ?? 0) * scale;
  const widthPx = ((field.width ?? 100) / 100) * labelWidthMm * scale;
  const heightPx = field.height ? field.height * scale : undefined;

  const selectionStyle = isSelected 
    ? 'border-2 border-dashed border-blue-500 bg-blue-100/40' 
    : 'border border-transparent hover:border-blue-300 hover:bg-blue-50/30';

  if (fieldKey === 'barcode') {
    return (
      <div
        className={`absolute cursor-move transition-colors ${selectionStyle} ${isDragging ? 'opacity-70' : ''}`}
        style={{
          left: `${xPx}px`,
          top: `${yPx}px`,
          width: `${widthPx}px`,
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center',
            padding: '1px',
          }}
        >
          <svg 
            className={`bartender-barcode-${fieldKey}`} 
            style={{ 
              height: `${(labelConfig.barcodeHeight || 20) * scale * 0.35}px`, 
              width: 'auto',
              maxWidth: '100%'
            }} 
          />
        </div>
        {isSelected && (
          <>
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`absolute cursor-move transition-colors ${selectionStyle} ${isDragging ? 'opacity-70' : ''}`}
      style={{
        left: `${xPx}px`,
        top: `${yPx}px`,
        width: `${widthPx}px`,
        height: heightPx ? `${heightPx}px` : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div
        style={{
          fontSize: `${scaledFontSize}px`,
          fontWeight: field.bold ? 'bold' : 'normal',
          textAlign: field.textAlign || 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: field.lineHeight || 1.1,
          padding: '0px 1px',
        }}
      >
        {content}
      </div>
      {isSelected && (
        <>
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 border border-white rounded-sm" />
        </>
      )}
    </div>
  );
}

// Field List Item Component (simplified, no drag)
interface FieldListItemProps {
  fieldKey: FieldKey;
  field: LabelFieldConfig;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: (show: boolean) => void;
}

function FieldListItem({ fieldKey, field, isSelected, onSelect, onToggle }: FieldListItemProps) {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded border transition-all cursor-pointer ${
        isSelected 
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
          : 'border-border hover:border-blue-300 hover:bg-muted/50'
      }`}
      onClick={onSelect}
    >
      <Checkbox
        checked={field.show}
        onCheckedChange={(checked) => {
          onToggle(checked === true);
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <span className={`text-sm flex-1 ${!field.show ? 'text-muted-foreground line-through' : ''}`}>
        {fieldLabels[fieldKey]}
      </span>
      {field.bold && <Bold className="h-3 w-3 text-muted-foreground" />}
      <span className="text-xs text-muted-foreground">{field.width}%</span>
    </div>
  );
}

export function BarTenderLabelDesigner({ 
  labelConfig, 
  setLabelConfig, 
  businessName, 
  sampleItem,
  labelWidth,
  labelHeight,
  columns = 1,
  savedTemplates = [],
  onSaveTemplate,
  onDeleteTemplate,
}: BarTenderLabelDesignerProps) {
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);
  const [zoom, setZoom] = useState(150);
  const previewRef = useRef<HTMLDivElement>(null);
  const barcodeValue = sampleItem?.barcode || '12345678';
  
  // Track previous label dimensions for auto-scaling
  const prevDimensionsRef = useRef<{ width: number; height: number }>({ width: labelWidth, height: labelHeight });
  
  // Template management state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Calculate scale factor for proper mm to px conversion
  const basePxPerMm = 3.78;
  const scale = (zoom / 100) * basePxPerMm;
  
  const labelWidthPx = labelWidth * scale;
  const labelHeightPx = labelHeight * scale;

  // Auto-scale positions when label dimensions change
  useEffect(() => {
    const prevWidth = prevDimensionsRef.current.width;
    const prevHeight = prevDimensionsRef.current.height;
    
    // Only scale if dimensions actually changed (not on first render with same values)
    if (prevWidth !== labelWidth || prevHeight !== labelHeight) {
      const scaleX = labelWidth / prevWidth;
      const scaleY = labelHeight / prevHeight;
      
      // Don't scale if ratio is too extreme (likely first init or template load)
      const isReasonableScale = scaleX > 0.3 && scaleX < 3 && scaleY > 0.3 && scaleY < 3;
      
      if (isReasonableScale && (scaleX !== 1 || scaleY !== 1)) {
        console.log(`Auto-scaling positions: ${prevWidth}x${prevHeight} -> ${labelWidth}x${labelHeight}`);
        
        const updates: Partial<LabelDesignConfig> = {};
        
        labelConfig.fieldOrder.forEach((fieldKey) => {
          const field = labelConfig[fieldKey] as LabelFieldConfig;
          if (field.x !== undefined && field.y !== undefined) {
            // Scale positions proportionally and clamp within bounds
            const newX = Math.max(0, Math.min((field.x || 0) * scaleX, labelWidth - 5));
            const newY = Math.max(0, Math.min((field.y || 0) * scaleY, labelHeight - 3));
            
            updates[fieldKey] = {
              ...field,
              x: newX,
              y: newY,
            } as LabelFieldConfig;
          }
        });
        
        if (Object.keys(updates).length > 0) {
          setLabelConfig(prev => ({ ...prev, ...updates }));
        }
      }
      
      // Update ref to current dimensions
      prevDimensionsRef.current = { width: labelWidth, height: labelHeight };
    }
  }, [labelWidth, labelHeight]);

  // Initialize field positions if not set
  useEffect(() => {
    const initializePositions = () => {
      let needsUpdate = false;
      const updates: Partial<LabelDesignConfig> = {};
      
      // Default layout - arrange fields vertically, scaling positions based on label height
      // For small labels (25mm), compress the layout; for larger labels, spread out more
      const isSmallLabel = labelHeight <= 30;
      const yScale = isSmallLabel ? labelHeight / 40 : 1; // Scale factor for small labels
      
      const defaultPositions: Partial<Record<FieldKey, { x: number; y: number; width: number }>> = {
        brand: { x: 0, y: 0, width: 100 },
        productName: { x: 0, y: Math.min(4 * yScale, labelHeight - 3), width: 100 },
        size: { x: 0, y: Math.min(7 * yScale, labelHeight - 3), width: 50 },
        color: { x: labelWidth / 2, y: Math.min(7 * yScale, labelHeight - 3), width: 50 },
        style: { x: 0, y: Math.min(10 * yScale, labelHeight - 3), width: 50 },
        price: { x: labelWidth / 2, y: Math.min(10 * yScale, labelHeight - 3), width: 50 },
        mrp: { x: 0, y: Math.min(13 * yScale, labelHeight - 3), width: 50 },
        customText: { x: labelWidth / 2, y: Math.min(13 * yScale, labelHeight - 3), width: 50 },
        barcode: { x: 0, y: Math.min(16 * yScale, labelHeight - 10), width: 100 },
        barcodeText: { x: 0, y: Math.min(22 * yScale, labelHeight - 3), width: 100 },
        billNumber: { x: 0, y: Math.min(25 * yScale, labelHeight - 2), width: 50 },
        supplierCode: { x: labelWidth / 2, y: Math.min(25 * yScale, labelHeight - 2), width: 50 },
        purchaseCode: { x: 0, y: Math.min(28 * yScale, labelHeight - 2), width: 100 },
      };

      labelConfig.fieldOrder.forEach((fieldKey) => {
        const field = labelConfig[fieldKey] as LabelFieldConfig;
        const defaultPos = defaultPositions[fieldKey];
        
        // Initialize if positions are undefined
        if (field.x === undefined || field.y === undefined || field.width === undefined) {
          needsUpdate = true;
          updates[fieldKey] = {
            ...field,
            x: defaultPos?.x ?? 0,
            y: defaultPos?.y ?? 0,
            width: defaultPos?.width ?? 100,
          } as LabelFieldConfig;
        } 
        // Also clamp existing positions that are out of bounds
        else if (field.y !== undefined && field.y > labelHeight - 2) {
          needsUpdate = true;
          // Recalculate position using scaled defaults for small labels
          updates[fieldKey] = {
            ...field,
            y: defaultPos?.y ?? Math.min(field.y, labelHeight - 3),
          } as LabelFieldConfig;
        }
      });

      if (needsUpdate) {
        setLabelConfig(prev => ({ ...prev, ...updates }));
      }
    };

    initializePositions();
  }, [labelConfig.fieldOrder]);

  // Render barcodes
  useEffect(() => {
    if (!previewRef.current) return;
    const svgs = previewRef.current.querySelectorAll('[class^="bartender-barcode-"]');
    svgs.forEach((svg) => {
      try {
        JsBarcode(svg, barcodeValue, {
          format: 'CODE128',
          width: (labelConfig.barcodeWidth || 1.5) * (zoom / 100),
          height: (labelConfig.barcodeHeight || 25) * (zoom / 100),
          displayValue: false,
          margin: 0
        });
      } catch (e) {
        console.log('Preview barcode error:', e);
      }
    });
  }, [labelConfig, barcodeValue, zoom]);

  // Keyboard controls
  useEffect(() => {
    if (!selectedField) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const field = labelConfig[selectedField] as LabelFieldConfig;
      const step = e.shiftKey ? 2 : 0.5; // mm

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], y: Math.max(0, field.y - step) }
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], y: Math.min(labelHeight - 3, field.y + step) }
          }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], x: Math.max(0, field.x - step) }
          }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], x: Math.min(labelWidth - 5, field.x + step) }
          }));
          break;
        case 'Escape':
          e.preventDefault();
          setSelectedField(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedField, labelConfig, setLabelConfig, labelWidth, labelHeight]);

  const getFieldContent = useCallback((fieldKey: FieldKey) => {
    if (sampleItem) {
      switch (fieldKey) {
        case 'brand': return sampleItem.brand || businessName || 'Brand';
        case 'productName': return sampleItem.product_name;
        case 'color': return sampleItem.color || '';
        case 'style': return sampleItem.style || '';
        case 'price': return `₹${sampleItem.sale_price}`;
        case 'mrp': return sampleItem.mrp ? `MRP ₹${sampleItem.mrp}` : '';
        case 'customText': return labelConfig.customTextValue || '';
        case 'barcodeText': return sampleItem.barcode || '';
        case 'billNumber': return sampleItem.bill_number || '';
        case 'supplierCode': return sampleItem.supplier_code || '';
        case 'purchaseCode': return sampleItem.purchase_code || '';
        case 'size': return sampleItem.size || '';
        default: return '';
      }
    }
    switch (fieldKey) {
      case 'brand': return businessName || 'BRAND';
      case 'productName': return 'Product Name';
      case 'color': return 'Blue';
      case 'style': return 'ST-001';
      case 'price': return '₹999';
      case 'mrp': return 'MRP ₹1299';
      case 'customText': return labelConfig.customTextValue || 'Custom Text';
      case 'barcodeText': return '12345678';
      case 'billNumber': return 'B0125001';
      case 'supplierCode': return 'SUP01';
      case 'purchaseCode': return 'PC123';
      case 'size': return 'M';
      default: return '';
    }
  }, [sampleItem, businessName]);

  const selectedFieldConfig = selectedField ? (labelConfig[selectedField] as LabelFieldConfig) : null;

  const handleFieldToggle = (fieldKey: FieldKey, show: boolean) => {
    setLabelConfig(prev => ({
      ...prev,
      [fieldKey]: { ...prev[fieldKey], show }
    }));
  };

  const handleFieldDrag = (fieldKey: FieldKey, deltaXPx: number, deltaYPx: number) => {
    // Convert px delta to mm
    const deltaXMm = deltaXPx / basePxPerMm;
    const deltaYMm = deltaYPx / basePxPerMm;
    
    setLabelConfig(prev => {
      const field = prev[fieldKey] as LabelFieldConfig;
      const newX = Math.max(0, Math.min(labelWidth - 5, (field.x || 0) + deltaXMm));
      const newY = Math.max(0, Math.min(labelHeight - 3, (field.y || 0) + deltaYMm));
      return {
        ...prev,
        [fieldKey]: { ...field, x: newX, y: newY }
      };
    });
  };

  const updateFieldProperty = <K extends keyof LabelFieldConfig>(property: K, value: LabelFieldConfig[K]) => {
    if (!selectedField) return;
    setLabelConfig(prev => ({
      ...prev,
      [selectedField]: { ...prev[selectedField], [property]: value }
    }));
  };

  // Quick layout presets
  const applyLayoutPreset = (preset: 'full-width' | 'side-by-side' | 'left' | 'right') => {
    if (!selectedField) return;
    const field = labelConfig[selectedField] as LabelFieldConfig;
    
    switch (preset) {
      case 'full-width':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...field, x: 0, width: 100 }
        }));
        break;
      case 'side-by-side':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...field, width: 50 }
        }));
        break;
      case 'left':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...field, x: 0, width: 50 }
        }));
        break;
      case 'right':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...field, x: labelWidth / 2, width: 50 }
        }));
        break;
    }
  };

  // Template management handlers
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    if (!onSaveTemplate) return;
    
    setIsSaving(true);
    const success = await onSaveTemplate({
      name: templateName.trim(),
      config: labelConfig,
      labelWidth,  // Save current dimensions with template
      labelHeight,
    });
    setIsSaving(false);
    
    if (success) {
      toast.success(`Template "${templateName}" saved`);
      setSaveDialogOpen(false);
      setTemplateName("");
    }
  };

  const handleLoadTemplate = (template: LabelTemplate) => {
    // If template has stored dimensions and they differ from current, scale positions
    const templateWidth = template.labelWidth || labelWidth;
    const templateHeight = template.labelHeight || labelHeight;
    
    if (templateWidth !== labelWidth || templateHeight !== labelHeight) {
      const scaleX = labelWidth / templateWidth;
      const scaleY = labelHeight / templateHeight;
      
      console.log(`Scaling template from ${templateWidth}x${templateHeight} to ${labelWidth}x${labelHeight}`);
      
      // Scale all field positions
      const scaledConfig = { ...template.config };
      template.config.fieldOrder.forEach((fieldKey) => {
        const field = template.config[fieldKey] as LabelFieldConfig;
        if (field && field.x !== undefined && field.y !== undefined) {
          (scaledConfig[fieldKey] as LabelFieldConfig) = {
            ...field,
            x: Math.max(0, Math.min((field.x || 0) * scaleX, labelWidth - 5)),
            y: Math.max(0, Math.min((field.y || 0) * scaleY, labelHeight - 3)),
          };
        }
      });
      
      setLabelConfig(scaledConfig);
      toast.success(`Template "${template.name}" loaded and scaled to ${labelWidth}x${labelHeight}mm`);
    } else {
      setLabelConfig(template.config);
      toast.success(`Template "${template.name}" loaded`);
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    if (!onDeleteTemplate) return;
    const success = await onDeleteTemplate(name);
    if (success) {
      toast.success(`Template "${name}" deleted`);
    }
  };

  // Render single label content with absolute positioned fields
  const renderLabelContent = () => (
    <div className="relative w-full h-full">
      {labelConfig.fieldOrder.map((fieldKey) => {
        const field = labelConfig[fieldKey] as LabelFieldConfig;
        if (!field.show) return null;
        return (
          <DraggableField
            key={fieldKey}
            fieldKey={fieldKey}
            field={field}
            isSelected={selectedField === fieldKey}
            content={getFieldContent(fieldKey)}
            labelConfig={labelConfig}
            onSelect={() => setSelectedField(fieldKey)}
            onDrag={(dx, dy) => handleFieldDrag(fieldKey, dx, dy)}
            onDragEnd={() => {}}
            scale={scale}
            labelWidthMm={labelWidth}
            labelHeightMm={labelHeight}
          />
        );
      })}
    </div>
  );

  return (
    <>
    {/* Save Template Dialog */}
    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Label Template</DialogTitle>
          <DialogDescription>
            Save your current label design for quick reuse later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              placeholder="e.g., Thermal Classic, Price Tag..."
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveTemplate} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Template Toolbar */}
      <div className="lg:col-span-12 flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Templates:</span>
        </div>
        
        {savedTemplates.length > 0 ? (
          <Select onValueChange={(value) => {
            const template = savedTemplates.find(t => t.name === value);
            if (template) handleLoadTemplate(template);
          }}>
            <SelectTrigger className="w-48 h-8">
              <SelectValue placeholder="Load a template..." />
            </SelectTrigger>
            <SelectContent>
              {savedTemplates.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">No saved templates</span>
        )}

        <div className="flex-1" />

        {onSaveTemplate && (
          <Button size="sm" variant="outline" onClick={() => setSaveDialogOpen(true)}>
            <Save className="h-4 w-4 mr-2" />
            Save Current
          </Button>
        )}

        {savedTemplates.length > 0 && onDeleteTemplate && (
          <Select onValueChange={handleDeleteTemplate}>
            <SelectTrigger className="w-32 h-8 text-destructive border-destructive/30">
              <SelectValue placeholder="Delete..." />
            </SelectTrigger>
            <SelectContent>
              {savedTemplates.map((template) => (
                <SelectItem key={template.name} value={template.name} className="text-destructive">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-3 w-3" />
                    {template.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Left Panel - Field List */}
      <Card className="lg:col-span-3 p-4">
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Label Fields</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Drag fields on canvas • Click to edit
        </p>
        
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {labelConfig.fieldOrder.map((fieldKey) => {
            const field = labelConfig[fieldKey] as LabelFieldConfig;
            return (
              <FieldListItem
                key={fieldKey}
                fieldKey={fieldKey}
                field={field}
                isSelected={selectedField === fieldKey}
                onSelect={() => setSelectedField(fieldKey)}
                onToggle={(show) => handleFieldToggle(fieldKey, show)}
              />
            );
          })}
        </div>
      </Card>

      {/* Center Panel - Live Preview Canvas */}
      <Card className="lg:col-span-5 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Live Preview</h3>
          </div>
          <div className="flex items-center gap-2 text-xs bg-muted px-2 py-1 rounded">
            <Maximize2 className="h-3 w-3" />
            <span>{labelWidth}×{labelHeight}mm</span>
            {columns > 1 && <span className="text-primary font-medium">({columns}UP)</span>}
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center justify-center gap-3 mb-4 p-2 bg-muted/50 rounded">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(Math.max(50, zoom - 25))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-[120px]">
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={50}
              max={300}
              step={10}
              className="w-20"
            />
            <span className="text-xs font-medium w-12 text-center">{zoom}%</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(Math.min(300, zoom + 25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Label Preview Container - Canvas style */}
        <div 
          className="flex justify-center items-start overflow-auto p-4 bg-gray-100 rounded min-h-[350px]"
          style={{ 
            backgroundImage: 'linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)',
            backgroundSize: '10px 10px',
            backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
          }}
          onClick={() => setSelectedField(null)}
        >
          <div className="flex gap-2" ref={previewRef}>
            {Array.from({ length: columns }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border-2 border-gray-400 shadow-lg relative overflow-hidden"
                style={{
                  width: `${labelWidthPx}px`,
                  height: `${labelHeightPx}px`,
                  fontFamily: 'Arial, sans-serif',
                }}
              >
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-blue-500 z-20" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-blue-500 z-20" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-blue-500 z-20" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-blue-500 z-20" />
                
                {/* Grid lines for reference */}
                <div 
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, #ccc 1px, transparent 1px),
                      linear-gradient(to bottom, #ccc 1px, transparent 1px)
                    `,
                    backgroundSize: `${5 * scale}px ${5 * scale}px`
                  }}
                />
                
                {renderLabelContent()}
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="mt-3 text-center">
          <p className="text-xs text-muted-foreground">
            {selectedField 
              ? <span className="font-medium text-blue-600">Editing: {fieldLabels[selectedField]} • Drag to move</span>
              : 'Click a field to select • Drag to reposition'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Arrow keys: move • Shift+Arrow: move faster • ESC: deselect
          </p>
        </div>
      </Card>

      {/* Right Panel - Field Properties */}
      <Card className="lg:col-span-4 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Type className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Field Properties</h3>
        </div>

        {selectedField && selectedFieldConfig ? (
          <div className="space-y-4">
            {/* Field Header */}
            <div className="p-3 bg-blue-50 rounded border border-blue-200">
              <p className="font-medium text-sm text-blue-900">{fieldLabels[selectedField]}</p>
              <p className="text-xs text-blue-600">Drag on canvas or use arrows</p>
            </div>

            {/* Visibility */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="field-show"
                checked={selectedFieldConfig.show}
                onCheckedChange={(checked) => updateFieldProperty('show', checked === true)}
              />
              <Label htmlFor="field-show" className="cursor-pointer text-sm">Show on label</Label>
            </div>

            <Separator />

            {/* Layout Presets */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Quick Layout</Label>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyLayoutPreset('full-width')}>
                  <Rows className="h-3 w-3 mr-1" /> Full Width
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyLayoutPreset('left')}>
                  <AlignLeft className="h-3 w-3 mr-1" /> Left Half
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyLayoutPreset('right')}>
                  <AlignRight className="h-3 w-3 mr-1" /> Right Half
                </Button>
              </div>
            </div>

            <Separator />

            {/* Position Controls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Move className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs font-medium">Position (mm)</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">X (Left)</Label>
                  <Input
                    type="number"
                    min="0"
                    max={labelWidth}
                    step="0.5"
                    value={(selectedFieldConfig.x ?? 0).toFixed(1)}
                    onChange={(e) => updateFieldProperty('x', parseFloat(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Y (Top)</Label>
                  <Input
                    type="number"
                    min="0"
                    max={labelHeight}
                    step="0.5"
                    value={(selectedFieldConfig.y ?? 0).toFixed(1)}
                    onChange={(e) => updateFieldProperty('y', parseFloat(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
              </div>
            </div>

            {/* Width & Height Controls */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Width (%)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[selectedFieldConfig.width ?? 100]}
                    onValueChange={([value]) => updateFieldProperty('width', value)}
                    min={20}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-xs w-8">{selectedFieldConfig.width ?? 100}%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Height (mm)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    step="0.5"
                    value={selectedFieldConfig.height ?? ''}
                    onChange={(e) => updateFieldProperty('height', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Auto"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {selectedField !== 'barcode' ? (
              <>
                {/* Custom Text Value Input - only for customText field */}
                {selectedField === 'customText' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Custom Text Value</Label>
                    <Input
                      type="text"
                      value={labelConfig.customTextValue || ''}
                      onChange={(e) => setLabelConfig(prev => ({ ...prev, customTextValue: e.target.value }))}
                      placeholder="Enter custom text..."
                      className="h-8"
                    />
                  </div>
                )}

                {/* Font Size */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Font Size</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[selectedFieldConfig.fontSize]}
                      onValueChange={([value]) => updateFieldProperty('fontSize', value)}
                      min={6}
                      max={24}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-8 text-center">{selectedFieldConfig.fontSize}</span>
                  </div>
                </div>

                {/* Bold & Alignment Row */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.bold ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('bold', !selectedFieldConfig.bold)}
                      className="h-8 w-8 p-0"
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">Bold</span>
                  </div>
                  
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.textAlign === 'left' ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('textAlign', 'left')}
                      className="h-8 w-8 p-0"
                    >
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.textAlign === 'center' || !selectedFieldConfig.textAlign ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('textAlign', 'center')}
                      className="h-8 w-8 p-0"
                    >
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.textAlign === 'right' ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('textAlign', 'right')}
                      className="h-8 w-8 p-0"
                    >
                      <AlignRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Barcode Size Controls */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Barcode Height</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[labelConfig.barcodeHeight || 25]}
                      onValueChange={([value]) => setLabelConfig(prev => ({ ...prev, barcodeHeight: value }))}
                      min={15}
                      max={60}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-8 text-center">{labelConfig.barcodeHeight || 25}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Barcode Width</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[(labelConfig.barcodeWidth || 1.5) * 10]}
                      onValueChange={([value]) => setLabelConfig(prev => ({ ...prev, barcodeWidth: value / 10 }))}
                      min={8}
                      max={25}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-8 text-center">{(labelConfig.barcodeWidth || 1.5).toFixed(1)}</span>
                  </div>
                </div>

                {/* Alignment for barcode */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Alignment</Label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.textAlign === 'left' ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('textAlign', 'left')}
                      className="h-8 w-8 p-0"
                    >
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.textAlign === 'center' || !selectedFieldConfig.textAlign ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('textAlign', 'center')}
                      className="h-8 w-8 p-0"
                    >
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedFieldConfig.textAlign === 'right' ? 'default' : 'outline'}
                      onClick={() => updateFieldProperty('textAlign', 'right')}
                      className="h-8 w-8 p-0"
                    >
                      <AlignRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Printer className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">Select a field to edit</p>
            <p className="text-xs mt-2">Click any field in the preview or list</p>
          </div>
        )}
      </Card>
    </div>
    </>
  );
}
