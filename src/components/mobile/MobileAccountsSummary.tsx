import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Wallet, 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  ArrowDownLeft, 
  ArrowUpRight,
  BookOpen,
  Receipt
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const MobileAccountsSummary = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch today's collection
  const { data: todaysCollection, isLoading: loadingCollection } = useQuery({
    queryKey: ["todays-collection", currentOrganization?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("total_amount")
        .eq("organization_id", currentOrganization?.id)
        .eq("voucher_type", "receipt")
        .gte("voucher_date", today)
        .is("deleted_at", null);
      
      if (error) throw error;
      return data?.reduce((sum, v) => sum + (v.total_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Fetch outstanding receivables (from customers)
  const { data: receivables, isLoading: loadingReceivables } = useQuery({
    queryKey: ["total-receivables", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("organization_id", currentOrganization?.id)
        .in("payment_status", ["pending", "partial"])
        .is("deleted_at", null);
      
      if (error) throw error;
      return data?.reduce((sum, s) => sum + Math.max(0, (s.net_amount || 0) - (s.paid_amount || 0)), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 120000,
  });

  // Fetch outstanding payables (to suppliers)
  const { data: payables, isLoading: loadingPayables } = useQuery({
    queryKey: ["total-payables", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount, paid_amount")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null);
      
      if (error) throw error;
      return data?.reduce((sum, b) => sum + Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0)), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 120000,
  });

  const formatCurrency = (amount: number) => {
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  };

  const isLoading = loadingCollection || loadingReceivables || loadingPayables;

  return (
    <div className="space-y-4 pb-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Today's Collection */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Today's Collection</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(todaysCollection || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Receivables */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <ArrowDownLeft className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">To Receive</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-semibold text-amber-600">
                {formatCurrency(receivables || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Payables */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4 text-red-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">To Pay</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-semibold text-red-600">
                {formatCurrency(payables || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Net Position */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Net Position</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className={cn(
                "text-lg font-semibold",
                (receivables || 0) - (payables || 0) >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatCurrency((receivables || 0) - (payables || 0))}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-14 flex flex-col items-center justify-center gap-1"
          onClick={() => orgNavigate("/accounts")}
        >
          <ArrowDownLeft className="h-5 w-5 text-green-500" />
          <span className="text-xs">Receive Payment</span>
        </Button>
        
        <Button
          variant="outline"
          className="h-14 flex flex-col items-center justify-center gap-1"
          onClick={() => orgNavigate("/accounts")}
        >
          <ArrowUpRight className="h-5 w-5 text-red-500" />
          <span className="text-xs">Make Payment</span>
        </Button>
        
        <Button
          variant="outline"
          className="h-14 flex flex-col items-center justify-center gap-1"
          onClick={() => orgNavigate("/accounts")}
        >
          <BookOpen className="h-5 w-5 text-purple-500" />
          <span className="text-xs">Customer Ledger</span>
        </Button>
        
        <Button
          variant="outline"
          className="h-14 flex flex-col items-center justify-center gap-1"
          onClick={() => orgNavigate("/accounts")}
        >
          <Building2 className="h-5 w-5 text-orange-500" />
          <span className="text-xs">Supplier Ledger</span>
        </Button>
      </div>
    </div>
  );
};
