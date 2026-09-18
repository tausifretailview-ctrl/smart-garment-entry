import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MASEERA_BUGGY_BANNER,
  MASEERA_UNCLAIMED,
  SR_159_NET,
  buildMaseeraLedgerDb,
  fetchMaseeraLedger,
} from "../helpers/maseeraLedgerFixture";
import {
  buildCreditNoteSrRegisterRows,
  creditNoteSrRegisterCsvHeader,
  creditNoteSrRegisterCsvRow,
  filterCreditNoteSrRegisterRows,
} from "@/utils/creditNoteSrRegister";
import { saleReturnConsumedForRemaining } from "@/utils/customerLedgerSaleReturnBalance";

const here = dirname(fileURLToPath(import.meta.url));

function maseeraSource() {
  const db = buildMaseeraLedgerDb();
  return {
    saleReturns: db.sale_returns,
    customersById: {
      [db.customers[0].id]: { customer_name: "MASEERA", phone: "9632982953" },
    },
    salesById: Object.fromEntries(
      db.sales.map((s) => [
        s.id,
        { sale_number: s.sale_number, sale_return_adjust: s.sale_return_adjust },
      ]),
    ),
    creditNotesById: Object.fromEntries(
      db.credit_notes.map((c) => [
        c.id,
        { credit_note_number: c.credit_note_number, credit_amount: c.credit_amount },
      ]),
    ),
    vouchers: db.voucher_entries,
  };
}

