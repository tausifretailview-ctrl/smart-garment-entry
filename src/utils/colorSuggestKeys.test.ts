import { describe, expect, it } from "vitest";
import { colorSuggestEnterOrTab } from "./colorSuggestKeys";

const saved = [{ value: "BLACK" }, { value: "BLACK." }, { value: "BLUE" }];
const base = { value: "", open: true, navigated: false, items: saved, highlightIndex: 0 };

describe("colour box Enter / Tab", () => {
  it("empty box, arrowed to a saved colour: Enter and Tab pick it (no mouse needed)", () => {
    expect(colorSuggestEnterOrTab({ ...base, key: "Enter", navigated: true, highlightIndex: 1 })).toEqual({ kind: "pick", value: "BLACK." });
    expect(colorSuggestEnterOrTab({ ...base, key: "Tab", navigated: true, highlightIndex: 2 })).toEqual({ kind: "pick", value: "BLUE" });
    // ArrowDown that opened the list leaves the first colour highlighted.
    expect(colorSuggestEnterOrTab({ ...base, key: "Enter", navigated: true, highlightIndex: 0 })).toEqual({ kind: "pick", value: "BLACK" });
  });

  it("empty box, list untouched: Enter still moves to the next field, Tab just closes", () => {
    expect(colorSuggestEnterOrTab({ ...base, key: "Enter" })).toEqual({ kind: "enter-empty" });
    expect(colorSuggestEnterOrTab({ ...base, key: "Tab" })).toEqual({ kind: "close" });
    expect(colorSuggestEnterOrTab({ ...base, key: "Enter", open: false, navigated: true })).toEqual({ kind: "enter-empty" });
    expect(colorSuggestEnterOrTab({ ...base, key: "Enter", navigated: true, items: [] })).toEqual({ kind: "enter-empty" });
  });

  it("typed text: unchanged — highlighted suggestion, else the typed colour", () => {
    const typed = { ...base, value: "bl", items: [{ value: "bl", isNew: true }, ...saved] };
    expect(colorSuggestEnterOrTab({ ...typed, key: "Enter", highlightIndex: 2 })).toEqual({ kind: "pick", value: "BLACK." });
    expect(colorSuggestEnterOrTab({ ...typed, key: "Enter", highlightIndex: 0 })).toEqual({ kind: "add-typed" });
    expect(colorSuggestEnterOrTab({ ...base, value: "BLUE", key: "Tab", items: [{ value: "BLUE" }, { value: "NAVY BLUE" }] })).toEqual({ kind: "pick", value: "BLUE" });
    expect(colorSuggestEnterOrTab({ ...base, value: "NAVY", key: "Enter", open: false })).toEqual({ kind: "add-typed" });
  });
});

describe("ProductEntryDialog colour box wiring", () => {
  it("a pick clears the arrow-key flag, so the next Enter / Tab moves on instead of adding again", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../components/ProductEntryDialog.tsx"), "utf8");
    const pickFn = src.slice(src.indexOf("  const pick = (picked: string) => {"), src.indexOf("  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {"));
    expect(pickFn).toMatch(/navigatedRef\.current = false;\s*onAdd\(/);
  });
});
