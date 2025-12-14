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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link2, CheckCircle, AlertCircle, Loader2, ChevronDown, Users, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RelinkLegacyInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RelinkStats {
  totalUnlinked: number;
  canAutoLink: number;
  canAutoLinkByPhone: number;
  multipleMatches: number;
  noMatches: number;
  multipleMatchNames: { name: string; count: number; phones: string[] }[];
  noMatchNames: { name: string; count: number }[];
}

interface RelinkResult {
  linked: number;
  linkedByName: number;
  linkedByPhone: number;
  noMatch: number;
  noMatchNames: { name: string; count: number }[];
  multipleMatch: number;
  multipleMatchNames: { name: string; count: number; phones: string[] }[];
  errors: number;
}

export function RelinkLegacyInvoicesDialog({ open, onOpenChange }: RelinkLegacyInvoicesDialogProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRelinking, setIsRelinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RelinkResult | null>(null);
  const [showNoMatchDetails, setShowNoMatchDetails] = useState(false);
  const [showMultipleMatchDetails, setShowMultipleMatchDetails] = useState(false);

  // Fetch stats for preview
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["legacy-invoice-relink-stats", currentOrganization?.id],
    queryFn: async (): Promise<RelinkStats> => {
      if (!currentOrganization?.id) {
        return { 
          totalUnlinked: 0, canAutoLink: 0, canAutoLinkByPhone: 0, 
          multipleMatches: 0, noMatches: 0, multipleMatchNames: [], noMatchNames: [] 
        };
      }

      // Get unlinked legacy invoices
      const { data: unlinkedInvoices, error: invError } = await supabase
        .from("legacy_invoices")
        .select("customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("customer_id", null);

      if (invError) throw invError;

      const totalUnlinked = unlinkedInvoices?.length || 0;
      
      // Group invoices by customer name
      const invoicesByName = new Map<string, { count: number; phones: Set<string> }>();
      unlinkedInvoices?.forEach(i => {
        const key = i.customer_name.toLowerCase().trim();
        if (!invoicesByName.has(key)) {
          invoicesByName.set(key, { count: 0, phones: new Set() });
        }
        const entry = invoicesByName.get(key)!;
        entry.count++;
        if (i.phone) entry.phones.add(i.phone);
      });

      // Get all customers for matching
      const { data: customers, error: custError } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (custError) throw custError;

      // Build customer maps
      const customerByName = new Map<string, { id: string; phone: string | null }[]>();
      const customerByPhone = new Map<string, string>();
      
      customers?.forEach(c => {
        const nameKey = c.customer_name.toLowerCase().trim();
        if (!customerByName.has(nameKey)) {
          customerByName.set(nameKey, []);
        }
        customerByName.get(nameKey)!.push({ id: c.id, phone: c.phone });
        
        if (c.phone) {
          const normalizedPhone = c.phone.replace(/[^\d]/g, '').slice(-10);
          if (normalizedPhone.length >= 10) {
            customerByPhone.set(normalizedPhone, c.id);
          }
        }
      });

      // Calculate stats
      let canAutoLink = 0;
      let canAutoLinkByPhone = 0;
      let multipleMatches = 0;
      let noMatches = 0;
      const multipleMatchNames: { name: string; count: number; phones: string[] }[] = [];
      const noMatchNames: { name: string; count: number }[] = [];

      invoicesByName.forEach((data, name) => {
        const matches = customerByName.get(name) || [];
        
        if (matches.length === 1) {
          canAutoLink++;
        } else if (matches.length > 1) {
          // Check if we can match by phone
          let phoneMatched = false;
          for (const phone of data.phones) {
            const normalizedPhone = phone.replace(/[^\d]/g, '').slice(-10);
            if (normalizedPhone.length >= 10 && customerByPhone.has(normalizedPhone)) {
              phoneMatched = true;
              break;
            }
          }
          
          if (phoneMatched) {
            canAutoLinkByPhone++;
          } else {
            multipleMatches++;
            // Get original case name from first invoice
            const originalName = unlinkedInvoices?.find(i => 
              i.customer_name.toLowerCase().trim() === name
            )?.customer_name || name;
            multipleMatchNames.push({ 
              name: originalName, 
              count: data.count,
              phones: matches.map(m => m.phone).filter(Boolean) as string[]
            });
          }
        } else {
          noMatches++;
          const originalName = unlinkedInvoices?.find(i => 
            i.customer_name.toLowerCase().trim() === name
          )?.customer_name || name;
          noMatchNames.push({ name: originalName, count: data.count });
        }
      });

      // Sort by count descending
      multipleMatchNames.sort((a, b) => b.count - a.count);
      noMatchNames.sort((a, b) => b.count - a.count);

      return { 
        totalUnlinked, 
        canAutoLink, 
        canAutoLinkByPhone,
        multipleMatches, 
        noMatches, 
        multipleMatchNames,
        noMatchNames
      };
    },
    enabled: open && !!currentOrganization?.id,
  });

  const relinkMutation = useMutation({
    mutationFn: async (): Promise<RelinkResult> => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      setIsRelinking(true);
      setProgress(0);
      setResult(null);

      // Get all customers for matching
      const { data: customers, error: custError } = await supabase
        .from("customers")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (custError) throw custError;

      // Build customer maps
      const customerByName = new Map<string, { id: string; phone: string | null }[]>();
      const customerByPhone = new Map<string, string>();
      
      customers?.forEach(c => {
        const nameKey = c.customer_name.toLowerCase().trim();
        if (!customerByName.has(nameKey)) {
          customerByName.set(nameKey, []);
        }
        customerByName.get(nameKey)!.push({ id: c.id, phone: c.phone });
        
        if (c.phone) {
          const normalizedPhone = c.phone.replace(/[^\d]/g, '').slice(-10);
          if (normalizedPhone.length >= 10) {
            customerByPhone.set(normalizedPhone, c.id);
          }
        }
      });

      // Get unlinked legacy invoices
      const { data: unlinkedInvoices, error: invError } = await supabase
        .from("legacy_invoices")
        .select("id, customer_name, phone")
        .eq("organization_id", currentOrganization.id)
        .is("customer_id", null);

      if (invError) throw invError;

      let linkedByName = 0;
      let linkedByPhone = 0;
      let noMatch = 0;
      let multipleMatch = 0;
      let errors = 0;
      
      const noMatchNamesMap = new Map<string, number>();
      const multipleMatchNamesMap = new Map<string, { count: number; phones: string[] }>();

      // Group invoices by customer name for batch updating
      const invoicesByCustomer = new Map<string, { ids: string[]; phones: Set<string> }>();
      unlinkedInvoices?.forEach(inv => {
        const key = inv.customer_name.toLowerCase().trim();
        if (!invoicesByCustomer.has(key)) {
          invoicesByCustomer.set(key, { ids: [], phones: new Set() });
        }
        const entry = invoicesByCustomer.get(key)!;
        entry.ids.push(inv.id);
        if (inv.phone) entry.phones.add(inv.phone);
      });

      const entries = Array.from(invoicesByCustomer.entries());

      for (let i = 0; i < entries.length; i++) {
        const [customerName, data] = entries[i];
        const matches = customerByName.get(customerName) || [];
        let customerId: string | null = null;
        let matchType: 'name' | 'phone' | 'none' = 'none';

        if (matches.length === 1) {
          // Unique name match
          customerId = matches[0].id;
          matchType = 'name';
        } else if (matches.length > 1) {
          // Multiple name matches - try phone matching
          for (const phone of data.phones) {
            const normalizedPhone = phone.replace(/[^\d]/g, '').slice(-10);
            if (normalizedPhone.length >= 10) {
              const phoneMatch = customerByPhone.get(normalizedPhone);
              if (phoneMatch) {
                customerId = phoneMatch;
                matchType = 'phone';
                break;
              }
            }
          }
          
          if (!customerId) {
            // Still couldn't match
            multipleMatch += data.ids.length;
            const originalName = unlinkedInvoices?.find(inv => 
              inv.customer_name.toLowerCase().trim() === customerName
            )?.customer_name || customerName;
            multipleMatchNamesMap.set(originalName, { 
              count: data.ids.length,
              phones: matches.map(m => m.phone).filter(Boolean) as string[]
            });
          }
        } else {
          // No match found
          noMatch += data.ids.length;
          const originalName = unlinkedInvoices?.find(inv => 
            inv.customer_name.toLowerCase().trim() === customerName
          )?.customer_name || customerName;
          noMatchNamesMap.set(originalName, (noMatchNamesMap.get(originalName) || 0) + data.ids.length);
        }

        if (customerId) {
          // Update all invoices for this customer
          const { error } = await supabase
            .from("legacy_invoices")
            .update({ customer_id: customerId })
            .in("id", data.ids);

          if (error) {
            errors += data.ids.length;
          } else {
            if (matchType === 'name') {
              linkedByName += data.ids.length;
            } else {
              linkedByPhone += data.ids.length;
            }
          }
        }

        // Update progress
        setProgress(Math.round(((i + 1) / entries.length) * 100));
      }

      const noMatchNames = Array.from(noMatchNamesMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      
      const multipleMatchNames = Array.from(multipleMatchNamesMap.entries())
        .map(([name, data]) => ({ name, count: data.count, phones: data.phones }))
        .sort((a, b) => b.count - a.count);

      return { 
        linked: linkedByName + linkedByPhone,
        linkedByName,
        linkedByPhone,
        noMatch, 
        noMatchNames,
        multipleMatch,
        multipleMatchNames,
        errors 
      };
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["legacy-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["legacy-invoice-relink-stats"] });
      toast({
        title: "Re-linking completed",
        description: `${data.linked} linked (${data.linkedByName} by name, ${data.linkedByPhone} by phone), ${data.noMatch + data.multipleMatch} skipped`,
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
      setShowNoMatchDetails(false);
      setShowMultipleMatchDetails(false);
      onOpenChange(false);
    }
  };

  const totalCanLink = (stats?.canAutoLink || 0) + (stats?.canAutoLinkByPhone || 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Re-link Legacy Invoices
          </DialogTitle>
          <DialogDescription>
            Match unlinked legacy invoices to existing customers by name and phone
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full max-h-[60vh]">
            <div className="space-y-4 py-4 pr-4">
              {isLoadingStats ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : result ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Re-linking completed!</span>
                  </div>
                  
                  {/* Results Summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-600">{result.linked}</p>
                      <p className="text-xs text-muted-foreground">Total Linked</p>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-yellow-600">{result.noMatch + result.multipleMatch}</p>
                      <p className="text-xs text-muted-foreground">Total Skipped</p>
                    </div>
                  </div>

                  {/* Linked Breakdown */}
                  <div className="bg-muted/50 p-3 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Linked by Name:
                      </span>
                      <span className="font-medium text-green-600">{result.linkedByName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Linked by Phone:
                      </span>
                      <span className="font-medium text-green-600">{result.linkedByPhone}</span>
                    </div>
                    {result.errors > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Errors:</span>
                        <span className="font-medium">{result.errors}</span>
                      </div>
                    )}
                  </div>

                  {/* No Match Details */}
                  {result.noMatchNames.length > 0 && (
                    <Collapsible open={showNoMatchDetails} onOpenChange={setShowNoMatchDetails}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between h-auto py-2 px-3">
                          <span className="text-sm text-red-600">
                            No Match Found: {result.noMatch} invoices ({result.noMatchNames.length} customers)
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${showNoMatchDetails ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg mt-2 max-h-40 overflow-y-auto">
                          <p className="text-xs text-muted-foreground mb-2">
                            These customers don't exist in your Customer Master. Add them first:
                          </p>
                          <div className="space-y-1">
                            {result.noMatchNames.slice(0, 20).map((item, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="truncate flex-1 mr-2">{item.name}</span>
                                <span className="text-muted-foreground shrink-0">{item.count} inv</span>
                              </div>
                            ))}
                            {result.noMatchNames.length > 20 && (
                              <p className="text-xs text-muted-foreground">
                                ... and {result.noMatchNames.length - 20} more
                              </p>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Multiple Match Details */}
                  {result.multipleMatchNames.length > 0 && (
                    <Collapsible open={showMultipleMatchDetails} onOpenChange={setShowMultipleMatchDetails}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between h-auto py-2 px-3">
                          <span className="text-sm text-yellow-600">
                            Multiple Matches: {result.multipleMatch} invoices ({result.multipleMatchNames.length} customers)
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${showMultipleMatchDetails ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg mt-2 max-h-40 overflow-y-auto">
                          <p className="text-xs text-muted-foreground mb-2">
                            These names have duplicate customers. Merge duplicates or add phone numbers:
                          </p>
                          <div className="space-y-2">
                            {result.multipleMatchNames.slice(0, 20).map((item, idx) => (
                              <div key={idx} className="text-sm">
                                <div className="flex justify-between">
                                  <span className="truncate flex-1 mr-2 font-medium">{item.name}</span>
                                  <span className="text-muted-foreground shrink-0">{item.count} inv</span>
                                </div>
                                {item.phones.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Phones: {item.phones.join(', ')}
                                  </p>
                                )}
                              </div>
                            ))}
                            {result.multipleMatchNames.length > 20 && (
                              <p className="text-xs text-muted-foreground">
                                ... and {result.multipleMatchNames.length - 20} more
                              </p>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
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
                      <span className="text-sm flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Can Link by Name:
                      </span>
                      <span className="font-medium">{stats?.canAutoLink || 0} customers</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span className="text-sm flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        Can Link by Phone (duplicates):
                      </span>
                      <span className="font-medium">{stats?.canAutoLinkByPhone || 0} customers</span>
                    </div>
                    <div className="flex justify-between text-yellow-600">
                      <span className="text-sm">Multiple Matches (skip):</span>
                      <span className="font-medium">{stats?.multipleMatches || 0} customers</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span className="text-sm">No Match Found (skip):</span>
                      <span className="font-medium">{stats?.noMatches || 0} customers</span>
                    </div>
                  </div>

                  {/* Preview of skipped names */}
                  {stats && stats.noMatchNames && stats.noMatchNames.length > 0 && (
                    <Collapsible open={showNoMatchDetails} onOpenChange={setShowNoMatchDetails}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between h-auto py-2">
                          <span className="text-xs text-red-600">
                            View {stats.noMatchNames.length} customers with no match
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${showNoMatchDetails ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg mt-1 max-h-32 overflow-y-auto">
                          <div className="space-y-1">
                            {stats.noMatchNames.slice(0, 15).map((item, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="truncate flex-1 mr-2">{item.name}</span>
                                <span className="text-muted-foreground shrink-0">{item.count} inv</span>
                              </div>
                            ))}
                            {stats.noMatchNames.length > 15 && (
                              <p className="text-xs text-muted-foreground">
                                ... and {stats.noMatchNames.length - 15} more
                              </p>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {stats && stats.multipleMatchNames && stats.multipleMatchNames.length > 0 && (
                    <Collapsible open={showMultipleMatchDetails} onOpenChange={setShowMultipleMatchDetails}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between h-auto py-2">
                          <span className="text-xs text-yellow-600">
                            View {stats.multipleMatchNames.length} customers with duplicates
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${showMultipleMatchDetails ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg mt-1 max-h-32 overflow-y-auto">
                          <div className="space-y-1">
                            {stats.multipleMatchNames.slice(0, 15).map((item, idx) => (
                              <div key={idx} className="text-xs">
                                <div className="flex justify-between">
                                  <span className="truncate flex-1 mr-2">{item.name}</span>
                                  <span className="text-muted-foreground shrink-0">{item.count} inv</span>
                                </div>
                                {item.phones.length > 0 && (
                                  <p className="text-muted-foreground text-[10px]">
                                    Phones: {item.phones.slice(0, 2).join(', ')}{item.phones.length > 2 ? '...' : ''}
                                  </p>
                                )}
                              </div>
                            ))}
                            {stats.multipleMatchNames.length > 15 && (
                              <p className="text-xs text-muted-foreground">
                                ... and {stats.multipleMatchNames.length - 15} more
                              </p>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {stats && (stats.multipleMatches > 0 || stats.noMatches > 0) && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>
                        To link more invoices: add missing customers, merge duplicate customers, 
                        or re-import legacy invoices with phone numbers for matching.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
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
                disabled={isRelinking || !stats || totalCanLink === 0}
              >
                {isRelinking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Re-linking...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Re-link {totalCanLink} Customers
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