describe("CN / S-R Adjustment Register — Phase 1 remaining", () => {
  it("does not read remaining_cn_amt (full-linked SRA)", () => {
    const src = readFileSync(
      join(here, "../../src/utils/creditNoteSrRegister.ts"),
      "utf8",
    );
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(withoutComments).toContain("saleReturnConsumedForRemaining");
    expect(withoutComments).toContain("allocateCnAdjustmentsToSaleReturns");
    expect(withoutComments).not.toContain("remaining_cn_amt");
  });

  it("MASEERA: SR/159 memo remaining 0; SR/160 remaining ₹4,150; CN date 18/09", () => {
    const rows = buildCreditNoteSrRegisterRows(maseeraSource());
    const sr159 = rows.find((r) => r.returnNumber === "SR/26-27/159");
    const sr160 = rows.find((r) => r.returnNumber === "SR/26-27/160");
    expect(sr159?.remainingAmount).toBe(0);
    expect(sr159?.isMemo).toBe(true);
    expect(sr159?.statusLabel).toBe("S/R Adjusted in Invoice");
    expect(sr159?.consumedAmount).toBe(SR_159_NET);
    expect(sr160?.remainingAmount).toBe(MASEERA_UNCLAIMED);
    expect(sr160?.remainingAmount).not.toBe(MASEERA_BUGGY_BANNER);
    expect(sr160?.appliedAmount).toBe(9_700);
    expect(sr160?.appliedToInvoices).toBe("INV/26-27/3123");
    expect(sr160?.cnAppliedDate).toBe("2026-09-18");
    expect(sr160?.statusLabel).toBe("CN Partially Applied to Invoice(s)");
  });

  it("hides settled/memo rows until Show settled is on", () => {
    const rows = buildCreditNoteSrRegisterRows(maseeraSource());
    const pending = filterCreditNoteSrRegisterRows(rows, { showSettled: false });
    expect(pending.map((r) => r.returnNumber)).toEqual(["SR/26-27/160"]);
    const all = filterCreditNoteSrRegisterRows(rows, { showSettled: true });
    expect(all.map((r) => r.returnNumber)).toEqual(["SR/26-27/159", "SR/26-27/160"]);
  });

  it("filters CN applied date from voucher_date, not sale created_at", () => {
    const rows = buildCreditNoteSrRegisterRows({
      saleReturns: [
        {
          id: "sr-1",
          return_number: "SR/1",
          return_date: "2026-09-01",
          customer_id: "c1",
          net_amount: 1000,
          credit_status: "adjusted",
          linked_sale_id: "inv-old",
        },
      ],
      customersById: { c1: { customer_name: "DATE TEST", phone: "" } },
      salesById: { "inv-old": { sale_number: "INV/26-27/1", sale_return_adjust: 1000 } },
      creditNotesById: {},
      vouchers: [
        {
          voucher_type: "receipt",
          payment_method: "credit_note_adjustment",
          reference_id: "inv-old",
          total_amount: 1000,
          voucher_date: "2026-09-10",
          created_at: "2026-09-10T14:00:00.000Z",
        },
      ],
    });
    expect(rows[0].cnAppliedDate).toBe("2026-09-10");
    expect(rows[0].returnDate).toBe("2026-09-01");
    expect(
      filterCreditNoteSrRegisterRows(rows, {
        fromDate: "2026-09-10",
        toDate: "2026-09-10",
        dateBasis: "return_date",
        showSettled: true,
      }),
    ).toHaveLength(0);
    expect(
      filterCreditNoteSrRegisterRows(rows, {
        fromDate: "2026-09-10",
        toDate: "2026-09-10",
        dateBasis: "cn_applied",
        showSettled: true,
      }),
    ).toHaveLength(1);
  });

  it("SADAF / AMRIN / Shaista remaining match live FIFO lock", () => {
    const sadaf = buildCreditNoteSrRegisterRows({
      saleReturns: [
        {
          id: "79",
          return_number: "SR/26-27/79",
          return_date: "2026-06-18",
          created_at: "2026-06-18T12:36:06Z",
          customer_id: "sadaf",
          net_amount: 3800,
          credit_status: "adjusted",
          linked_sale_id: "2988",
        },
        {
          id: "152",
          return_number: "SR/26-27/152",
          return_date: "2026-09-06",
          created_at: "2026-09-06T10:46:20Z",
          customer_id: "sadaf",
          net_amount: 2700,
          credit_status: "adjusted",
          linked_sale_id: "2988",
        },
      ],
      customersById: { sadaf: { customer_name: "DR.SADAF GODIL", phone: "" } },
      salesById: {
        "2971": { sale_number: "INV/26-27/2971", sale_return_adjust: 2700 },
        "2988": { sale_number: "INV/26-27/2988", sale_return_adjust: 3800 },
      },
      creditNotesById: {},
      vouchers: [
        {
          voucher_type: "receipt",
          payment_method: "credit_note_adjustment",
          reference_id: "2971",
          total_amount: 2700,
          voucher_date: "2026-09-06",
        },
        {
          voucher_type: "receipt",
          payment_method: "credit_note_adjustment",
          reference_id: "2988",
          total_amount: 3800,
          voucher_date: "2026-06-18",
        },
      ],
    });
    expect(sadaf.find((r) => r.id === "79")?.remainingAmount).toBe(0);
    expect(sadaf.find((r) => r.id === "152")?.remainingAmount).toBe(0);
    expect(sadaf.find((r) => r.id === "152")?.appliedToInvoices).toBe("INV/26-27/2971");

    const amrin = buildCreditNoteSrRegisterRows({
      saleReturns: [
        {
          id: "59",
          return_number: "SR/26-27/59",
          return_date: "2026-05-30",
          created_at: "2026-05-30T07:34:46Z",
          customer_id: "amrin",
          net_amount: 3450,
          credit_status: "adjusted",
          linked_sale_id: "1324",
        },
        {
          id: "97",
          return_number: "SR/26-27/97",
          return_date: "2026-07-01",
          created_at: "2026-07-01T06:37:00Z",
          customer_id: "amrin",
          net_amount: 1950,
          credit_status: "adjusted",
          linked_sale_id: "1324",
        },
      ],
      customersById: { amrin: { customer_name: "AMRIN BAIG", phone: "" } },
      salesById: {
        "1052": { sale_number: "INV/26-27/1052", sale_return_adjust: 1950 },
        "1324": { sale_number: "INV/26-27/1324", sale_return_adjust: 3450 },
      },
      creditNotesById: {},
      vouchers: [
        {
          voucher_type: "receipt",
          payment_method: "credit_note_adjustment",
          reference_id: "1052",
          total_amount: 1950,
          voucher_date: "2026-07-01",
        },
        {
          voucher_type: "receipt",
          payment_method: "credit_note_adjustment",
          reference_id: "1324",
          total_amount: 3450,
          voucher_date: "2026-05-30",
        },
      ],
    });
    expect(amrin.find((r) => r.id === "59")?.remainingAmount).toBe(0);
    expect(amrin.find((r) => r.id === "97")?.remainingAmount).toBe(0);

    const shaista = buildCreditNoteSrRegisterRows({
      saleReturns: [
        {
          id: "129",
          return_number: "SR/26-27/129",
          return_date: "2026-08-12",
          created_at: "2026-08-12T14:55:13Z",
          customer_id: "shaista",
          net_amount: 7550,
          credit_status: "adjusted",
          linked_sale_id: "2676",
        },
        {
          id: "130",
          return_number: "SR/26-27/130",
          return_date: "2026-08-12",
          created_at: "2026-08-12T14:55:54Z",
          customer_id: "shaista",
          net_amount: 5450,
          credit_status: "partially_adjusted",
          linked_sale_id: "2676",
        },
      ],
      customersById: { shaista: { customer_name: "Shaista Arif Reshmawala", phone: "" } },
      salesById: { "2676": { sale_number: "INV/26-27/2676", sale_return_adjust: 12750 } },
      creditNotesById: {},
      vouchers: [
        {
          voucher_type: "receipt",
          payment_method: "credit_note_adjustment",
          reference_id: "2676",
          total_amount: 12750,
          voucher_date: "2026-08-12",
        },
      ],
    });
    expect(shaista.find((r) => r.id === "129")?.remainingAmount).toBe(0);
    expect(shaista.find((r) => r.id === "130")?.remainingAmount).toBe(250);
    expect(
      filterCreditNoteSrRegisterRows(shaista, { showSettled: false }).map((r) => r.id),
    ).toEqual(["130"]);
  });

  it("searches customer name/phone and exports the on-screen columns", () => {
    const rows = buildCreditNoteSrRegisterRows(maseeraSource());
    expect(filterCreditNoteSrRegisterRows(rows, { customerQuery: "maseera", showSettled: true })).toHaveLength(2);
    expect(filterCreditNoteSrRegisterRows(rows, { customerQuery: "9632982953", showSettled: true })).toHaveLength(2);
    expect(filterCreditNoteSrRegisterRows(rows, { customerQuery: "nobody", showSettled: true })).toHaveLength(0);
    const header = creditNoteSrRegisterCsvHeader();
    const line = creditNoteSrRegisterCsvRow(rows.find((r) => r.returnNumber === "SR/26-27/160")!);
    expect(header).toContain("Remaining / Pending");
    expect(line[header.indexOf("Remaining / Pending")]).toBe("4150.00");
    expect(line[header.indexOf("CN Applied Date")]).toBe("2026-09-18");
  });

  it("register remaining matches saleReturnConsumedForRemaining directly", () => {
    expect(
      saleReturnConsumedForRemaining({
        allocatedAmount: 9700,
        absorbedOnLinkedInvoice: 10700,
        linkedSaleCnVoucherTotal: 10700,
      }),
    ).toBe(9700);
  });

  it("MASEERA register remaining matches ledger remaining (same helpers)", async () => {
    const ledger = await fetchMaseeraLedger();
    const rows = buildCreditNoteSrRegisterRows(maseeraSource());
    const sr159Ledger = ledger.find((r) => r.reference === "SR/26-27/159" && r.type === "return");
    const sr160Ledger = ledger.find((r) => r.reference === "SR/26-27/160" && r.type === "return");
    const sr159 = rows.find((r) => r.returnNumber === "SR/26-27/159");
    const sr160 = rows.find((r) => r.returnNumber === "SR/26-27/160");
    expect(sr159Ledger?.informational).toBe(true);
    expect(sr159Ledger?.credit).toBe(0);
    expect(sr159?.remainingAmount).toBe(sr159Ledger?.credit);
    expect(sr159?.isMemo).toBe(true);
    expect(sr160Ledger?.informational).not.toBe(true);
    expect(sr160?.remainingAmount).toBe(sr160Ledger?.credit);
    expect(sr160?.remainingAmount).toBe(MASEERA_UNCLAIMED);
  });

  it("page and fetch reuse the register builder — never remaining_cn_amt", () => {
    const page = readFileSync(
      join(here, "../../src/pages/CreditNoteSrAdjustmentRegister.tsx"),
      "utf8",
    );
    const data = readFileSync(
      join(here, "../../src/utils/creditNoteSrRegisterData.ts"),
      "utf8",
    );
    expect(page).toContain("buildCreditNoteSrRegisterRows");
    expect(page).not.toContain("remaining_cn_amt");
    expect(data).not.toContain("remaining_cn_amt");
  });
});
