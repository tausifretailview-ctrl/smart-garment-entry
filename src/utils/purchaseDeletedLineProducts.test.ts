import { describe, expect, it } from "vitest";
import {
  deletedPurchaseLinesMessage,
  findDeletedPurchaseLines,
  type DeletedRefsClient,
} from "./purchaseDeletedLineProducts";

/** Stub: tables map to the ids that are deleted; records the ids it was asked about. */
function stubClient(deleted: { products?: string[]; product_variants?: string[] }, fail = false) {
  const asked: Array<{ table: string; ids: string[] }> = [];
  const client = {
    from: (table: "products" | "product_variants") => ({
      select: () => ({
        eq: () => ({
          in: (_col: string, ids: string[]) => ({
            not: () => {
              asked.push({ table, ids });
              if (fail) return Promise.resolve({ data: null, error: new Error("boom") });
              const hit = (deleted[table] ?? []).filter((id) => ids.includes(id));
              return Promise.resolve({ data: hit.map((id) => ({ id })), error: null });
            },
          }),
        }),
      }),
    }),
  } as unknown as DeletedRefsClient;
  return { client, asked };
}

const line = (product_id: string, sku_id: string, product_name = "38507001", size = "8") => ({
  product_id,
  sku_id,
  product_name,
  size,
});

describe("findDeletedPurchaseLines", () => {
  it("returns lines whose product was deleted", async () => {
    const { client } = stubClient({ products: ["p-deleted"] });
    const lines = [line("p-deleted", "v1"), line("p-live", "v2")];
    await expect(findDeletedPurchaseLines(client, "org", lines)).resolves.toEqual([lines[0]]);
  });

  it("returns lines whose variant was deleted even if the product is live", async () => {
    const { client } = stubClient({ product_variants: ["v2"] });
    const lines = [line("p-live", "v1"), line("p-live", "v2")];
    await expect(findDeletedPurchaseLines(client, "org", lines)).resolves.toEqual([lines[1]]);
  });

  it("returns nothing when everything is live", async () => {
    const { client } = stubClient({});
    await expect(findDeletedPurchaseLines(client, "org", [line("p1", "v1")])).resolves.toEqual([]);
  });

  it("skips the lookup for new lines that have no product or variant yet", async () => {
    const { client, asked } = stubClient({ products: ["x"] });
    const result = await findDeletedPurchaseLines(client, "org", [
      { product_id: "", sku_id: "", product_name: "New item", size: "M" },
    ]);
    expect(result).toEqual([]);
    expect(asked).toHaveLength(0);
  });

  it("asks once per table with distinct ids", async () => {
    const { client, asked } = stubClient({});
    await findDeletedPurchaseLines(client, "org", [line("p1", "v1"), line("p1", "v2"), line("p2", "v3")]);
    expect(asked.find((a) => a.table === "products")?.ids).toEqual(["p1", "p2"]);
    expect(asked.find((a) => a.table === "product_variants")?.ids).toEqual(["v1", "v2", "v3"]);
  });

  it("fails open: a lookup error must never block a save", async () => {
    const { client } = stubClient({ products: ["p1"] }, true);
    await expect(findDeletedPurchaseLines(client, "org", [line("p1", "v1")])).resolves.toEqual([]);
  });
});

describe("deletedPurchaseLinesMessage", () => {
  it("names the products once and says nothing was saved", () => {
    const msg = deletedPurchaseLinesMessage([line("a", "1"), line("a", "2"), line("b", "3", "SHIRT")]);
    expect(msg).toContain("38507001, SHIRT");
    expect(msg).toContain("Recycle Bin");
    expect(msg).toContain("Nothing was saved");
  });

  it("caps the list at three names", () => {
    const msg = deletedPurchaseLinesMessage(["A", "B", "C", "D", "E"].map((n) => line(n, n, n)));
    expect(msg).toContain("A, B, C and 2 more");
  });
});
