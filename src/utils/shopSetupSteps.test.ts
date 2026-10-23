import { describe, expect, it } from "vitest";
import { buildShopSetupSteps, setupProgress, type ShopSetupFacts } from "./shopSetupSteps";

const blank: ShopSetupFacts = {
  hasShopDetails: false,
  hasBillFormat: false,
  products: 0,
  customers: 0,
  sales: 0,
  members: 1,
  whatsappOn: false,
};

describe("shop setup steps", () => {
  it("starts at 0% with the first bill as the last step", () => {
    const steps = buildShopSetupSteps(blank);
    expect(setupProgress(steps)).toEqual({ done: 0, total: 7, percent: 0 });
    expect(steps[0].id).toBe("details");
    expect(steps[steps.length - 1].id).toBe("first-bill");
  });

  it("counts the owner alone as no staff, and ticks steps from live counts", () => {
    const steps = buildShopSetupSteps({ ...blank, hasShopDetails: true, products: 12, members: 2, sales: 1 });
    const done = steps.filter((s) => s.done).map((s) => s.id);
    expect(done).toEqual(["details", "products", "staff", "first-bill"]);
    expect(setupProgress(steps).percent).toBe(57);
  });

  it("opens Settings on the right tab", () => {
    const bill = buildShopSetupSteps(blank).find((s) => s.id === "bill");
    expect(bill?.path).toBe("/settings");
    expect(bill?.state).toEqual({ settingsTab: "pos" });
  });
});
