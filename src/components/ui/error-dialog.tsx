import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { XCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
  severity?: ErrorSeverity;
  okLabel?: string;
}

const iconMap = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

const titleBarMap = {
  error: "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
  info: "bg-blue-600 text-white",
};

export function ErrorDialog({
  open,
  onOpenChange,
  title,
  message,
  severity = "error",
  okLabel = "OK",
}: ErrorDialogProps) {
  const Icon = iconMap[severity];
  const iconColor = colorMap[severity];
  const titleBar = titleBarMap[severity];

  const okButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => okButtonRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const defaultTitle =
    severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Information";

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <AlertDialogPrimitive.Content
          onKeyDown={handleKeyDown}
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2",
            "w-[92vw] max-w-md bg-background border border-border rounded-md shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "overflow-hidden",
          )}
        >
          {/* Windows-style title bar */}
          <div className={cn("px-4 py-2 text-sm font-semibold", titleBar)}>
            <AlertDialogPrimitive.Title className="m-0">
              {title || defaultTitle}
            </AlertDialogPrimitive.Title>
          </div>

          {/* Body with icon + message */}
          <div className="flex items-start gap-4 px-6 py-6">
            <Icon className={cn("h-10 w-10 flex-shrink-0", iconColor)} />
            <AlertDialogPrimitive.Description className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
              {message}
            </AlertDialogPrimitive.Description>
          </div>

          {/* Footer with OK button */}
          <div className="flex justify-end gap-2 px-4 py-3 bg-muted/40 border-t border-border">
            <Button
              ref={okButtonRef}
              onClick={() => onOpenChange(false)}
              className="min-w-[88px]"
              variant={severity === "error" ? "destructive" : "default"}
            >
              {okLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}