import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Receipt, Search, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { BackToDashboard } from "@/components/BackToDashboard";

interface PurchaseItem {
  id: string;
  product_id: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
}

interface PurchaseBill {
  id: string;
  supplier_name: string;
  supplier_invoice_no: string;
  bill_date: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  notes: string;
  created_at: string;
  items?: PurchaseItem[];
}

const PurchaseBillDashboard = () => {
  const { toast } = useToast();
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<Record<string, PurchaseItem[]>>({});

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .order("bill_date", { ascending: false });

      if (error) throw error;

      setBills(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load purchase bills",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBillItems = async (billId: string) => {
    if (billItems[billId]) {
      return; // Already fetched
    }

    try {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("bill_id", billId)
        .order("created_at");

      if (error) throw error;

      setBillItems((prev) => ({
        ...prev,
        [billId]: data || [],
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load bill items",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = async (billId: string) => {
    if (expandedBill === billId) {
      setExpandedBill(null);
    } else {
      setExpandedBill(billId);
      await fetchBillItems(billId);
    }
  };

  const filteredBills = bills.filter(
    (bill) =>
      bill.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.supplier_invoice_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPurchaseAmount = filteredBills.reduce((sum, bill) => sum + bill.net_amount, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <BackToDashboard />
        <div className="mb-6 flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Purchase Bills</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Bills</CardDescription>
              <CardTitle className="text-3xl">{filteredBills.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Purchase Amount</CardDescription>
              <CardTitle className="text-3xl">₹{totalPurchaseAmount.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Average Bill Value</CardDescription>
              <CardTitle className="text-3xl">
                ₹{filteredBills.length > 0 ? (totalPurchaseAmount / filteredBills.length).toFixed(2) : "0.00"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">All Purchase Bills</CardTitle>
                <CardDescription>View and manage purchase history</CardDescription>
              </div>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by supplier or invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredBills.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No purchase bills found</p>
                <p className="text-sm">Create your first purchase bill to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBills.map((bill) => (
                  <Card
                    key={bill.id}
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => toggleExpanded(bill.id)}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="mt-1">
                            {expandedBill === bill.id ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div>
                                <h3 className="text-lg font-semibold text-foreground">
                                  {bill.supplier_name}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  Invoice: {bill.supplier_invoice_no}
                                </p>
                              </div>
                              <Badge variant="outline" className="whitespace-nowrap">
                                {format(new Date(bill.bill_date), "dd MMM yyyy")}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Gross Amount</p>
                                <p className="font-semibold">₹{bill.gross_amount.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">GST Amount</p>
                                <p className="font-semibold">₹{bill.gst_amount.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Net Amount</p>
                                <p className="font-semibold text-primary">₹{bill.net_amount.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Items</p>
                                <p className="font-semibold">
                                  {billItems[bill.id]?.length || "—"}
                                </p>
                              </div>
                            </div>

                            {bill.notes && (
                              <div className="mt-3 text-sm">
                                <p className="text-muted-foreground">Notes:</p>
                                <p className="text-foreground">{bill.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Items Table */}
                      {expandedBill === bill.id && billItems[bill.id] && billItems[bill.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="font-semibold mb-3">Purchase Items</h4>
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Size</TableHead>
                                  <TableHead>Barcode</TableHead>
                                  <TableHead>HSN</TableHead>
                                  <TableHead className="text-right">Qty</TableHead>
                                  <TableHead className="text-right">Pur Price</TableHead>
                                  <TableHead className="text-right">Sale Price</TableHead>
                                  <TableHead className="text-right">GST %</TableHead>
                                  <TableHead className="text-right">Line Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {billItems[bill.id].map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.size}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {item.barcode || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs">{item.hsn_code || "—"}</TableCell>
                                    <TableCell className="text-right">{item.qty}</TableCell>
                                    <TableCell className="text-right">₹{item.pur_price}</TableCell>
                                    <TableCell className="text-right">₹{item.sale_price}</TableCell>
                                    <TableCell className="text-right">{item.gst_per}%</TableCell>
                                    <TableCell className="text-right font-semibold">
                                      ₹{item.line_total.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PurchaseBillDashboard;
