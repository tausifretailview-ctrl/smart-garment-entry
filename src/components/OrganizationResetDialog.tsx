import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationReset } from "@/hooks/useOrganizationReset";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

const OrganizationResetDialog = () => {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const {
    dataCounts,
    isLoadingCounts,
    resetOrganization,
    isResetting,
    progress,
    barcodeStartValue,
  } = useOrganizationReset();

  const [open, setOpen] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");

  const organizationName = currentOrganization?.name || "";
  const isConfirmationValid = confirmationText.trim().toLowerCase() === organizationName.toLowerCase();
  const canReset = backupConfirmed && isConfirmationValid && !isResetting;

  const handleReset = async () => {
    const success = await resetOrganization();
    if (success) {
      setOpen(false);
      setBackupConfirmed(false);
      setConfirmationText("");
      // Redirect to dashboard after reset
      navigate("/");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isResetting) {
      setOpen(newOpen);
      if (!newOpen) {
        setBackupConfirmed(false);
        setConfirmationText("");
      }
    }
  };

  const getTotalRecords = () => {
    if (!dataCounts) return 0;
    return Object.values(dataCounts).reduce((sum, count) => sum + count, 0);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Reset All Data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reset Organization Data
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-left">
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="font-semibold text-destructive">
                  ⚠️ This action is irreversible!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  All data will be permanently deleted and cannot be recovered.
                </p>
              </div>

              {isLoadingCounts ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">This will permanently delete:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>{dataCounts?.products || 0} Products & {dataCounts?.product_variants || 0} Variants</li>
                    <li>{dataCounts?.customers || 0} Customers</li>
                    <li>{dataCounts?.suppliers || 0} Suppliers</li>
                    <li>{dataCounts?.sales || 0} Sales Invoices</li>
                    <li>{dataCounts?.purchase_bills || 0} Purchase Bills</li>
                    <li>{dataCounts?.quotations || 0} Quotations</li>
                    <li>{dataCounts?.sale_orders || 0} Sale Orders</li>
                    <li>{dataCounts?.employees || 0} Employees</li>
                    <li>{dataCounts?.stock_movements || 0} Stock Movements</li>
                    <li>All recycle bin contents</li>
                  </ul>
                  <p className="text-sm text-muted-foreground pt-2">
                    <strong>Total records:</strong> {getTotalRecords().toLocaleString()}
                  </p>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <p>• Barcode sequence will reset to <strong>{barcodeStartValue.toLocaleString()}</strong></p>
                <p>• Bill numbers will start from 1</p>
              </div>

              {isResetting && progress ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{progress.currentStep}</p>
                  <Progress 
                    value={(progress.stepsCompleted / progress.totalSteps) * 100} 
                    className="h-2"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2 pt-2">
                    <Checkbox
                      id="backup-confirm"
                      checked={backupConfirmed}
                      onCheckedChange={(checked) => setBackupConfirmed(checked === true)}
                    />
                    <Label htmlFor="backup-confirm" className="text-sm cursor-pointer">
                      I have downloaded a backup of my data
                    </Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-name" className="text-sm">
                      Type "<strong>{organizationName}</strong>" to confirm:
                    </Label>
                    <Input
                      id="confirm-name"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      placeholder="Organization name"
                      className={confirmationText && !isConfirmationValid ? "border-destructive" : ""}
                    />
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleReset();
            }}
            disabled={!canReset}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isResetting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset All Data"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default OrganizationResetDialog;
