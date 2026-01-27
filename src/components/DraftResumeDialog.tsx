import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, RefreshCcw } from "lucide-react";
import { format } from "date-fns";

interface DraftResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResume: () => void;
  onStartFresh: () => void;
  draftType: string;
  lastSaved?: Date | string;
}

export function DraftResumeDialog({
  open,
  onOpenChange,
  onResume,
  onStartFresh,
  draftType,
  lastSaved,
}: DraftResumeDialogProps) {
  const formattedDate = lastSaved 
    ? format(new Date(lastSaved), "dd MMM yyyy, hh:mm a")
    : null;

  const typeLabels: Record<string, string> = {
    purchase: "Purchase Bill",
    quotation: "Quotation",
    sale_order: "Sale Order",
    sale_invoice: "Sales Invoice",
    purchase_order: "Purchase Order",
    salesman_sale_order: "Sale Order",
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Unsaved {typeLabels[draftType] || "Draft"} Found
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              You have an unsaved {typeLabels[draftType]?.toLowerCase() || "draft"} from a previous session.
            </p>
            {formattedDate && (
              <p className="text-xs text-muted-foreground">
                Last saved: {formattedDate}
              </p>
            )}
            <p>Would you like to resume editing or start fresh?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStartFresh} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Start Fresh
          </AlertDialogCancel>
          <AlertDialogAction onClick={onResume} className="gap-2">
            <FileText className="h-4 w-4" />
            Resume Draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
