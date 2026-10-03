import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalCustomerName,
  isWalkInCustomerName,
  planUnlinkedSaleParties,
  totalCustomerCount,
} from "./salePartyCustomerMaster";

const master = [
  { id: "c-aaman", customer_name: "AAMAN", phone: "9527465086" },
  { id: "c-shilpa", customer_name: "SHILPA MANOJ KERKAR", phone: "9833376049" },
];

describe("POS parties missing from Customer Master", () => {
  it("treats a typed POS name as a customer and ignores walk-in", () => {
    expect(canonicalCustomerName("  parshant   mahtre ")).toBe("PARSHANT MAHTRE");
    expect(isWalkInCustomerName("Walk-in Customer")).toBe(true);
    expect(isWalkInCustomerName("Walk in Customer")).toBe(true);
    expect(isWalkInCustomerName("")).toBe(true);
    expect(isWalkInCustomerName("Parshant Mahtre")).toBe(false);
  });

  it("adds each POS name and mobile that is not already in Customer Master", () => {
    const plan = planUnlinkedSaleParties(
      [
        {
          id: "s1",
          customer_name: "PARSHANT MAHTRE",
          customer_phone: "9833700838",
        },
        {
          id: "s2",
          customer_name: "OM SANJIT WAINGANKAR",
          customer_phone: null,
        },
        {
          id: "s3",
          customer_name: "Walk-in Customer",
          customer_phone: "9999999999",
        },
        {
          id: "s4",
          customer_id: "c-aaman",
          customer_name: "AAMAN",
          customer_phone: "9527465086",
        },
      ],
      master,
    );

    expect(plan.creates.map((row) => row.customer_name).sort()).toEqual([
      "OM SANJIT WAINGANKAR",
      "PARSHANT MAHTRE",
    ]);
    expect(plan.creates.find((row) => row.customer_name === "PARSHANT MAHTRE")).toMatchObject({
      phone: "9833700838",
      saleIds: ["s1"],
    });
    expect(plan.links).toEqual([]);
  });

  it("keeps one customer when the same mobile is on more than one bill", () => {
    const plan = planUnlinkedSaleParties(
      [
        { id: "s1", customer_name: "Parshant Mahtre", customer_phone: "9833700838" },
        { id: "s2", customer_name: "PARSHANT  MAHTRE", customer_phone: "+91 98337 00838" },
      ],
      master,
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      customer_name: "PARSHANT MAHTRE",
      phone: "9833700838",
      saleIds: ["s1", "s2"],
    });
  });

  it("links a bill to the customer who already has that mobile", () => {
    const plan = planUnlinkedSaleParties(
      [{ id: "s1", customer_name: "Aaman", customer_phone: "9527465086" }],
      master,
    );
    expect(plan.creates).toEqual([]);
    expect(plan.links).toEqual([
      { customerId: "c-aaman", saleIds: ["s1"], phoneToSet: null },
    ]);
  });

  it("links a name-only bill when that name exists once, and keeps a different mobile separate", () => {
    const plan = planUnlinkedSaleParties(
      [
        { id: "s-name", customer_name: "Shilpa Manoj Kerkar", customer_phone: "" },
        { id: "s-other", customer_name: "SHILPA MANOJ KERKAR", customer_phone: "9000000000" },
      ],
      master,
    );
    expect(plan.links.map((link) => link.saleIds)).toEqual([["s-name"]]);
    expect(plan.creates).toEqual([
      {
        customer_name: "SHILPA MANOJ KERKAR",
        phone: "9000000000",
        saleIds: ["s-other"],
      },
    ]);
  });

  it("stores the bill mobile on a master row that has the same name and no number", () => {
    const plan = planUnlinkedSaleParties(
      [{ id: "s1", customer_name: "AAMAN", customer_phone: "9527465086" }],
      [{ id: "c-aaman", customer_name: "AAMAN", phone: null }],
    );
    expect(plan.creates).toEqual([]);
    expect(plan.links).toEqual([
      { customerId: "c-aaman", saleIds: ["s1"], phoneToSet: "9527465086" },
    ]);
  });
});

describe("totalCustomerCount", () => {
  it("counts master rows and named bills, and skips walk-in", () => {
    const total = totalCustomerCount(master, [
      { id: "s1", customer_name: "PARSHANT MAHTRE", customer_phone: "9833700838" },
      { id: "s2", customer_name: "PARSHANT MAHTRE", customer_phone: "9833700838" },
      { id: "s3", customer_name: "Walk-in Customer", customer_phone: "9999999999" },
      { id: "s4", customer_id: "c-aaman", customer_name: "AAMAN", customer_phone: "9527465086" },
      { id: "s5", customer_name: "AAMAN", customer_phone: "9527465086" },
    ]);
    // 2 master rows + Parshant. Aaman's unlinked bill matches the master. Walk-in is not a customer.
    expect(total).toBe(3);
  });

  it("is the number the main dashboard Customers card uses", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Index.tsx"), "utf8");
    expect(dashboard).toContain("fetchTotalCustomerCount");
    expect(dashboard).toContain('title="Customers"');
    const card = dashboard.slice(dashboard.indexOf('title="Customers"'), dashboard.indexOf('title="Total Purchase"'));
    expect(card).toContain("customersCount");
    expect(card).not.toContain("displayedDashStats?.customer_count");
  });
});

describe("Customer Master reads POS parties", () => {
  it("syncs unlinked sale names when the master opens and when a POS bill is saved", () => {
    const masterPage = readFileSync(resolve(process.cwd(), "src/pages/CustomerMaster.tsx"), "utf8");
    const saveSale = readFileSync(resolve(process.cwd(), "src/hooks/useSaveSale.tsx"), "utf8");
    expect(masterPage).toContain("syncUnlinkedSalesIntoCustomerMaster");
    expect(saveSale).toContain("linkOrCreateCustomerFromSaleParty");
    expect(saveSale.match(/attachSaleCustomerMasterId\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
