import { describe, expect, it } from "vitest";
import { autoMapFields, applyMappings, customerMasterFields } from "./excelImportUtils";
import { cleanImportGstin, prepareCustomerImportRows, splitNewCustomers } from "./customerExcelImport";

describe("customer Excel import", () => {
  it("auto-maps a typical party list (ADD, GSTIN, State, Mobile No)", () => {
    const headers = ["Customer Name", "ADD", "GSTIN", "State", "Registered OR unregistered", "Mobile No"];
    expect(autoMapFields(headers, customerMasterFields)).toEqual({
      "Customer Name": "customer_name",
      ADD: "address",
      GSTIN: "gst_number",
      State: "state",
      "Registered OR unregistered": null,
      "Mobile No": "phone",
    });
  });

  it("does not require a mobile column", () => {
    expect(customerMasterFields.some((f) => f.required)).toBe(false);
  });

  it("keeps parties without a mobile and cleans GSTIN / state", () => {
    const mapped = applyMappings(
      [
        { Name: "a a brothers", Add: "Dadar, Mumbai", GSTIN: "27aawfa5348k1zs", State: "Maharashtra", Mob: "" },
        { Name: "A1 DRY FRUITS", Add: "Girgaon, Maharashtra", GSTIN: "Unregistered", State: "Maharashtra", Mob: "91-9820576294" },
        { Name: "", Add: "", GSTIN: "", State: "", Mob: "" },
        { Name: "SHORT", Add: "", GSTIN: "", State: "", Mob: "98201" },
      ],
      { Name: "customer_name", Add: "address", GSTIN: "gst_number", State: "state", Mob: "phone" },
    );
    const prepared = prepareCustomerImportRows(mapped);
    expect(prepared.blankRows).toBe(1);
    expect(prepared.invalidPhones).toBe(1);
    expect(prepared.clearedGstins).toBe(1);
    expect(prepared.rows).toEqual([
      { customer_name: "A A BROTHERS", phone: null, email: "", address: "Dadar, Mumbai, Maharashtra", gst_number: "27AAWFA5348K1ZS", opening_balance: 0 },
      { customer_name: "A1 DRY FRUITS", phone: "9820576294", email: "", address: "Girgaon, Maharashtra", gst_number: "", opening_balance: 0 },
      { customer_name: "SHORT", phone: null, email: "", address: "", gst_number: "", opening_balance: 0 },
    ]);
  });

  it("skips existing parties by mobile, or by name when there is no mobile", () => {
    const { rows } = prepareCustomerImportRows([
      { customer_name: "Old Party", phone: "" },
      { customer_name: "New Name", phone: "9876543210" },
      { customer_name: "Fresh", phone: "9123456789" },
      { customer_name: "Fresh", phone: "9123456789" },
      { customer_name: "No Mobile", phone: "" },
    ]);
    const { fresh, duplicates } = splitNewCustomers(rows, [
      { customer_name: "OLD PARTY", phone: "8888888888" },
      { customer_name: "Someone", phone: "+91 98765 43210" },
    ]);
    expect(duplicates).toBe(3);
    expect(fresh.map((r) => r.customer_name)).toEqual(["FRESH", "NO MOBILE"]);
  });

  it("only accepts 15-character GSTINs", () => {
    expect(cleanImportGstin(" 27aagfp5806j1zg ")).toBe("27AAGFP5806J1ZG");
    expect(cleanImportGstin("NA")).toBe("");
    expect(cleanImportGstin("Unregistered")).toBe("");
  });
});

describe("validateMappedData for party masters", () => {
  it("counts short customer rows instead of skipping them as summary rows", async () => {
    const { validateMappedData } = await import("./excelImportUtils");
    const rows = [
      { customer_name: "A A BROTHERS", gst_number: "27AAWFA5348K1ZS" },
      { customer_name: "A1 DRY FRUITS", phone: "91-9820576294" },
      { customer_name: "", phone: "" },
    ];
    const result = validateMappedData(rows, customerMasterFields, {
      Name: "customer_name",
      Mob: "phone",
      GSTIN: "gst_number",
    });
    expect(result.valid).toBe(true);
    expect(result.validRowCount).toBe(2);
  });
});

describe("customer import cell cleanup", () => {
  it("treats (blank) as empty and decodes &amp; in names", () => {
    const { rows } = prepareCustomerImportRows([
      { customer_name: "VINAYAK SWEET &amp;amp; SNACKS", address: "(blank)", state: "Maharashtra", phone: "(blank)" },
      { customer_name: "TESTY STORE", address: "(Blank)", state: "(blank)" },
    ]);
    expect(rows.map((r) => [r.customer_name, r.address, r.phone])).toEqual([
      ["VINAYAK SWEET & SNACKS", "Maharashtra", null],
      ["TESTY STORE", "", null],
    ]);
  });
});
