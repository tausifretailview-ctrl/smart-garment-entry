import { describe, expect, it, vi } from "vitest";
import { renameOrgBrand, renameOrgProductName } from "./productNameUpdate";

function mockClient(eqCalls: Array<unknown[]>) {
  return {
    from: vi.fn((table: string) => {
      const done = Promise.resolve({ error: null });
      const chain: Record<string, any> = {
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          done.then(resolve, reject),
      };
      chain.update = vi.fn(() => chain);
      chain.eq = vi.fn((...args: unknown[]) => {
        eqCalls.push([table, ...args]);
        return chain;
      });
      chain.is = vi.fn(() => chain);
      return chain;
    }),
  };
}

describe("renameOrgProductName", () => {
  it("scopes product and line-item updates by organization_id", async () => {
    const eqCalls: Array<unknown[]> = [];
    const client = mockClient(eqCalls);

    await renameOrgProductName("org-1", "prod-9", "FLEXI LS100", client);

    expect(client.from).toHaveBeenCalledWith("products");
    expect(client.from).toHaveBeenCalledWith("purchase_items");
    expect(client.from).toHaveBeenCalledWith("sale_items");
    expect(eqCalls).toContainEqual(["products", "id", "prod-9"]);
    expect(eqCalls).toContainEqual(["products", "organization_id", "org-1"]);
    expect(eqCalls).toContainEqual(["purchase_items", "product_id", "prod-9"]);
    expect(eqCalls).toContainEqual(["purchase_items", "organization_id", "org-1"]);
    expect(eqCalls).toContainEqual(["sale_items", "product_id", "prod-9"]);
    expect(eqCalls).toContainEqual(["sale_items", "organization_id", "org-1"]);
  });
});

describe("renameOrgBrand", () => {
  it("scopes brand rewrite by organization_id and current brand", async () => {
    const eqCalls: Array<unknown[]> = [];
    const client = mockClient(eqCalls);

    const saved = await renameOrgBrand("org-1", "flexi", "FLEXI", client);
    expect(saved).toBe("FLEXI");
    expect(eqCalls).toContainEqual(["products", "organization_id", "org-1"]);
    expect(eqCalls).toContainEqual(["products", "brand", "flexi"]);
    expect(eqCalls).toContainEqual(["purchase_items", "organization_id", "org-1"]);
    expect(eqCalls).toContainEqual(["purchase_items", "brand", "flexi"]);
  });
});
