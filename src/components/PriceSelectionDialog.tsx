import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { IndianRupee, Package, Clock, Check } from "lucide-react";
import { format } from "date-fns";

interface PriceOption {
  label: string;
  sale_price: number;
  mrp: number;
  pur_price?: number;
  source: "master" | "last_purchase";
  date?: Date;
}

interface PriceSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  size: string;
  masterPrice: {
    sale_price: number;
    mrp: number;
  };
  lastPurchasePrice: {
    sale_price: number;
    mrp: number;
    date?: Date;
  };
  onSelect: (source: "master" | "last_purchase", prices: { sale_price: number; mrp: number }) => void;
}

export function PriceSelectionDialog({
  open,
  onOpenChange,
  productName,
  size,
  masterPrice,
  lastPurchasePrice,
  onSelect,
}: PriceSelectionDialogProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const options: PriceOption[] = [
    {
      label: "Master Price",
      sale_price: masterPrice.sale_price,
      mrp: masterPrice.mrp,
      source: "master",
    },
    {
      label: "Last Purchase Price",
      sale_price: lastPurchasePrice.sale_price,
      mrp: lastPurchasePrice.mrp,
      source: "last_purchase",
      date: lastPurchasePrice.date,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
            Select Price
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{productName}</span>
            <Badge variant="outline" className="ml-2">{size}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {options.map((option) => (
            <Card
              key={option.source}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => onSelect(option.source, { sale_price: option.sale_price, mrp: option.mrp })}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {option.source === "master" ? (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{option.label}</span>
                    </div>
                    {option.date && (
                      <p className="text-xs text-muted-foreground">
                        Updated: {format(option.date, "dd MMM yyyy")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">
                      {formatCurrency(option.sale_price)}
                    </div>
                    {option.mrp > option.sale_price && (
                      <div className="text-sm text-muted-foreground line-through">
                        MRP: {formatCurrency(option.mrp)}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3 gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(option.source, { sale_price: option.sale_price, mrp: option.mrp });
                  }}
                >
                  <Check className="h-4 w-4" />
                  Use {option.label}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
