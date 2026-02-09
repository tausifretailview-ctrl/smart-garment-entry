import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizePhoneNumber } from "@/utils/excelImportUtils";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface CustomerBalanceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExcelRow {
  partyName: string;
  phone: string;
  closing: number;
  matchedCustomerId?: string;
  matchedCustomerName?: string;
  status: "matched" | "not_found" | "pending";
}

interface SheetData {
  name: string;
  rows: ExcelRow[];
  matched: number;
  notFound: number;
}

export function CustomerBalanceImportDialog({
  open,
  onOpenChange,
}: CustomerBalanceImportDialogProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [balSheet, setBalSheet] = useState<SheetData | null>(null);
  const [advSheet, setAdvSheet] = useState<SheetData | null>(null);
  const [importResults, setImportResults] = useState<{
    balSuccess: number;
    advSuccess: number;
    errors: number;
  } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrganization?.id) return;

    setIsProcessing(true);
    setImportResults(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Find Bal and Adv sheets
      const balSheetName = workbook.SheetNames.find((name) =>
        name.toLowerCase().includes("bal")
      );
      const advSheetName = workbook.SheetNames.find((name) =>
        name.toLowerCase().includes("adv")
      );

      if (!balSheetName && !advSheetName) {
        toast({
          title: "Invalid file",
          description: "Excel must contain sheets named 'Bal' or 'Adv'",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      // Fetch all customers for matching
      const { data: customers, error } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (error) throw error;

      // Create a lookup map by normalized phone
      const customerMap = new Map<string, { id: string; name: string }>();
      for (const c of customers || []) {
        const normalized = normalizePhoneNumber(c.phone);
        if (normalized) {
          customerMap.set(normalized, {
            id: c.id,
            name: c.customer_name,
          });
        }
      }

      // Process Bal sheet
      if (balSheetName) {
        const balData = processSheet(
          workbook.Sheets[balSheetName],
          customerMap,
          false
        );
        setBalSheet({
          name: balSheetName,
          rows: balData.rows,
          matched: balData.matched,
          notFound: balData.notFound,
        });
      } else {
        setBalSheet(null);
      }

      // Process Adv sheet
      if (advSheetName) {
        const advData = processSheet(
          workbook.Sheets[advSheetName],
          customerMap,
          true
        );
        setAdvSheet({
          name: advSheetName,
          rows: advData.rows,
          matched: advData.matched,
          notFound: advData.notFound,
        });
      } else {
        setAdvSheet(null);
      }

      toast({
        title: "File processed",
        description: "Review the data and click Import to proceed",
      });
    } catch (error: any) {
      toast({
        title: "Error processing file",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const processSheet = (
    sheet: XLSX.WorkSheet,
    customerMap: Map<string, { id: string; name: string }>,
    isAdvance: boolean
  ): { rows: ExcelRow[]; matched: number; notFound: number } => {
    const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
    const rows: ExcelRow[] = [];
    let matched = 0;
    let notFound = 0;

    for (const row of jsonData) {
      // Find phone column (Contact No. or similar)
      const phoneKey = Object.keys(row).find((k) =>
        k.toLowerCase().includes("contact") || k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile")
      );
      // Find party name column
      const nameKey = Object.keys(row).find((k) =>
        k.toLowerCase().includes("party") || k.toLowerCase().includes("name") || k.toLowerCase().includes("customer")
      );
      // Find closing column
      const closingKey = Object.keys(row).find((k) =>
        k.toLowerCase().includes("closing") || k.toLowerCase().includes("balance") || k.toLowerCase().includes("amount")
      );

      if (!phoneKey || !closingKey) continue;

      const phone = String(row[phoneKey] || "").trim();
      const partyName = String(row[nameKey] || "").trim();
      let closing = parseFloat(String(row[closingKey] || "0").replace(/,/g, ""));

      // For advances, convert negative to positive
      if (isAdvance && closing < 0) {
        closing = Math.abs(closing);
      }

      // Skip zero values
      if (closing === 0 || isNaN(closing)) continue;

      const normalizedPhone = normalizePhoneNumber(phone);
      const customer = normalizedPhone ? customerMap.get(normalizedPhone) : null;

      if (customer) {
        matched++;
        rows.push({
          partyName,
          phone: normalizedPhone || phone,
          closing,
          matchedCustomerId: customer.id,
          matchedCustomerName: customer.name,
          status: "matched",
        });
      } else {
        notFound++;
        rows.push({
          partyName,
          phone: normalizedPhone || phone,
          closing,
          status: "not_found",
        });
      }
    }

    return { rows, matched, notFound };
  };

  const handleImport = async () => {
    if (!currentOrganization?.id) return;

    setIsImporting(true);
    setProgress(0);

    const BATCH_SIZE = 50;
    let balSuccess = 0;
    let advSuccess = 0;
    let errors = 0;

    try {
      // Import outstanding balances (Bal sheet)
      if (balSheet) {
        const matchedRows = balSheet.rows.filter((r) => r.status === "matched");
        for (let i = 0; i < matchedRows.length; i += BATCH_SIZE) {
          const batch = matchedRows.slice(i, i + BATCH_SIZE);

          for (const row of batch) {
            try {
              const { error } = await supabase
                .from("customers")
                .update({ opening_balance: row.closing })
                .eq("id", row.matchedCustomerId!);

              if (error) {
                errors++;
              } else {
                balSuccess++;
              }
            } catch {
              errors++;
            }
          }

          // Update progress (Bal is 50% of total)
          const totalMatched =
            (balSheet?.rows.filter((r) => r.status === "matched").length || 0) +
            (advSheet?.rows.filter((r) => r.status === "matched").length || 0);
          if (totalMatched > 0) {
            setProgress(((balSuccess + advSuccess) / totalMatched) * 100);
          }
        }
      }

      // Import advances (Adv sheet)
      if (advSheet) {
        const matchedRows = advSheet.rows.filter((r) => r.status === "matched");
        for (let i = 0; i < matchedRows.length; i += BATCH_SIZE) {
          const batch = matchedRows.slice(i, i + BATCH_SIZE);

          for (const row of batch) {
            try {
              // Check if advance already exists for this customer with same amount
              const { data: existing } = await supabase
                .from("customer_advances")
                .select("id")
                .eq("customer_id", row.matchedCustomerId!)
                .eq("organization_id", currentOrganization.id)
                .eq("amount", row.closing)
                .eq("payment_method", "Excel Import")
                .maybeSingle();

              if (existing) {
                // Skip duplicate
                continue;
              }

              // Generate advance number
              const { data: advanceNumber, error: rpcError } = await supabase.rpc(
                "generate_advance_number",
                { p_organization_id: currentOrganization.id }
              );

              if (rpcError) {
                errors++;
                continue;
              }

              // Create advance record
              const { error } = await supabase.from("customer_advances").insert({
                organization_id: currentOrganization.id,
                customer_id: row.matchedCustomerId!,
                advance_number: advanceNumber,
                amount: row.closing,
                used_amount: 0,
                advance_date: format(new Date(), "yyyy-MM-dd"),
                payment_method: "Excel Import",
                description: `Imported from Excel - ${row.partyName}`,
                status: "active",
              });

              if (error) {
                errors++;
              } else {
                advSuccess++;
              }
            } catch {
              errors++;
            }
          }

          // Update progress
          const totalMatched =
            (balSheet?.rows.filter((r) => r.status === "matched").length || 0) +
            (advSheet?.rows.filter((r) => r.status === "matched").length || 0);
          if (totalMatched > 0) {
            setProgress(((balSuccess + advSuccess) / totalMatched) * 100);
          }
        }
      }

      setImportResults({ balSuccess, advSuccess, errors });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });

      toast({
        title: "Import completed",
        description: `Updated ${balSuccess} balances, created ${advSuccess} advances${errors > 0 ? `, ${errors} errors` : ""}`,
      });
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setProgress(100);
    }
  };

  const handleClose = () => {
    if (isImporting) return;
    setBalSheet(null);
    setAdvSheet(null);
    setImportResults(null);
    setProgress(0);
    onOpenChange(false);
  };

  const totalMatched =
    (balSheet?.matched || 0) + (advSheet?.matched || 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Customer Balances & Advances
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4">
          {/* File Upload */}
          <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing || isImporting}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || isImporting}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isProcessing ? "Processing..." : "Upload Excel File"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              File must contain sheets named "Bal" (outstanding) and/or "Adv" (advances)
            </p>
          </div>

          {/* Sheet Statistics */}
          {(balSheet || advSheet) && (
            <div className="grid grid-cols-2 gap-4">
              {balSheet && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Sheet: {balSheet.name}</span>
                    <Badge variant="secondary">{balSheet.rows.length} rows</Badge>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Matched: {balSheet.matched}
                    </span>
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Not found: {balSheet.notFound}
                    </span>
                  </div>
                </div>
              )}
              {advSheet && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">Sheet: {advSheet.name}</span>
                    <Badge variant="secondary">{advSheet.rows.length} rows</Badge>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Matched: {advSheet.matched}
                    </span>
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Not found: {advSheet.notFound}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview Table */}
          {(balSheet || advSheet) && (
            <ScrollArea className="h-[300px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Party Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Bal rows */}
                  {balSheet?.rows.slice(0, 25).map((row, idx) => (
                    <TableRow key={`bal-${idx}`}>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          Outstanding
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{row.partyName}</TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell className="text-right">₹{row.closing.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.status === "matched" ? (
                          <span className="text-green-600 flex items-center gap-1 text-sm">
                            <CheckCircle2 className="h-3 w-3" />
                            {row.matchedCustomerName}
                          </span>
                        ) : (
                          <span className="text-red-600 flex items-center gap-1 text-sm">
                            <XCircle className="h-3 w-3" /> Not found
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Adv rows */}
                  {advSheet?.rows.slice(0, 25).map((row, idx) => (
                    <TableRow key={`adv-${idx}`}>
                      <TableCell>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          Advance
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{row.partyName}</TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell className="text-right">₹{row.closing.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.status === "matched" ? (
                          <span className="text-green-600 flex items-center gap-1 text-sm">
                            <CheckCircle2 className="h-3 w-3" />
                            {row.matchedCustomerName}
                          </span>
                        ) : (
                          <span className="text-red-600 flex items-center gap-1 text-sm">
                            <XCircle className="h-3 w-3" /> Not found
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {((balSheet?.rows.length || 0) + (advSheet?.rows.length || 0)) > 50 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        ... and {(balSheet?.rows.length || 0) + (advSheet?.rows.length || 0) - 50} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Progress Bar */}
          {isImporting && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Importing... {Math.round(progress)}%
              </p>
            </div>
          )}

          {/* Import Results */}
          {importResults && (
            <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Import Completed</span>
              </div>
              <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                <p>• Updated {importResults.balSuccess} customer balances</p>
                <p>• Created {importResults.advSuccess} advance records</p>
                {importResults.errors > 0 && (
                  <p className="text-amber-600">• {importResults.errors} errors occurred</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {importResults ? "Close" : "Cancel"}
          </Button>
          {!importResults && (balSheet || advSheet) && (
            <Button
              onClick={handleImport}
              disabled={isImporting || totalMatched === 0}
            >
              {isImporting ? "Importing..." : `Import ${totalMatched} Records`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
