import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { StockIssuePresentation } from "@/utils/stockErrorMessages";

type StockIssueAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: StockIssuePresentation | null;
  onConfirm?: () => void;
  confirmLabel?: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
};

export function StockIssueAlertDialog({
  open,
  onOpenChange,
  issue,
  onConfirm,
  confirmLabel = "OK",
  secondaryAction,
}: StockIssueAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{issue?.title || "Stock Problem"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {issue?.message && <p className="font-medium text-foreground">{issue.message}</p>}
              {issue?.details?.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {secondaryAction && (
            <Button
              variant="outline"
              onClick={() => {
                secondaryAction.onClick();
                onOpenChange(false);
              }}
            >
              {secondaryAction.label}
            </Button>
          )}
          <AlertDialogAction
            onClick={() => {
              onConfirm?.();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
