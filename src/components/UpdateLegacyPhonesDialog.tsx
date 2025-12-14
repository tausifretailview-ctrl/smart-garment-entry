import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Phone, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { normalizePhoneNumber } from "@/utils/excelImportUtils";

interface UpdateLegacyPhonesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PhoneMatch {
  invoiceId: string;
  customerName: string;
  phone: string;
}

interface UpdateResult {
  updated: number;
  notMatched: number;
  alreadyHasPhone: number;
}

export const UpdateLegacyPhonesDialog = ({
  open,
  onOpenChange,
}: UpdateLegacyPhonesDialogProps) => {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"upload" | "preview" | "updating" | "done">("upload");
  const [excelData, setExcelData] = useState<Map<string, string>>(new Map()); // name -> phone
  const [matches, setMatches] = useState<PhoneMatch[]>([]);
  const [stats, setStats] = useState({ total: 0, matchable: 0, alreadyHasPhone: 0 });
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UpdateResult | null>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrganization?.id) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      // Build name -> phone map from Excel
      const nameToPhone = new Map<string, string>();
      for (const row of jsonData) {
        // Try common column names for customer name
        const name = (
          row["Customer Name"] || 
          row["customer_name"] || 
          row["Name"] || 
          row["name"] ||
          row["Partner"] ||
          row["partner"] ||
          ""
        ).toString().trim().toLowerCase();
        
        // Try common column names for phone
        const phoneRaw = (
          row["Mobile Number"] || 
          row["mobile_number"] || 
          row["Phone"] || 
          row["phone"] ||
          row["Mobile"] ||
          row["mobile"] ||
          ""
        ).toString();
        
        const phone = normalizePhoneNumber(phoneRaw);
        
        if (name && phone) {
          nameToPhone.set(name, phone);
        }
      }

      setExcelData(nameToPhone);

      // Fetch legacy invoices without phone
      const { data: legacyInvoices, error } = await supabase
        .from("legacy_invoices")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      const invoicesWithoutPhone = legacyInvoices?.filter(inv => !inv.phone) || [];
      const invoicesWithPhone = legacyInvoices?.filter(inv => inv.phone) || [];

      // Find matches
      const foundMatches: PhoneMatch[] = [];
      for (const invoice of invoicesWithoutPhone) {
        const normalizedName = invoice.customer_name.trim().toLowerCase();
        const matchedPhone = nameToPhone.get(normalizedName);
        if (matchedPhone) {
          foundMatches.push({
            invoiceId: invoice.id,
            customerName: invoice.customer_name,
            phone: matchedPhone,
          });
        }
      }

      setMatches(foundMatches);
      setStats({
        total: invoicesWithoutPhone.length,
        matchable: foundMatches.length,
        alreadyHasPhone: invoicesWithPhone.length,
      });
      setStep("preview");

      toast({
        title: "File parsed successfully",
        description: `Found ${nameToPhone.size} customers with phones in Excel`,
      });
    } catch (error: any) {
      toast({
        title: "Error parsing file",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [currentOrganization?.id, toast]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");

      setStep("updating");
      const BATCH_SIZE = 100;
      let updated = 0;

      for (let i = 0; i < matches.length; i += BATCH_SIZE) {
        const batch = matches.slice(i, i + BATCH_SIZE);
        
        // Update each invoice in the batch
        for (const match of batch) {
          const { error } = await supabase
            .from("legacy_invoices")
            .update({ phone: match.phone })
            .eq("id", match.invoiceId);
          
          if (!error) updated++;
        }

        setProgress(Math.round(((i + batch.length) / matches.length) * 100));
      }

      return {
        updated,
        notMatched: stats.total - stats.matchable,
        alreadyHasPhone: stats.alreadyHasPhone,
      };
    },
    onSuccess: (result) => {
      setResult(result);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["legacy-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["relink-stats"] });
      toast({
        title: "Phones updated successfully",
        description: `${result.updated} legacy invoices now have phone numbers`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating phones",
        description: error.message,
        variant: "destructive",
      });
      setStep("preview");
    },
  });

  const handleClose = () => {
    setStep("upload");
    setExcelData(new Map());
    setMatches([]);
    setStats({ total: 0, matchable: 0, alreadyHasPhone: 0 });
    setProgress(0);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Update Legacy Invoice Phones
          </DialogTitle>
          <DialogDescription>
            Upload Customer Master Excel to add phone numbers to legacy invoices
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Upload Excel file with Customer Name and Mobile Number columns
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="excel-upload"
              />
              <label htmlFor="excel-upload">
                <Button asChild>
                  <span>Select Excel File</span>
                </Button>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected columns: "Customer Name" / "Name" and "Mobile Number" / "Phone"
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary">{stats.matchable}</p>
                <p className="text-sm text-muted-foreground">Can be updated</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{stats.total - stats.matchable}</p>
                <p className="text-sm text-muted-foreground">No match found</p>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>• {stats.alreadyHasPhone} invoices already have phone numbers</p>
              <p>• {excelData.size} customers found in Excel with phones</p>
            </div>

            {matches.length > 0 && (
              <div className="max-h-40 overflow-y-auto border rounded p-2 text-xs">
                <p className="font-medium mb-1">Sample matches:</p>
                {matches.slice(0, 5).map((m, i) => (
                  <p key={i} className="text-muted-foreground">
                    {m.customerName} → {m.phone}
                  </p>
                ))}
                {matches.length > 5 && (
                  <p className="text-muted-foreground">...and {matches.length - 5} more</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={() => updateMutation.mutate()} 
                disabled={stats.matchable === 0}
                className="flex-1"
              >
                Update {stats.matchable} Invoices
              </Button>
            </div>
          </div>
        )}

        {step === "updating" && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Updating phone numbers...</p>
              <p className="text-sm text-muted-foreground mb-4">
                {Math.round((progress / 100) * matches.length)} / {matches.length}
              </p>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-lg font-medium">Update Complete!</p>
            </div>
            
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <p className="flex justify-between">
                <span>Phones added:</span>
                <span className="font-medium text-green-600">{result.updated}</span>
              </p>
              <p className="flex justify-between">
                <span>No match in Excel:</span>
                <span className="font-medium">{result.notMatched}</span>
              </p>
              <p className="flex justify-between">
                <span>Already had phone:</span>
                <span className="font-medium">{result.alreadyHasPhone}</span>
              </p>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Now run "Re-link Legacy" to link invoices using phone matching
            </p>

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
