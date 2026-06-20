import { useTheme } from "next-themes";
import { Moon, Sun, Sparkles, Palette, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  APP_CUSTOM_THEME_KEY,
  applyCustomTheme,
  initAppTheme,
  readCustomThemeId,
  stripCustomThemeClasses,
  type CustomThemeId,
} from "@/lib/appTheme";

type ThemeToggleProps = {
  /** Merged into trigger button (e.g. match header row 2 / sidebar toolbar). */
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [customTheme, setCustomTheme] = useState<CustomThemeId | null>(() => readCustomThemeId());

  useEffect(() => {
    initAppTheme();
    setCustomTheme(readCustomThemeId() ?? "purple");
  }, [setTheme]);

  const handleThemeChange = (newTheme: string) => {
    stripCustomThemeClasses();
    localStorage.removeItem(APP_CUSTOM_THEME_KEY);
    setCustomTheme(null);

    if (newTheme === "indigo") {
      setTheme("light");
      applyCustomTheme("indigo");
      localStorage.setItem(APP_CUSTOM_THEME_KEY, "indigo");
      setCustomTheme("indigo");
    } else if (newTheme === "enterprise") {
      setTheme("light");
      applyCustomTheme("enterprise");
      localStorage.setItem(APP_CUSTOM_THEME_KEY, "enterprise");
      setCustomTheme("enterprise");
    } else if (newTheme === "purple") {
      setTheme("light");
      applyCustomTheme("purple");
      localStorage.setItem(APP_CUSTOM_THEME_KEY, "purple");
      setCustomTheme("purple");
    } else {
      setTheme(newTheme);
    }
  };

  const currentTheme = customTheme || theme;

  const iconClass = className?.includes("text-white") ? "h-4 w-4 text-white" : undefined;

  const getThemeDisplay = () => {
    if (currentTheme === "enterprise") {
      return (
        <>
          <Building2 className={iconClass ?? "h-4 w-4 text-sky-600"} />
          <span className="hidden sm:inline">Enterprise Theme</span>
        </>
      );
    }
    if (currentTheme === "purple") {
      return (
        <>
          <Palette className={iconClass ?? "h-4 w-4 text-[#5B5FEF]"} />
          <span className="hidden sm:inline">Purple Theme</span>
        </>
      );
    }
    if (currentTheme === "indigo") {
      return (
        <>
          <Sparkles className={iconClass ?? "h-4 w-4 text-indigo-500"} />
          <span className="hidden sm:inline">Classic Theme</span>
        </>
      );
    }
    if (currentTheme === "dark") {
      return (
        <>
          <Moon className={iconClass ?? "h-4 w-4 text-primary"} />
          <span className="hidden sm:inline">Dark Theme</span>
        </>
      );
    }
    return (
      <>
        <Sun className={iconClass ?? "h-4 w-4 text-primary"} />
        <span className="hidden sm:inline">Light Theme</span>
      </>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 bg-card border-border hover:bg-accent", className)}
        >
          {getThemeDisplay()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        <DropdownMenuItem onClick={() => handleThemeChange("dark")} className="gap-2 cursor-pointer">
          <Moon className="h-4 w-4 text-red-500" />
          <span>Dark Theme (Red & Black)</span>
          {currentTheme === "dark" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("light")} className="gap-2 cursor-pointer">
          <Sun className="h-4 w-4 text-sky-500" />
          <span>Light Theme (Blue)</span>
          {currentTheme === "light" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("indigo")} className="gap-2 cursor-pointer">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span>Classic Theme (Indigo)</span>
          {currentTheme === "indigo" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("enterprise")} className="gap-2 cursor-pointer">
          <Building2 className="h-4 w-4 text-sky-600" />
          <span>Enterprise Theme (Pro)</span>
          {currentTheme === "enterprise" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("purple")} className="gap-2 cursor-pointer">
          <Palette className="h-4 w-4 text-[#5B5FEF]" />
          <span>Purple Theme (Ezzy)</span>
          {currentTheme === "purple" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
