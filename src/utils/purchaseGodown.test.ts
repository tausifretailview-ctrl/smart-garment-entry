import { describe, expect, it } from "vitest";
import {
  parsePurchaseGodownResult,
  purchaseGodownChoices,
  purchaseGodownMessage,
  purchaseGodownNeedsSync,
  showPurchaseGodownPicker,
} from "./purchaseGodown";
import type { Godown } from "./godowns";

const g = (id: string, name: string, godown_type: Godown["godown_type"], is_active = true, sort_order = 1): Godown => ({
  id,
  organization_id: "org",
  name,
  code: null,
  godown_type,
  address: null,
  pincode: null,
  contact_name: null,
  contact_phone: null,
  supplier_id: null,
  notes: null,
  is_active,
  sort_order,
  created_at: null,
});

const main = g("main", "Main", "main", true, 0);
const bhiwandi = g("bhw", "Bhiwandi", "godown", true, 2);
const thane = g("thn", "Thane", "godown", false, 1);
const jobWorker = g("jw", "Ravi Dyeing", "job_work", true, 3);

describe("receive a purchase bill into a godown (Phase 3 step 3c)", () => {
  it("offers Main first, then open godowns, and keeps the bill's own closed godown", () => {
    expect(purchaseGodownChoices([bhiwandi, thane, main, jobWorker]).map((x) => x.id)).toEqual(["main", "bhw", "jw"]);
    expect(purchaseGodownChoices([bhiwandi, thane, main], "thn").map((x) => x.id)).toEqual(["main", "bhw", "thn"]);
  });

  it("shows the picker only when the shop has a godown besides Main", () => {
    expect(showPurchaseGodownPicker([])).toBe(false);
    expect(showPurchaseGodownPicker([main])).toBe(false);
    expect(showPurchaseGodownPicker([main, thane])).toBe(false);
    expect(showPurchaseGodownPicker([main, thane], "thn")).toBe(true);
    expect(showPurchaseGodownPicker([main, bhiwandi])).toBe(true);
    expect(showPurchaseGodownPicker([bhiwandi])).toBe(false);
  });

  it("skips the extra call when a bill was and stays in Main", () => {
    expect(purchaseGodownNeedsSync({ mainId: "main", targetId: "main", savedId: null })).toBe(false);
    expect(purchaseGodownNeedsSync({ mainId: "main", targetId: null, savedId: "main" })).toBe(false);
    expect(purchaseGodownNeedsSync({ mainId: "main", targetId: "bhw", savedId: null })).toBe(true);
    expect(purchaseGodownNeedsSync({ mainId: "main", targetId: "main", savedId: "bhw" })).toBe(true);
    expect(purchaseGodownNeedsSync({ mainId: "main", targetId: "bhw", savedId: "bhw" })).toBe(true);
    expect(purchaseGodownNeedsSync({ mainId: null, targetId: "bhw", savedId: null })).toBe(false);
  });

  it("reads the database answer and tells the user what moved", () => {
    const r = parsePurchaseGodownResult({
      godown_id: "bhw",
      godown_name: "Bhiwandi",
      is_main: false,
      moved_in: "120.000",
      moved_back: 0,
      short: [],
    });
    expect(r.moved_in).toBe(120);
    expect(purchaseGodownMessage(r)).toEqual({
      title: "Received into Bhiwandi",
      description: "120 received into Bhiwandi.",
      warn: false,
    });
    expect(purchaseGodownMessage({ ...r, moved_in: 5, moved_back: 20 })?.description).toBe(
      "5 received into Bhiwandi, 20 moved back to Main.",
    );
    expect(purchaseGodownMessage({ ...r, moved_in: 0 })).toBeNull();
    expect(purchaseGodownMessage({ ...r, is_main: true, godown_name: "Main", moved_in: 0, moved_back: 55 })).toEqual({
      title: "Goods back in Main",
      description: "55 moved back to Main.",
      warn: false,
    });
    expect(parsePurchaseGodownResult(null)).toEqual({
      godown_id: null,
      godown_name: null,
      is_main: true,
      moved_in: 0,
      moved_back: 0,
      short: [],
    });
  });

  it("warns about goods that could not be moved", () => {
    const r = parsePurchaseGodownResult({
      godown_id: "thn",
      godown_name: "Thane",
      is_main: false,
      moved_in: 55,
      moved_back: 55,
      short: [
        { item: "MS Pipe / 6M", godown: "Bhiwandi", qty: 50, way: "back" },
        { item: "MS Pipe / 3M", godown: "Thane", qty: 2.5, way: "in" },
      ],
    });
    const msg = purchaseGodownMessage(r);
    expect(msg?.warn).toBe(true);
    expect(msg?.title).toBe("Bill saved. Some goods were not moved");
    expect(msg?.description).toBe(
      "50 of MS Pipe / 6M had already left Bhiwandi; 2.5 of MS Pipe / 3M was not in Main to send to Thane. Check Godown Transfers.",
    );
    const many = { ...r, short: Array.from({ length: 5 }, (_, i) => ({ item: `Item ${i}`, godown: "Thane", qty: 1, way: "back" as const })) };
    expect(purchaseGodownMessage(many)?.description).toContain("and 2 more");
  });
});
