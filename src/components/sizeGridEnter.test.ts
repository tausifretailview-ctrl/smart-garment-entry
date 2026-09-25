/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { advanceSizeQtyFocus } from "./sizeGridEnter";

function grid() {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  const bk3 = document.createElement("input");
  bk3.setAttribute("data-size-qty", "1");
  const bk4 = document.createElement("input");
  bk4.setAttribute("data-size-qty", "1");
  const addSize = document.createElement("button");
  addSize.textContent = "Add Size";
  const br3 = document.createElement("input");
  br3.setAttribute("data-size-qty", "1");
  const add = document.createElement("button");
  add.setAttribute("data-size-grid-add", "");
  add.textContent = "Add (Ctrl+A)";
  dialog.append(bk3, bk4, addSize, br3, add);
  document.body.append(dialog);
  return { dialog, bk3, bk4, br3, add, addSize };
}

describe("advanceSizeQtyFocus", () => {
  it("moves Enter from one size box to the next size, skipping Add Size", () => {
    const { dialog, bk4, br3, addSize } = grid();
    bk4.focus();
    expect(advanceSizeQtyFocus(bk4)).toBe(true);
    expect(document.activeElement).toBe(br3);
    expect(document.activeElement).not.toBe(addSize);
    dialog.remove();
  });

  it("lands on Add from the last size box", () => {
    const { dialog, br3, add } = grid();
    br3.focus();
    expect(advanceSizeQtyFocus(br3)).toBe(true);
    expect(document.activeElement).toBe(add);
    dialog.remove();
  });

  it("leaves non-size fields alone so Enter can still confirm elsewhere", () => {
    const { dialog, addSize } = grid();
    expect(advanceSizeQtyFocus(addSize)).toBe(false);
    dialog.remove();
  });
});
