import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, X } from "lucide-react";

interface DcItem {
  saleItemId: string;
  productName: string;
  size: string;
  quantity: number;
  netAmount: number;
  variantId: string;
  productId: string;
  barcode?: string;
}

interface DcSaleTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  customerId?: string | null;
  customerName: string;
  dcItems: DcItem[];
}

export const DcSaleTransferDialog = ({
  open,
  onOpenChange,
  saleId,
  customerId,
  customerName,
  dcItems,
}: DcSaleTransferDialogProps) => {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isTransferring, setIsTransferring] = useState(false);

  const handleTransfer = async () => {
    if (!currentOrganization?.id || !user?.id) return;
    setIsTransferring(true);

    try {
      // Generate challan number
      const { data: challanNumber, error: challanNoErr } = await supabase.rpc(
        "generate_challan_number",
        { p_organization_id: currentOrganization.id }
      );
      if (challanNoErr) throw challanNoErr;

      const totalAmount = dcItems.reduce((s, i) => s + i.netAmount, 0);

      // Create delivery challan
      const { data: challan, error: challanErr } = await supabase
        .from("delivery_challans")
        .insert({
          challan_number: challanNumber,
          challan_date: new Date().toISOString().split("T")[0],
          customer_id: customerId || null,
          customer_name: customerName,
          organization_id: currentOrganization.id,
          created_by: user.id,
          status: "delivered",
          gross_amount: totalAmount,
          discount_amount: 0,
          flat_discount_percent: 0,
          flat_discount_amount: 0,
          net_amount: totalAmount,
          round_off: 0,
          notes: `Auto-created from DC sale ${saleId}`,
        })
        .select()
        .single();

      if (challanErr) throw challanErr;

      // Insert challan items
      const challanItems = dcItems.map((item) => ({
        challan_id: challan.id,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        quantity: item.quantity,
        unit_price: item.quantity > 0 ? item.netAmount / item.quantity : 0,
        mrp: item.quantity > 0 ? item.netAmount / item.quantity : 0,
        discount_percent: 0,
        line_total: item.netAmount,
        barcode: item.barcode || null,
      }));

      const { error: itemsErr } = await supabase
        .from("delivery_challan_items")
        .insert(challanItems);
      if (itemsErr) throw itemsErr;

      // Insert dc_sale_transfers records
      const transfers = dcItems.map((item) => ({
        organization_id: currentOrganization.id,
        sale_id: saleId,
        sale_item_id: item.saleItemId,
        challan_id: challan.id,
        created_by: user.id,
      }));

      const { error: transferErr } = await supabase
        .from("dc_sale_transfers" as any)
        .insert(transfers);
      if (transferErr) throw transferErr;

      toast({
        title: "DC Transfer Complete",
        description: `${challanNumber} created for ${dcItems.length} item(s)`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Transfer Failed",
        description: err.message || "Could not create delivery challan",
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-orange-600" />
            DC Items Detected
          </DialogTitle>
          <DialogDescription>
            This cash sale contains {dcItems.length} DC product(s). Transfer to a Delivery Challan?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {dcItems.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded text-sm"
            >
              <div>
                <span className="font-medium">{item.productName}</span>
                <span className="text-muted-foreground ml-1">({item.size})</span>
                <span className="text-muted-foreground ml-1">× {item.quantity}</span>
              </div>
              <span className="font-semibold">₹{item.netAmount.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isTransferring}>
            <X className="h-4 w-4 mr-1" /> Skip
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={isTransferring}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Truck className="h-4 w-4 mr-1" />
            {isTransferring ? "Transferring..." : "Transfer to DC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
