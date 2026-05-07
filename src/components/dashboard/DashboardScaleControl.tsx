import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn } from "lucide-react";

const STORAGE_KEY = "dash_ui_scale";
const SCALES = [100, 110, 125, 150] as const;
type Scale = typeof SCALES[number];

function getStored(): Scale {
  if (typeof window === "undefined") return 110;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return (SCALES as readonly number[]).includes(raw) ? (raw as Scale) : 110;
}

export function DashboardScaleControl({ className }: { className?: string }) {
  const [scale, setScale] = useState<Scale>(() => getStored());

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.dashScale = String(scale);
    localStorage.setItem(STORAGE_KEY, String(scale));
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

export default DashboardScaleControl;