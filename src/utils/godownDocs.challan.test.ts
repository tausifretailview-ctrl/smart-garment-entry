import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  place: null as { godown_id: string } | null,
  placeError: null as { message: string } | null,
  places: [] as { doc_id: string; godowns: { name: string } | null }[],
  rpc: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, v: string) => {
    db.calls.push(`${col}=${v}`);
    return chain;
  };
  chain.in = (col: string, v: string[]) => {
    db.calls.push(`${col} in ${v.length}`);
    return Promise.resolve({ data: db.places, error: null });
  };
  chain.maybeSingle = () => Promise.resolve({ data: db.place, error: db.placeError });
  return { supabase: { from: () => chain, rpc: (...a: unknown[]) => db.rpc(...a) } };
});

import { fetchDocGodownNames, godownDocTakesStock, syncSaleFromChallanGodown } from "./godownDocs";

beforeEach(() => {
  db.place = null;
  db.placeError = null;
  db.places = [];
  db.calls = [];
  db.rpc.mockReset();
});

describe("delivery challan sent from a godown (Phase 3 step 3d-2)", () => {
  it("a challan takes no stock, a sale does", () => {
    expect(godownDocTakesStock("challan")).toBe(false);
    expect(godownDocTakesStock("sale")).toBe(true);
  });

  it("an invoice from a challan sent from Main does nothing more", async () => {
    expect(await syncSaleFromChallanGodown("dc1", "s1")).toBeNull();
    expect(db.calls).toEqual(["ref_type=challan", "doc_id=dc1"]);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("an invoice from a challan sent from Bhiwandi goes out of Bhiwandi", async () => {
    db.place = { godown_id: "bhw" };
    db.rpc.mockResolvedValue({
      data: { godown_id: "bhw", godown_name: "Bhiwandi", is_main: false, moved: 10, moved_back: 0, short: [] },
      error: null,
    });
    expect(await syncSaleFromChallanGodown("dc1", "s1")).toBeNull();
    expect(db.rpc).toHaveBeenCalledWith("godown_sync_doc", { p_ref_type: "sale", p_doc_id: "s1", p_godown_id: "bhw" });
  });

  it("says when some goods were not in the godown", async () => {
    db.place = { godown_id: "bhw" };
    db.rpc.mockResolvedValue({
      data: { godown_id: "bhw", godown_name: "Bhiwandi", is_main: false, moved: 8, moved_back: 0, short: [{ item: "MS Pipe", godown: "Bhiwandi", qty: 2, way: "forward" }] },
      error: null,
    });
    expect((await syncSaleFromChallanGodown("dc1", "s1"))?.title).toBe("Bill saved. Some goods did not move");
  });

  it("never throws: a failed move is reported, with the SQL hint when the SQL is missing", async () => {
    db.place = { godown_id: "bhw" };
    db.rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.godown_sync_doc in the schema cache" } });
    const missing = await syncSaleFromChallanGodown("dc1", "s1");
    expect(missing?.title).toBe("Invoice made. Goods went out of Main");
    expect(missing?.description).toContain("3d-1 SQL");

    db.rpc.mockResolvedValue({ data: null, error: { message: "Godown Bhiwandi is closed. Pick another godown." } });
    expect((await syncSaleFromChallanGodown("dc1", "s1"))?.description).toBe(
      'Godown Bhiwandi is closed. Pick another godown. Open the invoice, pick the godown in "Dispatch from" and save.',
    );

    db.placeError = { message: "network down" };
    expect((await syncSaleFromChallanGodown("dc1", "s1"))?.title).toBe("Invoice made. Goods went out of Main");
  });

  it("reads challan godown names as a plain object (safe in the saved query cache)", async () => {
    db.places = [
      { doc_id: "dc1", godowns: { name: "Bhiwandi" } },
      { doc_id: "dc2", godowns: null },
    ];
    const names = await fetchDocGodownNames("challan", ["dc1", "dc2", "dc1", ""]);
    expect(names).toEqual({ dc1: "Bhiwandi" });
    expect(names instanceof Map).toBe(false);
    expect(db.calls).toEqual(["ref_type=challan", "doc_id in 2"]);
  });
});
