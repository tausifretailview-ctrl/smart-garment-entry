import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

/**
 * Edit a product photo before it is saved (Product Master → Photos): turn it, zoom and drag it
 * into the 4:5 card frame (or fit the whole photo on white), and lighten / add contrast.
 * Saves a 1200 × 1500 JPEG.
 */
const OUT_W = 1200;
const OUT_H = 1500;
const PREVIEW_W = 320;
const PREVIEW_H = 400;

type PhotoEdit = {
  rotation: 0 | 90 | 180 | 270;
  zoom: number;
  /** Pan in preview pixels. */
  offsetX: number;
  offsetY: number;
  brightness: number;
  contrast: number;
  fit: "fill" | "fit";
};

const DEFAULT_EDIT: PhotoEdit = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0, brightness: 100, contrast: 100, fit: "fill" };

/** Draw the photo with the edit into a w × h frame (preview or the saved file). */
function drawEdited(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, e: PhotoEdit, w: number, h: number) {
  const k = w / PREVIEW_W;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `brightness(${e.brightness}%) contrast(${e.contrast}%)`;
  const turned = e.rotation === 90 || e.rotation === 270;
  const iw = turned ? img.height : img.width;
  const ih = turned ? img.width : img.height;
  const base = e.fit === "fill" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const s = base * e.zoom;
  ctx.translate(w / 2 + e.offsetX * k, h / 2 + e.offsetY * k);
  ctx.rotate((e.rotation * Math.PI) / 180);
  ctx.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

export function PhotoEditDialog({
  open,
  src,
  title,
  onCancel,
  onSave,
}: {
  open: boolean;
  /** The photo to edit (a saved photo's URL, or an object URL of a chosen file). */
  src: string | null;
  title: string;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<PhotoEdit>(DEFAULT_EDIT);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!open || !src) return;
    setImg(null);
    setFailed(false);
    setEdit(DEFAULT_EDIT);
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setFailed(true);
    // A photo the page already showed sits in the browser cache without the cross-site headers a
    // canvas needs; a fresh copy is asked for so the edited photo can be saved.
    el.src = /^https?:/i.test(src) ? `${src}${src.includes("?") ? "&" : "?"}edit=${Date.now()}` : src;
  }, [open, src]);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx && img) drawEdited(ctx, img, edit, PREVIEW_W, PREVIEW_H);
  }, [img, edit]);

  const set = useCallback((patch: Partial<PhotoEdit>) => setEdit((e) => ({ ...e, ...patch })), []);

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const out = document.createElement("canvas");
      out.width = OUT_W;
      out.height = OUT_H;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("This browser cannot edit photos");
      drawEdited(ctx, img, edit, OUT_W, OUT_H);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.88));
      if (!blob) throw new Error("Photo could not be made");
      await onSave(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit photo</DialogTitle>
          <DialogDescription>{title} · drag the photo to place it in the frame</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[320px_1fr]">
          <div className="relative mx-auto h-[400px] w-[320px] overflow-hidden rounded-xl border bg-white shadow-inner">
            {failed ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                This photo could not be opened for editing. Use Change photo to pick a new one.
              </div>
            ) : !img ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <canvas
              ref={canvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              data-testid="photo-edit-canvas"
              className={img ? "block cursor-grab touch-none active:cursor-grabbing" : "hidden"}
              onPointerDown={(e) => {
                (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: edit.offsetX, oy: edit.offsetY };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) set({ offsetX: d.ox + (e.clientX - d.x), offsetY: d.oy + (e.clientY - d.y) });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onWheel={(e) => set({ zoom: Math.min(4, Math.max(1, edit.zoom - e.deltaY * 0.001)) })}
            />
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => set({ rotation: (((edit.rotation + 270) % 360) as PhotoEdit["rotation"]) })} aria-label="Turn left">
                <RotateCcw className="mr-1 h-4 w-4" /> Left
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => set({ rotation: (((edit.rotation + 90) % 360) as PhotoEdit["rotation"]) })} aria-label="Turn right">
                <RotateCw className="mr-1 h-4 w-4" /> Right
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set({ fit: edit.fit === "fill" ? "fit" : "fill", zoom: 1, offsetX: 0, offsetY: 0 })}
                aria-label={edit.fit === "fill" ? "Show whole photo" : "Fill the frame"}
              >
                {edit.fit === "fill" ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
                {edit.fit === "fill" ? "Whole photo" : "Fill frame"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(DEFAULT_EDIT)} aria-label="Reset edits">
                <Undo2 className="mr-1 h-4 w-4" /> Reset
              </Button>
            </div>
            {[
              { key: "zoom" as const, label: "Zoom", min: 1, max: 4, step: 0.05, fmt: (v: number) => `${v.toFixed(1)}×` },
              { key: "brightness" as const, label: "Brightness", min: 60, max: 150, step: 1, fmt: (v: number) => `${v}%` },
              { key: "contrast" as const, label: "Contrast", min: 60, max: 150, step: 1, fmt: (v: number) => `${v}%` },
            ].map((c) => (
              <div key={c.key} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{c.label}</span>
                  <span className="tabular-nums text-muted-foreground">{c.fmt(edit[c.key])}</span>
                </div>
                <Slider
                  aria-label={c.label}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={[edit[c.key]]}
                  onValueChange={([v]) => set({ [c.key]: v } as Partial<PhotoEdit>)}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!img || saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
