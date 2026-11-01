import { Boxes } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UOM_OPTIONS } from "@/constants/uom";
import { cn } from "@/lib/utils";
import { formatAltUnitQty, type IndustrialItemForm } from "@/utils/industrialMode";

type Props = {
  value: IndustrialItemForm;
  onChange: (next: IndustrialItemForm) => void;
  /** Main unit of the item (Product Entry "Unit (UOM)"). */
  baseUom: string;
  className?: string;
};

const NONE = "__none__";

/** Product Entry (Industrial mode): alternate unit and reorder level, in one compact band. */
export function IndustrialItemFields({ value, onChange, baseUom, className }: Props) {
  const set = (patch: Partial<IndustrialItemForm>) => onChange({ ...value, ...patch });
  const base = baseUom || "NOS";
  const factor = Number(value.alt_uom_factor.replace(/,/g, ""));
  const reorder = Number(value.reorder_level.replace(/,/g, ""));
  const reorderInAlt =
    value.alt_uom && value.reorder_level.trim() ? formatAltUnitQty(reorder, base, value.alt_uom, factor) : "";

  return (
    <div
      className={cn("col-span-full rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2.5", className)}
      data-testid="industrial-item-fields"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-sky-900">
        <Boxes className="h-4 w-4 text-sky-700" />
        Units &amp; reorder
        <span className="font-normal text-slate-500">· for buying and selling in boxes, bags or rolls</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div>
          <Label htmlFor="item-alt-uom" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Alternate unit
          </Label>
          <Select
            value={value.alt_uom || NONE}
            onValueChange={(v) => set({ alt_uom: v === NONE ? "" : v, ...(v === NONE ? { alt_uom_factor: "" } : {}) })}
          >
            <SelectTrigger id="item-alt-uom" className="h-9 bg-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value={NONE}>None</SelectItem>
              {UOM_OPTIONS.filter((o) => o.value !== base).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="item-alt-factor" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {value.alt_uom ? `1 ${value.alt_uom} =` : "Conversion"}
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="item-alt-factor"
              inputMode="decimal"
              disabled={!value.alt_uom}
              value={value.alt_uom_factor}
              onChange={(e) => set({ alt_uom_factor: e.target.value.replace(/[^0-9.]/g, "").slice(0, 10) })}
              placeholder="12"
              className="h-9 bg-white text-sm tabular-nums"
            />
            <span className="shrink-0 text-sm font-semibold text-slate-600">{base}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="item-reorder-level" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Reorder level
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="item-reorder-level"
              inputMode="decimal"
              value={value.reorder_level}
              onChange={(e) => set({ reorder_level: e.target.value.replace(/[^0-9.]/g, "").slice(0, 12) })}
              placeholder="Min stock"
              className="h-9 bg-white text-sm tabular-nums"
            />
            <span className="shrink-0 text-sm font-semibold text-slate-600">{base}</span>
          </div>
        </div>
        <p className="col-span-2 self-end pb-2 text-xs text-slate-500 sm:col-span-1">
          {reorderInAlt
            ? `Reorder at ${reorderInAlt}.`
            : value.reorder_level.trim()
              ? "Shows in Products › Below reorder level when stock drops under this."
              : "Leave blank if you don't track a minimum."}
        </p>
      </div>
    </div>
  );
}
