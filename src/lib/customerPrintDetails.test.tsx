/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_PRINT_DETAILS,
  composePrintAddress,
  customerPrintDetailsPatch,
  isMissingPrintDetailsColumn,
  readCustomerPrintDetails,
  resolveBillParty,
} from "./customerPrintDetails";
import { CustomerPrintDetailsFields } from "@/components/customers/CustomerPrintDetailsFields";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const kamlapure = {
  print_name: "M/s. R. C. KAMLAPURE",
  print_address: "SHAIKH ROZA ROAD, DATTA NAGAR, SHAHABAZAR,",
  print_place: "GULBARGA",
  print_pincode: "585101",
  print_state: "Karnataka",
  print_country: "INDIA",
};

describe("Customer Master: print name and address on bills", () => {
  it("builds the printed address block from the separate fields", () => {
    expect(composePrintAddress(kamlapure)).toBe(
      "SHAIKH ROZA ROAD, DATTA NAGAR, SHAHABAZAR,\nGULBARGA - 585101, Karnataka, INDIA",
    );
    expect(composePrintAddress({ ...EMPTY_PRINT_DETAILS, print_place: "GULBARGA", print_state: "Karnataka" })).toBe("GULBARGA, Karnataka");
    expect(composePrintAddress({ ...EMPTY_PRINT_DETAILS, print_pincode: "585101" })).toBe("585101");
    expect(composePrintAddress({ ...EMPTY_PRINT_DETAILS, print_name: "Only a name" })).toBe("");
  });

  it("prints the print name and address, and falls back to the bill's own when blank", () => {
    const bill = { customerName: "R. C. KAMLAPURE - RAKESH FASHION - GULBARGA {CASH}", customerAddress: "Old address" };
    expect(resolveBillParty(bill, kamlapure)).toEqual({
      customerName: "M/s. R. C. KAMLAPURE",
      customerAddress: "SHAIKH ROZA ROAD, DATTA NAGAR, SHAHABAZAR,\nGULBARGA - 585101, Karnataka, INDIA",
    });
    // Name only: the address stays the customer's address.
    expect(resolveBillParty(bill, { ...EMPTY_PRINT_DETAILS, print_name: "M/s. R. C. KAMLAPURE" })).toEqual({
      customerName: "M/s. R. C. KAMLAPURE",
      customerAddress: "Old address",
    });
    // Address only: the name stays the search name.
    expect(resolveBillParty(bill, { ...EMPTY_PRINT_DETAILS, print_place: "GULBARGA" }).customerName).toBe(bill.customerName);
    expect(resolveBillParty(bill, null)).toEqual(bill);
    expect(resolveBillParty(bill, EMPTY_PRINT_DETAILS)).toEqual(bill);
  });

  it("reads any row safely and saves only what changed", () => {
    expect(readCustomerPrintDetails({ print_name: "  M/s.   A  ", print_state: 5, other: "x" })).toEqual({
      ...EMPTY_PRINT_DETAILS,
      print_name: "M/s. A",
    });
    expect(readCustomerPrintDetails(null)).toEqual(EMPTY_PRINT_DETAILS);
    expect(readCustomerPrintDetails({ print_address: " Line 1 \n\n  Line 2 " }).print_address).toBe("Line 1\nLine 2");
    // A new customer with nothing typed sends nothing (works before the SQL is run).
    expect(customerPrintDetailsPatch(EMPTY_PRINT_DETAILS)).toEqual({});
    expect(customerPrintDetailsPatch({ ...EMPTY_PRINT_DETAILS, print_name: "M/s. A" })).toEqual({ print_name: "M/s. A" });
    expect(customerPrintDetailsPatch(kamlapure, kamlapure)).toEqual({});
    expect(customerPrintDetailsPatch({ ...kamlapure, print_state: "" }, kamlapure)).toEqual({ print_state: null });
    expect(isMissingPrintDetailsColumn({ code: "42703", message: "column customers.print_name does not exist" })).toBe(true);
    expect(isMissingPrintDetailsColumn({ message: "permission denied" })).toBe(false);
  });

  it("form section opens on demand and previews what the bill will print", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onChange = vi.fn();
    const draw = (value = EMPTY_PRINT_DETAILS) =>
      act(() =>
        root.render(
          <CustomerPrintDetailsFields value={value} onChange={onChange} customerName="SEARCH NAME" customerAddress="Main address" />,
        ),
      );
    draw();
    expect(host.querySelector("#print-name")).toBeNull();
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Bill preview"]')?.textContent).toContain("SEARCH NAME");
    expect(host.querySelector('[aria-label="Bill preview"]')?.textContent).toContain("Main address");
    draw(kamlapure);
    const preview = host.querySelector('[aria-label="Bill preview"]')?.textContent || "";
    expect(preview).toContain("M/s. R. C. KAMLAPURE");
    expect(preview).toContain("GULBARGA - 585101, Karnataka, INDIA");
    act(() => root.unmount());
  });

  it("every bill path uses it: shared invoice component, each screen, and the online invoice link", () => {
    const wrapper = read("src/components/InvoiceWrapper.tsx");
    expect(wrapper).toContain("customerId?: string | null;");
    expect(wrapper).toContain(".select(CUSTOMER_PRINT_COLUMNS as any)");
    expect(wrapper).toContain("(printDetailsEnabled && printDetailsLoading)");
    // After the loading check every template gets the resolved name.
    const afterLoading = wrapper.slice(wrapper.indexOf("// Get settings - use prop overrides if provided"));
    expect(afterLoading).not.toContain("props.customerName");
    for (const [path, count] of [
      ["src/pages/SalesInvoiceDashboard.tsx", 3],
      ["src/pages/POSDashboard.tsx", 2],
      ["src/pages/POSSales.tsx", 3],
      ["src/pages/SalesInvoice.tsx", 2],
      ["src/pages/DebitNoteDashboard.tsx", 1],
      ["src/pages/QuotationEntry.tsx", 1],
      ["src/pages/DeliveryChallanEntry.tsx", 1],
    ] as const) {
      expect(read(path).split("customerId={").length - 1).toBeGreaterThanOrEqual(count);
    }
    expect(read("src/pages/PublicInvoiceView.tsx")).toContain("customerName: billParty?.customerName ?? sale.customer_name,");
    const edge = read("supabase/functions/get-public-invoice/index.ts");
    expect(edge).toContain(".select('print_name, print_address, print_place, print_pincode, print_state, print_country')");
    // The old gst / transport read is untouched, so it keeps working before the SQL is run.
    expect(edge).toContain(".select('gst_number, transport_details')");
    const customers = read("src/pages/CustomerMaster.tsx");
    expect(customers.match(/<CustomerPrintDetailsFields/g)).toHaveLength(2);
    expect(customers).toContain("...customerPrintDetailsPatch(printDetails, editingPrintDetailsRef.current),");
  });
});
