import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIndustrialMode } from "./useIndustrialMode";
import { fetchGodowns, godownErrorText, isMissingGodownSql, type Godown } from "@/utils/godowns";
import { purchaseGodownChoices, purchaseGodownNeedsSync, showPurchaseGodownPicker } from "@/utils/purchaseGodown";
import {
  checkDocGodownStock,
  docGodownSyncFailMessage,
  fetchDocGodown,
  GODOWN_DOC_PICK_LABEL,
  GODOWN_DOC_SQL_STEP,
  godownDocShortMessage,
  godownDocSyncWarning,
  godownDocTakesStock,
  syncDocGodown,
  type GodownDocType,
} from "@/utils/godownDocs";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive"; duration?: number }) => unknown;

/**
 * The godown a document's goods go out of ("Dispatch from", "Return from") or come into ("Return into")
 * (Industrial mode, Phase 3 step 3d). Does nothing, and reads nothing, unless Industrial mode
 * is on and the shop has a godown besides Main. A delivery challan moves no stock: it only keeps
 * the pick, with no stock check. A sale return brings goods in, so it needs no check either.
 */
export function useDocGodown(opts: {
  refType: GodownDocType;
  organizationId: string | null | undefined;
  /** The document open for editing, or null for a new one. */
  editDocId: string | null;
  toast: Toast;
}) {
  const { refType, organizationId, editDocId, toast } = opts;
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
  const hasOtherGodown = godowns.some((g) => g.godown_type !== "main");

  const docGodown = useQuery({
    queryKey: ["doc-godown", orgId, refType, editDocId || ""],
    queryFn: () => fetchDocGodown(refType, editDocId as string),
    enabled: industrialOn && !!orgId && !!editDocId && !!mainId && hasOtherGodown,
    staleTime: 0,
  });
  const savedId = editDocId ? (docGodown.data ?? mainId) : mainId;
  const docLoaded = !editDocId || docGodown.isSuccess;

  /** New documents keep the last pick (a warehouse often sends many bills from one godown). */
  const [newSource, setNewSource] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<{ docId: string; godownId: string | null } | null>(null);
  useEffect(() => {
    if (editDocId && docGodown.isSuccess) {
      setEditSource({ docId: editDocId, godownId: docGodown.data ?? null });
    }
  }, [editDocId, docGodown.isSuccess, docGodown.data]);

  const value = editDocId
    ? (editSource?.docId === editDocId ? editSource.godownId : docGodown.data ?? null) || mainId
    : (newSource && godowns.some((g) => g.id === newSource && g.is_active) ? newSource : mainId);

  const setValue = useCallback(
    (id: string) => {
      if (editDocId) setEditSource({ docId: editDocId, godownId: id });
      else setNewSource(id);
    },
    [editDocId],
  );

  const visible = industrialOn && !list.data?.missingSql && showPurchaseGodownPicker(godowns, savedId);
  const choices = useMemo(() => purchaseGodownChoices(godowns, savedId), [godowns, savedId]);

  const stateRef = useRef({ visible, value, savedId, mainId, docLoaded, editDocId, choices });
  stateRef.current = { visible, value, savedId, mainId, docLoaded, editDocId, choices };

  /**
   * Call before the save, after the usual stock check. Returns false (and tells the user why)
   * when the place the goods go out of does not have them. Never blocks a bill that goes out of
   * Main because of a problem reading godown stock: the usual stock check already passed.
   */
  const checkBeforeSave = useCallback(
    async (lines: { variant_id: string; qty: number }[]): Promise<boolean> => {
      const s = stateRef.current;
      if (!godownDocTakesStock(refType)) return true;
      if (!s.visible || !s.mainId || lines.length === 0) return true;
      if (s.editDocId && !s.docLoaded) return true;
      const target = s.value || s.mainId;
      try {
        const short = await checkDocGodownStock({
          organizationId: orgId,
          refType,
          docId: s.editDocId,
          godownId: target,
          lines,
        });
        const msg = godownDocShortMessage(
          short,
          s.choices.find((g) => g.id === target)?.name ?? "Main",
          GODOWN_DOC_PICK_LABEL[refType],
        );
        if (!msg) return true;
        toast({ title: msg.title, description: msg.description, variant: "destructive", duration: 12000 });
        return false;
      } catch (e) {
        if (target === s.mainId) return true;
        const text = godownErrorText(e);
        const pick = GODOWN_DOC_PICK_LABEL[refType];
        toast({
          title: "Could not check the godown stock",
          description: isMissingGodownSql(text)
            ? `Run the Phase 3 step ${GODOWN_DOC_SQL_STEP[refType]} SQL first, or pick Main in "${pick}".`
            : `${text.replace(/\.$/, "")}. Try again, or pick Main in "${pick}".`,
          variant: "destructive",
          duration: 12000,
        });
        return false;
      }
    },
    [orgId, refType, toast],
  );

  /**
   * Call after the document and its lines are saved. Never throws: the bill is already saved,
   * so a problem here only leaves the goods going out of Main, and the user is told so.
   */
  const syncAfterSave = useCallback(
    async (docId: string, isEdit: boolean) => {
      const s = stateRef.current;
      if (!s.visible || !s.mainId || !docId) return;
      if (isEdit && (!s.docLoaded || s.editDocId !== docId)) return;
      const savedId = isEdit ? s.savedId : s.mainId;
      if (!purchaseGodownNeedsSync({ mainId: s.mainId, targetId: s.value, savedId })) return;
      try {
        const result = await syncDocGodown(refType, docId, s.value || s.mainId);
        const warn = godownDocSyncWarning(result, refType);
        if (warn) toast({ title: warn.title, description: warn.description, variant: "destructive", duration: 12000 });
      } catch (e) {
        const text = godownErrorText(e);
        const msg = docGodownSyncFailMessage(refType, text);
        toast({ title: msg.title, description: msg.description, variant: "destructive", duration: 12000 });
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["doc-godown", orgId] });
        void queryClient.invalidateQueries({ queryKey: ["godown-summary", orgId] });
        void queryClient.invalidateQueries({ queryKey: ["godown-stock", orgId] });
        if (refType === "challan") void queryClient.invalidateQueries({ queryKey: ["challan-godown-places", orgId] });
        if (refType === "sale_return") void queryClient.invalidateQueries({ queryKey: ["sale-return-godown-places", orgId] });
        if (refType === "purchase_return") {
          void queryClient.invalidateQueries({ queryKey: ["purchase-return-godown-places", orgId] });
        }
      }
    },
    [orgId, queryClient, refType, toast],
  );

  return {
    visible,
    choices,
    value,
    setValue,
    mainId,
    loading: !!editDocId && visible && docGodown.isLoading,
    checkBeforeSave,
    syncAfterSave,
  };
}
