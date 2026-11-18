import { useEffect, useRef, useState } from "react";
import { CURRENCIES, type CurrencyCode } from "@/lib/storefrontStrips";

const NOTICE_MS = 4500;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/** Black strip above the header: one notice at a time, ‹ › to step, turns on by itself. */
export function StreetNoticeSlider({ lines }: { lines: string[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = lines.length;

  useEffect(() => {
    if (count < 2 || paused || prefersReducedMotion()) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), NOTICE_MS);
    return () => window.clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;
  const step = (dir: -1 | 1) => setIndex((i) => (((i + dir) % count) + count) % count);
  const current = lines[Math.min(index, count - 1)];

  return (
    <div
      className="st-notice"
      role="region"
      aria-label="Shop notices"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {count > 1 ? (
        <button type="button" className="st-notice-arrow" aria-label="Previous notice" onClick={() => step(-1)}>
          ‹
        </button>
      ) : null}
      <p className="st-notice-text" key={current} aria-live="polite">
        {current}
      </p>
      {count > 1 ? (
        <button type="button" className="st-notice-arrow" aria-label="Next notice" onClick={() => step(1)}>
          ›
        </button>
      ) : null}
    </div>
  );
}

/** Black running strip (under the banner, or above the footer). */
export function StreetRunningStrip({ lines, label, tone = "ink" }: { lines: string[]; label: string; tone?: "ink" | "soft" }) {
  if (lines.length === 0) return null;
  return (
    <div className={`st-running st-running-${tone}`} role="region" aria-label={label}>
      <ul className="st-visually-hidden">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="st-marquee" aria-hidden="true">
        {[0, 1].map((copy) => (
          <span className="st-marquee-group" key={copy}>
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bottom-left currency picker. Prices in another currency are approximate; checkout is in rupees. */
export function StreetCurrencyPicker({
  value,
  onChange,
}: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const current = CURRENCIES.find((c) => c.code === value) ?? CURRENCIES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="st-currency" ref={boxRef}>
      {open ? (
        <div className="st-currency-menu" role="listbox" aria-label="Show prices in">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              role="option"
              aria-selected={c.code === value}
              className={`st-currency-option${c.code === value ? " st-on" : ""}`}
              onClick={() => {
                onChange(c.code);
                setOpen(false);
              }}
            >
              <span className="st-currency-flag" aria-hidden="true">
                {c.flag}
              </span>
              {c.name} ({c.code})
            </button>
          ))}
          <p className="st-currency-note">Other currencies are approximate. You pay in Indian rupees.</p>
        </div>
      ) : null}
      <button
        type="button"
        className="st-currency-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Prices in ${current.name}. Change currency`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="st-currency-flag" aria-hidden="true">
          {current.flag}
        </span>
        {current.code}
        <span className="st-currency-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
    </div>
  );
}
