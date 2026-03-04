import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Keyboard } from "lucide-react";

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: "pos" | "dashboard" | "general";
}

const generalShortcuts: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Ctrl", "G"], description: "Open Size-wise Stock Report" },
      { keys: ["Ctrl", "P"], description: "Print current document" },
      { keys: ["Esc"], description: "Close dialog / Clear form" },
    ],
  },
];

const posShortcuts: ShortcutGroup[] = [
  {
    title: "POS Actions",
    shortcuts: [
      { keys: ["F1"], description: "Save & Print (Cash)" },
      { keys: ["F2"], description: "Save & Print (UPI)" },
      { keys: ["F3"], description: "Save & Print (Card)" },
      { keys: ["F4"], description: "Credit (Pay Later)" },
      { keys: ["F5"], description: "Sale Return" },
      { keys: ["F6"], description: "Mix Payment" },
      { keys: ["F7"], description: "Hold Bill" },
      { keys: ["F8"], description: "Cashier Report" },
      { keys: ["F9"], description: "Print Estimate (no save)" },
      { keys: ["Esc"], description: "Clear Cart" },
      { keys: ["Enter"], description: "Add scanned item to cart" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Ctrl", "P"], description: "Print last invoice" },
    ],
  },
];

const dashboardShortcuts: ShortcutGroup[] = [
  {
    title: "Dashboard Actions",
    shortcuts: [
      { keys: ["Ctrl", "P"], description: "Print selected invoice" },
      { keys: ["Ctrl", "F"], description: "Focus search" },
    ],
  },
];

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
  context = "general",
}: KeyboardShortcutsModalProps) {
  const getShortcuts = () => {
    switch (context) {
      case "pos":
        return [...posShortcuts, ...generalShortcuts];
      case "dashboard":
        return [...dashboardShortcuts, ...generalShortcuts];
      default:
        return generalShortcuts;
    }
  };

  const shortcuts = getShortcuts();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick actions to speed up your workflow
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {shortcuts.map((group) => (
            <div key={group.title} className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {group.title}
              </h4>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex} className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="px-2 py-0.5 text-xs font-mono bg-muted"
                          >
                            {key}
                          </Badge>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-muted-foreground text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Press <Badge variant="outline" className="px-1.5 py-0 text-xs font-mono mx-1">?</Badge> 
            or <Badge variant="outline" className="px-1.5 py-0 text-xs font-mono mx-1">Shift</Badge>
            <span className="text-muted-foreground mx-0.5">+</span>
            <Badge variant="outline" className="px-1.5 py-0 text-xs font-mono mx-1">/</Badge> 
            anywhere to open this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage keyboard shortcuts modal
export function useKeyboardShortcuts(context: "pos" | "dashboard" | "general" = "general") {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open modal with ? or Shift+/
      if (
        (e.key === "?" && !e.ctrlKey && !e.altKey) ||
        (e.key === "/" && e.shiftKey)
      ) {
        // Don't trigger if user is typing in an input
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    context,
  };
}
