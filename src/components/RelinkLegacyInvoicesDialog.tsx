import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Link2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RelinkLegacyInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RelinkStats {
  totalUnlinked: number;
  canAutoLink: number;
  multipleMatches: number;
  noMatches: number;
}

export function RelinkLegacyInvoicesDialog({ open, onOpenChange }: RelinkLegacyInvoicesDialogProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRelinking, setIsRelinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ linked: number; skipped: number; errors: number } | null>(null);

  // Fetch stats for preview
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["legacy-invoice-relink-stats", currentOrganization?.id],
    queryFn: async (): Promise<RelinkStats> => {
      if (!currentOrganization?.id) return { totalUnlinked: 0, canAutoLink: 0, multipleMatches: 0, noMatches: 0 };

      // Get unlinked legacy invoices grouped by customer name
      const { data: unlinkedInvoices, error: invError } = await supabase
        .from("legacy_invoices")
        .select("customer_name")
        .eq("organization_id", currentOrganization.id)
        .is("customer_id", null);

      if (invError) throw invError;

      const totalUnlinked = unlinkedInvoices?.length || 0;
      
      // Get unique customer names from unlinked invoices
      const uniqueNames = [...new Set(unlinkedInvoices?.map(i => i.customer_name.toLowerCase().trim()) || [])];

      // Get all customers for matching
      const { data: customers, error: custError } = await supabase
        .from("customers")
        .select("id, customer_name")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (custError) throw custError;

      // Build customer name map (lowercase -> list of customers)
      const customerMap = new Map<string, { id: string; name: string }[]>();
      customers?.forEach(c => {
        const key = c.customer_name.toLowerCase().trim();
        if (!customerMap.has(key)) {
          customerMap.set(key, []);
        }
        customerMap.get(key)!.push({ id: c.id, name: c.customer_name });
      });

      // Calculate stats
      let canAutoLink = 0;
      let multipleMatches = 0;
      let noMatches = 0;

      uniqueNames.forEach(name => {
        const matches = customerMap.get(name) || [];
        if (matches.length === 1) {
          canAutoLink++;
        } else if (matches.length > 1) {
          multipleMatches++;
        } else {
          noMatches++;
        }
      });

      return { totalUnlinked, canAutoLink, multipleMatches, noMatches };
    },
    enabled: open && !!currentOrganization?.id,
  });

  const relinkMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      setIsRelinking(true);
      setProgress(0);
      setResult(null);

      // Get all customers for matching
      const { data: customers, error: custError } = await supabase
        .from("customers")
        .select("id, customer_name")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (custError) throw custError;

      // Build customer name map (lowercase -> customer id) - only for unique matches
      const customerMap = new Map<string, string>();
      const duplicateNames = new Set<string>();
      
      customers?.forEach(c => {
        const key = c.customer_name.toLowerCase().trim();
        if (customerMap.has(key)) {
          duplicateNames.add(key);
        } else {
          customerMap.set(key, c.id);
        }
      });

      // Remove duplicates from map
      duplicateNames.forEach(name => customerMap.delete(name));

      // Get unlinked legacy invoices
      const { data: unlinkedInvoices, error: invError } = await supabase
        .from("legacy_invoices")
        .select("id, customer_name")
        .eq("organization_id", currentOrganization.id)
        .is("customer_id", null);

      if (invError) throw invError;

      let linked = 0;
      let skipped = 0;
      let errors = 0;

      // Group invoices by customer name for batch updating
      const invoicesByCustomer = new Map<string, string[]>();
      unlinkedInvoices?.forEach(inv => {
        const key = inv.customer_name.toLowerCase().trim();
        if (!invoicesByCustomer.has(key)) {
          invoicesByCustomer.set(key, []);
        }
        invoicesByCustomer.get(key)!.push(inv.id);
      });

      const entries = Array.from(invoicesByCustomer.entries());
      const BATCH_SIZE = 50;

      for (let i = 0; i < entries.length; i++) {
        const [customerName, invoiceIds] = entries[i];
        const customerId = customerMap.get(customerName);

        if (customerId) {
          // Update all invoices for this customer
          const { error } = await supabase
            .from("legacy_invoices")
            .update({ customer_id: customerId })
            .in("id", invoiceIds);

          if (error) {
            errors += invoiceIds.length;
          } else {
            linked += invoiceIds.length;
          }
        } else {
          skipped += invoiceIds.length;
        }

        // Update progress
        setProgress(Math.round(((i + 1) / entries.length) * 100));
      }

      return { linked, skipped, errors };
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["legacy-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["legacy-invoice-relink-stats"] });
      toast({
        title: "Re-linking completed",
        description: `${data.linked} invoices linked, ${data.skipped} skipped, ${data.errors} errors`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error re-linking invoices",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsRelinking(false);
    },
  });

  const handleRelink = () => {
    relinkMutation.mutate();
  };

  const handleClose = () => {
    if (!isRelinking) {
      setResult(null);
      setProgress(0);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Re-link Legacy Invoices
          </DialogTitle>
          <DialogDescription>
            Match unlinked legacy invoices to existing customers by name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Re-linking completed!</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{result.linked}</p>
                  <p className="text-xs text-muted-foreground">Linked</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950 p-3 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{result.errors}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>
            </div>
          ) : isRelinking ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Re-linking invoices...</p>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">{progress}%</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Total Unlinked Invoices:</span>
                  <span className="font-medium">{stats?.totalUnlinked || 0}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span className="text-sm">Can Auto-Link (unique match):</span>
                  <span className="font-medium">{stats?.canAutoLink || 0} names</span>
                </div>
                <div className="flex justify-between text-yellow-600">
                  <span className="text-sm">Multiple Matches (skip):</span>
                  <span className="font-medium">{stats?.multipleMatches || 0} names</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span className="text-sm">No Match Found (skip):</span>
                  <span className="font-medium">{stats?.noMatches || 0} names</span>
                </div>
              </div>

              {stats && stats.multipleMatches > 0 && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Invoices with multiple matching customers will be skipped to avoid incorrect linking.
                    You can manually link them later.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isRelinking}>
                Cancel
              </Button>
              <Button 
                onClick={handleRelink} 
                disabled={isRelinking || !stats || stats.canAutoLink === 0}
              >
                {isRelinking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Re-linking...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Re-link Invoices
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
