import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Check, AlertCircle, X, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import {
  TargetField,
  ParsedExcelData,
  parseExcelFile,
  autoMapFields,
  applyMappings,
  validateMappedData,
  generateSampleExcel,
} from '@/utils/excelImportUtils';

interface ExcelImportDialogProps {
  open: boolean;
  onClose: () => void;
  targetFields: TargetField[];
  onImport: (mappedData: Record<string, any>[]) => void;
  title: string;
  sampleData: Record<string, any>[];
  sampleFileName: string;
}

export const ExcelImportDialog = ({
  open,
  onClose,
  targetFields,
  onImport,
  title,
  sampleData,
  sampleFileName,
}: ExcelImportDialogProps) => {
  const [parsedData, setParsedData] = useState<ParsedExcelData | null>(null);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setIsLoading(true);
    try {
      const data = await parseExcelFile(file);
      setParsedData(data);
      const autoMappings = autoMapFields(data.headers, targetFields);
      setMappings(autoMappings);
      toast.success(`Loaded ${data.rows.length} rows from Excel`);
    } catch (error) {
      toast.error('Failed to parse Excel file');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleMappingChange = (excelColumn: string, systemField: string | null) => {
    setMappings(prev => ({
      ...prev,
      [excelColumn]: systemField === 'none' ? null : systemField,
    }));
  };

  const handleDownloadSample = () => {
    generateSampleExcel(targetFields, sampleFileName, sampleData);
    toast.success('Sample template downloaded');
  };

  const getMappingStatus = (excelColumn: string) => {
    const systemField = mappings[excelColumn];
    if (!systemField) return 'unmapped';
    
    const field = targetFields.find(f => f.key === systemField);
    if (field?.key === 'barcode') return 'barcode';
    return 'mapped';
  };

  const getImportStats = () => {
    if (!parsedData) return null;

    const mappedData = applyMappings(parsedData.rows, mappings);
    const barcodeField = Object.entries(mappings).find(([_, v]) => v === 'barcode');
    
    let autoGenerateBarcodes = 0;
    if (barcodeField) {
      autoGenerateBarcodes = parsedData.rows.filter(row => 
        !row[barcodeField[0]] || row[barcodeField[0]] === ''
      ).length;
    } else {
      autoGenerateBarcodes = parsedData.rows.length;
    }

    // Count unique products (by product_name + brand + category + color + style)
    const productNameField = Object.entries(mappings).find(([_, v]) => v === 'product_name');
    const brandField = Object.entries(mappings).find(([_, v]) => v === 'brand');
    const categoryField = Object.entries(mappings).find(([_, v]) => v === 'category');
    const colorField = Object.entries(mappings).find(([_, v]) => v === 'color');
    const styleField = Object.entries(mappings).find(([_, v]) => v === 'style');

    const uniqueProducts = new Set();
    parsedData.rows.forEach(row => {
      const key = [
        productNameField ? row[productNameField[0]] : '',
        brandField ? row[brandField[0]] : '',
        categoryField ? row[categoryField[0]] : '',
        colorField ? row[colorField[0]] : '',
        styleField ? row[styleField[0]] : '',
      ].join('|');
      uniqueProducts.add(key);
    });

    return {
      totalRows: parsedData.rows.length,
      uniqueProducts: uniqueProducts.size,
      autoGenerateBarcodes,
    };
  };

  const handleImport = () => {
    if (!parsedData) return;

    const mappedData = applyMappings(parsedData.rows, mappings);
    const validation = validateMappedData(mappedData, targetFields);

    if (!validation.valid) {
      validation.errors.forEach(err => toast.error(err));
      return;
    }

    onImport(mappedData);
    handleClose();
  };

  const handleClose = () => {
    setParsedData(null);
    setMappings({});
    onClose();
  };

  const stats = getImportStats();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Download Sample */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleDownloadSample}>
              <Download className="h-4 w-4 mr-2" />
              Download Sample Template
            </Button>
          </div>

          {/* File Upload */}
          {!parsedData && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleInputChange}
                className="hidden"
                id="excel-upload"
              />
              <label htmlFor="excel-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium">
                  {isLoading ? 'Loading...' : 'Drop Excel file here or click to upload'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports .xlsx and .xls files
                </p>
              </label>
            </div>
          )}

          {/* Field Mapping */}
          {parsedData && (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">File Column (Sample Value)</TableHead>
                      <TableHead className="w-[35%]">Map to System Field</TableHead>
                      <TableHead className="w-[30%]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.headers.map(header => {
                      const status = getMappingStatus(header);
                      return (
                        <TableRow key={header}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{header}</span>
                              {parsedData.sampleValues[header] && (
                                <span className="text-xs text-muted-foreground block truncate max-w-[200px]">
                                  {parsedData.sampleValues[header]}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mappings[header] || 'none'}
                              onValueChange={(value) => handleMappingChange(header, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select field..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">-- Don't import --</SelectItem>
                                {targetFields.map(field => (
                                  <SelectItem key={field.key} value={field.key}>
                                    {field.label} {field.required && '*'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {status === 'mapped' && (
                              <Badge variant="default" className="bg-green-500">
                                <Check className="h-3 w-3 mr-1" />
                                Mapped
                              </Badge>
                            )}
                            {status === 'unmapped' && (
                              <Badge variant="secondary">
                                <X className="h-3 w-3 mr-1" />
                                Not mapped
                              </Badge>
                            )}
                            {status === 'barcode' && (
                              <Badge variant="outline" className="border-blue-500 text-blue-500">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Auto-generate if empty
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Import Stats */}
              {stats && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                  <p className="font-medium">Import Preview:</p>
                  <p className="text-sm text-muted-foreground">
                    • {stats.totalRows} rows will be imported
                  </p>
                  <p className="text-sm text-muted-foreground">
                    • {stats.uniqueProducts} unique products detected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    • {stats.autoGenerateBarcodes} barcodes will be auto-generated
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {parsedData && (
            <Button onClick={handleImport}>
              <Upload className="h-4 w-4 mr-2" />
              Import {parsedData.rows.length} Rows
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
