import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { 
  Eye, GripVertical, ZoomIn, ZoomOut, AlignLeft, AlignCenter, AlignRight, 
  Bold, Type, Maximize2, Move, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  LayoutGrid, Printer, Rows, Columns
} from "lucide-react";
import JsBarcode from "jsbarcode";

interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  x?: number; // X position in mm
  y?: number; // Y position in mm
  width?: number; // Width as percentage of label width (0-100)
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

interface LabelItem {
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  barcode: string;
  bill_number: string;
  supplier_code?: string;
  purchase_code?: string;
}

interface BarTenderLabelDesignerProps {
  labelConfig: LabelDesignConfig;
  setLabelConfig: React.Dispatch<React.SetStateAction<LabelDesignConfig>>;
  businessName: string;
  sampleItem?: LabelItem | null;
  labelWidth: number;
  labelHeight: number;
  columns?: number;
}

type FieldKey = keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>;

const fieldLabels: Record<FieldKey, string> = {
  brand: 'Brand Name',
  productName: 'Product Name',
  color: 'Color',
  style: 'Style',
  size: 'Size',
  price: 'Price (MRP)',
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

  const fontSize = Math.max(4, field.fontSize * scale);
  const xPx = field.x * scale;
  const yPx = field.y * scale;
  const widthPx = (field.width / 100) * labelWidthMm * scale;

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
              height: `${(labelConfig.barcodeHeight || 25) * scale}px`, 
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
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: field.bold ? 'bold' : 'normal',
          textAlign: field.textAlign || 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: field.lineHeight || 1.2,
          padding: '1px 2px',
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
  columns = 1
}: BarTenderLabelDesignerProps) {
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);
  const [zoom, setZoom] = useState(150);
  const previewRef = useRef<HTMLDivElement>(null);
  const barcodeValue = sampleItem?.barcode || '12345678';

  // Calculate scale factor for proper mm to px conversion
  const basePxPerMm = 3.78;
  const scale = (zoom / 100) * basePxPerMm;
  
  const labelWidthPx = labelWidth * scale;
  const labelHeightPx = labelHeight * scale;

  // Initialize field positions if not set
  useEffect(() => {
    const initializePositions = () => {
      let needsUpdate = false;
      const updates: Partial<LabelDesignConfig> = {};
      
      // Default layout - arrange fields vertically with some side-by-side examples
      const defaultPositions: Record<FieldKey, { x: number; y: number; width: number }> = {
        brand: { x: 0, y: 0, width: 100 },
        productName: { x: 0, y: 4, width: 100 },
        size: { x: 0, y: 8, width: 50 }, // Left half
        color: { x: labelWidth / 2, y: 8, width: 50 }, // Right half
        style: { x: 0, y: 12, width: 50 },
        price: { x: labelWidth / 2, y: 12, width: 50 },
        barcode: { x: 0, y: 16, width: 100 },
        barcodeText: { x: 0, y: 24, width: 100 },
        billNumber: { x: 0, y: 27, width: 50 },
        supplierCode: { x: labelWidth / 2, y: 27, width: 50 },
        purchaseCode: { x: 0, y: 30, width: 100 },
      };

      labelConfig.fieldOrder.forEach((fieldKey) => {
        const field = labelConfig[fieldKey] as LabelFieldConfig;
        if (field.x === undefined || field.y === undefined || field.width === undefined) {
          needsUpdate = true;
          const defaultPos = defaultPositions[fieldKey];
          updates[fieldKey] = {
            ...field,
            x: defaultPos?.x ?? 0,
            y: defaultPos?.y ?? 0,
            width: defaultPos?.width ?? 100,
          } as LabelFieldConfig;
        }
      });

      if (needsUpdate) {
        setLabelConfig(prev => ({ ...prev, ...updates }));
      }
    };

    initializePositions();
  }, [labelConfig.fieldOrder, labelWidth]);

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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
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

            {/* Width Control */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Columns className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs font-medium">Width (%)</Label>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[selectedFieldConfig.width ?? 100]}
                  onValueChange={([value]) => updateFieldProperty('width', value)}
                  min={20}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-10 text-center">{selectedFieldConfig.width ?? 100}%</span>
              </div>
            </div>

            <Separator />

            {selectedField !== 'barcode' ? (
              <>
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
  );
}
