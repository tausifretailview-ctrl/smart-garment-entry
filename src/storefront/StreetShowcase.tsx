import { useEffect, useRef, useState } from "react";
import { showcaseOffset } from "@/lib/storefrontShowcase";

export type StreetShowcaseItem = {
  id: string;
  name: string;
  priceLabel: string;
  image: string;
  /** Small tag over the photo, e.g. "New". */
  flag?: string | null;
};

const AUTO_MS = 3200;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Street home "Featured styles": products shown one by one in a 3D carousel. The front card
 * faces the shopper, its neighbours sit angled behind it; it turns to the next product every few
 * seconds, pauses while hovered / touched or off screen, and can be swiped or stepped with the
 * arrows. Only the five cards near the front are drawn, so a long list stays light.
 */
export function StreetShowcase({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: StreetShowcaseItem[];
  onOpen: (id: string) => void;
}) {
  const count = items.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const touchX = useRef<number | null>(null);
  const swiped = useRef(false);

  const step = (dir: -1 | 1) => setActive((i) => (((i + dir) % count) + count) % count);

  // Only turn while the section is visible (saves battery, and the shopper sees it from slide 1).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (count < 2 || paused || !onScreen || prefersReducedMotion()) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % count), AUTO_MS);
    return () => window.clearInterval(t);
  }, [count, paused, onScreen]);

  if (count === 0) return null;
  const current = items[Math.min(active, count - 1)];

  return (
    <section className="st-section st-showcase" aria-label={title}>
      <div className="st-section-head">
        <h2 className="st-h2">{title}</h2>
        {count > 1 ? (
          <div className="st-reel-arrows">
            <button type="button" className="st-reel-arrow" aria-label="Previous product" onClick={() => step(-1)}>
              ‹
            </button>
            <button type="button" className="st-reel-arrow" aria-label="Next product" onClick={() => step(1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>

      <div
        className="st-show-stage"
        ref={stageRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={(e) => {
          setPaused(true);
          swiped.current = false;
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          setPaused(false);
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null || Math.abs(end - start) < 40) return;
          swiped.current = true;
          step(end < start ? 1 : -1);
        }}
      >
        {items.map((item, index) => {
          const offset = showcaseOffset(index, active, count);
          if (offset === null) return null;
          const front = offset === 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`st-show-card${front ? " st-show-front" : ""}`}
              data-offset={offset}
              style={{ "--st-show-offset": offset, "--st-show-depth": Math.abs(offset) } as React.CSSProperties}
              tabIndex={front ? 0 : -1}
              aria-hidden={front ? undefined : true}
              aria-label={front ? `${item.name}, ${item.priceLabel || "price on request"}. Open product` : undefined}
              onClick={() => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                if (front) onOpen(item.id);
                else setActive(index);
              }}
            >
              <img src={item.image} alt="" loading="lazy" decoding="async" draggable={false} />
              {item.flag ? <span className="st-flag st-flag-new">{item.flag}</span> : null}
              <span className="st-show-shine" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="st-show-info" key={current.id}>
        <span className="st-show-name">{current.name}</span>
        <span className="st-show-price">{current.priceLabel || "Price on request"}</span>
        <button type="button" className="st-btn st-btn-solid st-btn-sm st-show-cta" onClick={() => onOpen(current.id)}>
          View product
        </button>
      </div>

      {count > 1 ? (
        <div className="st-show-progress" aria-hidden="true">
          <span style={{ width: `${((active + 1) / count) * 100}%` }} />
        </div>
      ) : null}
    </section>
  );
}
