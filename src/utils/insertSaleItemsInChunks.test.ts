import { describe, expect, it, vi } from "vitest";
import { insertSaleItemsResilient } from "./insertSaleItemsInChunks";

describe("insertSaleItemsResilient", () => {
  it("retries without salesman when schema cache lacks the column", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          message: "Could not find the 'salesman' column of 'sale_items' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ error: null });

    const client = {
      from: () => ({ insert }),
    } as never;

    const rows = [{ sale_id: "s1", salesman: "RAVI", quantity: 1 }];
    const result = await insertSaleItemsResilient(client, rows, 5);

    expect(result.salesmanColumnMissing).toBe(true);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).toEqual([{ sale_id: "s1", quantity: 1 }]);
  });
});
