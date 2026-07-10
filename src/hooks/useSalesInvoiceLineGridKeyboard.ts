import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SaleLineGridColKey =
  | "index"
  | "product"
  | "size"
  | "color"
  | "barcode"
  | "hsn"
  | "qty"
  | "box"
  | "mrp"
  | "price"
  | "disc_percent"
  | "disc_amount"
  | "gst"
  | "total";

export interface SaleLineGridShowCol {
  hsn: boolean;
  box: boolean;
  color: boolean;
  mrp: boolean;
  disc_percent: boolean;
  disc_amount: boolean;
  gst: boolean;
}

export interface GridCellFocus {
  rowIndex: number;
  colKey: SaleLineGridColKey;
}

const EDITABLE_COLS: SaleLineGridColKey[] = [
  "qty",
  "box",
  "mrp",
  "price",
  "disc_percent",
  "disc_amount",
];

const NUMERIC_EDIT_COLS = new Set<SaleLineGridColKey>([
  "qty",
  "mrp",
  "price",
  "disc_percent",
  "disc_amount",
]);

function buildAllColumnKeys(showCol: SaleLineGridShowCol): SaleLineGridColKey[] {
  const cols: SaleLineGridColKey[] = ["index", "product", "size"];
  if (showCol.color) cols.push("color");
  cols.push("barcode");
  if (showCol.hsn) cols.push("hsn");
  cols.push("qty");
  if (showCol.box) cols.push("box");
  if (showCol.mrp) cols.push("mrp");
  cols.push("price");
  if (showCol.disc_percent) cols.push("disc_percent");
  if (showCol.disc_amount) cols.push("disc_amount");
  if (showCol.gst) cols.push("gst");
  cols.push("total");
  return cols;
}

function buildEditableColumnKeys(showCol: SaleLineGridShowCol): SaleLineGridColKey[] {
  return EDITABLE_COLS.filter((col) => {
    if (col === "box") return showCol.box;
    if (col === "mrp") return showCol.mrp;
    if (col === "disc_percent") return showCol.disc_percent;
    if (col === "disc_amount") return showCol.disc_amount;
    return true;
  });
}

function isColumnVisible(col: SaleLineGridColKey, showCol: SaleLineGridShowCol): boolean {
  if (col === "color") return showCol.color;
  if (col === "hsn") return showCol.hsn;
  if (col === "box") return showCol.box;
  if (col === "mrp") return showCol.mrp;
  if (col === "disc_percent") return showCol.disc_percent;
  if (col === "disc_amount") return showCol.disc_amount;
  if (col === "gst") return showCol.gst;
  return true;
}

function isEditableCol(col: SaleLineGridColKey): boolean {
  return EDITABLE_COLS.includes(col);
}

function cellKey(rowIndex: number, colKey: SaleLineGridColKey): string {
  return `${rowIndex}:${colKey}`;
}

export interface UseSalesInvoiceLineGridKeyboardOptions {
  showCol: SaleLineGridShowCol;
  displayRowCount: number;
  getItemIdForRow: (rowIndex: number) => string | undefined;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  onRemoveRow: (itemId: string) => void;
  onCommitQty: (itemId: string) => void;
  onRevertQty: (itemId: string, previousQty: number) => void;
  onRevertNumeric: (
    itemId: string,
    colKey: SaleLineGridColKey,
    previousValue: string | number,
  ) => void;
  onEditSeed?: (itemId: string, colKey: SaleLineGridColKey, seed: string) => void;
  getCellEditValue?: (itemId: string, colKey: SaleLineGridColKey) => string | number;
}

