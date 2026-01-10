import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Download, Check, AlertCircle, X, FileSpreadsheet, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  TargetField,
  ParsedExcelData,
  parseExcelFile,
  autoMapFields,
  applyMappings,
  validateMappedData,
  generateSampleExcel,
  ValidationResult,
} from '@/utils/excelImportUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ImportProgress {
  current: number;
  total: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  isImporting: boolean;
}

interface ImportTemplate {
  id: string;
  template_name: string;
  import_type: string;
  field_mappings: Record<string, string | null>;
  excel_headers: string[];
}

interface ExcelImportDialogProps {
  open: boolean;
  onClose: () => void;
  targetFields: TargetField[];
  onImport: (mappedData: Record<string, any>[], onProgress?: (progress: ImportProgress) => void) => Promise<void>;
  title: string;
  sampleData: Record<string, any>[];
  sampleFileName: string;
  importType?: 'supplier' | 'customer' | 'product' | 'purchase';
}

export const ExcelImportDialog = ({
  open,
  onClose,
  targetFields,
  onImport,
  title,
  sampleData,
  sampleFileName,
  importType = 'product',
}: ExcelImportDialogProps) => {
  const { currentOrganization } = useOrganization();
  const [parsedData, setParsedData] = useState<ParsedExcelData | null>(null);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  
  // Template management
  const [savedTemplates, setSavedTemplates] = useState<ImportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateToDelete, setTemplateToDelete] = useState<ImportTemplate | null>(null);

  // Load saved templates
  useEffect(() => {
    if (open && currentOrganization?.id) {
      loadSavedTemplates();
    }
  }, [open, currentOrganization?.id, importType]);

  const loadSavedTemplates = async () => {
    if (!currentOrganization?.id) return;
    
    const { data, error } = await supabase
      .from('import_templates')
      .select('*')
      .eq('organization_id', currentOrganization.id)
      .eq('import_type', importType)
      .order('template_name');
    
    if (!error && data) {
      setSavedTemplates(data.map(t => ({
        ...t,
        field_mappings: t.field_mappings as Record<string, string | null>,
        excel_headers: t.excel_headers || [],
      })));
    }
  };

  const saveCurrentMapping = async () => {
    if (!currentOrganization?.id || !templateName.trim() || !parsedData) {
      toast.error('Please enter a template name');
      return;
    }

    const { error } = await supabase
      .from('import_templates')
      .upsert({
        organization_id: currentOrganization.id,
        template_name: templateName.trim(),
        import_type: importType,
        field_mappings: mappings,
        excel_headers: parsedData.headers,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,template_name,import_type',
      });

    if (error) {
      toast.error('Failed to save template');
      console.error(error);
    } else {
      toast.success('Template saved successfully');
      setShowSaveDialog(false);
      setTemplateName('');
      loadSavedTemplates();
    }
  };

  const deleteTemplate = async () => {
    if (!templateToDelete) return;

    const { error } = await supabase
      .from('import_templates')
      .delete()
      .eq('id', templateToDelete.id);

    if (error) {
      toast.error('Failed to delete template');
    } else {
      toast.success('Template deleted');
      setSelectedTemplate('');
      loadSavedTemplates();
    }
    setTemplateToDelete(null);
  };

  const applyTemplate = (templateId: string) => {
    if (!parsedData || templateId === 'none') {
      setSelectedTemplate('');
      return;
    }

    const template = savedTemplates.find(t => t.id === templateId);
    if (!template) return;

    setSelectedTemplate(templateId);
    
    // Create new mappings based on saved template
    const newMappings: Record<string, string | null> = {};
    
    parsedData.headers.forEach(header => {
      // First, check if this exact header exists in the saved template
      if (template.field_mappings[header] !== undefined) {
        newMappings[header] = template.field_mappings[header];
      } else {
        // Try to match similar headers (case insensitive, ignoring special chars)
        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
        let found = false;
        
        for (const [savedHeader, systemField] of Object.entries(template.field_mappings)) {
          const normalizedSaved = savedHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normalizedHeader === normalizedSaved || 
              normalizedHeader.includes(normalizedSaved) || 
              normalizedSaved.includes(normalizedHeader)) {
            newMappings[header] = systemField;
            found = true;
            break;
          }
        }
        
        if (!found) {
          newMappings[header] = null;
        }
      }
    });
    
    setMappings(newMappings);
    toast.success(`Applied template: ${template.template_name}`);
  };

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
      
      const headerInfo = data.detectedHeaderRow && data.detectedHeaderRow > 0 
        ? ` (headers found on row ${data.detectedHeaderRow + 1})`
        : '';
      toast.success(`Loaded ${data.rows.length} rows from Excel${headerInfo}`);
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
    setSelectedTemplate(''); // Clear template selection when manually changing
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

  const getValidationResult = (): ValidationResult | null => {
    if (!parsedData) return null;
    const mappedData = applyMappings(parsedData.rows, mappings);
    return validateMappedData(mappedData, targetFields, mappings, {
      headerRowIndex: parsedData.detectedHeaderRow ?? 0,
    });
  };

  const handleImport = async () => {
    if (!parsedData) return;

    const mappedData = applyMappings(parsedData.rows, mappings);
    const validation = validateMappedData(mappedData, targetFields, mappings, {
      headerRowIndex: parsedData.detectedHeaderRow ?? 0,
    });

    if (!validation.valid) {
      validation.errors.forEach(err => toast.error(err));
      if (validation.rowErrors.length > 0) {
        toast.error(`${validation.invalidRowCount} rows have validation errors. Please fix them before importing.`);
      }
      return;
    }

    // Initialize progress
    setImportProgress({
      current: 0,
      total: mappedData.length,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      isImporting: true,
    });

    try {
      await onImport(mappedData, (progress) => {
        setImportProgress(progress);
      });
      handleClose();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Import failed');
    } finally {
      setImportProgress(null);
    }
  };

  const validationResult = getValidationResult();

  const handleClose = () => {
    if (importProgress?.isImporting) return; // Prevent closing during import
    setParsedData(null);
    setMappings({});
    setImportProgress(null);
    setSelectedTemplate('');
    setTemplateName('');
    onClose();
  };

  const stats = getImportStats();
  const mappedCount = Object.values(mappings).filter(Boolean).length;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Download Sample & Templates */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Saved Templates */}
              <div className="flex items-center gap-2">
                {savedTemplates.length > 0 && parsedData && (
                  <>
                    <Select value={selectedTemplate} onValueChange={applyTemplate}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Load saved template..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- No template --</SelectItem>
                        {savedTemplates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setTemplateToDelete(savedTemplates.find(t => t.id === selectedTemplate) || null)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </>
                )}
                {parsedData && (
                  <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Template
                  </Button>
                )}
              </div>

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
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {mappedCount} of {parsedData.headers.length} columns mapped
                  </p>
                  {parsedData.detectedHeaderRow !== undefined && parsedData.detectedHeaderRow > 0 && (
                    <Badge variant="outline">
                      Headers detected on row {parsedData.detectedHeaderRow + 1}
                    </Badge>
                  )}
                </div>

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

                {/* Validation Errors */}
                {validationResult && !validationResult.valid && (
                  <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 text-destructive font-medium">
                      <AlertCircle className="h-4 w-4" />
                      Validation Errors ({validationResult.invalidRowCount} rows with issues)
                    </div>
                    
                    {validationResult.errors.length > 0 && (
                      <div className="space-y-1">
                        {validationResult.errors.map((error, idx) => (
                          <p key={idx} className="text-sm text-destructive">• {error}</p>
                        ))}
                      </div>
                    )}

                    {validationResult.rowErrors.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1 mt-2">
                        {validationResult.rowErrors.slice(0, 20).map((error, idx) => (
                          <p key={idx} className="text-sm text-destructive/80">
                            Row {error.row}: {error.field} - {error.message}
                            {error.value !== undefined && error.value !== '' && (
                              <span className="text-muted-foreground"> (value: "{error.value}")</span>
                            )}
                          </p>
                        ))}
                        {validationResult.rowErrors.length > 20 && (
                          <p className="text-sm text-muted-foreground italic">
                            ... and {validationResult.rowErrors.length - 20} more errors
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Validation Success */}
                {validationResult && validationResult.valid && !importProgress && (
                  <div className="border border-green-500/50 bg-green-500/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-600 font-medium">
                      <Check className="h-4 w-4" />
                      All {validationResult.validRowCount} rows passed validation
                    </div>
                  </div>
                )}

                {/* Import Progress */}
                {importProgress && (
                  <div className="border border-primary/50 bg-primary/10 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-primary">Importing...</span>
                      <span className="text-sm text-muted-foreground">
                        {importProgress.current} / {importProgress.total}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-300 ease-out"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">✓ {importProgress.successCount} imported</span>
                      {importProgress.skippedCount > 0 && (
                        <span className="text-yellow-600">⊘ {importProgress.skippedCount} skipped (duplicates)</span>
                      )}
                      {importProgress.errorCount > 0 && (
                        <span className="text-destructive">✕ {importProgress.errorCount} failed</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={importProgress?.isImporting}
            >
              Cancel
            </Button>
            {parsedData && (
              <Button 
                onClick={handleImport}
                disabled={(validationResult ? !validationResult.valid : false) || importProgress?.isImporting}
              >
                {importProgress?.isImporting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {validationResult?.validRowCount || parsedData.rows.length} Rows
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Template Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Import Template</AlertDialogTitle>
            <AlertDialogDescription>
              Save your current field mappings as a template for future imports with similar Excel files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Asifa Format, Standard Supplier Import"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveCurrentMapping} disabled={!templateName.trim()}>
              Save Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Template Confirmation */}
      <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the template "{templateToDelete?.template_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};