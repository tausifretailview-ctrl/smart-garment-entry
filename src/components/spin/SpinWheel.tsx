import { useId } from "react";
import { SPIN_COLORS } from "@/lib/spinAndWin";

export type WheelSlice = { id?: string; label: string; color?: string | null };

const R = 142; // slice radius
const C = 160; // centre

function slicePath(i: number, n: number): string {
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const x0 = C + R * Math.cos(a0);
  const y0 = C + R * Math.sin(a0);
  const x1 = C + R * Math.cos(a1);
  const y1 = C + R * Math.sin(a1);
  const large = 1 / n > 0.5 ? 1 : 0;
  return `M${C} ${C} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** Light or dark text for a slice colour. */
function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const v = parseInt(m[1], 16);
  const lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
  return lum > 175 ? "#1f2937" : "#ffffff";
}

/** Words of a slice label split over at most two lines. */
function labelLines(label: string, n: number): string[] {
  const max = n > 8 ? 10 : 12;
  const words = label.trim().split(/\s+/);
  if (label.length <= max || words.length === 1) return [label.length > max + 3 ? `${label.slice(0, max + 2)}…` : label];
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length <= max || !cur) lines[lines.length - 1] = (cur + " " + w).trim();
    else if (lines.length < 2) lines.push(w);
    else lines[1] = `${lines[1]} ${w}`.slice(0, max + 1);
  }
  return lines;
}

/**
 * The Spin & Win wheel: a gold rim with lights, glossy slices clockwise from the top, a gold
 * hub and pointer. `rotation` (deg) turns the wheel; with `spinning` it eases there over
 * `durationMs`. The pointer stays at the top.
 */
export function SpinWheel({
  slices,
  rotation = 0,
  spinning = false,
  durationMs = 5200,
  size = 320,
  onSpinEnd,
}: {
  slices: WheelSlice[];
  rotation?: number;
  spinning?: boolean;
  durationMs?: number;
  size?: number;
  onSpinEnd?: () => void;
}) {
  const uid = useId().replace(/:/g, "");
  const n = Math.max(1, slices.length);
  const gold = `gold-${uid}`;
  const gloss = `gloss-${uid}`;
  const hub = `hub-${uid}`;
  const shadow = `shadow-${uid}`;
  return (
    <div className="relative mx-auto select-none" style={{ width: size, height: size }} data-testid="spin-wheel">
      {/* Gold rim and lights do not turn. */}
      <svg viewBox="0 0 320 320" width={size} height={size} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="60%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        <circle cx={C} cy={C} r={158} fill={`url(#${gold})`} />
        <circle cx={C} cy={C} r={149} fill="#1E1033" />
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * 2 * Math.PI;
          return (
            <circle
              key={i}
              cx={C + 153.5 * Math.cos(a)}
              cy={C + 153.5 * Math.sin(a)}
              r="2.6"
              fill={i % 2 ? "#FFFBEB" : "#FDE047"}
              className={spinning ? "animate-pulse" : undefined}
            />
          );
        })}
      </svg>

      <svg
        viewBox="0 0 320 320"
        width={size}
        height={size}
        role="img"
        aria-label="Spin & Win wheel"
        className="absolute inset-0"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? `transform ${durationMs}ms cubic-bezier(0.15, 0.7, 0.08, 1)` : "none",
        }}
        onTransitionEnd={() => onSpinEnd?.()}
      >
        <defs>
          <radialGradient id={gloss} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
          </radialGradient>
        </defs>
        {slices.map((s, i) => {
          const color = s.color || SPIN_COLORS[i % SPIN_COLORS.length];
          const mid = ((i + 0.5) / n) * 360;
          const lines = labelLines(s.label, n);
          const ink = inkFor(color);
          return (
            <g key={s.id ?? i}>
              <path d={slicePath(i, n)} fill={color} />
              <path d={slicePath(i, n)} fill={`url(#${gloss})`} stroke="#FDE68A" strokeOpacity="0.9" strokeWidth="1.5" />
              <g transform={`rotate(${mid} ${C} ${C})`}>
                {lines.map((line, li) => (
                  <text
                    key={li}
                    x={C}
                    y={C - R * 0.66 + li * 15}
                    textAnchor="middle"
                    fontSize={n > 8 ? 11.5 : 13.5}
                    fontWeight={800}
                    letterSpacing="0.3"
                    fill={ink}
                    style={{ fontFamily: "'Poppins', 'Segoe UI', Arial, sans-serif", paintOrder: "stroke", stroke: ink === "#ffffff" ? "rgba(0,0,0,0.25)" : "none", strokeWidth: 2 }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            </g>
          );
        })}
      </svg>

      {/* Hub and pointer (fixed). */}
      <svg viewBox="0 0 320 320" width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden>
        <defs>
          <radialGradient id={hub} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="45%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#B45309" />
          </radialGradient>
          <filter id={shadow} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>
        <circle cx={C} cy={C} r="30" fill={`url(#${hub})`} stroke="#FFFBEB" strokeWidth="3" filter={`url(#${shadow})`} />
        <circle cx={C} cy={C} r="12" fill="#7C2D12" opacity="0.85" />
        <path d="M160 46 L144 8 Q160 -2 176 8 Z" fill={`url(#${hub})`} stroke="#FFFBEB" strokeWidth="2.5" filter={`url(#${shadow})`} />
        <circle cx="160" cy="12" r="4" fill="#7C2D12" />
      </svg>
    </div>
  );
}