export function useSalesInvoiceLineGridKeyboard({
  showCol,
  displayRowCount,
  getItemIdForRow,
  scrollContainerRef,
  onRemoveRow,
  onCommitQty,
  onRevertQty,
  onRevertNumeric,
  onEditSeed,
  getCellEditValue,
}: UseSalesInvoiceLineGridKeyboardOptions) {
  const allColumns = useMemo(() => buildAllColumnKeys(showCol), [showCol]);
  const editableColumns = useMemo(() => buildEditableColumnKeys(showCol), [showCol]);

  const [focus, setFocus] = useState<GridCellFocus | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSeed, setEditSeed] = useState<string | null>(null);

  const pendingFocusItemIdRef = useRef<string | null>(null);
  const editSnapshotRef = useRef<{ colKey: SaleLineGridColKey; value: string | number } | null>(
    null,
  );
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const clampRow = useCallback(
    (row: number) => Math.max(0, Math.min(row, Math.max(0, displayRowCount - 1))),
    [displayRowCount],
  );

  const scrollCellIntoView = useCallback(
    (rowIndex: number, colKey: SaleLineGridColKey) => {
      const el = cellRefs.current.get(cellKey(rowIndex, colKey));
      if (!el) return;
      const container = scrollContainerRef.current;
      if (!container) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      const cellRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (cellRect.top < containerRect.top + 48) {
        container.scrollTop += cellRect.top - containerRect.top - 48;
      } else if (cellRect.bottom > containerRect.bottom) {
        container.scrollTop += cellRect.bottom - containerRect.bottom;
      }
      if (cellRect.left < containerRect.left) {
        container.scrollLeft += cellRect.left - containerRect.left;
      } else if (cellRect.right > containerRect.right) {
        container.scrollLeft += cellRect.right - containerRect.right;
      }
    },
    [scrollContainerRef],
  );

  const registerCellRef = useCallback(
    (rowIndex: number, colKey: SaleLineGridColKey, el: HTMLElement | null) => {
      const key = cellKey(rowIndex, colKey);
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    },
    [],
  );

  const focusCell = useCallback(
    (rowIndex: number, colKey: SaleLineGridColKey, opts?: { editing?: boolean; seed?: string }) => {
      if (displayRowCount === 0) return;
      const nextRow = clampRow(rowIndex);
      if (!isColumnVisible(colKey, showCol)) return;
      setFocus({ rowIndex: nextRow, colKey });
      setIsEditing(!!opts?.editing);
      setEditSeed(opts?.seed ?? null);
      requestAnimationFrame(() => scrollCellIntoView(nextRow, colKey));
    },
    [clampRow, displayRowCount, scrollCellIntoView, showCol],
  );

  const scheduleFocusOnItem = useCallback((itemId: string, colKey: SaleLineGridColKey = "qty") => {
    pendingFocusItemIdRef.current = itemId;
    // colKey stored via pending — always qty for scan per spec
    void colKey;
  }, []);

  const cancelEdit = useCallback(() => {
    const snap = editSnapshotRef.current;
    const itemId = focus ? getItemIdForRow(focus.rowIndex) : undefined;
    if (snap && itemId) {
      if (snap.colKey === "qty") {
        onRevertQty(itemId, Number(snap.value) || 0);
      } else if (snap.colKey === "box") {
        onRevertNumeric(itemId, snap.colKey, snap.value as string | number);
      } else if (NUMERIC_EDIT_COLS.has(snap.colKey)) {
        onRevertNumeric(itemId, snap.colKey, Number(snap.value) || 0);
      }
    }
    editSnapshotRef.current = null;
    setIsEditing(false);
    setEditSeed(null);
  }, [focus, getItemIdForRow, onRevertNumeric, onRevertQty]);

  const commitEdit = useCallback(() => {
    const itemId = focus ? getItemIdForRow(focus.rowIndex) : undefined;
    if (itemId && focus?.colKey === "qty") {
      onCommitQty(itemId);
    }
    editSnapshotRef.current = null;
    setIsEditing(false);
    setEditSeed(null);
  }, [focus, getItemIdForRow, onCommitQty]);

  const snapshotCurrentEditValue = useCallback(() => {
    if (!focus) return;
    const itemId = getItemIdForRow(focus.rowIndex);
    if (!itemId || !getCellEditValue) return;
    editSnapshotRef.current = {
      colKey: focus.colKey,
      value: getCellEditValue(itemId, focus.colKey),
    };
  }, [focus, getCellEditValue, getItemIdForRow]);

  const enterEditMode = useCallback(
    (seed?: string) => {
      if (!focus) return;
      if (!isEditableCol(focus.colKey)) return;
      if (!editSnapshotRef.current) snapshotCurrentEditValue();
      setIsEditing(true);
      setEditSeed(seed ?? null);
    },
    [focus, snapshotCurrentEditValue],
  );

  const moveFocus = useCallback(
    (rowIndex: number, colKey: SaleLineGridColKey) => {
      if (isEditing) commitEdit();
      focusCell(rowIndex, colKey);
    },
    [commitEdit, focusCell, isEditing],
  );

  const moveVertical = useCallback(
    (delta: number) => {
      if (!focus) return;
      moveFocus(focus.rowIndex + delta, focus.colKey);
    },
    [focus, moveFocus],
  );

  const moveHorizontalEditable = useCallback(
    (delta: number, wrapRow = true) => {
      if (!focus) return;
      const idx = editableColumns.indexOf(focus.colKey);
      if (idx === -1) {
        const first = editableColumns[0];
        if (first) moveFocus(focus.rowIndex, first);
        return;
      }
      const nextIdx = idx + delta;
      if (nextIdx >= 0 && nextIdx < editableColumns.length) {
        moveFocus(focus.rowIndex, editableColumns[nextIdx]);
        return;
      }
      if (!wrapRow) return;
      const nextRow = focus.rowIndex + (delta > 0 ? 1 : -1);
      if (nextRow < 0 || nextRow >= displayRowCount) return;
      const wrapCol = delta > 0 ? editableColumns[0] : editableColumns[editableColumns.length - 1];
      moveFocus(nextRow, wrapCol);
    },
    [displayRowCount, editableColumns, focus, moveFocus],
  );

  const moveTab = useCallback(
    (reverse: boolean) => {
      if (!focus) {
        if (displayRowCount > 0 && editableColumns[0]) {
          focusCell(0, editableColumns[0]);
        }
        return;
      }
      moveHorizontalEditable(reverse ? -1 : 1, true);
    },
    [displayRowCount, editableColumns, focus, focusCell, moveHorizontalEditable],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!focus || displayRowCount === 0) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^F\d{1,2}$/i.test(e.key)) return;

      const itemId = getItemIdForRow(focus.rowIndex);
      if (!itemId) return;

      if (isEditing) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelEdit();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          commitEdit();
          moveVertical(1);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          commitEdit();
          moveTab(e.shiftKey);
          return;
        }
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveVertical(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveVertical(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveHorizontalEditable(-1, true);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveHorizontalEditable(1, true);
          break;
        case "Enter":
          e.preventDefault();
          if (isEditableCol(focus.colKey)) {
            snapshotCurrentEditValue();
            enterEditMode();
          }
          break;
        case "Tab":
          e.preventDefault();
          moveTab(e.shiftKey);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          onRemoveRow(itemId);
          break;
        default:
          if (
            NUMERIC_EDIT_COLS.has(focus.colKey) &&
            isEditableCol(focus.colKey) &&
            /^[0-9.]$/.test(e.key)
          ) {
            e.preventDefault();
            snapshotCurrentEditValue();
            enterEditMode(e.key);
          }
          break;
      }
    },
    [
      focus,
      displayRowCount,
      getItemIdForRow,
      isEditing,
      cancelEdit,
      commitEdit,
      moveVertical,
      moveHorizontalEditable,
      enterEditMode,
      moveTab,
      onRemoveRow,
      snapshotCurrentEditValue,
    ],
  );

  const beginEditWithSnapshot = useCallback(
    (currentValue: string | number) => {
      if (!focus) return;
      editSnapshotRef.current = { colKey: focus.colKey, value: currentValue };
      enterEditMode();
    },
    [enterEditMode, focus],
  );

  useLayoutEffect(() => {
    const pendingId = pendingFocusItemIdRef.current;
    if (!pendingId || displayRowCount === 0) return;
    for (let row = 0; row < displayRowCount; row++) {
      if (getItemIdForRow(row) === pendingId) {
        pendingFocusItemIdRef.current = null;
        focusCell(row, "qty");
        break;
      }
    }
  }, [displayRowCount, focusCell, getItemIdForRow]);

  useLayoutEffect(() => {
    if (!focus || isEditing) return;
    const el = cellRefs.current.get(cellKey(focus.rowIndex, focus.colKey));
    el?.focus({ preventScroll: true });
  }, [focus, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const input = editInputRef.current;
    if (!input) return;
    input.focus();
    if (editSeed !== null) {
      input.value = editSeed;
      const len = editSeed.length;
      input.setSelectionRange(len, len);
    } else {
      input.select();
    }
  }, [isEditing, editSeed, focus?.rowIndex, focus?.colKey]);

  useLayoutEffect(() => {
    if (!isEditing || editSeed === null || !focus) return;
    const itemId = getItemIdForRow(focus.rowIndex);
    if (itemId) onEditSeed?.(itemId, focus.colKey, editSeed);
  }, [isEditing, editSeed, focus, getItemIdForRow, onEditSeed]);

  useEffect(() => {
    if (displayRowCount === 0) {
      setFocus(null);
      setIsEditing(false);
      return;
    }
    if (focus && focus.rowIndex >= displayRowCount) {
      setFocus({ rowIndex: displayRowCount - 1, colKey: focus.colKey });
    }
  }, [displayRowCount, focus]);

  const isCellFocused = useCallback(
    (rowIndex: number, colKey: SaleLineGridColKey) =>
      focus?.rowIndex === rowIndex && focus?.colKey === colKey,
    [focus],
  );

  const isCellEditing = useCallback(
    (rowIndex: number, colKey: SaleLineGridColKey) =>
      isEditing && isCellFocused(rowIndex, colKey),
    [isCellFocused, isEditing],
  );

  const getCellProps = useCallback(
    (
      rowIndex: number,
      colKey: SaleLineGridColKey,
      opts?: { itemId?: string; baseClassName?: string; onActivateEdit?: () => void },
    ) => {
      const focused = isCellFocused(rowIndex, colKey);
      const editing = isCellEditing(rowIndex, colKey);
      return {
        ref: (el: HTMLTableCellElement | null) => registerCellRef(rowIndex, colKey, el),
        role: "gridcell" as const,
        tabIndex: focused && !editing ? 0 : -1,
        "data-grid-row": rowIndex,
        "data-grid-col": colKey,
        className: cn(
          opts?.baseClassName,
          focused && !editing && "shadow-[inset_0_0_0_2px_hsl(var(--primary))] bg-primary/10 rounded-sm",
          editing && "shadow-[inset_0_0_0_2px_hsl(var(--primary))] bg-white p-0 rounded-sm",
        ),
        onFocus: () => {
          if (!focused) focusCell(rowIndex, colKey);
        },
        onClick: () => {
          if (focused && isEditableCol(colKey) && !editing) {
            opts?.onActivateEdit?.();
          } else if (!focused) {
            focusCell(rowIndex, colKey);
          }
        },
      };
    },
    [focusCell, isCellEditing, isCellFocused, registerCellRef],
  );

  const getRowClassName = useCallback(
    (rowIndex: number, base: string) =>
      cn(base, focus?.rowIndex === rowIndex && "bg-primary/5"),
    [focus?.rowIndex],
  );

  return {
    focus,
    isEditing,
    editInputRef,
    editSeed,
    handleGridKeyDown,
    getCellProps,
    getRowClassName,
    isCellFocused,
    isCellEditing,
    scheduleFocusOnItem,
    beginEditWithSnapshot,
    allColumns,
    editableColumns,
  };
}
