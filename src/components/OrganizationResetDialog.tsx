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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationReset, type OrganizationResetMode } from "@/hooks/useOrganizationReset";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

const OrganizationResetDialog = () => {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { hasSpecialPermission } = useUserPermissions();
  const hasResetPermission = hasSpecialPermission("reset_data");
  const {
    dataCounts,
    isLoadingCounts,
    resetOrganization,
    isResetting,
    progress,
  } = useOrganizationReset();

  const [open, setOpen] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [mode, setMode] = useState<OrganizationResetMode>("all");
  const [zeroOpeningBalances, setZeroOpeningBalances] = useState(false);
  const keepMasters = mode === "keep_masters";

  const organizationName = currentOrganization?.name || "";
  const isConfirmationValid = confirmationText.trim().toLowerCase() === organizationName.toLowerCase();
  const canReset = backupConfirmed && isConfirmationValid && !isResetting;

  const handleReset = async () => {
    const success = await resetOrganization(confirmationText.trim(), { mode, zeroOpeningBalances });
    if (success) {
      setOpen(false);
      setBackupConfirmed(false);
      setConfirmationText("");
      setMode("all");
      setZeroOpeningBalances(false);
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
        setMode("all");
        setZeroOpeningBalances(false);
      }
    }
  };

  const getTotalRecords = () => {
    if (!dataCounts) return 0;
    const total = Object.values(dataCounts).reduce((sum, count) => sum + count, 0);
    return keepMasters ? total - dataCounts.customers - dataCounts.suppliers : total;
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-2" disabled={!hasResetPermission} title={!hasResetPermission ? "You don't have permission to reset data. Ask admin to enable 'Reset Organization Data' in User Rights." : undefined}>
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

              <div className="space-y-2">
                <p className="font-medium">What do you want to delete?</p>
                <RadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as OrganizationResetMode)}
                  disabled={isResetting}
                  className="gap-2"
                >
                  <Label
                    htmlFor="reset-mode-all"
                    className="flex items-start gap-2 rounded-md border p-2 cursor-pointer font-normal"
                  >
                    <RadioGroupItem value="all" id="reset-mode-all" className="mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">Delete everything</span>
                      <span className="block text-xs text-muted-foreground">
                        All bills, stock, products, customers and suppliers.
                      </span>
                    </span>
                  </Label>
                  <Label
                    htmlFor="reset-mode-keep"
                    className="flex items-start gap-2 rounded-md border p-2 cursor-pointer font-normal"
                  >
                    <RadioGroupItem value="keep_masters" id="reset-mode-keep" className="mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">Keep Customer &amp; Supplier master</span>
                      <span className="block text-xs text-muted-foreground">
                        Customers and suppliers stay (name, mobile, GST, address, discounts). Everything else is deleted.
                      </span>
                    </span>
                  </Label>
                </RadioGroup>
                {keepMasters && (
                  <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground space-y-1">
                    <p>
                      Balances: all bills and payments are deleted, so each customer and supplier balance goes back
                      to their <strong>opening balance</strong>. Loyalty points go back to 0.
                    </p>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="zero-opening"
                        checked={zeroOpeningBalances}
                        onCheckedChange={(checked) => setZeroOpeningBalances(checked === true)}
                        disabled={isResetting}
                      />
                      <Label htmlFor="zero-opening" className="text-xs cursor-pointer font-normal">
                        Also set opening balances to 0 (every balance starts at 0)
                      </Label>
                    </div>
                  </div>
                )}
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
                    {!keepMasters && <li>{dataCounts?.customers || 0} Customers</li>}
                    {!keepMasters && <li>{dataCounts?.suppliers || 0} Suppliers</li>}
                    <li>{dataCounts?.sales || 0} Sales Invoices & {dataCounts?.sale_returns || 0} Sale Returns</li>
                    <li>{dataCounts?.purchase_bills || 0} Purchase Bills & {dataCounts?.purchase_returns || 0} Purchase Returns</li>
                    <li>{dataCounts?.quotations || 0} Quotations</li>
                    <li>{dataCounts?.sale_orders || 0} Sale Orders</li>
                    <li>{dataCounts?.employees || 0} Employees</li>
                    <li>{dataCounts?.stock_movements || 0} Stock Movements</li>
                    <li>All payments, receipts, credit notes, advances and accounting entries</li>
                    <li>All recycle bin contents</li>
                  </ul>
                  {keepMasters && (
                    <p className="text-sm text-foreground">
                      Kept: {dataCounts?.customers || 0} Customers & {dataCounts?.suppliers || 0} Suppliers
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground pt-2">
                    <strong>Total records:</strong> {getTotalRecords().toLocaleString()}
                  </p>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <p>• Barcodes start again from this shop&apos;s first barcode</p>
                <p>• Bill numbers will start from 1</p>
                <p>• Settings, users and other shops are not touched</p>
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
            ) : keepMasters ? (
              "Reset (keep masters)"
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
