import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { History, Loader2 } from "lucide-react";

interface Props {
  organizationId: string;
}

export function RecentBalanceAdjustments({ organizationId }: Props) {
  const { data: adjustments, isLoading } = useQuery({
    queryKey: ["all-balance-adjustments", organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_balance_adjustments")
        .select("*, customers:customer_id (customer_name, phone)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!organizationId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5" />
          Recent Adjustment History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !adjustments?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">No adjustments made yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-sidebar">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Prev Outstanding</TableHead>
                  <TableHead className="text-right">New Outstanding</TableHead>
                  <TableHead className="text-right">Prev Advance</TableHead>
                  <TableHead className="text-right">New Advance</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adj: any) => (
                  <TableRow key={adj.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(adj.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{adj.customers?.customer_name || "—"}</p>
                        {adj.customers?.phone && (
                          <p className="text-xs text-muted-foreground">{adj.customers.phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      ₹{(adj.previous_outstanding || 0).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="font-medium">₹{(adj.new_outstanding || 0).toLocaleString("en-IN")}</span>
                      {adj.outstanding_difference !== 0 && (
                        <Badge variant={adj.outstanding_difference > 0 ? "destructive" : "default"} className="ml-1 text-xs">
                          {adj.outstanding_difference > 0 ? "+" : ""}{adj.outstanding_difference.toLocaleString("en-IN")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      ₹{(adj.previous_advance || 0).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="font-medium">₹{(adj.new_advance || 0).toLocaleString("en-IN")}</span>
                      {adj.advance_difference !== 0 && (
                        <Badge variant={adj.advance_difference > 0 ? "default" : "destructive"} className="ml-1 text-xs">
                          {adj.advance_difference > 0 ? "+" : ""}{adj.advance_difference.toLocaleString("en-IN")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{adj.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
