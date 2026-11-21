import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fieldSalesCapacitorConfig, fieldSalesStartUrl } from "../../scripts/android-field-sales-config.mjs";

/** Field Sales Android app: own app id, opens the salesman app, orange chrome. */
describe("Field Sales Android config", () => {
  const owner = {
    appId: "com.ezzyerp.app",
    appName: "EzzyERP",
    server: { url: "https://app.inventoryshop.in", androidScheme: "https", allowNavigation: ["app.inventoryshop.in"] },
    plugins: { SplashScreen: { backgroundColor: "#1857A6", launchAutoHide: false }, StatusBar: { backgroundColor: "#1857A6", style: "LIGHT" } },
  };

  it("opens the salesman app for any shop, or one shop's Field Sales login", () => {
    expect(fieldSalesStartUrl("https://app.inventoryshop.in")).toBe("https://app.inventoryshop.in/?app=fieldsales");
    expect(fieldSalesStartUrl("https://app.inventoryshop.in/ella-noor", "Ella-Noor")).toBe(
      "https://app.inventoryshop.in/ella-noor/field-sales?app=fieldsales",
    );
  });

  it("keeps the owner settings and changes only id, name, start page and colours", () => {
    const cfg = fieldSalesCapacitorConfig(owner);
    expect(cfg.appId).toBe("com.ezzyerp.app.fieldsales");
    expect(cfg.appName).toBe("Field Sales");
    expect(cfg.server).toEqual({ ...owner.server, url: "https://app.inventoryshop.in/?app=fieldsales" });
    expect(cfg.plugins.SplashScreen).toEqual({ backgroundColor: "#F97316", launchAutoHide: false });
    expect(cfg.plugins.StatusBar).toEqual({ backgroundColor: "#F97316", style: "LIGHT" });
    expect(owner.appId).toBe("com.ezzyerp.app"); // input untouched
  });

  it("the app flavor exists in Gradle with its own application id", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(gradle).toMatch(/fieldsales\s*\{[^}]*applicationIdSuffix "\.fieldsales"/);
    expect(readFileSync("android/app/src/fieldsales/res/values/strings.xml", "utf8")).toContain(">Field Sales<");
  });
});
