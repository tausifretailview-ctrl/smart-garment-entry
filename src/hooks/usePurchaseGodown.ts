import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIndustrialMode } from "./useIndustrialMode";
import { fetchGodowns, godownErrorText, isMissingGodownSql, type Godown } from "@/utils/godowns";
import {
  fetchPurchaseBillGodown,
  purchaseGodownChoices,
  purchaseGodownMessage,
  purchaseGodownNeedsSync,
  showPurchaseGodownPicker,
  syncPurchaseBillGodown,
} from "@/utils/purchaseGodown";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive"; duration?: number }) => unknown;

/**
 * "Receive into" godown for Purchase Entry (Industrial mode, Phase 3 step 3c).
 * Does nothing, and reads nothing, unless Industrial mode is on.
 */
export function usePurchaseGodown(opts: {
  organizationId: string | null | undefined;
  /** The bill open for editing, or null for a new bill. */
  editBillId: string | null;
  toast: Toast;
}) {
  const { organizationId, editBillId, toast } = opts;
  const industrialOn = useIndustrialMode().enabled;
  const orgId = organizationId || "";
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["godowns", orgId],
    queryFn: () => fetchGodowns(orgId),
    enabled: industrialOn && !!orgId,
    staleTime: 5 * 60_000,
  });
  const godowns: Godown[] = useMemo(() => list.data?.godowns ?? [], [list.data]);
  const mainId = godowns.find((g) => g.godown_type === "main")?.id ?? null;

  const billGodown = useQuery({
    queryKey: ["purchase-bill-godown", orgId, editBillId || ""],
    queryFn: () => fetchPurchaseBillGodown(editBillId as string),
    enabled: industrialOn && !!orgId && !!editBillId && !!mainId,
    staleTime: 0,
  });
  const savedId = editBillId ? (billGodown.data ?? mainId) : mainId;
  const billLoaded = !editBillId || billGodown.isSuccess;

  /** New bills keep the last pick (a warehouse often books many bills into one godown). */
  const [newTarget, setNewTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ billId: string; godownId: string | null } | null>(null);
  useEffect(() => {
    if (editBillId && billGodown.isSuccess) {
      setEditTarget({ billId: editBillId, godownId: billGodown.data ?? null });
    }
  }, [editBillId, billGodown.isSuccess, billGodown.data]);

  const value = editBillId
    ? (editTarget?.billId === editBillId ? editTarget.godownId : billGodown.data ?? null) || mainId
    : (newTarget && godowns.some((g) => g.id === newTarget && g.is_active) ? newTarget : mainId);

  const setValue = useCallback(
    (id: string) => {
      if (editBillId) setEditTarget({ billId: editBillId, godownId: id });
      else setNewTarget(id);
    },
    [editBillId],
  );

  const visible = industrialOn && !list.data?.missingSql && showPurchaseGodownPicker(godowns, savedId);
  const choices = useMemo(() => purchaseGodownChoices(godowns, savedId), [godowns, savedId]);

  const stateRef = useRef({ visible, value, savedId, mainId, billLoaded, editBillId });
  stateRef.current = { visible, value, savedId, mainId, billLoaded, editBillId };

  /**
   * Call after the bill and its lines are saved. Never throws: the bill is already saved, so a
   * problem here only leaves the goods in Main, and the user is told how to move them.
   */
  const syncAfterSave = useCallback(
    async (billId: string, isEdit: boolean) => {
      const s = stateRef.current;
      if (!s.visible || !s.mainId || !billId) return;
      if (isEdit && (!s.billLoaded || s.editBillId !== billId)) return;
      const savedId = isEdit ? s.savedId : s.mainId;
      if (!purchaseGodownNeedsSync({ mainId: s.mainId, targetId: s.value, savedId })) return;
      try {
        const result = await syncPurchaseBillGodown(billId, s.value || s.mainId);
        const msg = purchaseGodownMessage(result);
        if (msg) {
          toast({
            title: msg.title,
            description: msg.description,
            variant: msg.warn ? "destructive" : "default",
            duration: msg.warn ? 12000 : 4000,
          });
        }
      } catch (e) {
        const text = godownErrorText(e);
        toast({
          title: "Bill saved. Goods stayed in Main",
          description: isMissingGodownSql(text)
            ? "Run the Phase 3 step 3c SQL first, then open this bill and save it again."
            : `${text.replace(/\.$/, "")}. Open the bill and save again, or move them in Godown Transfers.`,
          variant: "destructive",
          duration: 12000,
        });
      } finally {
        for (const key of ["purchase-bill-godown", "godown-summary", "godown-stock"]) {
          void queryClient.invalidateQueries({ queryKey: [key, orgId] });
        }
      }
    },
    [orgId, queryClient, toast],
  );

  return {
    visible,
    choices,
    value,
    setValue,
    mainId,
    loading: !!editBillId && industrialOn && !!mainId && billGodown.isLoading,
    syncAfterSave,
  };
}
