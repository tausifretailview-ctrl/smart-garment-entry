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
import { Receipt, IndianRupee, TrendingDown, Wallet } from "lucide-react";

interface SupplierHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  organizationId: string;
}

export const SupplierHistoryDialog = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  organizationId,
}: SupplierHistoryDialogProps) => {
  const [activeTab, setActiveTab] = useState("purchases");

  // Fetch supplier details
  const { data: supplier } = useQuery({
    queryKey: ["supplier-details", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch purchase bills
  const { data: purchaseBills, isLoading: loadingPurchases } = useQuery({
    queryKey: ["supplier-purchases", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("bill_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch purchase returns
  const { data: purchaseReturns, isLoading: loadingReturns } = useQuery({
    queryKey: ["supplier-returns", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("*")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("return_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch payments from voucher entries
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ["supplier-payments", supplierId, purchaseBills],
    queryFn: async () => {
      if (!purchaseBills || purchaseBills.length === 0) return [];
      const billIds = purchaseBills.map((b) => b.id);
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .in("reference_id", billIds)
        .eq("voucher_type", "payment")
        .is("deleted_at", null)
        .order("voucher_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!purchaseBills && purchaseBills.length > 0,
  });

  // Calculate totals
  const openingBalance = supplier?.opening_balance || 0;
  const totalPurchases = purchaseBills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
  const totalReturns = purchaseReturns?.reduce((sum, ret) => sum + (ret.net_amount || 0), 0) || 0;
  const totalPaid = purchaseBills?.reduce((sum, bill) => sum + (bill.paid_amount || 0), 0) || 0;
  const currentBalance = openingBalance + totalPurchases - totalReturns - totalPaid;

  const getPaymentStatusBadge = (status: string | null | undefined) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">Paid</Badge>;
      case "partial":
        return <Badge className="bg-orange-400/20 text-orange-600 dark:text-orange-400">Partial</Badge>;
      default:
        return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">Unpaid</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">{supplierName}</DialogTitle>
          <DialogDescription>
            Supplier Transaction History
            {supplier?.phone && <span className="ml-2">• {supplier.phone}</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Opening Bal</span>
              </div>
              <p className="text-lg font-bold text-blue-600">₹{openingBalance.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Total Purchases</span>
              </div>
              <p className="text-lg font-bold text-purple-600">₹{totalPurchases.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Total Paid</span>
              </div>
              <p className="text-lg font-bold text-green-600">₹{totalPaid.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${currentBalance > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                <span className="text-xs text-muted-foreground">Balance</span>
              </div>
              <p className={`text-lg font-bold ${currentBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                ₹{Math.abs(currentBalance).toFixed(0)}
                {currentBalance < 0 && " CR"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="purchases">
              Purchases ({purchaseBills?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="payments">
              Payments ({payments?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="returns">
              Returns ({purchaseReturns?.length || 0})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Purchases Tab */}
            <TabsContent value="purchases" className="m-0">
              {loadingPurchases ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : purchaseBills && purchaseBills.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseBills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">
                          {bill.software_bill_no || bill.supplier_invoice_no || "-"}
                        </TableCell>
                        <TableCell>{format(new Date(bill.bill_date), "dd MMM yy")}</TableCell>
                        <TableCell className="text-right">₹{bill.net_amount?.toFixed(0)}</TableCell>
                        <TableCell className="text-right">₹{(bill.paid_amount || 0).toFixed(0)}</TableCell>
                        <TableCell>{getPaymentStatusBadge(bill.payment_status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No purchase records found</p>
              )}
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="m-0">
              {loadingPayments ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : payments && payments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.voucher_number}</TableCell>
                        <TableCell>{format(new Date(payment.voucher_date), "dd MMM yy")}</TableCell>
                        <TableCell className="text-right text-green-600">
                          ₹{payment.total_amount?.toFixed(0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{payment.description || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No payment records found</p>
              )}
            </TabsContent>

            {/* Returns Tab */}
            <TabsContent value="returns" className="m-0">
              {loadingReturns ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : purchaseReturns && purchaseReturns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Original Bill</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseReturns.map((ret) => (
                      <TableRow key={ret.id}>
                        <TableCell className="font-medium">{ret.return_number || "-"}</TableCell>
                        <TableCell>{format(new Date(ret.return_date), "dd MMM yy")}</TableCell>
                        <TableCell>{ret.original_bill_number || "-"}</TableCell>
                        <TableCell className="text-right text-red-600">₹{ret.net_amount?.toFixed(0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No return records found</p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
