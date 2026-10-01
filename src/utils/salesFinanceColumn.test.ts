import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSalesFinanceColumnProbe,
  salesFinanceFields,
  splitCardAndFinance,
} from "./salesFinanceColumn";

const clientWith = (error: unknown) => {
  const select = vi.fn(() => ({ limit: () => Promise.resolve({ error }) }));
  return { client: { from: () => ({ select }) } as never, select };
};

describe("salesFinanceFields", () => {
  beforeEach(() => resetSalesFinanceColumnProbe());

  it("includes finance_amount when the column exists, and probes only once", async () => {
    const { client, select } = clientWith(null);
    expect(await salesFinanceFields(client, 18000)).toEqual({ finance_amount: 18000 });
    expect(await salesFinanceFields(client, 0)).toEqual({ finance_amount: 0 });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the migration is not applied yet, so POS saves keep working", async () => {
    const { client } = clientWith({ code: "42703", message: "column sales.finance_amount does not exist" });
    expect(await salesFinanceFields(client, 18000)).toEqual({});
  });
});

describe("splitCardAndFinance", () => {
  it("takes finance out of the card bucket", () => {
    expect(splitCardAndFinance(18000, 18000)).toEqual({ card: 0, finance: 18000 });
    expect(splitCardAndFinance(5000, 3000)).toEqual({ card: 2000, finance: 3000 });
  });
  it("never lets finance exceed card and treats missing as 0", () => {
    expect(splitCardAndFinance(500, 900)).toEqual({ card: 0, finance: 500 });
    expect(splitCardAndFinance(null, undefined)).toEqual({ card: 0, finance: 0 });
  });
});
