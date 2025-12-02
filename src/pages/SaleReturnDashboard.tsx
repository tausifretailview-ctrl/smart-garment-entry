import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Printer, Trash2, Plus, Search } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { SaleReturnPrint } from "@/components/SaleReturnPrint";

interface SaleReturn {
  id: string;
  return_number: string | null;
  customer_name: string;
  original_sale_number: string | null;
  return_date: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  notes: string | null;
  items?: SaleReturnItem[];
}

interface SaleReturnItem {
  id: string;
  product_name: string;
  size: string;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  line_total: number;
}

interface BusinessDetails {
  business_name: string | null;
  address: string | null;
  mobile_number: string | null;
  gst_number: string | null;
}

export default function SaleReturnDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [returnToDelete, setReturnToDelete] = useState<string | null>(null);

  const [returnToPrint, setReturnToPrint] = useState<SaleReturn | null>(null);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  useEffect(() => {
    if (currentOrganization) {
      fetchReturns();
      fetchBusinessDetails();
    }
  }, [currentOrganization]);

  const fetchBusinessDetails = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("business_name, address, mobile_number, gst_number")
      .eq("organization_id", currentOrganization?.id)
      .single();

    if (error) {
      console.error("Error fetching business details:", error);
      return;
    }

    setBusinessDetails(data);
  };

  const fetchReturns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sale_returns")
      .select("*")
      .eq("organization_id", currentOrganization?.id)
      .order("return_date", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load returns", variant: "destructive" });
      setLoading(false);
      return;
    }

    setReturns(data || []);
    setLoading(false);
  };

  const fetchReturnItems = async (returnId: string) => {
    const { data, error } = await supabase
      .from("sale_return_items")
      .select("*")
      .eq("return_id", returnId);

    if (error) {
      toast({ title: "Error", description: "Failed to load return items", variant: "destructive" });
      return [];
    }

    return data || [];
  };

  const toggleRow = async (returnId: string) => {
    const newExpanded = new Set(expandedRows);
    
    if (newExpanded.has(returnId)) {
      newExpanded.delete(returnId);
    } else {
      newExpanded.add(returnId);
      const returnRecord = returns.find((r) => r.id === returnId);
      if (returnRecord && !returnRecord.items) {
        const items = await fetchReturnItems(returnId);
        setReturns(returns.map((r) => (r.id === returnId ? { ...r, items } : r)));
      }
    }
    
    setExpandedRows(newExpanded);
  };

  const handleDelete = async () => {
    if (!returnToDelete) return;

    const { error } = await supabase
      .from("sale_returns")
      .delete()
      .eq("id", returnToDelete);

    if (error) {
      toast({ title: "Error", description: "Failed to delete return", variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Return deleted successfully" });
    setReturns(returns.filter((r) => r.id !== returnToDelete));
    setDeleteDialogOpen(false);
    setReturnToDelete(null);
  };

  const handlePrintClick = async (returnRecord: SaleReturn) => {
    if (!returnRecord.items) {
      const items = await fetchReturnItems(returnRecord.id);
      setReturnToPrint({ ...returnRecord, items });
    } else {
      setReturnToPrint(returnRecord);
    }
    setTimeout(() => handlePrint(), 100);
  };

  const filteredReturns = returns.filter((ret) => {
    const search = searchTerm.toLowerCase();
    return (
      ret.return_number?.toLowerCase().includes(search) ||
      ret.customer_name.toLowerCase().includes(search) ||
      ret.original_sale_number?.toLowerCase().includes(search) ||
      ret.return_date.includes(search)
    );
  });

  const totalReturns = filteredReturns.length;
  const totalValue = filteredReturns.reduce((sum, ret) => sum + ret.net_amount, 0);

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Sale Returns</h1>
          <Button onClick={() => navigate("/sale-return-entry")}>
            <Plus className="h-4 w-4 mr-2" />
            New Return
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalReturns}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Return Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalValue.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by return number, customer, sale number, or date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredReturns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No returns found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Return No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Original Sale No</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((ret) => (
                    <>
                      <TableRow key={ret.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleRow(ret.id)}
                          >
                            {expandedRows.has(ret.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ret.return_number || "-"}</Badge>
                        </TableCell>
                        <TableCell>{new Date(ret.return_date).toLocaleDateString()}</TableCell>
                        <TableCell>{ret.customer_name}</TableCell>
                        <TableCell>
                          {ret.original_sale_number ? (
                            <Badge variant="outline">{ret.original_sale_number}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">₹{ret.gross_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{ret.gst_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">₹{ret.net_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintClick(ret)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setReturnToDelete(ret.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(ret.id) && ret.items && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/50">
                            <div className="p-4">
                              <h4 className="font-medium mb-2">Return Items:</h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Barcode</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">GST%</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {ret.items.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.product_name}</TableCell>
                                      <TableCell>{item.size}</TableCell>
                                      <TableCell>{item.barcode || "-"}</TableCell>
                                      <TableCell className="text-right">{item.quantity}</TableCell>
                                      <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                                      <TableCell className="text-right">{item.gst_percent}%</TableCell>
                                      <TableCell className="text-right">₹{item.line_total.toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {ret.notes && (
                                <div className="mt-4">
                                  <span className="font-medium">Notes: </span>
                                  <span className="text-muted-foreground">{ret.notes}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sale Return?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the return record.
                Note: Stock will NOT be automatically adjusted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div style={{ display: "none" }}>
          {returnToPrint && businessDetails && (
            <SaleReturnPrint
              ref={printRef}
              saleReturn={returnToPrint}
              businessDetails={businessDetails}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
