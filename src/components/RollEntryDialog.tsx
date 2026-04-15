import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

interface RollData {
  color: string;
  meters: number;
}

interface RollEntryDialogProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  colors: string[];
  rate: number;
  onConfirm: (rolls: RollData[]) => void;
}

export function RollEntryDialog({
  open,
  onClose,
  productName,
  colors,
  rate,
  onConfirm,
}: RollEntryDialogProps) {
  // State: per-color array of meter values
  const [colorRolls, setColorRolls] = useState<Record<string, string[]>>({});
  const inputRefs = useRef<Record<string, (HTMLInputElement | null)[]>>({});

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      const initial: Record<string, string[]> = {};
      colors.forEach(c => { initial[c] = [""]; });
      setColorRolls(initial);
      inputRefs.current = {};
      setTimeout(() => {
        const firstColor = colors[0];
        if (firstColor) inputRefs.current[firstColor]?.[0]?.focus();
      }, 150);
    }
  }, [open, colors]);

  const updateRoll = useCallback((color: string, index: number, value: string) => {
    // Allow decimal meter values
    const cleaned = value.replace(/[^0-9.]/g, "");
    setColorRolls(prev => {
      const updated = { ...prev };
      updated[color] = [...(updated[color] || [])];
      updated[color][index] = cleaned;
      return updated;
    });
  }, []);

  const addRoll = useCallback((color: string) => {
    setColorRolls(prev => {
      const updated = { ...prev };
      updated[color] = [...(updated[color] || []), ""];
      return updated;
    });
    setTimeout(() => {
      const rolls = colorRolls[color] || [];
      inputRefs.current[color]?.[rolls.length]?.focus();
    }, 100);
  }, [colorRolls]);

  const removeRoll = useCallback((color: string, index: number) => {
    setColorRolls(prev => {
      const updated = { ...prev };
      updated[color] = (updated[color] || []).filter((_, i) => i !== index);
      if (updated[color].length === 0) updated[color] = [""];
      return updated;
    });
  }, []);

  // Compute totals
  const allRolls: RollData[] = [];
  let totalMeters = 0;
  let totalRollCount = 0;

  Object.entries(colorRolls).forEach(([color, rolls]) => {
    rolls.forEach(r => {
      const m = parseFloat(r);
      if (m > 0) {
        allRolls.push({ color, meters: m });
        totalMeters += m;
        totalRollCount++;
      }
    });
  });

  const totalAmount = totalMeters * rate;
  const canConfirm = totalRollCount > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(allRolls);
  };

  const handleKeyDown = (e: React.KeyboardEvent, color: string, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const rolls = colorRolls[color] || [];
      const val = parseFloat(rolls[index]);
      if (val > 0) {
        // If last input in this color, add new roll
        if (index === rolls.length - 1) {
          addRoll(color);
        } else {
          inputRefs.current[color]?.[index + 1]?.focus();
        }
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            Roll-wise MTR Entry
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{productName}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="font-bold">
              {totalRollCount} Rolls
            </Badge>
            <Badge variant="outline" className="font-bold">
              {totalMeters.toFixed(1)} MTR
            </Badge>
            {rate > 0 && (
              <Badge variant="outline" className="font-bold">
                ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {colors.map(color => {
            const rolls = colorRolls[color] || [""];
            const colorTotal = rolls.reduce((s, r) => s + (parseFloat(r) || 0), 0);
            const colorCount = rolls.filter(r => parseFloat(r) > 0).length;

            return (
              <div key={color} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                    {color || "DEFAULT"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {colorCount} rolls · {colorTotal.toFixed(1)} MTR
                  </span>
                </div>
                <div className="space-y-1">
                  {rolls.map((val, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-right text-xs font-bold text-muted-foreground shrink-0">
                        {i + 1}.
                      </span>
                      <Input
                        ref={(el) => {
                          if (!inputRefs.current[color]) inputRefs.current[color] = [];
                          inputRefs.current[color][i] = el;
                        }}
                        value={val}
                        onChange={(e) => updateRoll(color, i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, color, i)}
                        placeholder="Enter meters"
                        type="text"
                        inputMode="decimal"
                        className={cn(
                          "font-mono text-sm no-uppercase",
                          parseFloat(val) > 0 && "border-green-400 bg-green-50 dark:bg-green-950/20"
                        )}
                      />
                      <span className="text-xs text-muted-foreground shrink-0">MTR</span>
                      {rolls.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => removeRoll(color, i)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-primary"
                  onClick={() => addRoll(color)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Roll
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="min-w-[140px]"
          >
            Confirm {totalRollCount} Rolls
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
