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

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [customTheme, setCustomTheme] = useState<string | null>(null);

  // Check for custom theme class on mount and restore from localStorage
  // Default to purple theme if no theme is saved
  useEffect(() => {
    const savedCustomTheme = localStorage.getItem("custom-theme");
    const stripCustom = () => {
      document.documentElement.classList.remove("theme-indigo", "theme-purple", "theme-enterprise");
    };
    if (savedCustomTheme === "indigo") {
      stripCustom();
      document.documentElement.classList.add("theme-indigo");
      setCustomTheme("indigo");
    } else if (savedCustomTheme === "enterprise") {
      stripCustom();
      document.documentElement.classList.add("theme-enterprise");
      setCustomTheme("enterprise");
    } else if (savedCustomTheme === "purple" || !savedCustomTheme) {
      stripCustom();
      document.documentElement.classList.add("theme-purple");
      setCustomTheme("purple");
      if (!savedCustomTheme) {
        localStorage.setItem("custom-theme", "purple");
        setTheme("light");
      }
    }
  }, [setTheme]);

  const handleThemeChange = (newTheme: string) => {
    document.documentElement.classList.remove("theme-indigo", "theme-purple", "theme-enterprise");
    localStorage.removeItem("custom-theme");
    setCustomTheme(null);

    if (newTheme === "indigo") {
      setTheme("light");
      document.documentElement.classList.add("theme-indigo");
      localStorage.setItem("custom-theme", "indigo");
      setCustomTheme("indigo");
    } else if (newTheme === "enterprise") {
      setTheme("light");
      document.documentElement.classList.add("theme-enterprise");
      localStorage.setItem("custom-theme", "enterprise");
      setCustomTheme("enterprise");
    } else if (newTheme === "purple") {
      setTheme("light");
      document.documentElement.classList.add("theme-purple");
      localStorage.setItem("custom-theme", "purple");
      setCustomTheme("purple");
    } else {
      setTheme(newTheme);
    }
  };

  const currentTheme = customTheme || theme;

  const getThemeDisplay = () => {
    if (currentTheme === "enterprise") {
      return (
        <>
          <Building2 className="h-4 w-4 text-sky-600" />
          <span className="hidden sm:inline">Enterprise Theme</span>
        </>
      );
    }
    if (currentTheme === "purple") {
      return (
        <>
          <Palette className="h-4 w-4 text-[#5B5FEF]" />
          <span className="hidden sm:inline">Purple Theme</span>
        </>
      );
    }
    if (currentTheme === "indigo") {
      return (
        <>
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="hidden sm:inline">Classic Theme</span>
        </>
      );
    }
    if (currentTheme === 'dark') {
      return (
        <>
          <Moon className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Dark Theme</span>
        </>
      );
    }
    return (
      <>
        <Sun className="h-4 w-4 text-primary" />
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
          className="gap-2 bg-card border-border hover:bg-accent"
        >
          {getThemeDisplay()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        <DropdownMenuItem 
          onClick={() => handleThemeChange("dark")}
          className="gap-2 cursor-pointer"
        >
          <Moon className="h-4 w-4 text-red-500" />
          <span>Dark Theme (Red & Black)</span>
          {currentTheme === "dark" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleThemeChange("light")}
          className="gap-2 cursor-pointer"
        >
          <Sun className="h-4 w-4 text-sky-500" />
          <span>Light Theme (Blue)</span>
          {currentTheme === "light" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleThemeChange("indigo")}
          className="gap-2 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span>Classic Theme (Indigo)</span>
          {currentTheme === "indigo" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleThemeChange("enterprise")}
          className="gap-2 cursor-pointer"
        >
          <Building2 className="h-4 w-4 text-sky-600" />
          <span>Enterprise Theme (Pro)</span>
          {currentTheme === "enterprise" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleThemeChange("purple")}
          className="gap-2 cursor-pointer"
        >
          <Palette className="h-4 w-4 text-[#5B5FEF]" />
          <span>Purple Theme (Ezzy)</span>
          {currentTheme === "purple" && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
