import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { useState, useEffect } from "react";

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [activeError, setActiveError] = useState<{ id: string; title?: string; message: string } | null>(null);

  // Pick the next unhandled destructive (non-inline) toast and route it to the modal
  useEffect(() => {
    if (activeError) return; // wait until current modal is closed
    const next = toasts.find(
      (t: any) => t.variant === "destructive" && !t.inline && t.open !== false,
    );
    if (next) {
      const titleStr = typeof next.title === "string" ? next.title : undefined;
      const descStr = typeof next.description === "string" ? next.description : undefined;
      setActiveError({
        id: next.id,
        title: titleStr,
        message: descStr || titleStr || "An error occurred",
      });
    }
  }, [toasts, activeError]);

  const handleErrorClose = (open: boolean) => {
    if (!open && activeError) {
      dismiss(activeError.id);
      setActiveError(null);
    }
  };

  // Bottom-right toasts: everything that's NOT a (non-inline) destructive
  const nonDestructive = toasts.filter(
    (t: any) => t.variant !== "destructive" || t.inline,
  );

  return (
    <>
      <ErrorDialog
        open={!!activeError}
        onOpenChange={handleErrorClose}
        title={activeError?.title}
        message={activeError?.message || ""}
        severity="error"
      />

      <ToastProvider>
        {nonDestructive.map(function ({ id, title, description, action, ...props }) {
          return (
            <Toast key={id} {...props}>
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
              {action}
              <ToastClose />
            </Toast>
          );
        })}
        <ToastViewport />
      </ToastProvider>
    </>
  );
}
