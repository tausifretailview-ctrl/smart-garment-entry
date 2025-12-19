import { useTheme } from "next-themes";
import { Moon, Sun, Sparkles } from "lucide-react";
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

  // Check for indigo theme class on mount and restore from localStorage
  useEffect(() => {
    const savedCustomTheme = localStorage.getItem('custom-theme');
    if (savedCustomTheme === 'indigo') {
      document.documentElement.classList.add('theme-indigo');
      setCustomTheme('indigo');
    }
  }, []);

  const handleThemeChange = (newTheme: string) => {
    // Remove indigo class first
    document.documentElement.classList.remove('theme-indigo');
    localStorage.removeItem('custom-theme');
    setCustomTheme(null);

    if (newTheme === 'indigo') {
      setTheme('light');
      document.documentElement.classList.add('theme-indigo');
      localStorage.setItem('custom-theme', 'indigo');
      setCustomTheme('indigo');
    } else {
      setTheme(newTheme);
    }
  };

  const currentTheme = customTheme === 'indigo' ? 'indigo' : theme;

  const getThemeDisplay = () => {
    if (currentTheme === 'indigo') {
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
      <DropdownMenuContent align="end" className="w-48">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
