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
    queryKey: ["product-variants", productId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color, barcode, stock_qty, sale_price, pur_price")
        .eq("product_id", productId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .eq("active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!productId,
  });

  // Fetch accurate totals
  const { data: saleTotals } = useQuery({
    queryKey: ["product-sale-totals", productId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("quantity, line_total, sales!inner(organization_id)")
        .eq("product_id", productId)
        .eq("sales.organization_id", organizationId)
        .is("deleted_at", null);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  const { data: purchaseTotals } = useQuery({
    queryKey: ["product-purchase-totals", productId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("qty, line_total, purchase_bills!inner(organization_id)")
        .eq("product_id", productId)
        .eq("purchase_bills.organization_id", organizationId)
        .is("deleted_at", null);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.qty || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  const { data: returnTotals } = useQuery({
    queryKey: ["product-return-totals", productId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_return_items")
        .select("quantity, line_total, sale_returns!inner(organization_id)")
        .eq("product_id", productId)
        .eq("sale_returns.organization_id", organizationId);
      if (error) throw error;
      const totalQty = (data || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
      const totalAmount = (data || []).reduce((sum, i) => sum + (i.line_total || 0), 0);
      const totalCount = (data || []).length;
      return { totalQty, totalAmount, totalCount };
    },
    enabled: isOpen && !!productId,
  });

  const { data: purchaseReturnTotals } = useQuery({
    queryKey: ["product-purchase-return-totals", productId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_return_items")
        .select("qty, line_total, purchase_returns!inner(organization_id)")
        .eq("product_id", productId)
        .eq("purchase_returns.organization_id", organizationId);
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
    queryKey: ["product-sales", productId, organizationId, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select(`*, sales:sale_id (sale_number, sale_date, customer_name, organization_id)`)
        .eq("product_id", productId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((i: any) => {
        if (!i.sales) return false;
        if (i.sales.organization_id !== organizationId) return false;
        if (fromDate && i.sales.sale_date < fromDate) return false;
        if (toDate && i.sales.sale_date > toDate) return false;
        return true;
      });
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const { data: purchaseItems, isLoading: loadingPurchases } = useQuery({
    queryKey: ["product-purchases", productId, organizationId, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select(`*, purchase_bills:bill_id (software_bill_no, bill_date, supplier_name, organization_id)`)
        .eq("product_id", productId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((i: any) => {
        if (!i.purchase_bills) return false;
        if (i.purchase_bills.organization_id !== organizationId) return false;
        if (fromDate && i.purchase_bills.bill_date < fromDate) return false;
        if (toDate && i.purchase_bills.bill_date > toDate) return false;
        return true;
      });
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const { data: saleReturns, isLoading: loadingSaleReturns } = useQuery({
    queryKey: ["product-sale-returns", productId, organizationId, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_return_items")
        .select(`*, sale_returns:return_id (return_number, return_date, customer_name, organization_id)`)
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((i: any) => {
        if (!i.sale_returns) return false;
        if (i.sale_returns.organization_id !== organizationId) return false;
        if (fromDate && i.sale_returns.return_date < fromDate) return false;
        if (toDate && i.sale_returns.return_date > toDate) return false;
        return true;
      });
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const { data: stockMovements, isLoading: loadingMovements } = useQuery({
    queryKey: ["product-stock-movements", productId, organizationId, variants, fromDate, toDate],
    queryFn: async () => {
      if (!variants || variants.length === 0) return [];
      const variantIds = variants.map((v) => v.id);
      let query = supabase
        .from("stock_movements")
        .select("*")
        .in("variant_id", variantIds)
        .eq("organization_id", organizationId)
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
    queryKey: ["product-purchase-returns", productId, organizationId, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_return_items")
        .select(`*, purchase_returns:return_id (return_number, return_date, supplier_name, organization_id)`)
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((i: any) => {
        if (!i.purchase_returns) return false;
        if (i.purchase_returns.organization_id !== organizationId) return false;
        if (fromDate && i.purchase_returns.return_date < fromDate) return false;
        if (toDate && i.purchase_returns.return_date > toDate) return false;
        return true;
      });
    },
    enabled: isOpen && !!productId && showDetails,
  });

  const totalStock = variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0;
  const totalSold = saleTotals?.totalQty || 0;
  const totalPurchased = purchaseTotals?.totalQty || 0;
  const totalReturned = returnTotals?.totalQty || 0;
  const totalPurReturned = purchaseReturnTotals?.totalQty || 0;

  const getMovementTypeBadge = (type: string) => {
    const config: Record<string, { label: string; className: string }> = {
      purchase:          { label: "Purchase",       className: "bg-green-100 text-green-700 border-green-300" },
      sale:              { label: "Sale",            className: "bg-blue-100 text-blue-700 border-blue-300" },
      sale_return:       { label: "Sale Return",     className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
      purchase_return:   { label: "Pur Return",      className: "bg-red-100 text-red-700 border-red-300" },
      adjustment:        { label: "Adjustment",      className: "bg-purple-100 text-purple-700 border-purple-300" },
      purchase_increase: { label: "Stock Added",     className: "bg-teal-100 text-teal-700 border-teal-300" },
      purchase_decrease: { label: "Stock Reduced",   className: "bg-orange-100 text-orange-700 border-orange-300" },
      purchase_delete:   { label: "Bill Deleted",    className: "bg-slate-100 text-slate-600 border-slate-300" },
      sale_delete:       { label: "Sale Deleted",    className: "bg-slate-100 text-slate-600 border-slate-300" },
      soft_delete_sale:  { label: "Sale Deleted",    className: "bg-slate-100 text-slate-600 border-slate-300" },
      soft_delete_purchase: { label: "Bill Deleted", className: "bg-slate-100 text-slate-600 border-slate-300" },
    };
    const cfg = config[type] 
      || { label: type, className: "bg-slate-100 text-slate-600 border-slate-300" };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold 
                        border whitespace-nowrap ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  };

  const thClass = "text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${showDetails ? "max-w-4xl max-h-[85vh]" : "max-w-lg"} overflow-hidden flex flex-col p-0 transition-all duration-200`}>
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 rounded-t-lg flex-shrink-0" />
        <div className="p-4 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                <Package className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <div>{productName}</div>
                <DialogDescription className="text-xs font-normal mt-0.5">
                  Product transaction summary · stock · sales · purchases · returns
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-4 pb-4 flex flex-col flex-1 overflow-hidden">
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-2 mb-3">
            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Current Stock</p>
                <p className="text-lg font-bold text-blue-600 tabular-nums mt-0.5">
                  {totalStock.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-muted-foreground">units</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Purchased</p>
                <p className="text-lg font-bold text-green-600 tabular-nums mt-0.5">
                  {totalPurchased.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ₹{(purchaseTotals?.totalAmount || 0).toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Sold</p>
                <p className="text-lg font-bold text-purple-600 tabular-nums mt-0.5">
                  {totalSold.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ₹{(saleTotals?.totalAmount || 0).toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Sale Returns</p>
                <p className="text-lg font-bold text-orange-600 tabular-nums mt-0.5">
                  {totalReturned.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ₹{(returnTotals?.totalAmount || 0).toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Pur Returns</p>
                <p className="text-lg font-bold text-red-600 tabular-nums mt-0.5">
                  {totalPurReturned.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ₹{(purchaseReturnTotals?.totalAmount || 0).toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Toggle Details Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full border-dashed text-muted-foreground hover:text-foreground hover:border-solid"
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
                      className="h-7 text-[10px] uppercase tracking-wide font-semibold px-3"
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
                <TabsList className="grid w-full grid-cols-5 h-9 bg-muted/60 p-0.5 rounded-lg">
                  <TabsTrigger value="sales" className="rounded-md text-[10px] font-medium">
                    Sales ({saleItems?.length ?? saleTotals?.totalCount ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="purchases" className="rounded-md text-[10px] font-medium">
                    Purchases ({purchaseItems?.length ?? purchaseTotals?.totalCount ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="returns" className="rounded-md text-[10px] font-medium">
                    Sale Ret ({saleReturns?.length ?? returnTotals?.totalCount ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="pur-returns" className="rounded-md text-[10px] font-medium">
                    Pur Ret ({purchaseReturnItems?.length ?? purchaseReturnTotals?.totalCount ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="movements" className="rounded-md text-[10px] font-medium">Movements</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto mt-3">
                  {/* Sales Tab */}
                  <TabsContent value="sales" className="m-0">
                    {loadingSales ? (
                      <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : saleItems && saleItems.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table className="min-w-[600px]">
                          <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                            <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                              <TableHead className={thClass}>Invoice</TableHead>
                              <TableHead className={thClass}>Date</TableHead>
                              <TableHead className={thClass}>Customer</TableHead>
                              <TableHead className={thClass}>Size</TableHead>
                              <TableHead className={`${thClass} text-right`}>Qty</TableHead>
                              <TableHead className={`${thClass} text-right`}>Rate</TableHead>
                              <TableHead className={`${thClass} text-right`}>Amount</TableHead>
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
                          <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                            <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                              <TableHead className={thClass}>Bill No</TableHead>
                              <TableHead className={thClass}>Date</TableHead>
                              <TableHead className={thClass}>Supplier</TableHead>
                              <TableHead className={thClass}>Size</TableHead>
                              <TableHead className={`${thClass} text-right`}>Qty</TableHead>
                              <TableHead className={`${thClass} text-right`}>Rate</TableHead>
                              <TableHead className={`${thClass} text-right`}>Amount</TableHead>
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
                          <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                            <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                              <TableHead className={thClass}>Return No</TableHead>
                              <TableHead className={thClass}>Date</TableHead>
                              <TableHead className={thClass}>Customer</TableHead>
                              <TableHead className={thClass}>Size</TableHead>
                              <TableHead className={`${thClass} text-right`}>Qty</TableHead>
                              <TableHead className={`${thClass} text-right`}>Amount</TableHead>
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
                          <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                            <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                              <TableHead className={thClass}>Return No</TableHead>
                              <TableHead className={thClass}>Date</TableHead>
                              <TableHead className={thClass}>Supplier</TableHead>
                              <TableHead className={thClass}>Size</TableHead>
                              <TableHead className={`${thClass} text-right`}>Qty</TableHead>
                              <TableHead className={`${thClass} text-right`}>Rate</TableHead>
                              <TableHead className={`${thClass} text-right`}>Amount</TableHead>
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
                          <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                            <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                              <TableHead className={thClass}>Date</TableHead>
                              <TableHead className={thClass}>Type</TableHead>
                              <TableHead className={thClass}>Bill No</TableHead>
                              <TableHead className={`${thClass} text-right`}>Qty</TableHead>
                              <TableHead className={thClass}>Notes</TableHead>
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
