import { useEffect, useRef, useState } from "react";

export type StreetVideoItem = {
  id: string;
  video_url: string;
  caption: string;
  /** Label of what "Shop now" opens; null hides the button. */
  shopLabel: string | null;
};

/** True when the visitor asked the system to reduce motion: clips then wait for a tap. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * One portrait clip. The file is only fetched once the card comes near the screen, plays muted
 * on loop while visible and pauses when scrolled away, so a row of clips stays light.
 */
function StreetVideoCard({ item, onShop }: { item: StreetVideoItem; onShop: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const autoplay = useRef(!prefersReducedMotion());
  const visible = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSrc(item.video_url);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.current = entry.isIntersecting;
          if (entry.isIntersecting) {
            setSrc((prev) => prev ?? item.video_url);
            // First time in view the file is attached on the next render (effect below plays it).
            if (autoplay.current && el.currentSrc) void el.play().catch(() => setPaused(true));
          } else if (!el.paused) {
            el.pause();
          }
        }
      },
      { rootMargin: "200px", threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item.video_url]);

  // Once the file is attached, start it if the card is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || !src || !visible.current || !autoplay.current) return;
    void el.play().catch(() => setPaused(true));
  }, [src]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (!src) setSrc(item.video_url);
    if (el.paused) {
      autoplay.current = true;
      void el.play().catch(() => setPaused(true));
    } else {
      autoplay.current = false;
      el.pause();
    }
  };

  return (
    <div className="st-reel">
      <video
        ref={ref}
        src={src ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={toggle}
        aria-label={item.caption || "Shop video"}
      />
      {paused ? (
        <button type="button" className="st-reel-play" aria-label="Play video" onClick={toggle}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </button>
      ) : null}
      {item.caption || item.shopLabel ? (
        <div className="st-reel-foot">
          {item.caption ? <span className="st-reel-caption">{item.caption}</span> : null}
          {item.shopLabel ? (
            <button type="button" className="st-btn st-btn-light st-reel-shop" onClick={onShop}>
              Shop now
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Street home: a sideways row of shop videos with arrows (swipe on phones). */
export function StreetVideoRail({
  title,
  videos,
  onShop,
}: {
  title: string;
  videos: StreetVideoItem[];
  onShop: (video: StreetVideoItem) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  if (videos.length === 0) return null;

  const scroll = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: dir * Math.max(rail.clientWidth * 0.8, 240), behavior: "smooth" });
  };

  return (
    <section className="st-section st-reels" aria-label={title}>
      <div className="st-section-head">
        <h2 className="st-h2">{title}</h2>
        {videos.length > 1 ? (
          <div className="st-reel-arrows">
            <button type="button" className="st-reel-arrow" aria-label="Previous videos" onClick={() => scroll(-1)}>
              ‹
            </button>
            <button type="button" className="st-reel-arrow" aria-label="Next videos" onClick={() => scroll(1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>
      <div className="st-reel-rail" ref={railRef}>
        {videos.map((video) => (
          <StreetVideoCard key={video.id} item={video} onShop={() => onShop(video)} />
        ))}
      </div>
    </section>
  );
}
