import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  docGodownSyncFailMessage,
  GODOWN_DOC_PICK_LABEL,
  GODOWN_DOC_SQL_STEP,
  godownDocCheckLines,
  godownDocShortMessage,
  godownDocSyncWarning,
  godownDocTakesStock,
} from "./godownDocs";

describe("purchase return goes out of a godown (Phase 3 step 3d-4)", () => {
  it("takes stock, so it is checked before the save", () => {
    expect(godownDocTakesStock("purchase_return")).toBe(true);
    expect(GODOWN_DOC_SQL_STEP.purchase_return).toBe("3d-4");
    expect(GODOWN_DOC_PICK_LABEL.purchase_return).toBe("Return from");
  });

  it("sums the return lines per item for the check", () => {
    expect(
      godownDocCheckLines([
        { variantId: "v1", quantity: 4 },
        { variantId: "v1", quantity: 6 },
        { variantId: "", quantity: 2 },
        { variantId: "v2", quantity: 0 },
      ]),
    ).toEqual([{ variant_id: "v1", qty: 10 }]);
  });

  it("names the Return from pick when the godown is short", () => {
    const msg = godownDocShortMessage(
      [{ variant_id: "v1", item: "MS Pipe / 6M", need: 41, have: 40, elsewhere: 60 }],
      "Bhiwandi",
      GODOWN_DOC_PICK_LABEL.purchase_return,
    );
    expect(msg).toEqual({
      title: "Not enough stock in Bhiwandi",
      description:
        'MS Pipe / 6M: need 41, Bhiwandi has 40 (60 in other godowns). Pick another godown in "Return from" or move the goods first.',
    });
  });

  it("keeps Dispatch from for bills", () => {
    const msg = godownDocShortMessage([{ variant_id: "v1", item: "Pipe", need: 2, have: 1, elsewhere: 0 }], "Main");
    expect(msg?.description).toContain('"Dispatch from"');
  });

  it("says Return saved when some goods could not be taken", () => {
    const w = godownDocSyncWarning(
      {
        godown_id: "bhw",
        godown_name: "Bhiwandi",
        is_main: false,
        moved: 1,
        moved_back: 0,
        short: [{ item: "Pipe", godown: "Bhiwandi", qty: 2, way: "forward" }],
      },
      "purchase_return",
    );
    expect(w).toEqual({
      title: "Return saved. Some goods did not move",
      description: "2 of Pipe was not in Bhiwandi, so it came off Main. Check Godown Transfers.",
    });
  });

  it("asks for the 3d-4 SQL when the database does not know purchase returns yet", () => {
    expect(docGodownSyncFailMessage("purchase_return", "Document not found")).toEqual({
      title: "Return saved. Goods went out of Main",
      description: "Run the Phase 3 step 3d-4 SQL first, then open this return and save it again.",
    });
    expect(docGodownSyncFailMessage("purchase_return", "network down").description).toBe(
      "network down. Open the return and save again, or move the stock in Godown Transfers.",
    );
  });
});
