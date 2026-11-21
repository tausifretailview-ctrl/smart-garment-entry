import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { FIELD_SALES_SAFE_BOTTOM } from "@/hooks/useFieldSalesShell";

/**
 * Bottom sheet for the Field Sales app (customer picker and similar): slides over the lower part
 * of the screen, title + close on top, its own scroll area, and stays inside the phone width.
 */
export function FieldSheet({
  open,
  onOpenChange,
  title,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid={testId}
          className="fixed inset-x-0 bottom-0 z-[100] flex h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white text-slate-900 shadow-2xl outline-none sm:inset-x-auto sm:left-1/2 sm:w-[440px] sm:-translate-x-1/2"
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" aria-hidden />
          <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-1">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-base font-bold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col" style={{ paddingBottom: FIELD_SALES_SAFE_BOTTOM }}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
