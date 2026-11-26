import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";
import { isUsableImageUrl } from "@/lib/productImages";

/**
 * Full-screen product photo inside the app (Field Sales, phones). Tapping a photo used to open
 * the bare image link in a new tab: the installed app left for the browser, and the page could
 * not be zoomed (the app turns off pinch zoom). Here: photo fitted to the screen, pinch or
 * double-tap to zoom, drag to look around, X / Back / tap outside the photo to close.
 *
 * A Radix dialog, so it opens on top of another dialog (the size sheet) without closing it.
 */

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

type Point = { x: number; y: number };

export function ProductPhotoViewer({
  url,
  name,
  onClose,
}: {
  /** The photo to show; null/empty = closed. */
  url: string | null | undefined;
  name?: string;
  onClose: () => void;
}) {
  const open = isUsableImageUrl(url);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ start: Point; offset: Point } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setFailed(false);
  }, [url]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(1, s));
  const setZoom = (s: number) => {
    const next = clampScale(s);
    setScale(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      pinch.current = { dist: distance(), scale };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { start: { x: e.clientX, y: e.clientY }, offset };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const d = distance();
      if (pinch.current.dist > 0) setZoom((pinch.current.scale * d) / pinch.current.dist);
      moved.current = true;
    } else if (drag.current && scale > 1) {
      const dx = e.clientX - drag.current.start.x;
      const dy = e.clientY - drag.current.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      setOffset({ x: drag.current.offset.x + dx, y: drag.current.offset.y + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1 && !pinch.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
    if (e.type !== "pointerup" || !wasSingle || moved.current) return;
    // A tap: double-tap on the photo zooms in / back; a tap beside the photo closes.
    const onPhoto = (e.target as HTMLElement).dataset?.testid === "product-photo-image";
    if (!onPhoto) {
      if (scale === 1) onClose();
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setZoom(scale > 1 ? 1 : DOUBLE_TAP_SCALE);
    } else {
      lastTap.current = now;
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/95" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[200] flex flex-col text-white outline-none"
          data-testid="product-photo-viewer"
        >
          <div
            className="flex shrink-0 items-center gap-2 px-3 pb-2"
            style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
          >
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {name || "Photo"}
            </DialogPrimitive.Title>
            {scale > 1 ? (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="flex h-10 items-center gap-1 rounded-full bg-white/15 px-3 text-sm font-semibold active:bg-white/25"
              >
                <ZoomIn className="h-4 w-4" /> Fit
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
              aria-label="Close photo"
              data-testid="product-photo-close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(e) => setZoom(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
          >
            {failed ? (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
                This photo could not be loaded. Check the internet connection and try again.
              </p>
            ) : open ? (
              <img
                src={url!}
                alt={name || ""}
                draggable={false}
                onError={() => setFailed(true)}
                className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transition: pointers.current.size ? "none" : "transform 150ms ease-out",
                }}
                data-testid="product-photo-image"
              />
            ) : null}
          </div>

          <p
            className="shrink-0 px-4 pt-2 text-center text-xs text-white/60"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            Pinch or double-tap to zoom
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
