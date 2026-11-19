import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Grid3x3, Loader2, Maximize, Minus, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LabelItem } from "@/types/labelTypes";
import { labelCellCss } from "@/lib/barcode/renderLabelSheet";
import {
  buildFullPageSlots,
  computeSheetFit,
  fitA4PageZoom,
  type FullPageMode,
} from "@/lib/barcode/fullPageSheet";
import { A4_PAGE_HEIGHT_MM, A4_PAGE_WIDTH_MM } from "@/utils/a4SheetLayout";

const PX_PER_MM = 3.7795;

export interface FullPageSheetGeometry {
  cols: number;
  rows: number;
  /** Label size and gap as printed (NovaJet corrections already applied). */
  widthMm: number;
  heightMm: number;
  gapMm: number;
  /** Where the first label starts on the page (base margin + nudges). */
  marginTopMm: number;
  marginLeftMm: number;
}

export interface SheetOffsets {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface CustomSheetSize {
  width: number;
  height: number;
  cols: number;
  rows: number;
  gap: number;
}

export interface FullPageSheetDesignerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The label field designer shown on the left (same one as on the page). */
  designer: ReactNode;
  items: LabelItem[];
  /** HTML of one label: the same builder Preview and Print use. */
  labelHtml: (item: LabelItem) => string;
  /** Changes whenever the label design changes (fields, fonts, positions, format). */
  designKey: string;
  absoluteLayout: boolean;
  sheet: FullPageSheetGeometry;
  sheetType: string;
  sheetOptions: { value: string; label: string; description?: string }[];
  onSheetTypeChange: (value: string) => void;
  /** Only for the "custom" sheet type. */
  customSize?: CustomSheetSize | null;
  onCustomSizeChange?: (patch: Partial<CustomSheetSize>) => void;
  offsets: SheetOffsets;
  onOffsetsChange: (patch: Partial<SheetOffsets>) => void;
  startPosition: number;
  onStartPositionChange: (value: number) => void;
  onSaveDefault?: () => Promise<void> | void;
}

function MmStepper({
  label,
  value,
  onChange,
  step = 0.5,
  min,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  testId?: string;
}) {
  const clamp = (v: number) => {
    const n = Math.round(v * 10) / 10;
    return min !== undefined ? Math.max(min, n) : n;
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] font-semibold text-muted-foreground w-10 shrink-0">{label}</span>
      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(clamp(value - step))} aria-label={`${label} minus`}>
        <Minus className="h-3 w-3" />
      </Button>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
        className="h-7 w-14 px-1 text-center text-xs font-mono no-uppercase"
        aria-label={label}
        data-testid={testId}
      />
      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(clamp(value + step))} aria-label={`${label} plus`}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Full Page Designer: the label designer next to a live, true-to-scale A4 page with every
 * label of the sheet, built from the same label HTML, sizes, gaps and margins as the print.
 */
