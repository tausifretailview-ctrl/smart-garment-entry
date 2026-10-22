import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerShippingAddress } from "@/utils/customerShippingAddresses";

interface CustomerShippingAddressesEditorProps {
  value: CustomerShippingAddress[];
  onChange: (rows: CustomerShippingAddress[]) => void;
  compact?: boolean;
}

/** Customer Master: list of branch / ship-to addresses, picked later on Sale Bill. */
export function CustomerShippingAddressesEditor({ value, onChange, compact }: CustomerShippingAddressesEditorProps) {
  const update = (index: number, patch: Partial<CustomerShippingAddress>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className={compact ? "text-xs" : undefined}>
          Shipping addresses {value.length > 0 && <span className="text-muted-foreground">({value.length})</span>}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => onChange([...value, { label: "", address: "" }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Add branches to pick a ship-to address on Sale Bill. Without one, the bill prints the address above.
        </p>
      ) : (
        value.map((row, index) => (
          <div key={index} className="rounded-md border p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                value={row.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder={`Branch / area name (e.g. Branch ${index + 1})`}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                title="Remove this address"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={row.address}
              onChange={(e) => update(index, { address: e.target.value })}
              placeholder="Shipping address"
              className="min-h-[48px] text-sm"
            />
          </div>
        ))
      )}
    </div>
  );
}
