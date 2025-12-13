import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import * as XLSX from 'xlsx';

interface LegacyInvoiceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

interface ParsedInvoice {
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  amount: number;
  payment_status: string;
}

interface ImportResult {
  success: number;
  skipped: number;
  errors: string[];
}

export function LegacyInvoiceImportDialog({
  open,
  onOpenChange,
  organizationId,
}: LegacyInvoiceImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedInvoice[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);
    setParsedData([]);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      // Map Excel columns to expected format
      const mapped: ParsedInvoice[] = jsonData
        .filter(row => {
          // Filter out rows without essential data
          const invoiceNum = row['Number'] || row['Invoice Number'] || row['number'] || '';
          const customerName = row['Partner Name'] || row['Customer Name'] || row['customer_name'] || row['Customer'] || '';
          return invoiceNum && customerName;
        })
        .map(row => {
          // Parse amount (handle various formats like "₹ 1,500.00", "1500", etc.)
          let amount = row['Total in Currency'] || row['Amount'] || row['total'] || row['Net Amount'] || 0;
          if (typeof amount === 'string') {
            amount = parseFloat(amount.replace(/[₹,\s]/g, '')) || 0;
          }

          // Parse date (handle various formats)
          let dateStr = row['Date'] || row['Invoice Date'] || row['invoice_date'] || new Date().toISOString();
          let parsedDate: Date;
          
          if (typeof dateStr === 'number') {
            // Excel date serial number
            parsedDate = new Date((dateStr - 25569) * 86400 * 1000);
          } else if (typeof dateStr === 'string') {
            // Try to parse various date formats
            const parts = dateStr.split(/[\/\-]/);
            if (parts.length === 3) {
              // Assume DD/MM/YYYY or MM/DD/YYYY format
              const [first, second, third] = parts.map(p => parseInt(p));
              if (first > 12) {
                // DD/MM/YYYY
                parsedDate = new Date(third, second - 1, first);
              } else {
                // MM/DD/YYYY or try ISO
                parsedDate = new Date(dateStr);
              }
            } else {
              parsedDate = new Date(dateStr);
            }
          } else {
            parsedDate = new Date();
          }

          // Ensure valid date
          if (isNaN(parsedDate.getTime())) {
            parsedDate = new Date();
          }

          return {
            invoice_number: String(row['Number'] || row['Invoice Number'] || row['number'] || '').trim(),
            customer_name: String(row['Partner Name'] || row['Customer Name'] || row['customer_name'] || row['Customer'] || '').trim(),
            invoice_date: parsedDate.toISOString().split('T')[0],
            amount: Math.abs(amount),
            payment_status: String(row['Status'] || row['Payment Status'] || 'Paid').toLowerCase().includes('paid') ? 'Paid' : 'Unpaid',
          };
        });

      setParsedData(mapped);
      toast.success(`Parsed ${mapped.length} invoices from Excel`);
    } catch (error) {
      console.error('Error parsing Excel:', error);
      toast.error('Failed to parse Excel file');
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    setProgress(0);
    
    const batchSize = 50;
    let success = 0;
    let skipped = 0;
    const errors: string[] = [];

    // First, fetch existing customers to match
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, customer_name, phone')
      .eq('organization_id', organizationId);

    const customerMap = new Map<string, string>();
    existingCustomers?.forEach(c => {
      customerMap.set(c.customer_name.toLowerCase().trim(), c.id);
    });

    // Import in batches using fetch API
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    
    if (!accessToken) {
      toast.error('Authentication required');
      setImporting(false);
      return;
    }

    for (let i = 0; i < parsedData.length; i += batchSize) {
      const batch = parsedData.slice(i, i + batchSize);
      
      const records = batch.map(invoice => ({
        organization_id: organizationId,
        customer_id: customerMap.get(invoice.customer_name.toLowerCase().trim()) || null,
        customer_name: invoice.customer_name,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        amount: invoice.amount,
        payment_status: invoice.payment_status,
        source: 'Odoo ERP',
      }));

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/legacy_invoices`,
          {
            method: 'POST',
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=ignore-duplicates,return=representation',
            },
            body: JSON.stringify(records),
          }
        );

        if (response.ok) {
          const data = await response.json();
          success += Array.isArray(data) ? data.length : 1;
          skipped += batch.length - (Array.isArray(data) ? data.length : 1);
        } else if (response.status === 409) {
          // Conflict - duplicates
          skipped += batch.length;
        } else {
          const errorText = await response.text();
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorText}`);
        }
      } catch (err: any) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${err.message}`);
      }

      setProgress(Math.round(((i + batch.length) / parsedData.length) * 100));
    }

    setResult({ success, skipped, errors });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['legacy-invoices'] });
    
    if (success > 0) {
      toast.success(`Imported ${success} invoices successfully`);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setResult(null);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Legacy Invoices
          </DialogTitle>
          <DialogDescription>
            Import historical billing data from Odoo ERP or other systems
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select Excel File</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                Browse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected columns: Number (Invoice #), Partner Name (Customer), Date, Total in Currency (Amount), Status
            </p>
          </div>

          {/* Preview Table */}
          {parsedData.length > 0 && (
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <Label>Preview ({parsedData.length} records)</Label>
                {result && (
                  <div className="flex gap-2">
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {result.success} imported
                    </Badge>
                    {result.skipped > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {result.skipped} skipped
                      </Badge>
                    )}
                    {result.errors.length > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {result.errors.length} errors
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <ScrollArea className="h-[300px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 100).map((invoice, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.customer_name}</TableCell>
                        <TableCell>{invoice.invoice_date}</TableCell>
                        <TableCell className="text-right">₹{invoice.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={invoice.payment_status === 'Paid' ? 'default' : 'secondary'}>
                            {invoice.payment_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {parsedData.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          ... and {parsedData.length - 100} more records
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Progress */}
          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importing...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={parsedData.length === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import {parsedData.length} Invoices
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
