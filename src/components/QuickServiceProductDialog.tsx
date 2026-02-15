import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface QuickServiceProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCode: string;
  onAdd: (data: { code: string; quantity: number; mrp: number }) => void;
}

export const QuickServiceProductDialog = ({
  open,
  onOpenChange,
  serviceCode,
  onAdd,
}: QuickServiceProductDialogProps) => {
  const [quantity, setQuantity] = useState(1);
  const [mrp, setMrp] = useState<string>("");
  const mrpInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus MRP field when dialog opens
  useEffect(() => {
    if (open) {
      setQuantity(1);
      setMrp("");
      setTimeout(() => mrpInputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = () => {
    const mrpValue = parseFloat(mrp);
    if (!mrpValue || mrpValue <= 0) return;
    if (quantity <= 0) return;
    onAdd({ code: serviceCode, quantity, mrp: mrpValue });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-5 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base">
            Quick Service Item #{serviceCode}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              onKeyDown={handleKeyDown}
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">MRP / Price</Label>
            <Input
              ref={mrpInputRef}
              type="number"
              min={0}
              step="0.01"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter price"
              className="h-9 mt-1"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!mrp || parseFloat(mrp) <= 0}
            className="w-full h-9"
          >
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
