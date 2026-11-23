import { describe, expect, it } from "vitest";
import { capMatches, cappedListNote, LONG_LIST_SHOWN, matchesAllWords, searchWords } from "./longOptionList";

const names = Array.from({ length: 5000 }, (_, i) => `Customer ${i} 98${String(i).padStart(8, "0")}`);
const hay = names.map((n) => n.toLowerCase());

describe("long pick lists draw a capped number of rows", () => {
  it("no search: the first rows only, with the real total", () => {
    const { shown, total } = capMatches(names, hay, "");
    expect(shown).toHaveLength(LONG_LIST_SHOWN);
    expect(shown[0]).toBe(names[0]);
    expect(total).toBe(5000);
  });

  it("the search looks through every entry, not only the rows on screen", () => {
    const { shown, total } = capMatches(names, hay, "customer 4999");
    expect(shown).toEqual([names[4999]]);
    expect(total).toBe(1);
  });

  it("every typed word must be found (name and phone in any order)", () => {
    expect(capMatches(names, hay, "9800004321 customer").shown).toEqual([names[4321]]);
    expect(capMatches(names, hay, "customer zzz").total).toBe(0);
    expect(matchesAllWords("ravi kumar 98765", searchWords("  KUMAR   987 "))).toBe(true);
  });

  it("a wide search is still capped and reports how many match", () => {
    const { shown, total } = capMatches(names, hay, "customer 1");
    expect(shown).toHaveLength(LONG_LIST_SHOWN);
    expect(total).toBeGreaterThan(LONG_LIST_SHOWN);
  });

  it("the chosen entry is shown first when it would be beyond the limit", () => {
    const { shown, total } = capMatches(names, hay, "", 100, 4000);
    expect(shown[0]).toBe(names[4000]);
    expect(shown).toHaveLength(100);
    expect(new Set(shown).size).toBe(100);
    expect(total).toBe(5000);
    // Already near the top: still listed once.
    const near = capMatches(names, hay, "", 100, 3);
    expect(near.shown.filter((n) => n === names[3])).toHaveLength(1);
    expect(near.shown).toHaveLength(100);
  });

  it("while searching, nothing is pinned", () => {
    expect(capMatches(names, hay, "customer 12", 100, 4000).shown).not.toContain(names[4000]);
  });

  it("short lists are untouched", () => {
    const few = ["A", "B", "C"];
    expect(capMatches(few, few.map((x) => x.toLowerCase()), "")).toEqual({ shown: few, total: 3 });
  });

  it("the note appears only when rows are left out", () => {
    expect(cappedListNote(100, 4321)).toBe("Showing 100 of 4,321. Type to narrow.");
    expect(cappedListNote(3, 3)).toBeNull();
    expect(cappedListNote(0, 0)).toBeNull();
  });
});
