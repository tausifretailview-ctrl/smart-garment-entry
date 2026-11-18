import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { spinFrameIndex, spinStep } from "@/lib/productSpin";

const HINT_TURN_MS = 1800;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Product page 360° view: the shop's photos taken around the product, shown as one picture the
 * shopper drags (or uses the arrow keys) to rotate. Only the first photo loads with the page; the
 * rest load when the viewer comes on screen, then it turns once by itself to show it can.
 */
export function StreetSpinViewer({
  frames,
  name,
  onMorePhotos,
}: {
  frames: string[];
  name: string;
  /** Phones: jump to the next photo in the gallery (dragging here rotates instead of scrolling). */
  onMorePhotos?: () => void;
}) {
  const count = frames.length;
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; index: number; width: number } | null>(null);
  const ready = started && loaded >= count;

  // Fetch the other frames only once the viewer is near the screen.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One slow turn when everything has loaded, so the shopper sees it is a 360° view.
  useEffect(() => {
    if (!ready || touched || count < 2 || prefersReducedMotion()) return;
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setIndex(step % count);
      if (step >= count) window.clearInterval(timer);
    }, Math.max(40, HINT_TURN_MS / count));
    return () => window.clearInterval(timer);
  }, [ready, touched, count]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    setTouched(true);
    setDragging(true);
    drag.current = { x: e.clientX, index, width: e.currentTarget.clientWidth };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety: moves still arrive while the pointer stays over the picture */
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setIndex(spinFrameIndex(d.index, e.clientX - d.x, d.width, count));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setTouched(true);
    setIndex((i) => spinStep(i, e.key === "ArrowRight" ? 1 : -1, count));
  };

  return (
    <div
      ref={boxRef}
      className={`st-gallery-item st-spin${dragging ? " st-spin-dragging" : ""}`}
      role="img"
      aria-label={`${name}, 360 degree view. Drag or use the arrow keys to rotate.`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      {frames.map((src, i) =>
        i === 0 || started ? (
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            className={i === index ? "st-spin-on" : undefined}
            onLoad={() => setLoaded((n) => n + 1)}
            // A frame that fails still counts, so the viewer is not stuck loading.
            onError={() => setLoaded((n) => n + 1)}
          />
        ) : null,
      )}
      <span className="st-spin-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            d="M3 12c0-2.2 4-4 9-4s9 1.8 9 4-4 4-9 4c-1 0-2-.1-3-.2M9 13l-3 2.8 3 2.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {ready ? "360° · drag to rotate" : "360° · loading"}
      </span>
      {!ready && started ? (
        <span className="st-spin-progress" aria-hidden="true">
          <span style={{ width: `${Math.round((Math.min(loaded, count) / count) * 100)}%` }} />
        </span>
      ) : null}
      {onMorePhotos ? (
        <button
          type="button"
          className="st-spin-more"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onMorePhotos}
        >
          Photos ›
        </button>
      ) : null}
    </div>
  );
}
