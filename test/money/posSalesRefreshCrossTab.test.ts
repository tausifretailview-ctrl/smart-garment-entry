import { describe, expect, it, vi } from "vitest";
import {
  MONEY_VIEW_FRESHNESS_LS_KEY,
  notifyMoneyViewChanged,
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

  it("notifyMoneyViewChanged writes freshness marker without POS session event", () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", { setItem } as Storage);
    vi.stubGlobal("window", { dispatchEvent } as Window & typeof globalThis);

    notifyMoneyViewChanged({ organizationId: "org-99" });

    expect(setItem).toHaveBeenCalledWith(
      MONEY_VIEW_FRESHNESS_LS_KEY,
      expect.stringContaining('"organizationId":"org-99"'),
    );
    expect(dispatchEvent).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
