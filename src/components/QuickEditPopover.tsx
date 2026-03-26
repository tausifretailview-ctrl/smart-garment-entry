import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface QuickEditPopoverProps {
  children: React.ReactNode;
  field: string;
  label: string;
  value: string | number;
  type?: string;
  productId: string;
  skuId: string;
  dbField: string;
  dbTable?: "products" | "product_variants";
  onSaved: (newValue: any) => void;
}

const QuickEditPopover = ({
  children, field, label, value, type = "text", productId, skuId,
  dbField, dbTable = "products", onSaved
}: QuickEditPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setEditValue(String(value));
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalVal = type === "number" ? parseFloat(editValue) || 0 : editValue;
      const id = dbTable === "products" ? productId : skuId;

      const { error } = await supabase
        .from(dbTable)
        .update({ [dbField]: finalVal, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      onSaved(finalVal);
      setOpen(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
      toast({ title: "Updated", description: `${label} updated successfully` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn(
          "cursor-pointer transition-colors rounded",
          flash && "bg-green-100 dark:bg-green-900/30",
          !flash && "hover:bg-accent/50"
        )}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 z-[9999]" align="start">
        <div className="space-y-2">
          <Label className="text-xs font-medium">{label}</Label>
          <Input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setOpen(false);
            }}
            className="h-8 text-sm no-uppercase"
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-7 w-7 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 px-2 text-xs gap-1">
              <Check className="h-3 w-3" /> Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default QuickEditPopover;
