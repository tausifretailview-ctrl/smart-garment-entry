import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Eye, GripVertical, ZoomIn, ZoomOut, AlignLeft, AlignCenter, AlignRight, 
  Bold, Type, Maximize2, Move, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  LayoutGrid, Printer
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  lineHeight?: number;
  minHeight?: number;
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

// Sortable Field Component for Preview
interface SortablePreviewFieldProps {
  fieldKey: FieldKey;
  field: LabelFieldConfig;
  isSelected: boolean;
  content: string;
  labelConfig: LabelDesignConfig;
  onSelect: () => void;
  scale: number;
}

function SortablePreviewField({ 
  fieldKey, 
  field, 
  isSelected, 
  content, 
  labelConfig, 
  onSelect,
  scale 
}: SortablePreviewFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldKey });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fontSize = Math.max(4, field.fontSize * scale);
  const pt = (field.paddingTop ?? 0) * scale;
  const pb = (field.paddingBottom ?? 0) * scale;
  const pl = (field.paddingLeft ?? 0) * scale;
  const pr = (field.paddingRight ?? 0) * scale;

  const selectionStyle = isSelected 
    ? 'border-2 border-dashed border-blue-500 bg-blue-50/50' 
    : 'border border-transparent hover:border-blue-300 hover:bg-blue-50/30';

  if (fieldKey === 'barcode') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative cursor-pointer transition-all ${selectionStyle}`}
        onClick={onSelect}
      >
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-0.5 cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 z-10"
        >
          <GripVertical className="h-2 w-2 text-blue-500" />
        </div>
        <div
          style={{
            padding: `${pt}px ${pr}px ${pb}px ${pl}px`,
            display: 'flex',
            justifyContent: field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center',
          }}
        >
          <svg 
            className={`bartender-barcode-${fieldKey}`} 
            style={{ 
              height: `${(labelConfig.barcodeHeight || 25) * scale}px`, 
              width: 'auto',
              maxWidth: '95%'
            }} 
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative cursor-pointer transition-all ${selectionStyle}`}
      onClick={onSelect}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 p-0.5 cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 z-10"
      >
        <GripVertical className="h-2 w-2 text-blue-500" />
      </div>
      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: field.bold ? 'bold' : 'normal',
          textAlign: field.textAlign || 'center',
          padding: `${pt}px ${pr}px ${pb}px ${pl}px`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: field.lineHeight || 1.2,
          minHeight: field.minHeight ? `${field.minHeight * scale}px` : undefined,
        }}
      >
        {content}
      </div>
    </div>
  );
}

// Field List Item Component
interface FieldListItemProps {
  fieldKey: FieldKey;
  field: LabelFieldConfig;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: (show: boolean) => void;
}

