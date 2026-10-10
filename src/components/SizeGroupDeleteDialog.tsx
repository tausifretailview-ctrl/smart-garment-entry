import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  countProductsUsingSizeGroup,
  deleteSizeGroup,
  friendlySizeGroupError,
  moveProductsToSizeGroup,
  sizesMissingFromTarget,
  type SizeGroupLite,
} from "@/lib/sizeGroupActions";

interface SizeGroupDeleteDialogProps {
  organizationId: string | undefined;
  /** Group to delete; null keeps the dialog closed. */
  group: SizeGroupLite | null;
  allGroups: SizeGroupLite[];
  onClose: () => void;
  /** Called after the group is gone; movedToId is set when its products were moved. */
  onDeleted: (deletedId: string, movedToId: string | null) => void;
}

/**
 * Delete a size group safely. When products still use it, the database blocks the delete
 * (products_size_group_id_fkey), so we show how many and let the user move them to
 * another group first.
 */
export function SizeGroupDeleteDialog({
  organizationId,
  group,
  allGroups,
  onClose,
  onDeleted,
}: SizeGroupDeleteDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setUsageCount(null);
    setCheckError(null);
    setTargetId("");
    if (!group || !organizationId) return;
    let cancelled = false;
    countProductsUsingSizeGroup(organizationId, group.id)
      .then((n) => {
        if (!cancelled) setUsageCount(n);
      })
      .catch((err) => {
        if (!cancelled) setCheckError(friendlySizeGroupError(err, "Could not check products using this size group"));
      });
    return () => {
      cancelled = true;
    };
  }, [group?.id, organizationId]);

  const otherGroups = allGroups.filter((g) => g.id !== group?.id);
  const target = otherGroups.find((g) => g.id === targetId);
  const missingSizes = group && target ? sizesMissingFromTarget(group.sizes, target.sizes) : [];
  const inUse = (usageCount ?? 0) > 0;

  const handleConfirm = async () => {
    if (!group || !organizationId) return;
    if (inUse && !targetId) return;
    setWorking(true);
    try {
      if (inUse) {
        await moveProductsToSizeGroup(organizationId, group.id, targetId);
      }
      await deleteSizeGroup(group.id);
      toast({
        title: "Size group deleted",
        description: inUse
          ? `${usageCount} product${usageCount === 1 ? "" : "s"} moved to "${target?.group_name}" and "${group.group_name}" deleted`
          : `"${group.group_name}" deleted`,
      });
      // Other screens cache the size group list (Sales, Purchase, Product Dashboard)
      queryClient.invalidateQueries({ queryKey: ["size-groups"] });
      queryClient.invalidateQueries({ queryKey: ["product-size-groups"] });
      onDeleted(group.id, inUse ? targetId : null);
      onClose();
    } catch (err) {
      toast({
        title: "Could not delete size group",
        description: friendlySizeGroupError(err, "Failed to delete size group"),
        variant: "destructive",
      });
      // Products may have moved before the delete failed; refresh the count.
      countProductsUsingSizeGroup(organizationId, group.id).then(setUsageCount).catch(() => {});
    } finally {
      setWorking(false);
    }
  };

  const checking = !!group && usageCount === null && !checkError;

  return (
    <AlertDialog open={!!group} onOpenChange={(open) => !open && !working && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Size Group "{group?.group_name}"</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {checking && (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking products using this size group…
                </span>
              )}
              {checkError && <span className="text-destructive">{checkError}</span>}
              {usageCount === 0 && <span>No products use this size group. It will be deleted permanently.</span>}
              {inUse && (
                <span>
                  {usageCount} product{usageCount === 1 ? "" : "s"} use{usageCount === 1 ? "s" : ""} this size group,
                  so it cannot be deleted directly. Choose a size group to move {usageCount === 1 ? "it" : "them"} to,
                  then this one will be deleted.
                </span>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {inUse && (
          <div className="space-y-2">
            <Label>Move products to</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select size group" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {otherGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.group_name}
                    {g.sizes.length > 0 ? ` (${g.sizes.join(", ")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {otherGroups.length === 0 && (
              <p className="text-xs text-muted-foreground">Create another size group first.</p>
            )}
            {missingSizes.length > 0 && (
              <p className="text-xs text-amber-600">
                "{target?.group_name}" does not have size {missingSizes.join(", ")}. Existing stock and barcodes
                stay as they are; pick a group with the same sizes if you will add these sizes again.
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={working || usageCount === null || (inUse && !targetId)}
          >
            {working ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : inUse ? (
              "Move & Delete"
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
