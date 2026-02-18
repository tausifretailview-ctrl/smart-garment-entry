import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Search, CheckCircle, AlertTriangle, RefreshCw, RotateCcw, Package, Activity, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Discrepancy {
  variant_id: string;
  barcode: string;
  product_name: string;
  size: string;
  current_stock_qty: number;
  calculated_stock_qty: number;
  discrepancy: number;
  opening_qty: number;
}

interface FixResult {
  barcode: string;
  product_name: string;
  size: string;
  old_qty: number;
  new_qty: number;
  adjustment?: number;
  opening?: number;
  purchases?: number;
  sales?: number;
  pur_returns?: number;
  sale_returns?: number;
}

interface HealthSummary {
  totalVariants: number;
  discrepancyCount: number;
  lastReconciliation: string | null;
  isLoading: boolean;
}

export const StockReconciliation = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [fixResults, setFixResults] = useState<FixResult[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [resultDialogTitle, setResultDialogTitle] = useState("Reconciliation Complete");
  const [health, setHealth] = useState<HealthSummary>({
    totalVariants: 0, discrepancyCount: 0, lastReconciliation: null, isLoading: true,
  });

  useEffect(() => {
    if (!currentOrganization?.id) return;
    const fetchHealth = async () => {
      setHealth(prev => ({ ...prev, isLoading: true }));
      try {
        const [variantRes, discRes, reconRes] = await Promise.all([
          supabase.from('product_variants').select('id', { count: 'exact', head: true })
            .eq('organization_id', currentOrganization.id).is('deleted_at', null),
          supabase.rpc('detect_stock_discrepancies', { p_organization_id: currentOrganization.id }),
          supabase.from('stock_movements').select('created_at')
            .eq('organization_id', currentOrganization.id).eq('movement_type', 'reconciliation')
            .order('created_at', { ascending: false }).limit(1),
        ]);
        setHealth({
          totalVariants: variantRes.count || 0,
          discrepancyCount: discRes.data?.length || 0,
          lastReconciliation: reconRes.data?.[0]?.created_at || null,
          isLoading: false,
        });
      } catch {
        setHealth(prev => ({ ...prev, isLoading: false }));
      }
    };
    fetchHealth();
  }, [currentOrganization?.id]);

  const handleScanDiscrepancies = async () => {
    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    try {
      const { data, error } = await supabase.rpc('detect_stock_discrepancies', {
        p_organization_id: currentOrganization.id
      });

      if (error) throw error;

      setDiscrepancies(data || []);
      setLastScanTime(new Date());

      if (!data || data.length === 0) {
        toast({
          title: "All Clear!",
          description: "No stock discrepancies found. Stock levels are accurate.",
        });
      } else {
        toast({
          title: "Discrepancies Found",
          description: `Found ${data.length} item(s) with stock discrepancies`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to scan for discrepancies",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleFixDiscrepancies = async () => {
    if (!currentOrganization?.id) return;

    setIsFixing(true);
    setShowFixDialog(false);
    
    try {
      const { data, error } = await supabase.rpc('fix_stock_discrepancies', {
        p_organization_id: currentOrganization.id
      });

      if (error) throw error;

      const result = data?.[0];
      const fixedCount = result?.fixed_count || 0;
      const details = (result?.details || []) as unknown as FixResult[];

      setFixResults(details);
      setDiscrepancies([]);
      setShowResultsDialog(true);
      setHealth(prev => ({ ...prev, discrepancyCount: 0, lastReconciliation: new Date().toISOString() }));

      toast({
        title: "Reconciliation Complete",
        description: `Fixed ${fixedCount} stock discrepancy(ies)`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fix discrepancies",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  const handleResetFromTransactions = async () => {
    if (!currentOrganization?.id) return;

    setIsResetting(true);
    setShowResetDialog(false);
    
    try {
      const { data, error } = await supabase.rpc('reset_stock_from_transactions', {
        p_organization_id: currentOrganization.id
      });

      if (error) throw error;

      const result = data?.[0];
      const fixedCount = result?.fixed_count || 0;
      const details = (result?.details || []) as unknown as FixResult[];

      setFixResults(details);
      setDiscrepancies([]);
      setResultDialogTitle("Stock Reset Complete");
      setShowResultsDialog(true);
      setHealth(prev => ({ ...prev, discrepancyCount: 0, lastReconciliation: new Date().toISOString() }));

      toast({
        title: "Stock Reset Complete",
        description: `Reset ${fixedCount} product variant(s) to match transaction history`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset stock",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Stock Reconciliation
        </CardTitle>
        <CardDescription>
          Detect and fix discrepancies between recorded stock levels and calculated movements
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stock Health Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Variants</p>
              {health.isLoading ? <Skeleton className="h-6 w-16" /> : (
                <p className="text-xl font-bold">{health.totalVariants.toLocaleString()}</p>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${health.discrepancyCount > 0 ? 'bg-destructive/10 border-destructive/20' : 'bg-success/10 border-success/20'}`}>
            <Activity className={`h-8 w-8 ${health.discrepancyCount > 0 ? 'text-destructive' : 'text-success'}`} />
            <div>
              <p className="text-sm text-muted-foreground">Discrepancies</p>
              {health.isLoading ? <Skeleton className="h-6 w-16" /> : (
                <p className="text-xl font-bold">{health.discrepancyCount}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Last Reconciliation</p>
              {health.isLoading ? <Skeleton className="h-6 w-24" /> : (
                <p className="text-sm font-medium">
                  {health.lastReconciliation ? new Date(health.lastReconciliation).toLocaleDateString() : 'Never'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button onClick={handleScanDiscrepancies} disabled={isScanning || isFixing}>
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Scan for Discrepancies
              </>
            )}
          </Button>

          {discrepancies.length > 0 && (
            <Button 
              variant="destructive" 
              onClick={() => setShowFixDialog(true)}
              disabled={isFixing || isResetting}
            >
              {isFixing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fixing...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Fix All ({discrepancies.length})
                </>
              )}
            </Button>
          )}

          <Button 
            variant="outline" 
            onClick={() => setShowResetDialog(true)}
            disabled={isResetting || isFixing || isScanning}
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Stock from Bills
              </>
            )}
          </Button>
        </div>

        {/* Last Scan Time */}
        {lastScanTime && (
          <p className="text-sm text-muted-foreground">
            Last scanned: {lastScanTime.toLocaleString()}
          </p>
        )}

        {/* Status Badge */}
        {lastScanTime && discrepancies.length === 0 && (
          <div className="flex items-center gap-2 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-green-600 dark:text-green-400 font-medium">
              Stock levels are accurate - no discrepancies found
            </span>
          </div>
        )}

        {/* Discrepancies Table */}
        {discrepancies.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border-b">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="font-medium text-destructive">
                {discrepancies.length} discrepancy(ies) found
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Calculated</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discrepancies.map((item) => (
                  <TableRow key={item.variant_id}>
                    <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell className="text-right">{item.opening_qty}</TableCell>
                    <TableCell className="text-right">{item.current_stock_qty}</TableCell>
                    <TableCell className="text-right">{item.calculated_stock_qty}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.discrepancy > 0 ? "destructive" : "secondary"}>
                        {item.discrepancy > 0 ? "+" : ""}{item.discrepancy}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Fix Confirmation Dialog */}
        <AlertDialog open={showFixDialog} onOpenChange={setShowFixDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fix Stock Discrepancies?</AlertDialogTitle>
              <AlertDialogDescription>
                This will update {discrepancies.length} product variant(s) to match their calculated 
                stock levels based on stock movements. A reconciliation record will be created in 
                stock movements for audit purposes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleFixDiscrepancies}>
                Fix All Discrepancies
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset Confirmation Dialog */}
        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Stock from Transaction History?</AlertDialogTitle>
              <AlertDialogDescription>
                This will recalculate ALL stock levels based on actual transaction records:
                <br /><br />
                <strong>Stock = Opening Qty + Purchases - Sales - Purchase Returns + Sale Returns</strong>
                <br /><br />
                Use this to fix negative stock or corrupted data from old bugs. This ignores all 
                previous stock movements and recalculates from scratch.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetFromTransactions}>
                Reset All Stock
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Results Dialog */}
        <AlertDialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
          <AlertDialogContent className="max-w-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                {resultDialogTitle}
              </AlertDialogTitle>
              <AlertDialogDescription>
                The following stock levels have been corrected:
              </AlertDialogDescription>
            </AlertDialogHeader>
            {fixResults.length > 0 && (
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Old Qty</TableHead>
                      <TableHead className="text-right">New Qty</TableHead>
                      {fixResults[0]?.purchases !== undefined ? (
                        <>
                          <TableHead className="text-right">Purchases</TableHead>
                          <TableHead className="text-right">Sales</TableHead>
                        </>
                      ) : (
                        <TableHead className="text-right">Adjustment</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fixResults.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.size}</TableCell>
                        <TableCell className="text-right">{item.old_qty}</TableCell>
                        <TableCell className="text-right">{item.new_qty}</TableCell>
                        {item.purchases !== undefined ? (
                          <>
                            <TableCell className="text-right text-green-600">+{item.purchases}</TableCell>
                            <TableCell className="text-right text-red-600">-{item.sales}</TableCell>
                          </>
                        ) : (
                          <TableCell className="text-right">
                            <Badge variant={item.adjustment && item.adjustment > 0 ? "default" : "secondary"}>
                              {item.adjustment && item.adjustment > 0 ? "+" : ""}{item.adjustment}
                            </Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setShowResultsDialog(false)}>
                Done
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
