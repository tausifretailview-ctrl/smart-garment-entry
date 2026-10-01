import { describe, expect, it } from "vitest";
import {
  deletedPurchaseLinesMessage,
  findDeletedPurchaseLines,
  retargetDeletedPurchaseLines,
  retargetLinesOntoLiveCatalog,
  type DeletedRefsClient,
  type LiveNameCatalogClient,
  type LivePurchaseProduct,
  type LivePurchaseVariant,
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

const live = (
  id: string,
  product_name: string,
  extra: Partial<LivePurchaseProduct> = {},
): LivePurchaseProduct => ({ id, product_name, ...extra });

const variant = (
  id: string,
  product_id: string,
  extra: Partial<LivePurchaseVariant> = {},
): LivePurchaseVariant => ({ id, product_id, ...extra });

describe("retargetLinesOntoLiveCatalog", () => {
  const deletedLine = {
    ...line("p-old", "v-old", "NARZO 100X"),
    brand: "REALME",
    barcode: "IMEI1",
    size: "None",
  };
  const other = line("p-live", "v-ok", "SHIRT");

  it("points the recycle-bin product at the live same-name product", () => {
    const result = retargetLinesOntoLiveCatalog(
      [deletedLine, other],
      [deletedLine],
      [live("p-new", "narzo 100x", { brand: "REALME" })],
      [variant("v-new", "p-new", { barcode: "IMEI1", size: "None" })],
    );
    expect(result.changed).toBe(true);
    expect(result.stillDeleted).toEqual([]);
    expect(result.lines[0]).toMatchObject({ product_id: "p-new", sku_id: "v-new" });
    expect(result.lines[1]).toBe(other);
  });

  it("keeps the block when the dashboard has no live product of that name", () => {
    const result = retargetLinesOntoLiveCatalog([deletedLine], [deletedLine], [], []);
    expect(result.changed).toBe(false);
    expect(result.stillDeleted).toEqual([deletedLine]);
  });

  it("uses the only live variant when barcode and size do not match", () => {
    const result = retargetLinesOntoLiveCatalog(
      [deletedLine],
      [deletedLine],
      [live("p-new", "NARZO 100X")],
      [variant("v-only", "p-new", { size: "128GB", barcode: "OTHER" })],
    );
    expect(result.lines[0]).toMatchObject({ product_id: "p-new", sku_id: "v-only" });
  });

  it("does not guess among several live variants", () => {
    const result = retargetLinesOntoLiveCatalog(
      [deletedLine],
      [deletedLine],
      [live("p-new", "NARZO 100X")],
      [variant("a", "p-new", { size: "64" }), variant("b", "p-new", { size: "128" })],
    );
    expect(result.stillDeleted).toEqual([deletedLine]);
  });
});

describe("retargetDeletedPurchaseLines", () => {
  it("loads the live catalog and rewrites the line", async () => {
    const client = {
      from: (table: "products" | "product_variants") => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              ilike: () =>
                Promise.resolve({
                  data:
                    table === "products"
                      ? [{ id: "p-new", product_name: "NARZO 100X", brand: "REALME" }]
                      : [],
                  error: null,
                }),
            }),
            in: () => ({
              is: () =>
                Promise.resolve({
                  data: [{ id: "v-new", product_id: "p-new", size: "None", barcode: "" }],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    } as unknown as LiveNameCatalogClient;
    const row = line("p-old", "v-old", "NARZO 100X");
    const result = await retargetDeletedPurchaseLines(client, "org", [row], [row]);
    expect(result.stillDeleted).toEqual([]);
    expect(result.lines[0]).toMatchObject({ product_id: "p-new", sku_id: "v-new" });
  });

  it("stays blocked when the catalog lookup fails", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              ilike: () => Promise.resolve({ data: null, error: new Error("boom") }),
            }),
            in: () => ({ is: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      }),
    } as unknown as LiveNameCatalogClient;
    const row = line("p-old", "v-old", "NARZO 100X");
    const result = await retargetDeletedPurchaseLines(client, "org", [row], [row]);
    expect(result.changed).toBe(false);
    expect(result.stillDeleted).toEqual([row]);
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
