import { describe, expect, it, vi } from "vitest";
import {
  isManualReturnNumberEnabled,
  isReturnNumberInUse,
  keepTypedReturnNumber,
  typedReturnNumberProblem,
  typedReturnNumberToSave,
} from "./manualReturnNumber";
import { saveReturnWithItemsAtomic } from "./saveReturnAtomic";

describe("typed return number (Settings -> Purchase)", () => {
  it("is off unless the purchase setting is exactly true", () => {
    expect(isManualReturnNumberEnabled(undefined)).toBe(false);
    expect(isManualReturnNumberEnabled({})).toBe(false);
    expect(isManualReturnNumberEnabled({ manual_return_number: "true" })).toBe(false);
    expect(isManualReturnNumberEnabled({ manual_return_number: true })).toBe(true);
  });

  it("keeps only a changed, non-empty number while the setting is on", () => {
    expect(typedReturnNumberToSave("PR-OWN-7", "PR/26-27/5", false)).toBeNull();
    expect(typedReturnNumberToSave("PR/26-27/5", "PR/26-27/5", true)).toBeNull();
    expect(typedReturnNumberToSave("  PR/26-27/5 ", "PR/26-27/5", true)).toBeNull();
    expect(typedReturnNumberToSave("   ", "PR/26-27/5", true)).toBeNull();
    expect(typedReturnNumberToSave(" PR-OWN-7 ", "PR/26-27/5", true)).toBe("PR-OWN-7");
    // No number could be shown (offline): what the user typed is used.
    expect(typedReturnNumberToSave("SR 12", "", true)).toBe("SR 12");
  });

  it("refuses numbers that are too long or carry control characters", () => {
    expect(typedReturnNumberProblem("SR-1")).toBeNull();
    expect(typedReturnNumberProblem("x".repeat(41))).toMatch(/at most 40/);
    expect(typedReturnNumberProblem("SR\t1")).toMatch(/cannot be saved/);
    expect(typedReturnNumberProblem("")).toMatch(/Type a return number/);
  });

  it("checks the shop's live returns for the number", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "r1" }], error: null });
    const is = vi.fn(() => ({ limit }));
    const eq2 = vi.fn(() => ({ is }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    await expect(isReturnNumberInUse({ from } as never, "purchase_returns", "org", "PR-OWN-7")).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("purchase_returns");
    expect(eq1).toHaveBeenCalledWith("organization_id", "org");
    expect(eq2).toHaveBeenCalledWith("return_number", "PR-OWN-7");
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    limit.mockResolvedValueOnce({ data: [], error: null });
    await expect(isReturnNumberInUse({ from } as never, "purchase_returns", "org", "PR-OWN-8")).resolves.toBe(false);
  });

  it("puts the typed number on a return the older database numbered from the series", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const sb = { from } as never;
    await expect(keepTypedReturnNumber(sb, "sale_returns", "r1", "SR-OWN", "SR-OWN")).resolves.toEqual({ number: "SR-OWN", kept: true });
    expect(from).not.toHaveBeenCalled();
    await expect(keepTypedReturnNumber(sb, "sale_returns", "r1", "SR-OWN", "SR/26-27/9")).resolves.toEqual({ number: "SR-OWN", kept: true });
    expect(update).toHaveBeenCalledWith({ return_number: "SR-OWN" });
    expect(eq).toHaveBeenCalledWith("id", "r1");
    eq.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    await expect(keepTypedReturnNumber(sb, "sale_returns", "r1", "SR-OWN", "SR/26-27/9")).resolves.toEqual({ number: "SR/26-27/9", kept: false });
  });

  it("sends the typed number to the one-step save as manual_return_number, never as a column", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { return: { id: "r1", return_number: "PR-OWN-7" }, return_number: "PR-OWN-7", items_inserted: 1 },
      error: null,
    });
    const r = await saveReturnWithItemsAtomic({ rpc } as never, "purchase_return", "org", { net_amount: 5 }, [{}], {
      manualReturnNumber: " PR-OWN-7 ",
    });
    expect(rpc.mock.calls[0][1].p_header).toEqual({ net_amount: 5, manual_return_number: "PR-OWN-7" });
    expect(r?.returnNumber).toBe("PR-OWN-7");
    await saveReturnWithItemsAtomic({ rpc } as never, "purchase_return", "org", { net_amount: 5 }, [{}], { manualReturnNumber: null });
    expect(rpc.mock.calls[1][1].p_header).toEqual({ net_amount: 5 });
  });
});
