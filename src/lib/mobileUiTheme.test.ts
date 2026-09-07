/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { getMobileUiTheme, MOBILE_UI_THEME_KEY, setMobileUiTheme } from "./mobileUiTheme";

describe("mobile UI theme", () => {
  afterEach(() => {
    localStorage.removeItem(MOBILE_UI_THEME_KEY);
  });

  it("defaults to classic when nothing is stored", () => {
    expect(getMobileUiTheme()).toBe("classic");
  });

  it("only returns premium when that exact value is stored", () => {
    localStorage.setItem(MOBILE_UI_THEME_KEY, "dark");
    expect(getMobileUiTheme()).toBe("classic");
    setMobileUiTheme("premium");
    expect(getMobileUiTheme()).toBe("premium");
    setMobileUiTheme("classic");
    expect(getMobileUiTheme()).toBe("classic");
  });
});
