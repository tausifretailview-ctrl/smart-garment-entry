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
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Package, ShoppingCart, TrendingUp, TrendingDown, RotateCcw } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState("sales");

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

  // Fetch sale items for this product
  const { data: saleItems, isLoading: loadingSales } = useQuery({
    queryKey: ["product-sales", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select(`
          *,
          sales:sale_id (
            sale_number,
            sale_date,
            customer_name
          )
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!productId,
  });

  // Fetch purchase items for this product
  const { data: purchaseItems, isLoading: loadingPurchases } = useQuery({
    queryKey: ["product-purchases", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select(`
          *,
          purchase_bills:bill_id (
            software_bill_no,
            bill_date,
            supplier_name
          )
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!productId,
  });

  // Fetch stock movements
  const { data: stockMovements, isLoading: loadingMovements } = useQuery({
    queryKey: ["product-stock-movements", productId, variants],
    queryFn: async () => {
      if (!variants || variants.length === 0) return [];
      const variantIds = variants.map((v) => v.id);
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .in("variant_id", variantIds)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!variants && variants.length > 0,
  });

  // Fetch sale returns
  const { data: saleReturns, isLoading: loadingSaleReturns } = useQuery({
    queryKey: ["product-sale-returns", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_return_items")
        .select(`
          *,
          sale_returns:return_id (
            return_number,
            return_date,
            customer_name
          )
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!productId,
  });

  // Calculate totals
  const totalStock = variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0;
  const totalSold = saleItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const totalPurchased = purchaseItems?.reduce((sum, item) => sum + item.qty, 0) || 0;
  const totalReturned = saleReturns?.reduce((sum, item) => sum + item.quantity, 0) || 0;

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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">{productName}</DialogTitle>
          <DialogDescription>Product Transaction History</DialogDescription>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Current Stock</span>
              </div>
              <p className="text-lg font-bold text-blue-600">{totalStock}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Total Purchased</span>
              </div>
              <p className="text-lg font-bold text-green-600">{totalPurchased}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Total Sold</span>
              </div>
              <p className="text-lg font-bold text-purple-600">{totalSold}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">Sale Returns</span>
              </div>
              <p className="text-lg font-bold text-orange-600">{totalReturned}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sales">Sales ({saleItems?.length || 0})</TabsTrigger>
            <TabsTrigger value="purchases">Purchases ({purchaseItems?.length || 0})</TabsTrigger>
            <TabsTrigger value="returns">Returns ({saleReturns?.length || 0})</TabsTrigger>
            <TabsTrigger value="movements">Movements ({stockMovements?.length || 0})</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Sales Tab */}
            <TabsContent value="sales" className="m-0">
              {loadingSales ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : saleItems && saleItems.length > 0 ? (
                <Table>
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
              ) : (
                <p className="text-center text-muted-foreground py-8">No sales records found</p>
              )}
            </TabsContent>

            {/* Purchases Tab */}
            <TabsContent value="purchases" className="m-0">
              {loadingPurchases ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : purchaseItems && purchaseItems.length > 0 ? (
                <Table>
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
              ) : (
                <p className="text-center text-muted-foreground py-8">No purchase records found</p>
              )}
            </TabsContent>

            {/* Sale Returns Tab */}
            <TabsContent value="returns" className="m-0">
              {loadingSaleReturns ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : saleReturns && saleReturns.length > 0 ? (
                <Table>
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
              ) : (
                <p className="text-center text-muted-foreground py-8">No return records found</p>
              )}
            </TabsContent>

            {/* Stock Movements Tab */}
            <TabsContent value="movements" className="m-0">
              {loadingMovements ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : stockMovements && stockMovements.length > 0 ? (
                <Table>
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
              ) : (
                <p className="text-center text-muted-foreground py-8">No stock movement records found</p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
