import { describe, expect, it, vi } from "vitest";
import { hardDeleteDocument, isMissingHardDeleteDocumentRpc, isOneStepHardDeleteEntity } from "./hardDeleteDocument";

function client(reply: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: reply.data ?? null, error: reply.error ?? null });
  return { sb: { rpc } as never, rpc };
}

describe("one-step permanent delete", () => {
  it("covers the documents that had separate line and header deletes", () => {
    for (const e of ["sales", "sale_returns", "purchase_returns", "sale_orders", "quotations", "voucher_entries", "products"]) {
      expect(isOneStepHardDeleteEntity(e)).toBe(true);
    }
    // Purchase bills keep hard_delete_purchase_bill; header-only records keep their single delete.
    for (const e of ["purchase_bills", "customers", "suppliers", "credit_notes"]) {
      expect(isOneStepHardDeleteEntity(e)).toBe(false);
    }
  });

  it("deletes in one call", async () => {
    const { sb, rpc } = client({ data: { success: true, lines_deleted: 2 } });
    await expect(hardDeleteDocument(sb, "sales", "s1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("hard_delete_document", { p_entity: "sales", p_id: "s1" });
  });

  it("falls back (null) only when the function is missing; other errors are thrown", async () => {
    await expect(hardDeleteDocument(client({ error: { code: "PGRST202", message: "x" } }).sb, "quotations", "q1")).resolves.toBeNull();
    await expect(
      hardDeleteDocument(client({ error: { code: "42501", message: "Only admin can permanently delete this record." } }).sb, "sales", "s1"),
    ).rejects.toMatchObject({ message: "Only admin can permanently delete this record." });
    expect(isMissingHardDeleteDocumentRpc({ code: "23503", message: "violates foreign key constraint" })).toBe(false);
  });

  it("refuses a reply that does not say success", async () => {
    await expect(hardDeleteDocument(client({ data: {} }).sb, "sales", "s1")).rejects.toThrow(/did not complete/);
  });
});