export function FullPageSheetDesigner(props: FullPageSheetDesignerProps) {
  const {
    open,
    onOpenChange,
    designer,
    items,
    labelHtml,
    designKey,
    absoluteLayout,
    sheet,
    sheetType,
    sheetOptions,
    onSheetTypeChange,
    customSize,
    onCustomSizeChange,
    offsets,
    onOffsetsChange,
    startPosition,
    onStartPositionChange,
    onSaveDefault,
  } = props;

  const [mode, setMode] = useState<FullPageMode>("fill");
  const [page, setPage] = useState(0);
  const [showOutlines, setShowOutlines] = useState(true);
  /** null = fit the whole page; "width" = fit the page width (scroll down); number = manual. */
  const [zoom, setZoom] = useState<number | null | "width">(null);
  const [fitZoom, setFitZoom] = useState(0.5);
  const [fitWidthZoom, setFitWidthZoom] = useState(0.5);
  const [saving, setSaving] = useState(false);
  // Callback ref: the dialog content mounts in a portal, so the node can arrive after the first effect.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);

  const slotsPerPage = Math.max(1, sheet.cols * sheet.rows);
  const { slots, pageCount, totalLabels } = useMemo(
    () => buildFullPageSlots({ items, slotsPerPage, startPosition, mode, page }),
    [items, slotsPerPage, startPosition, mode, page],
  );
  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  // Rebuild label HTML once per distinct item when the design changes (deferred, so
  // dragging a field in the designer stays smooth on a 65-label sheet).
  const deferredDesignKey = useDeferredValue(designKey);
  const htmlByItem = useMemo(() => {
    const map = new Map<LabelItem, string>();
    const css = labelCellCss(sheet.widthMm, sheet.heightMm, absoluteLayout);
    for (const s of slots) {
      if (s.kind !== "label" || map.has(s.item)) continue;
      let inner = "";
      try {
        inner = labelHtml(s.item);
      } catch {
        inner = "";
      }
      map.set(s.item, `<div class="label-cell" style="${css}">${inner}</div>`);
    }
    return map;
    // labelHtml is a fresh closure each render; deferredDesignKey says when its output changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, deferredDesignKey, sheet.widthMm, sheet.heightMm, absoluteLayout]);

  const fit = computeSheetFit({
    cols: sheet.cols,
    rows: sheet.rows,
    widthMm: sheet.widthMm,
    heightMm: sheet.heightMm,
    gapMm: sheet.gapMm,
    marginTopMm: sheet.marginTopMm,
    marginLeftMm: sheet.marginLeftMm,
  });
  const hasOverflow = fit.overflowXMm > 0 || fit.overflowYMm > 0 || fit.offPageTopLeft;

  // Fit the page to the viewport.
  useEffect(() => {
    const el = viewportEl;
    if (!open || !el) return;
    const measure = () => {
      setFitZoom(fitA4PageZoom(el.clientWidth - 32, el.clientHeight - 32, PX_PER_MM));
      setFitWidthZoom(fitA4PageZoom(el.clientWidth - 48, Number.MAX_SAFE_INTEGER, PX_PER_MM));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, viewportEl]);

  const effectiveZoom = zoom === null ? fitZoom : zoom === "width" ? fitWidthZoom : zoom;
  const pageWpx = A4_PAGE_WIDTH_MM * PX_PER_MM;
  const pageHpx = A4_PAGE_HEIGHT_MM * PX_PER_MM;
  const setZoomStep = (dir: 1 | -1) =>
    setZoom(Math.max(0.2, Math.min(3, Math.round((effectiveZoom + dir * 0.1) * 10) / 10)));

  const handleSaveDefault = async () => {
    if (!onSaveDefault) return;
    setSaving(true);
    try {
      await onSaveDefault();
    } finally {
      setSaving(false);
    }
  };

  const currentSheet = sheetOptions.find((o) => o.value === sheetType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[98vw] w-full h-[95vh] max-h-[95vh] flex flex-col p-3 gap-2"
        data-testid="full-page-designer"
      >
        <DialogHeader className="shrink-0 pr-10 flex-row items-center gap-3 space-y-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="flex items-center gap-2">
              <Grid3x3 className="h-5 w-5 text-primary" />
              Full Page Designer
            </DialogTitle>
            <DialogDescription className="truncate">
              Design the label on the left; the whole A4 sheet on the right uses the same sizes, gaps and margins as Print.
            </DialogDescription>
          </div>
          {onSaveDefault && (
            <Button type="button" size="sm" variant="outline" onClick={() => void handleSaveDefault()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save as Default
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(430px,38%)] gap-3">
          <div className="min-h-0 overflow-auto rounded-lg border bg-background p-2" data-testid="full-page-designer-fields">
            {designer}
          </div>

          <section className="min-h-0 flex flex-col rounded-lg border bg-background overflow-hidden">
            {/* Sheet setup */}
            <div className="shrink-0 border-b px-2 py-1.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs font-semibold">Sheet</Label>
                <Select value={sheetType} onValueChange={onSheetTypeChange}>
                  <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Sheet type">
                    <SelectValue placeholder="Sheet type" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                        {o.description ? <span className="text-muted-foreground"> · {o.description}</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground" data-testid="full-page-sheet-summary">
                  {sheet.widthMm}×{sheet.heightMm}mm · {sheet.cols}×{sheet.rows} = {slotsPerPage} per sheet · gap {sheet.gapMm}mm
                </span>
              </div>

              {sheetType === "custom" && customSize && onCustomSizeChange && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <MmStepper label="Width" value={customSize.width} min={5} onChange={(v) => onCustomSizeChange({ width: v })} />
                  <MmStepper label="Height" value={customSize.height} min={5} onChange={(v) => onCustomSizeChange({ height: v })} />
                  <MmStepper label="Cols" value={customSize.cols} step={1} min={1} onChange={(v) => onCustomSizeChange({ cols: Math.round(v) })} />
                  <MmStepper label="Rows" value={customSize.rows} step={1} min={1} onChange={(v) => onCustomSizeChange({ rows: Math.round(v) })} />
                  <MmStepper label="Gap" value={customSize.gap} step={0.5} min={0} onChange={(v) => onCustomSizeChange({ gap: v })} />
                </div>
              )}

              <div className="grid grid-cols-[auto_auto_auto] items-center justify-start gap-x-3 gap-y-1">
                <span className="row-span-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Nudge
                  <br />
                  (mm)
                </span>
                <MmStepper label="Top" value={offsets.top} onChange={(v) => onOffsetsChange({ top: v })} testId="full-page-offset-top" />
                <MmStepper label="Left" value={offsets.left} onChange={(v) => onOffsetsChange({ left: v })} testId="full-page-offset-left" />
                <MmStepper label="Bottom" value={offsets.bottom} onChange={(v) => onOffsetsChange({ bottom: v })} />
                <MmStepper label="Right" value={offsets.right} onChange={(v) => onOffsetsChange({ right: v })} />
              </div>
            </div>

            {/* View controls */}
            <div className="shrink-0 border-b px-2 py-1.5 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5 bg-muted/40" role="group" aria-label="Page view">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn("h-7 text-xs transition-none", mode === "fill" ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground")}
                  onClick={() => setMode("fill")}
                  aria-pressed={mode === "fill"}
                >
                  Full sheet
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn("h-7 text-xs transition-none", mode === "print" ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground")}
                  onClick={() => setMode("print")}
                  aria-pressed={mode === "print"}
                >
                  Print order ({totalLabels})
                </Button>
              </div>
              {mode === "print" && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Start at</span>
                  <Input
                    type="number"
                    min={1}
                    max={slotsPerPage}
                    value={startPosition}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      onStartPositionChange(Number.isFinite(n) && n >= 1 ? Math.min(n, slotsPerPage) : 1);
                    }}
                    className="h-7 w-14 px-1 text-center text-xs"
                    aria-label="Start position"
                  />
                </div>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={showOutlines} onCheckedChange={setShowOutlines} aria-label="Show label outlines" />
                Outlines
              </label>
            </div>

            {hasOverflow && (
              <div className="shrink-0 flex items-center gap-2 bg-amber-50 text-amber-800 border-b border-amber-200 px-3 py-1.5 text-xs" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Labels run off the page
                  {fit.overflowXMm > 0 ? ` by ${fit.overflowXMm}mm on the right` : ""}
                  {fit.overflowYMm > 0 ? `${fit.overflowXMm > 0 ? " and" : " by"} ${fit.overflowYMm}mm at the bottom` : ""}
                  {fit.offPageTopLeft ? " (top or left edge)" : ""}. Reduce the nudge or the label size.
                </span>
              </div>
            )}

            {/* The A4 page */}
            <div ref={setViewportEl} className="flex-1 min-h-0 overflow-auto bg-slate-200 dark:bg-slate-800 p-4">
              <div
                className="mx-auto"
                style={{ width: pageWpx * effectiveZoom, height: pageHpx * effectiveZoom }}
              >
                <div
                  data-testid="full-page-sheet"
                  data-cols={sheet.cols}
                  data-rows={sheet.rows}
                  className="relative bg-white text-black shadow-[0_8px_30px_rgba(15,23,42,0.25)]"
                  style={{
                    width: `${A4_PAGE_WIDTH_MM}mm`,
                    height: `${A4_PAGE_HEIGHT_MM}mm`,
                    transform: `scale(${effectiveZoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      top: `${sheet.marginTopMm}mm`,
                      left: `${sheet.marginLeftMm}mm`,
                      display: "grid",
                      gridTemplateColumns: `repeat(${sheet.cols}, ${sheet.widthMm}mm)`,
                      gridTemplateRows: `repeat(${sheet.rows}, ${sheet.heightMm}mm)`,
                      gap: `${sheet.gapMm}mm`,
                    }}
                  >
                    {slots.map((slot, i) => (
                      <div
                        key={i}
                        data-slot={slot.kind}
                        title={`Label ${i + 1}`}
                        className={cn(
                          "relative overflow-hidden",
                          slot.kind === "skip" && "bg-slate-100",
                        )}
                        style={{
                          width: `${sheet.widthMm}mm`,
                          height: `${sheet.heightMm}mm`,
                          outline: showOutlines ? "0.25mm dashed #94a3b8" : undefined,
                          outlineOffset: "-0.125mm",
                          borderRadius: showOutlines ? "1mm" : undefined,
                        }}
                        {...(slot.kind === "label"
                          ? { dangerouslySetInnerHTML: { __html: htmlByItem.get(slot.item) ?? "" } }
                          : {})}
                      >
                        {slot.kind === "skip" ? (
                          <span className="absolute inset-0 flex items-center justify-center text-[3mm] font-semibold text-slate-400">
                            used
                          </span>
                        ) : slot.kind === "empty" && showOutlines ? (
                          <span className="absolute left-[1mm] top-[0.5mm] text-[2.2mm] text-slate-300">{i + 1}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t px-3 py-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span
                className="min-w-0 truncate"
                title={mode === "fill" ? "Full sheet repeats your labels in every slot, to check the design." : undefined}
              >
                {currentSheet?.label ?? sheetType} · first label at top {sheet.marginTopMm.toFixed(1)}mm, left{" "}
                {sheet.marginLeftMm.toFixed(1)}mm · space right {fit.rightMm}mm, bottom {fit.bottomMm}mm
              </span>
              {mode === "print" && (
                <span className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span data-testid="full-page-page">
                    Page {Math.min(page + 1, pageCount)} of {pageCount}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Button type="button" variant="outline" size="icon" className="h-6 w-6" onClick={() => setZoomStep(-1)} aria-label="Zoom out">
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-12 text-center text-xs font-mono tabular-nums" data-testid="full-page-zoom">
                  {Math.round(effectiveZoom * 100)}%
                </span>
                <Button type="button" variant="outline" size="icon" className="h-6 w-6" onClick={() => setZoomStep(1)} aria-label="Zoom in">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant={zoom === null ? "secondary" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-[11px] gap-1"
                  onClick={() => setZoom(null)}
                  title="Show the whole page"
                >
                  <Maximize className="h-3.5 w-3.5" />
                  Page
                </Button>
                <Button
                  type="button"
                  variant={zoom === "width" ? "secondary" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setZoom("width")}
                  title="Fit the page width and scroll down"
                >
                  Width
                </Button>
              </div>
            </div>
          </section>
        </div>

      </DialogContent>
    </Dialog>
  );
}

export default FullPageSheetDesigner;
