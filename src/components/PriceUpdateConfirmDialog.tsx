import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IndianRupee, ArrowRight } from "lucide-react";

interface PriceChange {
  sku_id: string;
  product_name: string;
  size: string;
  barcode: string;
  field: "pur_price" | "sale_price" | "mrp";
  old_value: number;
  new_value: number;
}

interface PriceUpdateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceChanges: PriceChange[];
  onConfirm: (selectedChanges: PriceChange[]) => void;
  onSkip: () => void;
}

const fieldLabels: Record<string, string> = {
  pur_price: "Purchase Price",
  sale_price: "Sale Price",
  mrp: "MRP",
};

export function PriceUpdateConfirmDialog({
  open,
  onOpenChange,
  priceChanges,
  onConfirm,
  onSkip,
}: PriceUpdateConfirmDialogProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    new Set(priceChanges.map((c) => `${c.sku_id}-${c.field}`))
  );

  const handleToggle = (key: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedItems(newSet);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === priceChanges.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(priceChanges.map((c) => `${c.sku_id}-${c.field}`)));
    }
  };

  const handleConfirm = () => {
    const selected = priceChanges.filter((c) =>
      selectedItems.has(`${c.sku_id}-${c.field}`)
    );
    onConfirm(selected);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
            Price Changes Detected
          </DialogTitle>
          <DialogDescription>
            The following prices differ from the Product Master. Select which
            prices you want to update in the Product Master.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedItems.size === priceChanges.length}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Field</TableHead>
                <TableHead className="text-right">Master Price</TableHead>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead className="text-right">New Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priceChanges.map((change) => {
                const key = `${change.sku_id}-${change.field}`;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.has(key)}
                        onCheckedChange={() => handleToggle(key)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {change.product_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{change.size}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          change.field === "sale_price"
                            ? "default"
                            : change.field === "mrp"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {fieldLabels[change.field]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(change.old_value)}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="text-right font-medium text-primary">
                      {formatCurrency(change.new_value)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onSkip}>
            Skip All
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedItems.size === 0}
          >
            Update Selected ({selectedItems.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
