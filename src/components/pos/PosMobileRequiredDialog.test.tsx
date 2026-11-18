/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosMobileRequiredDialog } from "./PosMobileRequiredDialog";
import { isValidPosMobile, normalizePosMobile, posBillNeedsMobile } from "@/utils/posRequiredMobile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("POS mobile number compulsory: rules", () => {
  it("accepts a 10-digit Indian mobile, with or without +91 / 0", () => {
    expect(isValidPosMobile("9876543210")).toBe(true);
    expect(isValidPosMobile("+91 98765 43210")).toBe(true);
    expect(isValidPosMobile("09876543210")).toBe(true);
    expect(normalizePosMobile("+91-98765-43210")).toBe("9876543210");
    expect(isValidPosMobile("12345")).toBe(false);
    expect(isValidPosMobile("1234567890")).toBe(false);
    expect(isValidPosMobile("")).toBe(false);
  });

  it("only asks when the setting is on and the bill has no valid mobile (default off)", () => {
    expect(posBillNeedsMobile({}, "")).toBe(false);
    expect(posBillNeedsMobile(undefined, "")).toBe(false);
    expect(posBillNeedsMobile({ pos_require_customer_mobile: true }, "")).toBe(true);
    expect(posBillNeedsMobile({ pos_require_customer_mobile: true }, "98765")).toBe(true);
    expect(posBillNeedsMobile({ pos_require_customer_mobile: true }, "9876543210")).toBe(false);
  });
});

describe("PosMobileRequiredDialog", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  const render = (onSubmit = vi.fn()) => {
    act(() => {
      root.render(<PosMobileRequiredDialog open initialPhone="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    });
    return onSubmit;
  };

  const type = (value: string) => {
    const input = document.body.querySelector("input[type=tel]") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const submit = () => {
    const form = document.body.querySelector("form") as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  };

  it("does not save with a short number and says why", () => {
    const onSubmit = render();
    type("98765");
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Enter a valid 10-digit mobile number.");
  });

  it("saves with the 10-digit mobile", () => {
    const onSubmit = render();
    type("+919876543210");
    submit();
    expect(onSubmit).toHaveBeenCalledWith("9876543210");
  });
});

describe("POS asks for the mobile on every save path", () => {
  const pos = readFileSync(join(process.cwd(), "src/pages/POSSales.tsx"), "utf8");
  const form = readFileSync(join(process.cwd(), "src/components/settings/PosSettingsForm.tsx"), "utf8");

  it("is a POS setting, off unless switched on", () => {
    expect(form).toContain('id="pos_require_customer_mobile"');
    expect(form).toContain("checked={sale.pos_require_customer_mobile === true}");
  });

  it("checks before Cash / UPI / Card / Credit, plain Save and Mix", () => {
    expect(pos).toContain('!ensurePosMobile({ kind: "pay", method, opts })');
    expect(pos).toContain('if (!ensurePosMobile({ kind: "save", forcePaymentMethod })) return;');
    expect(pos).toContain('if (!ensurePosMobile({ kind: "mix" })) return;');
    expect(pos.match(/\{mobileRequiredDialog\}/g)?.length).toBe(3);
  });

  it("also asks on the phone billing screen, then saves with the payment mode already chosen", () => {
    const phone = readFileSync(join(process.cwd(), "src/pages/mobile/MobilePosBilling.tsx"), "utf8");
    // Every payment (one-tap, payment sheet, mix) goes through runSave, which checks first.
    const runSave = phone.slice(phone.indexOf("const runSave = async ("), phone.indexOf("const toggleFastPicks"));
    expect(runSave).toContain("posBillNeedsMobile(saleSettings as { pos_require_customer_mobile?: boolean }, billPhone)");
    expect(runSave.indexOf("posBillNeedsMobile(")).toBeLessThan(runSave.indexOf("saveLockRef.current = true;"));
    // The typed mobile is what the bill is saved with.
    expect(runSave).toContain("customerPhone: billPhone,");
    expect(phone).toContain("if (waiting) void runSave(waiting.method, waiting.breakdown, mobile);");
    expect(phone).toContain("<PosMobileRequiredDialog");
  });
});
