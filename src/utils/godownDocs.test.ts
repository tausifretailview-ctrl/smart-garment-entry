import { describe, expect, it } from "vitest";
import {
  godownDocCheckLines,
  godownDocShortMessage,
  godownDocSyncWarning,
  parseGodownDocResult,
  parseGodownDocShort,
} from "./godownDocs";

describe("sale goods out of a godown (Phase 3 step 3d)", () => {
  it("sums the bill lines per item for the stock check", () => {
    expect(
      godownDocCheckLines([
        { variantId: "a", quantity: 2 },
        { variantId: "b", quantity: 1.5 },
        { variantId: "a", quantity: 3 },
        { variantId: "", quantity: 4 },
        { variantId: "c", quantity: 0 },
        { variantId: null, quantity: 1 },
      ]),
    ).toEqual([
      { variant_id: "a", qty: 5 },
      { variant_id: "b", qty: 1.5 },
    ]);
  });

  it("stops the save with what the picked place is short of", () => {
    const short = parseGodownDocShort([
      { variant_id: "a", item: "MS Pipe / 6M", need: "15", have: "10", elsewhere: "60" },
      { variant_id: "b", item: "Bolt", need: 4, have: 0, elsewhere: 0 },
    ]);
    expect(short[0]).toEqual({ variant_id: "a", item: "MS Pipe / 6M", need: 15, have: 10, elsewhere: 60 });
    expect(godownDocShortMessage(short, "Bhiwandi")).toEqual({
      title: "Not enough stock in Bhiwandi",
      description:
        'MS Pipe / 6M: need 15, Bhiwandi has 10 (60 in other godowns); Bolt: need 4, Bhiwandi has 0. Pick another godown in "Dispatch from" or move the goods first.',
    });
    expect(godownDocShortMessage([], "Main")).toBeNull();
    expect(parseGodownDocShort(null)).toEqual([]);
    const many = Array.from({ length: 5 }, (_, i) => ({ variant_id: String(i), item: `Item ${i}`, need: 2, have: 1, elsewhere: 0 }));
    expect(godownDocShortMessage(many, "Main")?.description).toContain("; and 2 more.");
  });

  it("stays quiet when the goods moved, and warns when some could not", () => {
    const ok = parseGodownDocResult({ godown_id: "bhw", godown_name: "Bhiwandi", is_main: false, moved: "10", moved_back: 0, short: [] });
    expect(ok.moved).toBe(10);
    expect(godownDocSyncWarning(ok)).toBeNull();

    const r = parseGodownDocResult({
      godown_id: "bhw",
      godown_name: "Bhiwandi",
      is_main: false,
      moved: 8,
      moved_back: 0,
      short: [
        { item: "MS Pipe / 6M", godown: "Bhiwandi", qty: 2, way: "forward" },
        { item: "Bolt", godown: "Thane", qty: 1.5, way: "back" },
      ],
    });
    expect(godownDocSyncWarning(r)).toEqual({
      title: "Bill saved. Some goods did not move",
      description:
        "2 of MS Pipe / 6M was not in Bhiwandi, so it came off Main; 1.5 of Bolt could not go back to Thane. Check Godown Transfers.",
    });
    expect(parseGodownDocResult(undefined)).toEqual({
      godown_id: null,
      godown_name: null,
      is_main: true,
      moved: 0,
      moved_back: 0,
      short: [],
    });
  });
});
