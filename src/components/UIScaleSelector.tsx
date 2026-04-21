import { Monitor, Check } from "lucide-react";
import { useState, useEffect } from "react";
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
  { key: "compact", label: "Compact", desc: "High density (16px)", size: "16px" },
  { key: "standard", label: "Standard", desc: "Default (18px)", size: "18px" },
  { key: "large", label: "Large", desc: "Easy reading (20px)", size: "20px" },
] as const;

type ScaleKey = (typeof SCALE_OPTIONS)[number]["key"];

function applyScale(key: ScaleKey) {
  const opt = SCALE_OPTIONS.find((o) => o.key === key)!;
  document.documentElement.style.fontSize = opt.size;
  if (key === "compact") {
    document.documentElement.classList.add("scale-compact");
  } else {
    document.documentElement.classList.remove("scale-compact");
  }
}

export function initUIScale() {
  const saved = (localStorage.getItem("ui-scale") as ScaleKey) || "large";
  applyScale(saved);
}

export const UIScaleSelector = () => {
  const [scale, setScale] = useState<ScaleKey>(() => {
    return (localStorage.getItem("ui-scale") as ScaleKey) || "large";
  });

  useEffect(() => {
    applyScale(scale);
  }, [scale]);

  const handleSelect = (key: ScaleKey) => {
    setScale(key);
    localStorage.setItem("ui-scale", key);
    applyScale(key);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden md:flex"
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
