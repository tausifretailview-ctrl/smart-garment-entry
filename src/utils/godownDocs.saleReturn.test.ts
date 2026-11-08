import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  docGodownSyncFailMessage,
  GODOWN_DOC_SQL_STEP,
  godownDocSyncWarning,
  godownDocTakesStock,
  type GodownDocSyncResult,
} from "./godownDocs";

const result = (short: GodownDocSyncResult["short"]): GodownDocSyncResult => ({
  godown_id: "bhw",
  godown_name: "Bhiwandi",
  is_main: false,
  moved: 2,
  moved_back: 0,
  short,
});

describe("sale return goes back into a godown (Phase 3 step 3d-3)", () => {
  it("a sale return brings goods in, so there is no stock check before the save", () => {
    expect(godownDocTakesStock("sale_return")).toBe(false);
    expect(GODOWN_DOC_SQL_STEP.sale_return).toBe("3d-3");
  });

  it("nothing to say when every piece moved", () => {
    expect(godownDocSyncWarning(result([]), "sale_return")).toBeNull();
  });

  it("speaks of goods coming in for a return", () => {
    const w = godownDocSyncWarning(
      result([
        { item: "MS Pipe / 6M", godown: "Bhiwandi", qty: 2, way: "forward" },
        { item: "Elbow", godown: "Thane", qty: 4, way: "back" },
      ]),
      "sale_return",
    );
    expect(w?.title).toBe("Return saved. Some goods did not move");
    expect(w?.description).toBe(
      "2 of MS Pipe / 6M could not go into Bhiwandi, so it stayed in Main; 4 of Elbow was no longer in Thane, so it could not come out. Check Godown Transfers.",
    );
  });

  it("keeps the sale wording for bills", () => {
    const w = godownDocSyncWarning(result([{ item: "MS Pipe", godown: "Bhiwandi", qty: 2, way: "forward" }]));
    expect(w?.title).toBe("Bill saved. Some goods did not move");
    expect(w?.description).toContain("was not in Bhiwandi, so it came off Main");
  });

  it("asks for the 3d-3 SQL when the database does not know sale returns yet", () => {
    for (const text of ["Document not found", "Godowns do not follow sale_return yet"]) {
      const m = docGodownSyncFailMessage("sale_return", text);
      expect(m.title).toBe("Return saved. Goods stayed in Main");
      expect(m.description).toBe("Run the Phase 3 step 3d-3 SQL first, then open this return and save it again.");
    }
    expect(docGodownSyncFailMessage("sale_return", "Could not find the function public.godown_sync_doc").description).toContain(
      "3d-3 SQL",
    );
  });

  it("passes on a real reason", () => {
    expect(docGodownSyncFailMessage("sale_return", "Godown Thane is closed. Pick another godown.").description).toBe(
      "Godown Thane is closed. Pick another godown. Open the return and save again, or move the stock in Godown Transfers.",
    );
  });

  it("keeps the bill and challan messages", () => {
    expect(docGodownSyncFailMessage("sale", "network down")).toEqual({
      title: "Bill saved. Goods went out of Main",
      description: "network down. Open the bill and save again, or move the stock in Godown Transfers.",
    });
    expect(docGodownSyncFailMessage("challan", "Document not found").description).toBe(
      "Run the Phase 3 step 3d-2 SQL first. The invoice made from this challan will go out of Main.",
    );
    expect(docGodownSyncFailMessage("sale", "Document not found").description).toBe(
      "Document not found. Open the bill and save again, or move the stock in Godown Transfers.",
    );
  });
});
