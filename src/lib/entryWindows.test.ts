/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  entryWindowId,
  entryWindowInstance,
  entryWindowLabel,
  entryWindowSearch,
  forgetEntryWindowBill,
  markEntryWindowClosing,
  nextFreeEntryWindow,
  parseEntryWindowId,
  tabIdOf,
  takeEntryWindowClosing,
} from "./entryWindows";

describe("entry windows (several Sale Bills at once)", () => {
  afterEach(() => sessionStorage.clear());

  it("reads the window number from ?w= for multi-window pages only, up to 3", () => {
    expect(entryWindowInstance("sales-invoice", "")).toBe(1);
    expect(entryWindowInstance("sales-invoice", "?w=2")).toBe(2);
    expect(entryWindowInstance("sales-invoice", "w=3&x=1")).toBe(3);
    expect(entryWindowInstance("sales-invoice", "?w=4")).toBe(1);
    expect(entryWindowInstance("sales-invoice", "?w=abc")).toBe(1);
    expect(entryWindowInstance("purchase-entry", "?w=2")).toBe(1);
  });

  it("builds and parses window ids", () => {
    expect(entryWindowId("sales-invoice", "?w=2")).toBe("sales-invoice~2");
    expect(entryWindowId("sales-invoice", "")).toBe("sales-invoice");
    expect(entryWindowId("customers", "?w=2")).toBe("customers");
    expect(parseEntryWindowId("sales-invoice~3")).toEqual({ path: "sales-invoice", instance: 3 });
    expect(parseEntryWindowId("sales-invoice")).toEqual({ path: "sales-invoice", instance: 1 });
    expect(parseEntryWindowId("customers~2")).toEqual({ path: "customers~2", instance: 1 });
    expect(parseEntryWindowId("sales-invoice~9")).toEqual({ path: "sales-invoice~9", instance: 1 });
    expect(tabIdOf({ path: "sales-invoice" })).toBe("sales-invoice");
    expect(tabIdOf({ id: "sales-invoice~2", path: "sales-invoice" })).toBe("sales-invoice~2");
  });

  it("labels and addresses", () => {
    expect(entryWindowLabel("Sales Invoice", 1)).toBe("Sales Invoice");
    expect(entryWindowLabel("Sales Invoice", 2)).toBe("Sales Invoice 2");
    expect(entryWindowSearch(1)).toBe("");
    expect(entryWindowSearch(3)).toBe("?w=3");
  });

  it("finds the first free window, null when all 3 are open", () => {
    expect(nextFreeEntryWindow("sales-invoice", [])).toBe(1);
    expect(nextFreeEntryWindow("sales-invoice", ["sales-invoice", "customers"])).toBe(2);
    expect(nextFreeEntryWindow("sales-invoice", ["sales-invoice~2"])).toBe(1);
    expect(nextFreeEntryWindow("sales-invoice", ["sales-invoice", "sales-invoice~2", "sales-invoice~3"])).toBeNull();
    expect(nextFreeEntryWindow("customers", [])).toBeNull();
  });

  it("closing marks are read once; a closed window's kept bill is forgotten", () => {
    markEntryWindowClosing("sales-invoice~2");
    expect(takeEntryWindowClosing("sales-invoice~2")).toBe(true);
    expect(takeEntryWindowClosing("sales-invoice~2")).toBe(false);

    sessionStorage.setItem("ezzy-draft-resume:org:user:sale_invoice:w2", "{}");
    sessionStorage.setItem("ezzy-draft-resume:org:user:sale_invoice:w3", "{}");
    sessionStorage.setItem("ezzy-draft-resume:org:user:sale_invoice", "{}");
    forgetEntryWindowBill("sales-invoice", 2);
    expect(sessionStorage.getItem("ezzy-draft-resume:org:user:sale_invoice:w2")).toBeNull();
    expect(sessionStorage.getItem("ezzy-draft-resume:org:user:sale_invoice:w3")).toBe("{}");
    expect(sessionStorage.getItem("ezzy-draft-resume:org:user:sale_invoice")).toBe("{}");
    forgetEntryWindowBill("sales-invoice", 1); // window 1 keeps its kept bill / database draft
    expect(sessionStorage.getItem("ezzy-draft-resume:org:user:sale_invoice")).toBe("{}");
  });
});
