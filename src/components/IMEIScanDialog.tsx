import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Smartphone, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IMEIScanDialogProps {
  open: boolean;
  onClose: () => void;
  quantity: number;
  productName: string;
  onConfirm: (imeiNumbers: string[]) => void;
  minLength?: number;
  maxLength?: number;
}

export function IMEIScanDialog({
  open,
  onClose,
  quantity,
  productName,
  onConfirm,
  minLength = 15,
  maxLength = 19,
}: IMEIScanDialogProps) {
  const [imeiValues, setImeiValues] = useState<string[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setImeiValues(Array(quantity).fill(""));
      inputRefs.current = Array(quantity).fill(null);
      // Focus first input after mount
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [open, quantity]);

  const updateIMEI = useCallback((index: number, value: string) => {
    // Only allow digits
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, maxLength);
    setImeiValues(prev => {
      const updated = [...prev];
      updated[index] = cleaned;
      return updated;
    });

    // Auto-advance to next empty field when valid length reached
    if (cleaned.length >= minLength) {
      const nextEmpty = imeiValues.findIndex((v, i) => i > index && (!v || v.length < minLength));
      if (nextEmpty >= 0) {
        setTimeout(() => inputRefs.current[nextEmpty]?.focus(), 50);
      }
    }
  }, [imeiValues, minLength, maxLength]);

  const isValid = (val: string) => val.length >= minLength && val.length <= maxLength;
  const allFilled = imeiValues.length === quantity && imeiValues.every(isValid);
  const hasDuplicates = new Set(imeiValues.filter(v => v.length > 0)).size !== imeiValues.filter(v => v.length > 0).length;
  const filledCount = imeiValues.filter(isValid).length;

  const handleConfirm = () => {
    if (!allFilled || hasDuplicates) return;
    onConfirm(imeiValues);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Scan IMEI Numbers
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {productName}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="font-bold">
              {filledCount} / {quantity} scanned
            </Badge>
            {hasDuplicates && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Duplicate found
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
          {Array.from({ length: quantity }, (_, i) => {
            const val = imeiValues[i] || "";
            const valid = isValid(val);
            const isDuplicate = val.length > 0 && imeiValues.filter(v => v === val).length > 1;

            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-8 text-right text-xs font-bold text-muted-foreground shrink-0">
                  {i + 1}.
                </span>
                <Input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  value={val}
                  onChange={(e) => updateIMEI(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (valid && !isDuplicate) {
                        const nextEmpty = imeiValues.findIndex((v, idx) => idx > i && (!v || v.length < minLength));
                        if (nextEmpty >= 0) {
                          inputRefs.current[nextEmpty]?.focus();
                        } else if (allFilled && !hasDuplicates) {
                          handleConfirm();
                        }
                      }
                    }
                  }}
                  placeholder={`IMEI #${i + 1}`}
                  className={cn(
                    "font-mono tracking-wider text-sm",
                    valid && !isDuplicate && "border-green-400 bg-green-50 dark:bg-green-950/20",
                    isDuplicate && "border-destructive bg-destructive/10",
                    !valid && val.length > 0 && "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                  )}
                  inputMode="text"
                />
                <div className="w-5 shrink-0">
                  {valid && !isDuplicate && <Check className="h-4 w-4 text-green-600" />}
                  {isDuplicate && <X className="h-4 w-4 text-destructive" />}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!allFilled || hasDuplicates}
            className="min-w-[120px]"
          >
            Confirm {quantity} Items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
