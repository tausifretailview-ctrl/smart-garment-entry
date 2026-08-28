import { describe, expect, it } from "vitest";
import { tabLoadMessage } from "./tabLoadLabels";

describe("tabLoadMessage", () => {
  it("returns named label for high-traffic routes", () => {
    expect(tabLoadMessage("customers", "page")).toBe("Opening Customers…");
    expect(tabLoadMessage("accounts-payments", "dashboard")).toBe("Opening Payments…");
    expect(tabLoadMessage("settings", "dashboard")).toBe("Opening Settings…");
  });

  it("falls back to shell-specific generic copy", () => {
    expect(tabLoadMessage("unknown-route", "entry")).toBe("Loading bill screen…");
    expect(tabLoadMessage("unknown-route", "dashboard")).toBe("Loading dashboard…");
    expect(tabLoadMessage("unknown-route", "page")).toBe("Loading page…");
  });
});
