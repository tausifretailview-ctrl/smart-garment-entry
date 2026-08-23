import { describe, expect, it } from "vitest";
import {
  OLD_BARCODE_SALE_ITEMS_SELECT,
  fetchOldBarcodeSaleItemMappings,
  type OldBarcodeSaleItemsClient,
} from "./stockReportOldBarcodeSearch";

type Row = { variant_id: string; barcode: string; organization_id: string };

function createOrgScopedClient(rows: Row[]): {
  client: OldBarcodeSaleItemsClient;
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  let orgFilter: string | null = null;

  const builder = {
    select(columns: string) {
      calls.push({ method: "select", args: [columns] });
      return builder;
    },
    eq(column: string, value: string) {
      calls.push({ method: "eq", args: [column, value] });
      if (column === "sales.organization_id") orgFilter = value;
      return builder;
    },
    is(column: string, value: null) {
      calls.push({ method: "is", args: [column, value] });
      return builder;
    },
    ilike(column: string, pattern: string) {
      calls.push({ method: "ilike", args: [column, pattern] });
      return builder;
    },
    limit(n: number) {
      calls.push({ method: "limit", args: [n] });
      return builder;
    },
    then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      const filtered = orgFilter
        ? rows.filter((r) => r.organization_id === orgFilter)
        : rows;
      return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
    },
  };
  const client: OldBarcodeSaleItemsClient = {
    from: (table) => {
      calls.push({ method: "from", args: [table] });
      return builder as ReturnType<OldBarcodeSaleItemsClient["from"]>;
    },
  };
  return { client, calls };
}

describe("fetchOldBarcodeSaleItemMappings", () => {
  it("scopes sale_items lookup via sales.organization_id (inner join select)", async () => {
    const { client, calls } = createOrgScopedClient([]);
    await fetchOldBarcodeSaleItemMappings(client, "org-A", "ABC123");

    expect(calls).toContainEqual({ method: "from", args: ["sale_items"] });
    expect(calls).toContainEqual({
      method: "select",
      args: [OLD_BARCODE_SALE_ITEMS_SELECT],
    });
    expect(OLD_BARCODE_SALE_ITEMS_SELECT).toContain("sales!inner");
    expect(calls).toContainEqual({
      method: "eq",
      args: ["sales.organization_id", "org-A"],
    });
  });

  it("does not resolve a barcode that only exists on another organization's sale_items", async () => {
    const sharedBarcode = "SHARED-BC-99";
    const { client } = createOrgScopedClient([
      {
        variant_id: "variant-other-org",
        barcode: sharedBarcode,
        organization_id: "org-B",
      },
    ]);

    const map = await fetchOldBarcodeSaleItemMappings(client, "org-A", sharedBarcode);

    expect(map.has(sharedBarcode.toLowerCase())).toBe(false);
    expect(map.size).toBe(0);
  });

  it("resolves a barcode that belongs to the requesting organization", async () => {
    const { client } = createOrgScopedClient([
      {
        variant_id: "variant-own",
        barcode: "OWN-BC-1",
        organization_id: "org-A",
      },
      {
        variant_id: "variant-other",
        barcode: "OWN-BC-1",
        organization_id: "org-B",
      },
    ]);

    const map = await fetchOldBarcodeSaleItemMappings(client, "org-A", "OWN-BC-1");

    expect(map.get("own-bc-1")).toBe("variant-own");
    expect(map.size).toBe(1);
  });
});
