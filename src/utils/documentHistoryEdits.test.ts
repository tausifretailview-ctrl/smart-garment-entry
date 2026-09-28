import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchDocumentEditEvents, summarizeValueDelta } from "./documentHistoryEdits";

function mockAuditQuery(rows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

describe("fetchDocumentEditEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps UPDATE audit rows to edit events with date/time source", async () => {
    mockAuditQuery([
      {
        id: "a1",
        action: "UPDATE",
        created_at: "2026-08-07T10:30:00.000Z",
        user_email: "cashier@demo.com",
        old_values: { net_amount: 5000 },
        new_values: { net_amount: 4500 },
      },
    ]);

    const events = await fetchDocumentEditEvents({
      organizationId: "org-1",
      entityId: "sale-1",
      entityTypes: ["sale"],
      createdAt: "2026-08-07T09:00:00.000Z",
      updatedAt: "2026-08-07T10:30:00.000Z",
    });

    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe("2026-08-07T10:30:00.000Z");
    expect(events[0].lines.some((l) => l.includes("cashier@demo.com"))).toBe(true);
    expect(events[0].lines.some((l) => /net amount/i.test(l))).toBe(true);
  });

  it("falls back to updated_at when no audit edits exist", async () => {
    mockAuditQuery([]);

    const events = await fetchDocumentEditEvents({
      organizationId: "org-1",
      entityId: "sale-1",
      entityTypes: ["sale"],
      createdAt: "2026-08-07T09:00:00.000Z",
      updatedAt: "2026-08-07T11:00:00.000Z",
    });

    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe("2026-08-07T11:00:00.000Z");
    expect(events[0].lines[0]).toMatch(/updated/i);
  });

  it("skips updated_at fallback when near a payment timestamp", async () => {
    mockAuditQuery([]);

    const events = await fetchDocumentEditEvents({
      organizationId: "org-1",
      entityId: "sale-1",
      entityTypes: ["sale"],
      createdAt: "2026-08-07T09:00:00.000Z",
      updatedAt: "2026-08-07T09:12:05.000Z",
      ignoreUpdatedNearTimestamps: ["2026-08-07T09:12:00.000Z"],
    });

    expect(events).toHaveLength(0);
  });
});

describe("summarizeValueDelta (Sale Bill edits)", () => {
  it("shows invoice discount and S/R adjust changes from SALE_UPDATED", () => {
    const lines = summarizeValueDelta(
      { net_amount: 5000, flat_discount_amount: 0, sale_return_adjust: 1000, discount_amount: 0 },
      { net_amount: 4500, flat_discount_amount: 500, sale_return_adjust: 0, discount_amount: 0 },
    );
    expect(lines).toContain("invoice discount: ₹0.00 → ₹500.00");
    expect(lines).toContain("S/R adjust: ₹1,000.00 → ₹0.00");
    expect(lines.some((l) => l.startsWith("item discount"))).toBe(false);
  });

  it("shows advance adjust from SALE_ADVANCE_ADJUST_UPDATED", () => {
    expect(summarizeValueDelta({ advance_adjust: 0 }, { advance_adjust: 750 })).toEqual([
      "advance adjust: ₹0.00 → ₹750.00",
    ]);
  });

  it("ignores numeric formatting differences", () => {
    expect(summarizeValueDelta({ sale_return_adjust: "100.00" }, { sale_return_adjust: 100 })).toEqual([]);
  });
});
