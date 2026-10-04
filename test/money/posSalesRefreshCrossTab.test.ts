import { describe, expect, it, vi } from "vitest";
import {
  MONEY_VIEW_FRESHNESS_LS_KEY,
  MONEY_VIEW_FRESHNESS_MAX_AGE_MS,
  notifyMoneyViewChanged,
  parseMoneyFreshnessMarker,
  shouldApplyMoneyFreshnessMarker,
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

  it("applies a recent marker the background tab has not seen yet", () => {
    const now = 1_700_000_100_000;
    expect(
      shouldApplyMoneyFreshnessMarker(
        { organizationId: "org-1", ts: now - 5_000 },
        { organizationId: "org-1", lastAppliedTs: 0, now },
      ),
    ).toBe(true);
  });

  it("skips a marker this tab already applied, another org, or an old one", () => {
    const now = 1_700_000_100_000;
    const ts = now - 1_000;
    expect(
      shouldApplyMoneyFreshnessMarker(
        { organizationId: "org-1", ts },
        { organizationId: "org-1", lastAppliedTs: ts, now },
      ),
    ).toBe(false);
    expect(
      shouldApplyMoneyFreshnessMarker(
        { organizationId: "org-2", ts },
        { organizationId: "org-1", lastAppliedTs: 0, now },
      ),
    ).toBe(false);
    expect(
      shouldApplyMoneyFreshnessMarker(
        { organizationId: "org-1", ts: now - MONEY_VIEW_FRESHNESS_MAX_AGE_MS - 1 },
        { organizationId: "org-1", lastAppliedTs: 0, now },
      ),
    ).toBe(false);
  });
});
