import { describe, expect, it } from "vitest";
import {
  MONEY_VIEW_FRESHNESS_LS_KEY,
  parseMoneyFreshnessMarker,
} from "@/utils/posSalesRefresh";

describe("posSalesRefresh localStorage bridge", () => {
  it("parses cross-tab freshness marker", () => {
    const raw = JSON.stringify({
      organizationId: "org-1",
      ts: 1_700_000_000_000,
    });
    expect(parseMoneyFreshnessMarker(raw)).toEqual({
      organizationId: "org-1",
      ts: 1_700_000_000_000,
    });
  });

  it("rejects malformed marker", () => {
    expect(parseMoneyFreshnessMarker("not-json")).toBeNull();
    expect(parseMoneyFreshnessMarker(JSON.stringify({ organizationId: "x" }))).toBeNull();
  });

  it("exports stable localStorage key", () => {
    expect(MONEY_VIEW_FRESHNESS_LS_KEY).toBe("money_view_freshness_v1");
  });
});
