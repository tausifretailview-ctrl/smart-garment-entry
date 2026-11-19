import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_TRANSPORTER,
  cleanTransporterInput,
  customerTransporterPatch,
  isMissingTransportersTable,
  transporterInvoiceText,
} from "./transporters";
import { getMenuPermissionForPath } from "@/lib/menuPermissions";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Transport Master", () => {
  it("cleans the form: trims, upper-cases GSTIN / vehicle, blanks become empty", () => {
    const out = cleanTransporterInput({
      ...EMPTY_TRANSPORTER,
      transporter_name: "  VRL   Logistics ",
      transporter_gstin: "29aabcv3609c1zj",
      phone: "98450 12345",
      vehicle_number: "mh12ab1234",
      city: "  ",
      pincode: "560 001",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.transporter_name).toBe("VRL Logistics");
    expect(out.value.transporter_gstin).toBe("29AABCV3609C1ZJ");
    expect(out.value.phone).toBe("9845012345");
    expect(out.value.vehicle_number).toBe("MH12AB1234");
    expect(out.value.city).toBeNull();
    expect(out.value.pincode).toBe("560001");
    expect(out.value.transport_mode).toBe("road");
  });

  it("refuses what the database would refuse, with a plain reason", () => {
    const bad = (patch: Partial<typeof EMPTY_TRANSPORTER>) =>
      cleanTransporterInput({ ...EMPTY_TRANSPORTER, transporter_name: "VRL", ...patch });
    expect(cleanTransporterInput(EMPTY_TRANSPORTER)).toEqual({ ok: false, error: "Enter the transporter name" });
    expect(bad({ transporter_gstin: "ABC" })).toMatchObject({ ok: false, error: expect.stringContaining("15") });
    expect(bad({ pincode: "1234" })).toMatchObject({ ok: false, error: "Pincode must be 6 digits" });
    expect(bad({ email: "not-an-email" })).toMatchObject({ ok: false, error: "Check the email address" });
    expect(bad({ phone: "12" })).toMatchObject({ ok: false, error: "Check the phone number" });
  });

  it("fills the invoice transport text from the transporter", () => {
    expect(transporterInvoiceText({ transporter_name: "VRL Logistics", phone: "9845012345", transporter_gstin: "29AABCV3609C1ZJ" })).toBe(
      "VRL Logistics · 9845012345 · GSTIN 29AABCV3609C1ZJ",
    );
    expect(transporterInvoiceText({ transporter_name: "Local Tempo", phone: null, transporter_gstin: null })).toBe("Local Tempo");
  });

  it("sends the customer's transporter only when it changed (works before the SQL is run)", () => {
    expect(customerTransporterPatch("", "")).toEqual({});
    expect(customerTransporterPatch("t1", "t1")).toEqual({});
    expect(customerTransporterPatch("t2", "t1")).toEqual({ transporter_id: "t2" });
    expect(customerTransporterPatch("", "t1")).toEqual({ transporter_id: null });
    expect(isMissingTransportersTable({ code: "PGRST205", message: "Could not find the table 'public.transporters'" })).toBe(true);
    expect(isMissingTransportersTable({ code: "42703", message: 'column customers.transporter_id does not exist' })).toBe(true);
    expect(isMissingTransportersTable({ message: "permission denied" })).toBe(false);
  });

  it("is in the Master menu, opens with Customer Master's right, and is picked in Add Customer", () => {
    expect(getMenuPermissionForPath("/transporters")).toBe("customer_master");
    expect(read("src/components/AppSidebar.tsx")).toContain('<NavLink to="/transporters"');
    expect(read("src/app/AppRoutes.tsx")).toContain('path="transporters"');
    const customers = read("src/pages/CustomerMaster.tsx");
    expect(customers.match(/<TransporterSelect/g)).toHaveLength(2); // desktop and phone forms
    expect(customers).toContain("...customerTransporterPatch(data.transporter_id, editingTransporterRef.current)");
    expect(customers).toContain("transport_details: transporter ? transporterInvoiceText(transporter) : prev.transport_details");
    const sql = read("supabase/migrations/20270507120000_transport_master.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS transporter_id uuid REFERENCES public.transporters(id) ON DELETE SET NULL");
    expect(sql).toContain("REVOKE ALL ON TABLE public.transporters FROM PUBLIC, anon;");
  });
});
