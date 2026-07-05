import { Monitor, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { isElectronShell } from "@/lib/electronShell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const SCALE_OPTIONS = [
  { key: "compact", label: "Compact", desc: "High density (16px)", size: "16px", zoom: 0.85 },
  { key: "standard", label: "Standard", desc: "Default (18px)", size: "18px", zoom: 1.0 },
  { key: "large", label: "Large", desc: "Easy reading (19px)", size: "19px", zoom: 1.05 },
] as const;

type ScaleKey = (typeof SCALE_OPTIONS)[number]["key"];

const UI_SCALE_STORAGE_KEY = "ui-scale";

/** Desktop shell default — compact fits 1080p / 125% Windows scaling without manual zoom. */
const ELECTRON_DEFAULT_SCALE: ScaleKey = "compact";

function readSavedScale(): ScaleKey | null {
  try {
    const saved = localStorage.getItem(UI_SCALE_STORAGE_KEY) as ScaleKey | null;
    if (saved && SCALE_OPTIONS.some((o) => o.key === saved)) return saved;
  } catch {
    /* private mode */
  }
  return null;
}

function defaultScaleKey(): ScaleKey {
  return isElectronShell() ? ELECTRON_DEFAULT_SCALE : "large";
}

function applyScale(key: ScaleKey) {
  const opt = SCALE_OPTIONS.find((o) => o.key === key)!;
  document.documentElement.style.fontSize = opt.size;
  if (key === "compact") {
    document.documentElement.classList.add("scale-compact");
  } else {
    document.documentElement.classList.remove("scale-compact");
  }
  if (isElectronShell()) {
    const api = (window as Window & { electronAPI?: { setZoomFactor?: (z: number) => Promise<void> } })
      .electronAPI;
    if (api?.setZoomFactor) {
      document.documentElement.style.zoom = "";
      void api.setZoomFactor(opt.zoom);
    } else {
      // Older desktop builds (pre set-zoom-factor IPC) — Chromium zoom fallback
      document.documentElement.style.zoom = String(opt.zoom);
    }
  } else {
    document.documentElement.style.zoom = "";
  }
}

export function initUIScale() {
  const saved = readSavedScale();
  const key = saved ?? defaultScaleKey();
  applyScale(key);
  if (!saved) {
    try {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, key);
    } catch {
      /* private mode */
    }
  }
}

type UIScaleSelectorProps = {
  /** Optional trigger styles (e.g. dark header row vs light sidebar). */
  triggerClassName?: string;
};

export const UIScaleSelector = ({ triggerClassName }: UIScaleSelectorProps) => {
  const [scale, setScale] = useState<ScaleKey>(() => readSavedScale() ?? defaultScaleKey());

  useEffect(() => {
    applyScale(scale);
  }, [scale]);

  const handleSelect = (key: ScaleKey) => {
    setScale(key);
    localStorage.setItem(UI_SCALE_STORAGE_KEY, key);
    applyScale(key);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={
            triggerClassName ??
            "h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden md:flex"
          }
          title="Display Scale"
        >
          <Monitor className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs">Display Scale</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SCALE_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.key}
            onClick={() => handleSelect(opt.key)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div>
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs text-muted-foreground">{opt.desc}</div>
            </div>
            {scale === opt.key && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
