import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separator?: boolean;
  hidden?: boolean;
}

interface DesktopContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Windows-style desktop context menu
 * Minimal, compact design compatible with light/dark themes
 */
export const DesktopContextMenu: React.FC<DesktopContextMenuProps> = ({
  isOpen,
  position,
  items,
  onClose,
}) => {
  if (!isOpen) return null;

  const visibleItems = items.filter((item) => !item.hidden);

  const handleItemClick = (item: ContextMenuItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (item.disabled) return;
    
    item.onClick();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className={cn(
          "fixed min-w-[180px] max-w-[240px] py-1",
          "bg-popover border border-border shadow-lg",
          "rounded-sm overflow-hidden",
          "animate-in fade-in-0 zoom-in-95 duration-100"
        )}
        style={{
          left: position.x,
          top: position.y,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {visibleItems.map((item, index) => {
          if (item.separator) {
            return (
              <div
                key={`sep-${index}`}
                className="h-px bg-border my-1 mx-2"
              />
            );
          }

          const Icon = item.icon;

          return (
            <button
              key={index}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm",
                "transition-colors duration-75",
                item.disabled
                  ? "text-muted-foreground cursor-not-allowed opacity-50"
                  : item.destructive
                  ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                  : "text-foreground hover:bg-accent focus:bg-accent",
                "outline-none focus:outline-none"
              )}
              onClick={(e) => handleItemClick(item, e)}
              disabled={item.disabled}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 flex-shrink-0",
                    item.disabled
                      ? "text-muted-foreground"
                      : item.destructive
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                />
              )}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Empty area context menu for page-level actions
 */
interface PageContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  title?: string;
}

export const PageContextMenu: React.FC<PageContextMenuProps> = ({
  isOpen,
  position,
  items,
  onClose,
  title,
}) => {
  if (!isOpen) return null;

  const visibleItems = items.filter((item) => !item.hidden);

  const handleItemClick = (item: ContextMenuItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (item.disabled) return;
    
    item.onClick();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className={cn(
          "fixed min-w-[180px] max-w-[240px]",
          "bg-popover border border-border shadow-lg",
          "rounded-sm overflow-hidden",
          "animate-in fade-in-0 zoom-in-95 duration-100"
        )}
        style={{
          left: position.x,
          top: position.y,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border bg-muted/30">
            {title}
          </div>
        )}
        <div className="py-1">
          {visibleItems.map((item, index) => {
            if (item.separator) {
              return (
                <div
                  key={`sep-${index}`}
                  className="h-px bg-border my-1 mx-2"
                />
              );
            }

            const Icon = item.icon;

            return (
              <button
                key={index}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm",
                  "transition-colors duration-75",
                  item.disabled
                    ? "text-muted-foreground cursor-not-allowed opacity-50"
                    : "text-foreground hover:bg-accent focus:bg-accent",
                  "outline-none focus:outline-none"
                )}
                onClick={(e) => handleItemClick(item, e)}
                disabled={item.disabled}
              >
                {Icon && (
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
