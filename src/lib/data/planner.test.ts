import { describe, expect, it } from "vitest";
import {
  defaultTitle,
  entryStateLabel,
  filterEntries,
  groupByDate,
  isRedEntry,
  monthGrid,
  statusForCheque,
  summarize,
  validateEntry,
  type PlannerEntry,
  type PlannerEntryInput,
} from "./planner";

const entry = (over: Partial<PlannerEntry>): PlannerEntry => ({
  id: "e",
  organization_id: "o",
  entry_date: "2026-12-05",
  entry_time: null,
  entry_type: "task",
  title: "Call",
  notes: null,
  customer_id: null,
  supplier_id: null,
  party_name: null,
  amount: null,
  cheque_number: null,
  bank_name: null,
  cheque_status: null,
  priority: "normal",
  status: "pending",
  assigned_employee_ids: [],
  done_at: null,
  created_at: "2026-11-28T10:00:00Z",
  ...over,
});

describe("Calendar - Planner", () => {
  it("lays December 2026 out Monday to Sunday like the printed calendar", () => {
    const weeks = monthGrid(2026, 11);
    expect(weeks).toHaveLength(5);
    // 1 December 2026 is a Tuesday: Monday 30 November leads the first week.
    expect(weeks[0][0]).toEqual({ iso: "2026-11-30", day: 30, inMonth: false });
    expect(weeks[0][1]).toEqual({ iso: "2026-12-01", day: 1, inMonth: true });
    expect(weeks[4][3]).toEqual({ iso: "2026-12-31", day: 31, inMonth: true });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("pending entries are red from their day on; done and future ones are not", () => {
    const today = "2026-12-10";
    expect(isRedEntry(entry({ entry_date: "2026-12-10" }), today)).toBe(true);
    expect(isRedEntry(entry({ entry_date: "2026-12-03" }), today)).toBe(true);
    expect(isRedEntry(entry({ entry_date: "2026-12-11" }), today)).toBe(false);
    expect(isRedEntry(entry({ entry_date: "2026-12-03", status: "done" }), today)).toBe(false);
    expect(entryStateLabel(entry({ entry_date: "2026-12-03" }), today)).toBe("Overdue");
    expect(entryStateLabel(entry({ entry_date: "2026-12-10" }), today)).toBe("Due today");
    expect(entryStateLabel(entry({ entry_type: "cheque", cheque_status: "bounced" }), today)).toBe("Bounced");
  });

  it("a cheque is done when cleared; bounced stays pending to follow up", () => {
    expect(statusForCheque("cleared", "pending")).toBe("done");
    expect(statusForCheque("bounced", "done")).toBe("pending");
    expect(statusForCheque("deposited", "pending")).toBe("pending");
    expect(statusForCheque("cleared", "cancelled")).toBe("cancelled");
  });

  it("a day's list shows red ones first, high priority next, then by time; done last", () => {
    const today = "2026-12-05";
    const list = groupByDate(
      [
        entry({ id: "done", status: "done" }),
        entry({ id: "late", entry_time: "17:00" }),
        entry({ id: "early", entry_time: "09:30" }),
        entry({ id: "high", priority: "high", entry_time: "18:00" }),
      ],
      today,
    ).get("2026-12-05")!;
    expect(list.map((e) => e.id)).toEqual(["high", "early", "late", "done"]);
  });

  it("filters by type, tagged employee and status", () => {
    const all = [
      entry({ id: "a", entry_type: "collection", assigned_employee_ids: ["e1"] }),
      entry({ id: "b", entry_type: "cheque", status: "done" }),
      entry({ id: "c", assigned_employee_ids: ["e1", "e2"] }),
    ];
    expect(filterEntries(all, { employeeId: "e1" }).map((e) => e.id)).toEqual(["a", "c"]);
    expect(filterEntries(all, { type: "cheque" }).map((e) => e.id)).toEqual(["b"]);
    expect(filterEntries(all, { status: "pending" }).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("top cards: due today, overdue, collections to get, cheques to deposit", () => {
    const today = "2026-12-05";
    expect(
      summarize(
        [
          entry({ entry_type: "collection", amount: 25000 }),
          entry({ entry_type: "collection", amount: 5000, entry_date: "2026-12-01" }),
          entry({ entry_type: "collection", amount: 999, status: "done" }),
          entry({ entry_type: "cheque", cheque_status: "received", entry_date: "2026-12-20" }),
          entry({ entry_type: "cheque", cheque_status: "deposited" }),
        ],
        today,
      ),
    ).toEqual({ dueToday: 2, overdue: 1, collectionAmount: 30000, chequesToDeposit: 1 });
  });

  it("form checks and a title from the type and party", () => {
    const ok: PlannerEntryInput = {
      entry_date: "2026-12-05", entry_time: null, entry_type: "task", title: "Visit", notes: null, customer_id: null,
      supplier_id: null, party_name: null, amount: null, cheque_number: null, bank_name: null, cheque_status: null,
      priority: "normal", status: "pending", assigned_employee_ids: [],
    };
    expect(validateEntry(ok)).toBeNull();
    expect(validateEntry({ ...ok, title: "  " })).toBe("Write what is to be done");
    expect(validateEntry({ ...ok, amount: -1 })).toBe("Amount must be 0 or more");
    expect(defaultTitle("collection", "Ramesh Traders")).toBe("Collect payment – Ramesh Traders");
    expect(defaultTitle("cheque", "Ramesh Traders")).toBe("Deposit cheque – Ramesh Traders");
    expect(defaultTitle("task", "Ramesh")).toBe("");
  });
});
