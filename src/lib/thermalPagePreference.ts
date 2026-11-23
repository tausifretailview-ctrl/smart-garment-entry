/**
 * "Size the print page to the receipt" — a choice for each computer, kept in this browser.
 *
 * Browser printing of a thermal receipt can go two ways, and which one is right depends on
 * the printer and the paper chosen in its driver on that computer:
 *
 *  - Off (default): the page has no set size, so Chrome uses the printer's own paper (an 80 mm
 *    roll) and the receipt starts at the top. Right when the printer's paper is the roll.
 *  - On: the page is sized to the receipt (roll width × receipt height). Right when the
 *    computer's print dialog picks A4 / Letter and the receipt comes out tiny.
 *
 * On a computer whose printer paper is a long roll (e.g. 80 × 297 mm), "on" makes Chrome
 * centre the shorter page on that paper: a blank gap above the receipt (Chirag Men's Wear,
 * 23 Nov 2026). There is no single page size that suits both, and the browser does not tell
 * the page which paper the printer has, so the shop picks per computer.
 */
const KEY = "ezzy_thermal_fit_page_to_receipt";

export function isThermalPageSizedToReceipt(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setThermalPageSizedToReceipt(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the default (printer's paper) stays */
  }
}

export const THERMAL_FIT_PAGE_STORAGE_KEY = KEY;
