import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  PAIR_TOP,
  PAIR_X,
  dotsToMm,
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
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragKey, setDragKey] = useState<FootwearFieldKey | null>(null);

  const patchField = (key: FootwearFieldKey, patch: Parameters<typeof updateFootwearField>[3]) => {
    onChange(updateFootwearField(resolved, panel, key, patch));
  };

  /** Pixels per dot, measured from the rendered preview (survives zoom/scale). */
  const pxPerDot = useCallback(() => {
    const el = previewRef.current;
    const widthPx = el?.getBoundingClientRect().width || 0;
    if (!widthPx) return 0;
    return widthPx / (PRECISION_PRO_TSC_WIDTH_MM * 8);
  }, []);

  const startDrag = (key: FootwearFieldKey) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const ratio = pxPerDot();
    if (!ratio) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = fields[key].x;
    const originY = fields[key].y;
    setDragKey(key);

    const move = (ev: PointerEvent) => {
      const nx = Math.round(originX + (ev.clientX - startX) / ratio);
      const ny = Math.round(originY + (ev.clientY - startY) / ratio);
      patchField(key, {
        x: Math.min(maxX, Math.max(0, nx)),
        y: Math.min(maxY, Math.max(0, ny)),
      });
    };
    const up = () => {
      setDragKey(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Panel origin inside the 102×53mm form (mm), used to place drag handles.
  const panelOriginMm =
    panel === "box"
      ? { left: 0, top: 0 }
      : { left: dotsToMm(PAIR_X), top: dotsToMm(PAIR_TOP) };

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
                <div className="col-span-3 grid grid-cols-3 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Font</Label>
                    <Select
                      value={f.font}
                      onValueChange={(v) => patchField(key, { font: v as typeof f.font })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["1", "2", "3", "4", "5"] as const).map((v) => (
                          <SelectItem key={v} value={v} className="text-xs">
                            Font {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DotNudge
                    label="Width ×"
                    value={f.mulX}
                    min={1}
                    max={10}
                    onChange={(mulX) => patchField(key, { mulX })}
                  />
                  <DotNudge
                    label="Height ×"
                    value={f.mulY}
                    min={1}
                    max={10}
                    onChange={(mulY) => patchField(key, { mulY })}
                  />
                </div>
                {key === "barcode" && (
                  <div className="col-span-3">
                    <DotNudge
                      label="Barcode height (dots)"
                      value={f.barcodeHeight ?? 40}
                      min={10}
                      max={200}
                      onChange={(barcodeHeight) => patchField(key, { barcodeHeight })}
                    />
                  </div>
                )}
                {key !== "barcode" && (
                  <div className="col-span-3 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Prefix</Label>
                      <Input
                        className="h-7 text-xs"
                        value={f.caption ?? ""}
                        placeholder="e.g. ART NO : "
                        onChange={(e) => patchField(key, { caption: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Suffix</Label>
                      <Input
                        className="h-7 text-xs"
                        value={f.suffix ?? ""}
                        placeholder="e.g. /-"
                        onChange={(e) => patchField(key, { suffix: e.target.value })}
                      />
                    </div>
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
          <p className="text-[11px] text-muted-foreground shrink-0">
            Drag the dotted handles on the preview to move fields of the selected panel.
          </p>
          <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <CardContent className="p-3 flex items-center justify-center bg-muted/30 overflow-auto flex-1 min-h-[180px]">
              <div ref={previewRef} className="relative select-none">
                <PrecisionProTSCPreview
                  item={sample}
                  businessName={businessName}
                  scaleFactor={scaleFactor}
                  design={resolved}
                />
                <div className="absolute inset-0">
                  {FOOTWEAR_FIELD_KEYS.filter((key) => fields[key].show).map((key) => {
                    const f = fields[key];
                    const leftMm = panelOriginMm.left + dotsToMm(f.x);
                    const topMm = panelOriginMm.top + dotsToMm(f.y);
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        title={`Drag ${FOOTWEAR_FIELD_LABELS[key]}`}
                        onPointerDown={startDrag(key)}
                        className={cn(
                          "absolute cursor-move rounded-sm border border-dashed",
                          dragKey === key
                            ? "border-primary bg-primary/25"
                            : "border-primary/60 bg-primary/10 hover:bg-primary/20",
                        )}
                        style={{
                          left: `${leftMm * scaleFactor}mm`,
                          top: `${topMm * scaleFactor}mm`,
                          width: `${(key === "barcode" ? 24 : 14) * scaleFactor}mm`,
                          height: `${(key === "barcode" ? 8 : 3.5) * scaleFactor}mm`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
