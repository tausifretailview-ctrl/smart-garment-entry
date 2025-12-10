import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eye, X, GripVertical } from "lucide-react";
import JsBarcode from "jsbarcode";
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
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

interface InteractiveLabelPreviewProps {
  labelConfig: LabelDesignConfig;
  setLabelConfig: React.Dispatch<React.SetStateAction<LabelDesignConfig>>;
  businessName: string;
  sampleItem?: LabelItem | null;
  labelWidth: number;
  labelHeight: number;
}

const fieldLabels: Record<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>, string> = {
  brand: 'Brand Name',
  productName: 'Product Name',
  color: 'Color',
  style: 'Style',
  size: 'Size',
  price: 'Price (MRP)',
  barcode: 'Barcode Image',
  barcodeText: 'Barcode Number',
  billNumber: 'Bill Number',
  supplierCode: 'Supplier Code',
  purchaseCode: 'Purchase Code',
};

// Sortable Field Item Component
interface SortableFieldProps {
  fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>;
  field: LabelFieldConfig;
  isSelected: boolean;
  content: string;
  labelConfig: LabelDesignConfig;
  onSelect: () => void;
  fieldLabels: Record<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>, string>;
}

function SortableField({ fieldKey, field, isSelected, content, labelConfig, onSelect, fieldLabels }: SortableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const scale = 1;
  const fontSize = Math.max(6, field.fontSize * scale);
  const pt = (field.paddingTop ?? 0) * scale;
  const pb = (field.paddingBottom ?? 0) * scale;
  const pl = (field.paddingLeft ?? 0) * scale;
  const pr = (field.paddingRight ?? 0) * scale;

  if (fieldKey === 'barcode') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`cursor-pointer transition-all w-full relative ${isSelected ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : 'hover:bg-primary/5'}`}
      >
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-1 cursor-grab active:cursor-grabbing hover:bg-primary/20 rounded"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
        <div
          onClick={onSelect}
          style={{
            margin: `${pt}px ${pr}px ${pb}px ${pl}px`,
            display: 'flex',
            justifyContent: 'center',
            padding: '4px',
          }}
          title={`Click to select ${fieldLabels[fieldKey]}`}
        >
          <svg 
            className={`interactive-barcode-${fieldKey}`} 
            style={{ 
              height: `${(labelConfig.barcodeHeight || 28) * scale}px`, 
              width: 'auto',
              maxWidth: '90%'
            }} 
          />
        </div>
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    fontWeight: field.bold ? 'bold' : 'normal',
    textAlign: (field.textAlign || 'center') as 'left' | 'center' | 'right',
    margin: `${pt}px ${pr}px ${pb}px ${pl}px`,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    width: '100%',
    padding: '4px 8px 4px 24px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxSizing: 'border-box',
    lineHeight: field.lineHeight || 1.2,
    minHeight: field.minHeight ? `${field.minHeight}px` : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`transition-all relative ${isSelected ? 'ring-2 ring-primary ring-offset-1 bg-primary/10' : 'hover:bg-primary/5'}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 cursor-grab active:cursor-grabbing hover:bg-primary/20 rounded z-10"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      <div
        onClick={onSelect}
        style={fieldStyle}
        title={`Click to select ${fieldLabels[fieldKey]}`}
      >
        {content}
      </div>
    </div>
  );
}

export function InteractiveLabelPreview({ 
  labelConfig, 
  setLabelConfig, 
  businessName, 
  sampleItem,
  labelWidth,
  labelHeight
}: InteractiveLabelPreviewProps) {
  const [selectedField, setSelectedField] = useState<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'> | null>(null);
  const [zoom, setZoom] = useState(100);
  const previewRef = useRef<HTMLDivElement>(null);
  const barcodeValue = sampleItem?.barcode || '12345678';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Render barcodes
  useEffect(() => {
    if (!previewRef.current) return;
    const svgs = previewRef.current.querySelectorAll('[class^="interactive-barcode-"]');
    svgs.forEach((svg) => {
      try {
        JsBarcode(svg, barcodeValue, {
          format: 'CODE128',
          width: labelConfig.barcodeWidth || 1.8,
          height: labelConfig.barcodeHeight || 28,
          displayValue: false,
          margin: 0
        });
      } catch (e) {
        console.log('Preview barcode error:', e);
      }
    });
  }, [labelConfig, barcodeValue]);

  // Keyboard controls for selected field
  useEffect(() => {
    if (!selectedField) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const field = labelConfig[selectedField] as LabelFieldConfig;
      const step = e.shiftKey ? 5 : 1; // Shift for larger movements

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { 
              ...prev[selectedField], 
              paddingTop: Math.max(-20, (field.paddingTop ?? 0) - step) 
            }
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { 
              ...prev[selectedField], 
              paddingTop: Math.min(30, (field.paddingTop ?? 0) + step) 
            }
          }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { 
              ...prev[selectedField], 
              paddingLeft: Math.max(-20, (field.paddingLeft ?? 0) - step) 
            }
          }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setLabelConfig(prev => ({
            ...prev,
            [selectedField]: { 
              ...prev[selectedField], 
              paddingLeft: Math.min(30, (field.paddingLeft ?? 0) + step) 
            }
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

  const getFieldContent = (fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>) => {
    if (sampleItem) {
      switch (fieldKey) {
        case 'brand': return sampleItem.brand || businessName || 'Brand';
        case 'productName': return sampleItem.product_name + (labelConfig.size.show ? '' : ` (${sampleItem.size})`);
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
      case 'brand': return businessName || 'Brand';
      case 'productName': return 'Sample Product';
      case 'color': return 'Blue';
      case 'style': return 'Classic';
      case 'price': return '₹999';
      case 'barcodeText': return '12345678';
      case 'billNumber': return 'BILL001';
      case 'supplierCode': return 'SUP01';
      case 'purchaseCode': return 'PC123';
      case 'size': return 'M';
      default: return '';
    }
  };

  const selectedFieldConfig = selectedField ? (labelConfig[selectedField] as LabelFieldConfig) : null;

  const adjustSpacing = (direction: 'up' | 'down' | 'left' | 'right', amount: number) => {
    if (!selectedField || !selectedFieldConfig) return;

    switch (direction) {
      case 'up':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...prev[selectedField], paddingTop: Math.max(-20, (selectedFieldConfig.paddingTop ?? 0) - amount) }
        }));
        break;
      case 'down':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...prev[selectedField], paddingTop: Math.min(30, (selectedFieldConfig.paddingTop ?? 0) + amount) }
        }));
        break;
      case 'left':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...prev[selectedField], paddingLeft: Math.max(-20, (selectedFieldConfig.paddingLeft ?? 0) - amount) }
        }));
        break;
      case 'right':
        setLabelConfig(prev => ({
          ...prev,
          [selectedField]: { ...prev[selectedField], paddingLeft: Math.min(30, (selectedFieldConfig.paddingLeft ?? 0) + amount) }
        }));
        break;
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLabelConfig((prev) => {
        const oldIndex = prev.fieldOrder.indexOf(active.id as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>);
        const newIndex = prev.fieldOrder.indexOf(over.id as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>);

        const newFieldOrder = [...prev.fieldOrder];
        newFieldOrder.splice(oldIndex, 1);
        newFieldOrder.splice(newIndex, 0, active.id as keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>);

        return {
          ...prev,
          fieldOrder: newFieldOrder,
        };
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Live Preview */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Interactive Preview</h3>
            <span className="text-xs text-muted-foreground">{labelWidth}×{labelHeight}mm</span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Zoom:</Label>
            <Input
              type="range"
              min="50"
              max="200"
              step="10"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 h-6"
            />
            <span className="text-xs font-medium min-w-[45px]">{zoom}%</span>
          </div>
        </div>
        
        <div className="flex justify-center mb-4 overflow-auto p-4" style={{ minHeight: '400px' }}>
          <div 
            ref={previewRef}
            className="border-2 border-dashed border-primary/30 rounded bg-white relative origin-top-left"
            style={{ 
              width: `${Math.min(labelWidth * 2.5, 200)}px`,
              height: `${Math.min(labelHeight * 2.5, 250)}px`,
              fontFamily: 'Arial, sans-serif',
              fontSize: '6px',
              lineHeight: 1.2,
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="p-2 h-full w-full flex flex-col items-center justify-start overflow-visible">
                <SortableContext
                  items={labelConfig.fieldOrder.filter(key => (labelConfig[key] as LabelFieldConfig).show)}
                  strategy={verticalListSortingStrategy}
                >
                  {labelConfig.fieldOrder.map((fieldKey) => {
                    const field = labelConfig[fieldKey] as LabelFieldConfig;
                    if (!field.show) return null;

                    const isSelected = selectedField === fieldKey;
                    const content = getFieldContent(fieldKey);

                    return (
                      <SortableField
                        key={fieldKey}
                        fieldKey={fieldKey}
                        field={field}
                        isSelected={isSelected}
                        content={content}
                        labelConfig={labelConfig}
                        onSelect={() => setSelectedField(fieldKey)}
                        fieldLabels={fieldLabels}
                      />
                    );
                  })}
                </SortableContext>
              </div>
            </DndContext>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="text-center">
            {sampleItem 
              ? `Showing: ${sampleItem.product_name}` 
              : 'Add products to see actual data'}
          </p>
          <p className="text-center font-medium">
            {selectedField ? `Selected: ${fieldLabels[selectedField]}` : 'Click any field to edit'}
          </p>
          <p className="text-center text-muted-foreground/70">
            Drag fields with grip icon to reorder • Use arrow keys for spacing
          </p>
        </div>
      </Card>

      {/* Field Editor */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Field Properties</h3>
          {selectedField && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedField(null)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {selectedField && selectedFieldConfig ? (
          <div className="space-y-4">
            <div className="p-3 bg-primary/5 rounded border border-primary/20">
              <p className="font-medium text-sm">{fieldLabels[selectedField]}</p>
              <p className="text-xs text-muted-foreground">Press ESC to deselect</p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="field-show"
                checked={selectedFieldConfig.show}
                onCheckedChange={(checked) => {
                  setLabelConfig(prev => ({
                    ...prev,
                    [selectedField]: { ...prev[selectedField], show: checked === true }
                  }));
                }}
              />
              <Label htmlFor="field-show" className="cursor-pointer">Show Field</Label>
            </div>

            {selectedField !== 'barcode' && (
              <>
                <div className="space-y-2">
                  <Label>Font Size (px)</Label>
                  <Input
                    type="number"
                    min="6"
                    max="24"
                    value={selectedFieldConfig.fontSize}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], fontSize: parseInt(e.target.value) || 9 }
                      }));
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="field-bold"
                    checked={selectedFieldConfig.bold}
                    onCheckedChange={(checked) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], bold: checked === true }
                      }));
                    }}
                  />
                  <Label htmlFor="field-bold" className="cursor-pointer">Bold</Label>
                </div>

                <div className="space-y-2">
                  <Label>Text Alignment</Label>
                  <Select
                    value={selectedFieldConfig.textAlign || 'center'}
                    onValueChange={(value: 'left' | 'center' | 'right') => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], textAlign: value }
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Line Height</Label>
                  <Input
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    value={selectedFieldConfig.lineHeight || 1.2}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], lineHeight: parseFloat(e.target.value) || 1.2 }
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Min Height (px)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={selectedFieldConfig.minHeight || 0}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], minHeight: parseInt(e.target.value) || 0 }
                      }));
                    }}
                  />
                </div>
              </>
            )}

            {selectedField === 'barcode' && (
              <>
                <div className="space-y-2">
                  <Label>Barcode Height (px)</Label>
                  <Input
                    type="number"
                    min="15"
                    max="80"
                    value={labelConfig.barcodeHeight || 28}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        barcodeHeight: parseInt(e.target.value) || 28
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Barcode Width</Label>
                  <Input
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    value={labelConfig.barcodeWidth || 1.8}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        barcodeWidth: parseFloat(e.target.value) || 1.8
                      }));
                    }}
                  />
                </div>
              </>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label className="font-semibold">Spacing Controls</Label>
              <p className="text-xs text-muted-foreground">
                Adjust field position using arrow keys or buttons below
              </p>

              <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                <div />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adjustSpacing('up', 1)}
                  className="h-12"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <div />
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adjustSpacing('left', 1)}
                  className="h-12"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center justify-center text-xs text-muted-foreground">
                  Position
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adjustSpacing('right', 1)}
                  className="h-12"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                
                <div />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adjustSpacing('down', 1)}
                  className="h-12"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <div />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Top (px)</Label>
                  <Input
                    type="number"
                    min="-20"
                    max="30"
                    value={selectedFieldConfig.paddingTop ?? 0}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], paddingTop: parseInt(e.target.value) || 0 }
                      }));
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bottom (px)</Label>
                  <Input
                    type="number"
                    min="-20"
                    max="30"
                    value={selectedFieldConfig.paddingBottom ?? 0}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], paddingBottom: parseInt(e.target.value) || 0 }
                      }));
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Left (px)</Label>
                  <Input
                    type="number"
                    min="-20"
                    max="30"
                    value={selectedFieldConfig.paddingLeft ?? 0}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], paddingLeft: parseInt(e.target.value) || 0 }
                      }));
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Right (px)</Label>
                  <Input
                    type="number"
                    min="-20"
                    max="30"
                    value={selectedFieldConfig.paddingRight ?? 0}
                    onChange={(e) => {
                      setLabelConfig(prev => ({
                        ...prev,
                        [selectedField]: { ...prev[selectedField], paddingRight: parseInt(e.target.value) || 0 }
                      }));
                    }}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Eye className="h-12 w-12 mb-4 opacity-20" />
            <p>Click on any field in the preview to edit its properties</p>
            <p className="text-xs mt-2">Field styling, spacing, and positioning options will appear here</p>
          </div>
        )}
      </Card>
    </div>
  );
}
