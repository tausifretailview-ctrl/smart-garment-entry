import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn } from "lucide-react";

const STORAGE_KEY = "pos_ui_scale";
const SCALES = [100, 110, 125, 150] as const;
type Scale = typeof SCALES[number];

export function applyPosScale(scale: number) {
  if (typeof document === "undefined") return;
  document.body.dataset.posScale = String(scale);
}

export function getStoredPosScale(): Scale {
  if (typeof window === "undefined") return 100;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return (SCALES as readonly number[]).includes(raw) ? (raw as Scale) : 100;
}

export function PosScaleControl({ className }: { className?: string }) {
  const [scale, setScale] = useState<Scale>(() => getStoredPosScale());

  useEffect(() => {
    applyPosScale(scale);
    localStorage.setItem(STORAGE_KEY, String(scale));
    return () => {
      // keep scale across pages; don't reset on unmount
    };
  }, [scale]);

  return (
    <div
      className={
        "inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-1 " +
        (className ?? "")
      }
      title="Display scale"
    >
      <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
      {SCALES.map((s) => (
        <Button
          key={s}
          type="button"
          size="sm"
          variant={scale === s ? "default" : "ghost"}
          onClick={() => setScale(s)}
          className="h-7 px-2 text-[11px] font-semibold"
        >
          {s}%
        </Button>
      ))}
    </div>
  );
}

export default PosScaleControl;