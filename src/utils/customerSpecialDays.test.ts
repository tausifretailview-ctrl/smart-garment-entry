import { describe, expect, it } from "vitest";
import {
  daysUntilNext,
  isMissingSpecialDayColumnError,
  parseMonthDay,
  specialDayWishMessage,
  toDateInputValue,
  upcomingSpecialDays,
} from "./customerSpecialDays";

const today = new Date(2026, 9, 20); // 20 Oct 2026

describe("customer birthdays and anniversaries", () => {
  it("reads day and month from a stored date", () => {
    expect(parseMonthDay("1990-10-20")).toEqual({ month: 10, day: 20 });
    expect(parseMonthDay("1990-10-20T00:00:00+00:00")).toEqual({ month: 10, day: 20 });
    expect(parseMonthDay("")).toBeNull();
    expect(parseMonthDay(null)).toBeNull();
    expect(parseMonthDay("20/10/1990")).toBeNull();
  });

  it("counts days to the next one, wrapping into next year", () => {
    expect(daysUntilNext("1990-10-20", today)).toBe(0);
    expect(daysUntilNext("1985-10-21", today)).toBe(1);
    expect(daysUntilNext("2000-10-19", today)).toBe(364);
    expect(daysUntilNext("2001-01-01", today)).toBe(73);
    expect(daysUntilNext(null, today)).toBeNull();
  });

  it("wishes 29 Feb birthdays on 28 Feb in normal years", () => {
    expect(daysUntilNext("2000-02-29", new Date(2027, 1, 28))).toBe(0);
    expect(daysUntilNext("2000-02-29", new Date(2028, 1, 28))).toBe(1);
  });

  it("lists today first, then soonest, inside the window", () => {
    const rows = upcomingSpecialDays(
      [
        { id: "a", customer_name: "ZOYA", phone: "9876543210", birthday: "1995-10-25" },
        { id: "b", customer_name: "AMIT", phone: "9876543211", anniversary: "2015-10-20", birthday: "1990-03-01" },
        { id: "c", customer_name: "RAVI", phone: null, birthday: "1992-12-25" },
      ],
      today,
      7,
    );
    expect(rows.map((r) => `${r.customer.id}:${r.kind}:${r.daysAway}`)).toEqual(["b:anniversary:0", "a:birthday:5"]);
    expect(rows[1].on.getDate()).toBe(25);
    expect(upcomingSpecialDays([{ id: "a", customer_name: "X", phone: null, birthday: "1995-10-25" }], today, 0)).toEqual([]);
  });

  it("writes a friendly wish with the shop name", () => {
    expect(specialDayWishMessage("birthday", "RAHUL SHARMA", "KS Footwear")).toBe(
      "Happy Birthday Rahul Sharma! 🎂🎉\n\nWarm wishes from KS Footwear. Visit us this week for a special gift on your shopping!",
    );
    expect(specialDayWishMessage("anniversary", "Walk-in Customer", null)).toBe("Happy Anniversary! 💐🎉");
  });

  it("keeps only valid date input values", () => {
    expect(toDateInputValue("1990-10-20T00:00:00Z")).toBe("1990-10-20");
    expect(toDateInputValue("")).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
  });

  it("spots the missing-column error before the SQL is run", () => {
    expect(isMissingSpecialDayColumnError({ code: "42703", message: "column customers.birthday does not exist" })).toBe(true);
    expect(isMissingSpecialDayColumnError({ code: "PGRST204", message: "Could not find the 'birthday' column" })).toBe(true);
    expect(isMissingSpecialDayColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});
