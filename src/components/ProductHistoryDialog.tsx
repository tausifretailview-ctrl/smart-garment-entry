import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { Package, ShoppingCart, TrendingUp, TrendingDown, RotateCcw, ChevronDown, ChevronUp, Calendar } from "lucide-react";

interface ProductHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  organizationId: string;
}

export const ProductHistoryDialog = ({
  isOpen,
  onClose,
  productId,
  productName,
  organizationId,
}: ProductHistoryDialogProps) => {
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("sales");
  const [periodFilter, setPeriodFilter] = useState<"monthly" | "quarterly" | "yearly" | "custom">("monthly");
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const applyPeriod = (period: "monthly" | "quarterly" | "yearly" | "custom") => {
    setPeriodFilter(period);
    const now = new Date();
    if (period === "monthly") {
      setFromDate(format(startOfMonth(now), "yyyy-MM-dd"));
      setToDate(format(endOfMonth(now), "yyyy-MM-dd"));
    } else if (period === "quarterly") {
      setFromDate(format(startOfQuarter(now), "yyyy-MM-dd"));
      setToDate(format(endOfQuarter(now), "yyyy-MM-dd"));
    } else if (period === "yearly") {
      setFromDate(format(startOfYear(now), "yyyy-MM-dd"));
      setToDate(format(endOfYear(now), "yyyy-MM-dd"));
    }
    // custom: user picks manually
  };

  // Fetch product variants
  const { data: variants } = useQuery({
    queryKey: ["product-variants", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!productId,
  });

  // Fetch accurate totals
  const { data: saleTotals } = useQuery({
    queryKey: ["product-sale-totals", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("quantity, line_total")
        .eq("product_id", productId);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  const { data: purchaseTotals } = useQuery({
    queryKey: ["product-purchase-totals", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("qty, line_total")
        .eq("product_id", productId);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.qty || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  const { data: returnTotals } = useQuery({
    queryKey: ["product-return-totals", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_return_items")
        .select("quantity, line_total")
        .eq("product_id", productId);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  const { data: purchaseReturnTotals } = useQuery({
    queryKey: ["product-purchase-return-totals", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_return_items")
        .select("qty, line_total")
        .eq("product_id", productId);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.qty || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  // Detail queries — only fire when showDetails is true
  const { data: saleItems, isLoading: loadingSales } = useQuery({
    queryKey: ["product-sales", productId, fromDate, toDate],
    queryFn: async () => {
      let query = supabase
        .from("sale_items")
        .select(`*, sales:sale_id (sale_number, sale_date, customer_name)`)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (fromDate) query = query.gte("sales.sale_date", fromDate);
      if (toDate) query = query.lte("sales.sale_date", toDate);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((i: any) => i.sales !== null);
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const { data: purchaseItems, isLoading: loadingPurchases } = useQuery({
    queryKey: ["product-purchases", productId, fromDate, toDate],
    queryFn: async () => {
      let query = supabase
        .from("purchase_items")
        .select(`*, purchase_bills:bill_id (software_bill_no, bill_date, supplier_name)`)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (fromDate) query = query.gte("purchase_bills.bill_date", fromDate);
      if (toDate) query = query.lte("purchase_bills.bill_date", toDate);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((i: any) => i.purchase_bills !== null);
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const { data: saleReturns, isLoading: loadingSaleReturns } = useQuery({
    queryKey: ["product-sale-returns", productId, fromDate, toDate],
    queryFn: async () => {
      let query = supabase
        .from("sale_return_items")
        .select(`*, sale_returns:return_id (return_number, return_date, customer_name)`)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (fromDate) query = query.gte("sale_returns.return_date", fromDate);
      if (toDate) query = query.lte("sale_returns.return_date", toDate);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((i: any) => i.sale_returns !== null);
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const { data: stockMovements, isLoading: loadingMovements } = useQuery({
    queryKey: ["product-stock-movements", productId, variants, fromDate, toDate],
    queryFn: async () => {
      if (!variants || variants.length === 0) return [];
      const variantIds = variants.map((v) => v.id);
      let query = supabase
        .from("stock_movements")
        .select("*")
        .in("variant_id", variantIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!variants && variants.length > 0 && showDetails,
  });

  const { data: purchaseReturnItems, isLoading: loadingPurchaseReturns } = useQuery({
    queryKey: ["product-purchase-returns", productId, fromDate, toDate],
    queryFn: async () => {
      let query = supabase
        .from("purchase_return_items")
        .select(`*, purchase_returns:return_id (return_number, return_date, supplier_name)`)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (fromDate) query = query.gte("purchase_returns.return_date", fromDate);
      if (toDate) query = query.lte("purchase_returns.return_date", toDate);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((i: any) => i.purchase_returns !== null);
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const totalStock = variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0;
  const totalSold = saleTotals?.totalQty || 0;
  const totalPurchased = purchaseTotals?.totalQty || 0;
  const totalReturned = returnTotals?.totalQty || 0;
  const totalPurReturned = purchaseReturnTotals?.totalQty || 0;

  const getMovementTypeBadge = (type: string) => {
    switch (type) {
      case "purchase":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">Purchase</Badge>;
      case "sale":
        return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400">Sale</Badge>;
      case "sale_return":
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">Sale Return</Badge>;
      case "purchase_return":
        return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">Pur Return</Badge>;
      case "adjustment":
        return <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-400">Adjustment</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${showDetails ? "max-w-4xl max-h-[85vh]" : "max-w-lg"} overflow-hidden flex flex-col transition-all duration-200`}>
        <DialogHeader>
          <DialogTitle className="text-xl">{productName}</DialogTitle>
          <DialogDescription>Product Transaction Summary</DialogDescription>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Current Stock</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{totalStock}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Total Purchased</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{totalPurchased}</p>
              <p className="text-xs text-muted-foreground">₹{(purchaseTotals?.totalAmount || 0).toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Total Sold</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{totalSold}</p>
              <p className="text-xs text-muted-foreground">₹{(saleTotals?.totalAmount || 0).toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">Sale Returns</span>
              </div>
              <p className="text-2xl font-bold text-orange-600">{totalReturned}</p>
              <p className="text-xs text-muted-foreground">₹{(returnTotals?.totalAmount || 0).toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Purchase Returns</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{totalPurReturned}</p>
              <p className="text-xs text-muted-foreground">₹{(purchaseReturnTotals?.totalAmount || 0).toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Toggle Details Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full"
        >
          {showDetails ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
          {showDetails ? "Hide Details" : "View Details"}
        </Button>

        {/* Details Section */}
        {showDetails && (
          <div className="flex-1 flex flex-col overflow-hidden mt-2">
            {/* Period Filter */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-1">
                {(["monthly", "quarterly", "yearly", "custom"] as const).map((p) => (
                  <Button
                    key={p}
                    variant={periodFilter === p ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs capitalize"
                    onClick={() => applyPeriod(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              {periodFilter === "custom" && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-xs w-[130px]" />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-xs w-[130px]" />
                </div>
              )}
              {periodFilter !== "custom" && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fromDate && toDate ? `${format(new Date(fromDate), "dd MMM yy")} – ${format(new Date(toDate), "dd MMM yy")}` : ""}
                </span>
              )}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="sales" className="text-xs">Sales ({saleTotals?.totalCount || 0})</TabsTrigger>
                <TabsTrigger value="purchases" className="text-xs">Purchases ({purchaseTotals?.totalCount || 0})</TabsTrigger>
                <TabsTrigger value="returns" className="text-xs">Sale Ret ({returnTotals?.totalCount || 0})</TabsTrigger>
                <TabsTrigger value="pur-returns" className="text-xs">Pur Ret ({purchaseReturnTotals?.totalCount || 0})</TabsTrigger>
                <TabsTrigger value="movements" className="text-xs">Movements</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-auto mt-3">
                {/* Sales Tab */}
                <TabsContent value="sales" className="m-0">
                  {loadingSales ? (
                    <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : saleItems && saleItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {saleItems.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.sales?.sale_number || "-"}</TableCell>
                              <TableCell>{item.sales?.sale_date ? format(new Date(item.sales.sale_date), "dd MMM yy") : "-"}</TableCell>
                              <TableCell>{item.sales?.customer_name || "-"}</TableCell>
                              <TableCell>{item.size}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">₹{item.unit_price?.toFixed(0)}</TableCell>
                              <TableCell className="text-right">₹{item.line_total?.toFixed(0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No sales records found</p>
                  )}
                </TabsContent>

                {/* Purchases Tab */}
                <TabsContent value="purchases" className="m-0">
                  {loadingPurchases ? (
                    <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : purchaseItems && purchaseItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bill No</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchaseItems.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.purchase_bills?.software_bill_no || "-"}</TableCell>
                              <TableCell>{item.purchase_bills?.bill_date ? format(new Date(item.purchase_bills.bill_date), "dd MMM yy") : "-"}</TableCell>
                              <TableCell>{item.purchase_bills?.supplier_name || "-"}</TableCell>
                              <TableCell>{item.size}</TableCell>
                              <TableCell className="text-right">{item.qty}</TableCell>
                              <TableCell className="text-right">₹{item.pur_price?.toFixed(0)}</TableCell>
                              <TableCell className="text-right">₹{item.line_total?.toFixed(0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No purchase records found</p>
                  )}
                </TabsContent>

                {/* Sale Returns Tab */}
                <TabsContent value="returns" className="m-0">
                  {loadingSaleReturns ? (
                    <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : saleReturns && saleReturns.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Return No</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {saleReturns.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.sale_returns?.return_number || "-"}</TableCell>
                              <TableCell>{item.sale_returns?.return_date ? format(new Date(item.sale_returns.return_date), "dd MMM yy") : "-"}</TableCell>
                              <TableCell>{item.sale_returns?.customer_name || "-"}</TableCell>
                              <TableCell>{item.size}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right text-red-600">₹{item.line_total?.toFixed(0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No return records found</p>
                  )}
                </TabsContent>

                {/* Purchase Returns Tab */}
                <TabsContent value="pur-returns" className="m-0">
                  {loadingPurchaseReturns ? (
                    <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : purchaseReturnItems && purchaseReturnItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Return No</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchaseReturnItems.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.purchase_returns?.return_number || "-"}</TableCell>
                              <TableCell>{item.purchase_returns?.return_date ? format(new Date(item.purchase_returns.return_date), "dd MMM yy") : "-"}</TableCell>
                              <TableCell>{item.purchase_returns?.supplier_name || "-"}</TableCell>
                              <TableCell>{item.size}</TableCell>
                              <TableCell className="text-right">{item.qty}</TableCell>
                              <TableCell className="text-right">₹{item.pur_price?.toFixed(0)}</TableCell>
                              <TableCell className="text-right text-red-600">₹{item.line_total?.toFixed(0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No purchase return records found</p>
                  )}
                </TabsContent>

                {/* Stock Movements Tab */}
                <TabsContent value="movements" className="m-0">
                  {loadingMovements ? (
                    <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : stockMovements && stockMovements.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Bill No</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stockMovements.map((movement: any) => (
                            <TableRow key={movement.id}>
                              <TableCell>{format(new Date(movement.created_at), "dd MMM yy")}</TableCell>
                              <TableCell>{getMovementTypeBadge(movement.movement_type)}</TableCell>
                              <TableCell>{movement.bill_number || "-"}</TableCell>
                              <TableCell className={`text-right font-medium ${movement.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                                {movement.quantity > 0 ? "+" : ""}{movement.quantity}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{movement.notes || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No stock movement records found</p>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
