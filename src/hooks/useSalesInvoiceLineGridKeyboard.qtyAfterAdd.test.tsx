/** @vitest-environment jsdom */
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSalesInvoiceLineGridKeyboard } from "./useSalesInvoiceLineGridKeyboard";
import { isSaleFocusQtyAfterAddEnabled } from "@/utils/posGoodsAskQtyDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const showCol = { hsn: false, box: false, color: false, mrp: false, disc_percent: false, disc_amount: false, gst: false };
type Api = ReturnType<typeof useSalesInvoiceLineGridKeyboard>;

function Harness(props: {
  rows: string[];
  editQtyOnAdd: boolean;
  onReturnToSearch: () => void;
  onCommitQty: (id: string) => void;
  onRevertQty: (id: string, q: number) => void;
  apiRef: { current: Api | null };
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const grid = useSalesInvoiceLineGridKeyboard({
    showCol,
    displayRowCount: props.rows.length,
    getItemIdForRow: (r) => props.rows[r],
    scrollContainerRef: scrollRef,
    onRemoveRow: () => {},
    onCommitQty: props.onCommitQty,
    onRevertQty: props.onRevertQty,
    onRevertNumeric: () => {},
    getCellEditValue: () => 1,
    editQtyOnAdd: props.editQtyOnAdd,
    onReturnToSearch: props.onReturnToSearch,
  });
  props.apiRef.current = grid;
  return (
    <div ref={scrollRef} onKeyDown={grid.handleGridKeyDown} data-testid="grid">
      {props.rows.map((id, r) => (
        <div key={id} {...grid.getCellProps(r, "qty")}>
          {grid.isCellEditing(r, "qty") ? <input ref={grid.editInputRef} type="number" defaultValue={1} /> : "1"}
        </div>
      ))}
    </div>
  );
}

describe("Sales Invoice: cursor to Qty after adding a product", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const setup = (editQtyOnAdd: boolean) => {
    const onReturnToSearch = vi.fn();
    const onCommitQty = vi.fn();
    const onRevertQty = vi.fn();
    const apiRef: { current: Api | null } = { current: null };
    const render = (rows: string[]) =>
      act(() => {
        root.render(
          <Harness rows={rows} editQtyOnAdd={editQtyOnAdd} onReturnToSearch={onReturnToSearch} onCommitQty={onCommitQty} onRevertQty={onRevertQty} apiRef={apiRef} />,
        );
      });
    render([]);
    act(() => apiRef.current!.scheduleFocusOnItem("item-1"));
    render(["item-1"]);
    const key = (k: string) =>
      act(() => {
        const target = host.querySelector("input") ?? host.querySelector("[data-grid-col]")!;
        target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      });
    return { onReturnToSearch, onCommitQty, onRevertQty, apiRef, key };
  };

  it("opens the added line's Qty for typing; Enter saves it and returns to the search bar", () => {
    const t = setup(true);
    expect(t.apiRef.current!.isCellEditing(0, "qty")).toBe(true);
    expect(document.activeElement?.tagName).toBe("INPUT");
    t.key("Enter");
    expect(t.onCommitQty).toHaveBeenCalledWith("item-1");
    expect(t.onReturnToSearch).toHaveBeenCalledTimes(1);
    expect(t.apiRef.current!.isEditing).toBe(false);
  });

  it("Esc puts the old Qty back and also returns to the search bar", () => {
    const t = setup(true);
    t.key("Escape");
    expect(t.onRevertQty).toHaveBeenCalledWith("item-1", 1);
    expect(t.onReturnToSearch).toHaveBeenCalledTimes(1);
  });

  it("setting off: Qty is only highlighted (as before) and nothing jumps to search", () => {
    const t = setup(false);
    expect(t.apiRef.current!.isCellEditing(0, "qty")).toBe(false);
    expect(t.apiRef.current!.isCellFocused(0, "qty")).toBe(true);
    expect(t.onReturnToSearch).not.toHaveBeenCalled();
  });

  it("is a Settings → Sale option, off by default, and the Qty window wins when both are on", () => {
    expect(isSaleFocusQtyAfterAddEnabled({})).toBe(false);
    expect(isSaleFocusQtyAfterAddEnabled({ sale_focus_qty_after_add: true })).toBe(true);
    const page = readFileSync(join(process.cwd(), "src/pages/SalesInvoice.tsx"), "utf8");
    expect(page).toMatch(/isSaleFocusQtyAfterAddEnabled\(\(settingsData as any\)\?\.sale_settings\) &&\s*!isSaleGoodsAskQtyDialogEnabled/);
    expect(readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8")).toContain('id="sale_focus_qty_after_add"');
  });
});
