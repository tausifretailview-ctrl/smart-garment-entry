import { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface MobilePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Native-style bottom sheet shell for searchable pickers (customer, payment mode, etc.). */
export function MobilePickerSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: MobilePickerSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "max-h-[min(92dvh,720px)] px-0 pb-[max(1rem,env(safe-area-inset-bottom))]",
          className
        )}
      >
        <DrawerHeader className="px-4 pb-2 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="flex flex-col min-h-0 flex-1 px-4 pb-2">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
