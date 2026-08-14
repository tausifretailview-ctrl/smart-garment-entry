import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { LabelItem } from "@/types/labelTypes";
import { cn } from "@/lib/utils";
import { PrecisionProTSCPreview } from "@/components/labels/PrecisionProTSCPreview";
import {
  DEFAULT_FOOTWEAR_FORM_DESIGN,
  FOOTWEAR_FIELD_KEYS,
  FOOTWEAR_FIELD_LABELS,
  type FootwearFieldKey,
  type FootwearFormDesign,
  type FootwearPanelId,
  resolveFootwearFormDesign,
  updateFootwearField,
} from "@/utils/labels/precisionProFootwearDesign";
import {
  PRECISION_PRO_TSC_HEIGHT_MM,
  PRECISION_PRO_TSC_WIDTH_MM,
} from "@/utils/labels/precisionProGeometry";

interface FootwearPanelDesignerProps {
  design: FootwearFormDesign;
  onChange: (design: FootwearFormDesign) => void;
  sampleItem?: LabelItem;
  businessName?: string;
  scaleFactor?: number;
  className?: string;
}

function DotNudge({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const step = (delta: number) => {
    const next = Math.round(value + delta);
    if (next >= min && next <= max) onChange(next);
  };
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => step(-1)}>
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          className="h-7 text-xs text-center tabular-nums font-mono px-1"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, Math.round(n))));
          }}
        />
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => step(1)}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function FootwearPanelDesigner({
  design,
  onChange,
  sampleItem,
  businessName = "STORE",
  scaleFactor = 1.4,
  className,
}: FootwearPanelDesignerProps) {
  const [panel, setPanel] = useState<FootwearPanelId>("box");
  const resolved = resolveFootwearFormDesign(design);
  const fields = resolved[panel].fields;
  const maxX = panel === "box" ? 500 : 300;
  const maxY = panel === "box" ? 410 : 190;

  const patchField = (key: FootwearFieldKey, patch: Parameters<typeof updateFootwearField>[3]) => {
    onChange(updateFootwearField(resolved, panel, key, patch));
  };

  const sample: LabelItem = sampleItem || {
    product_name: "RUNNER PRO",
    brand: "BRAND",
    category: "SHOE",
    color: "BLACK",
    style: "ART-42",
    size: "9",
    sale_price: 999,
    mrp: 1299,
    barcode: "8901234567890",
    bill_number: "PB-001",
  };

  return (
    <div className={cn("flex flex-col gap-3 min-h-0", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Design panel
        </p>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              panel === "box"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
            onClick={() => setPanel("box")}
          >
            Box (64×53)
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              panel === "pair"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
            onClick={() => setPanel("pair")}
          >
            Pair (38×25)×2
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1 ml-auto"
          onClick={() => onChange(resolveFootwearFormDesign(DEFAULT_FOOTWEAR_FORM_DESIGN))}
        >
          <RotateCcw className="h-3 w-3" />
          Reset defaults
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {panel === "box"
          ? "Box coords are absolute on the 102×53 form (dots @ 203 DPI)."
          : "Pair is designed once and printed twice (top + bottom). Coords are relative to each pair sticker."}
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="space-y-2 overflow-auto min-h-0 max-h-[420px] xl:max-h-none pr-1">
          {FOOTWEAR_FIELD_KEYS.map((key) => {
            const f = fields[key];
            return (
              <div
                key={key}
                className="grid grid-cols-[1fr_auto_auto] gap-2 items-end border rounded-md p-2 bg-muted/20"
              >
                <div className="flex items-center gap-2 min-w-0 pb-1">
                  <Switch
                    checked={f.show}
                    onCheckedChange={(v) => patchField(key, { show: v })}
                  />
                  <span className="text-xs font-medium truncate">{FOOTWEAR_FIELD_LABELS[key]}</span>
                </div>
                <DotNudge
                  label="X"
                  value={f.x}
                  min={0}
                  max={maxX}
                  onChange={(x) => patchField(key, { x })}
                />
                <DotNudge
                  label="Y"
                  value={f.y}
                  min={0}
                  max={maxY}
                  onChange={(y) => patchField(key, { y })}
                />
                {f.caption != null && f.caption !== "" && (
                  <div className="col-span-3">
                    <Label className="text-[10px] text-muted-foreground">Caption</Label>
                    <Input
                      className="h-7 text-xs"
                      value={f.caption}
                      onChange={(e) => patchField(key, { caption: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col min-h-0 gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
            Live form preview ({PRECISION_PRO_TSC_WIDTH_MM}×{PRECISION_PRO_TSC_HEIGHT_MM}mm)
          </p>
          <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <CardContent className="p-3 flex items-center justify-center bg-muted/30 overflow-auto flex-1 min-h-[180px]">
              <PrecisionProTSCPreview
                item={sample}
                businessName={businessName}
                scaleFactor={scaleFactor}
                design={resolved}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
