import { SPIN_COLORS } from "@/lib/spinAndWin";

export type WheelSlice = { id?: string; label: string; color?: string | null };

const R = 150;
const C = 160;

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
  return lum > 170 ? "#1f2937" : "#ffffff";
}

/**
 * The Spin & Win wheel: slices clockwise from the top, the pointer at the top. `rotation`
 * (deg) turns the wheel; with `spinning` it eases there over `durationMs`.
 */
export function SpinWheel({
  slices,
  rotation = 0,
  spinning = false,
  durationMs = 4800,
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
  const n = Math.max(1, slices.length);
  return (
    <div className="relative mx-auto select-none" style={{ width: size, height: size }} data-testid="spin-wheel">
      <svg
        viewBox="0 0 320 320"
        width={size}
        height={size}
        role="img"
        aria-label="Spin & Win wheel"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? `transform ${durationMs}ms cubic-bezier(0.12, 0.66, 0.1, 1)` : "none",
        }}
        onTransitionEnd={() => onSpinEnd?.()}
      >
        <circle cx={C} cy={C} r={R + 6} fill="#1f2937" />
        {slices.map((s, i) => {
          const color = s.color || SPIN_COLORS[i % SPIN_COLORS.length];
          const mid = ((i + 0.5) / n) * 360;
          const label = s.label.length > 16 ? `${s.label.slice(0, 15)}…` : s.label;
          return (
            <g key={s.id ?? i}>
              <path d={slicePath(i, n)} fill={color} stroke="#ffffff" strokeWidth="2" />
              <text
                x={C}
                y={C - R * 0.6}
                transform={`rotate(${mid} ${C} ${C})`}
                textAnchor="middle"
                fontSize={n > 8 ? 11 : 13}
                fontWeight={700}
                fill={inkFor(color)}
                style={{ fontFamily: "Arial, sans-serif" }}
              >
                {label}
              </text>
            </g>
          );
        })}
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * 2 * Math.PI - Math.PI / 2;
          return <circle key={i} cx={C + (R + 1) * Math.cos(a)} cy={C + (R + 1) * Math.sin(a)} r="3.5" fill="#FDE68A" />;
        })}
        <circle cx={C} cy={C} r="26" fill="#ffffff" stroke="#1f2937" strokeWidth="4" />
        <circle cx={C} cy={C} r="10" fill="#F97316" />
      </svg>
      {/* Pointer at the top (does not turn). */}
      <svg viewBox="0 0 40 44" width={size * 0.11} height={size * 0.12} className="absolute left-1/2 -translate-x-1/2" style={{ top: -size * 0.03 }} aria-hidden>
        <path d="M20 42 L4 6 Q20 -2 36 6 Z" fill="#DC2626" stroke="#ffffff" strokeWidth="3" />
      </svg>
    </div>
  );
}