function FieldListItem({ fieldKey, field, isSelected, onSelect, onToggle }: FieldListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldKey });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded border transition-all cursor-pointer ${
        isSelected 
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
          : 'border-border hover:border-blue-300 hover:bg-muted/50'
      }`}
      onClick={onSelect}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-1 cursor-grab active:cursor-grabbing hover:bg-muted rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Calculate scale factor for proper mm to px conversion
  // 1mm ≈ 3.78px at 96dpi, but we scale based on zoom
  const basePxPerMm = 3.78;
  const scale = (zoom / 100) * basePxPerMm;
  
  const labelWidthPx = labelWidth * scale;
  const labelHeightPx = labelHeight * scale;

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
      const step = e.shiftKey ? 5 : 1;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], paddingTop: Math.max(-20, (field.paddingTop ?? 0) - step) }
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], paddingTop: Math.min(30, (field.paddingTop ?? 0) + step) }
          }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], paddingLeft: Math.max(-20, (field.paddingLeft ?? 0) - step) }
          }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { ...prev[selectedField], paddingLeft: Math.min(30, (field.paddingLeft ?? 0) + step) }
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
  }, [selectedField, labelConfig, setLabelConfig]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLabelConfig((prev) => {
        const oldIndex = prev.fieldOrder.indexOf(active.id as FieldKey);
        const newIndex = prev.fieldOrder.indexOf(over.id as FieldKey);
        return {
          ...prev,
          fieldOrder: arrayMove(prev.fieldOrder, oldIndex, newIndex),
        };
      });
    }
  };

  const updateFieldProperty = <K extends keyof LabelFieldConfig>(property: K, value: LabelFieldConfig[K]) => {
    if (!selectedField) return;
    setLabelConfig(prev => ({
      ...prev,
      [selectedField]: { ...prev[selectedField], [property]: value }
    }));
  };

  const adjustSpacing = (direction: 'up' | 'down' | 'left' | 'right', amount: number = 1) => {
    if (!selectedField || !selectedFieldConfig) return;
    
    const props: Record<string, 'paddingTop' | 'paddingLeft'> = {
      up: 'paddingTop',
      down: 'paddingTop',
      left: 'paddingLeft',
      right: 'paddingLeft',
    };
    
    const multiplier = direction === 'up' || direction === 'left' ? -1 : 1;
    const prop = props[direction];
    const currentValue = selectedFieldConfig[prop] ?? 0;
    const newValue = Math.min(30, Math.max(-20, currentValue + (amount * multiplier)));
    
    updateFieldProperty(prop, newValue);
  };

  // Render single label content
  const renderLabelContent = () => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={labelConfig.fieldOrder.filter(key => (labelConfig[key] as LabelFieldConfig).show)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col items-stretch justify-start h-full p-1 overflow-hidden">
          {labelConfig.fieldOrder.map((fieldKey) => {
            const field = labelConfig[fieldKey] as LabelFieldConfig;
            if (!field.show) return null;
            return (
              <SortablePreviewField
                key={fieldKey}
                fieldKey={fieldKey}
                field={field}
                isSelected={selectedField === fieldKey}
                content={getFieldContent(fieldKey)}
                labelConfig={labelConfig}
                onSelect={() => setSelectedField(fieldKey)}
                scale={zoom / 100}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
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
          Drag to reorder • Click to edit
        </p>
        
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={labelConfig.fieldOrder} strategy={verticalListSortingStrategy}>
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
          </SortableContext>
        </DndContext>
      </Card>

      {/* Center Panel - Live Preview */}
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
              max={250}
              step={10}
              className="w-20"
            />
            <span className="text-xs font-medium w-12 text-center">{zoom}%</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(Math.min(250, zoom + 25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Label Preview Container */}
        <div 
          className="flex justify-center items-start overflow-auto p-4 bg-gray-100 rounded min-h-[300px]"
          style={{ 
            backgroundImage: 'linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)',
            backgroundSize: '10px 10px',
            backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
          }}
        >
          <div className="flex gap-2" ref={previewRef}>
            {Array.from({ length: columns }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border-2 border-gray-400 shadow-lg relative"
                style={{
                  width: `${labelWidthPx}px`,
                  height: `${labelHeightPx}px`,
                  fontFamily: 'Arial, sans-serif',
                }}
              >
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-blue-500" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-blue-500" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-blue-500" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-blue-500" />
                
                {renderLabelContent()}
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="mt-3 text-center">
          <p className="text-xs text-muted-foreground">
            {selectedField 
              ? <span className="font-medium text-blue-600">Editing: {fieldLabels[selectedField]}</span>
              : 'Click a field to edit • Drag to reorder'}
          </p>
          {sampleItem && (
            <p className="text-xs text-muted-foreground mt-1">
              Preview: {sampleItem.product_name} ({sampleItem.size})
            </p>
          )}
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
              <p className="text-xs text-blue-600">Arrow keys to move • ESC to deselect</p>
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

                {/* Bold */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={selectedFieldConfig.bold ? 'default' : 'outline'}
                    onClick={() => updateFieldProperty('bold', !selectedFieldConfig.bold)}
                    className="h-8 w-8 p-0"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">Bold text</span>
                </div>

                {/* Alignment */}
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

                {/* Line Height */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Line Height</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[selectedFieldConfig.lineHeight || 1.2]}
                      onValueChange={([value]) => updateFieldProperty('lineHeight', value)}
                      min={0.8}
                      max={2}
                      step={0.1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-8 text-center">{(selectedFieldConfig.lineHeight || 1.2).toFixed(1)}</span>
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
              </>
            )}

            <Separator />

            {/* Position Controls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Move className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs font-medium">Position</Label>
              </div>
              
              <div className="grid grid-cols-3 gap-1 max-w-[140px] mx-auto">
                <div />
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => adjustSpacing('up')}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div />
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => adjustSpacing('left')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center justify-center text-xs text-muted-foreground">
                  ↕↔
                </div>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => adjustSpacing('right')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div />
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => adjustSpacing('down')}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <div />
              </div>

              {/* Precise spacing inputs */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Top</Label>
                  <Input
                    type="number"
                    min="-20"
                    max="30"
                    value={selectedFieldConfig.paddingTop ?? 0}
                    onChange={(e) => updateFieldProperty('paddingTop', parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Left</Label>
                  <Input
                    type="number"
                    min="-20"
                    max="30"
                    value={selectedFieldConfig.paddingLeft ?? 0}
                    onChange={(e) => updateFieldProperty('paddingLeft', parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
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
