import React from "react";

interface ShortcutItem {
  key: string;
  label: string;
  action?: () => void;
}

interface ERPShortcutBarProps {
  shortcuts?: ShortcutItem[];
}

const defaultShortcuts: ShortcutItem[] = [
  { key: "F1", label: "Help" },
  { key: "F2", label: "Edit" },
  { key: "F3", label: "Print" },
  { key: "F5", label: "Refresh" },
  { key: "F8", label: "New" },
  { key: "Del", label: "Delete" },
  { key: "Ctrl+E", label: "Export" },
  { key: "Ctrl+F", label: "Search" },
  { key: "Esc", label: "Close" },
];

export function ERPShortcutBar({ shortcuts = defaultShortcuts }: ERPShortcutBarProps) {
  return (
    <div
      className="flex border-t border-border bg-white flex-shrink-0 overflow-hidden"
      style={{ height: "22px" }}
    >
      {shortcuts.map((sc, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-2 border-r border-border cursor-pointer hover:bg-primary/5 transition-colors"
          style={{ height: "22px" }}
          onClick={sc.action}
        >
          <span
            className="text-[9px] font-bold text-white px-1 rounded-[1px]"
            style={{ background: "hsl(var(--primary))", lineHeight: "14px" }}
          >
            {sc.key}
          </span>
          <span className="text-[10px] text-muted-foreground">{sc.label}</span>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div
        className="flex items-center gap-1.5 px-2 border-l border-border cursor-pointer hover:bg-destructive/5"
        style={{ height: "22px" }}
      >
        <span
          className="text-[9px] font-bold text-white px-1 rounded-[1px]"
          style={{ background: "hsl(var(--destructive))", lineHeight: "14px" }}
        >
          Alt+F4
        </span>
        <span className="text-[10px] text-muted-foreground">Exit</span>
      </div>
    </div>
  );
}
