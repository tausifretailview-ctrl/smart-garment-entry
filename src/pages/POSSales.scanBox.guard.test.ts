import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * POS scan box (speed review item S3): a key typed in the box must not set screen state, or
 * the whole 10,000-line POS screen and its hidden invoice copy redraw once per character of
 * every scan. Behaviour is covered in e2e/pos-scan-box.spec.ts; this keeps the wiring.
 */
const source = readFileSync("src/pages/POSSales.tsx", "utf8");
const between = (start: string, end: string) => {
  const a = source.indexOf(start);
  expect(a, start).toBeGreaterThan(-1);
  const b = source.indexOf(end, a);
  expect(b, end).toBeGreaterThan(a);
  return source.slice(a, b);
};

describe("POS scan box does not redraw the screen per key", () => {
  it("the typing handler only notes the text (delivered after a pause)", () => {
    const handler = between("const handleBarcodeInputChange = useCallback(", "}, [recordKeystroke");
    expect(handler).toContain("noteScanBoxTyped(value)");
    expect(handler).not.toMatch(/setSearchInput(State)?\(value\)/);
    // An empty list is kept as the same array, so the first character does not redraw either.
    expect(handler).toContain("prev.length === 0 ? prev : []");
  });

  it("the desktop box is not driven by the state", () => {
    const box = between("ref={barcodeInputRef}", "onBlur={handleBarcodeInputBlur}");
    expect(box).toContain("defaultValue={searchInput}");
    expect(box).not.toMatch(/\bvalue=\{searchInput\}/);
  });

  it("code that sets the text sets the box too and drops a pending typing update", () => {
    const setter = between("const setSearchInput = useCallback(", "const noteScanBoxTyped");
    expect(setter).toContain("clearTimeout(scanBoxSettleTimerRef.current)");
    expect(setter).toContain("box.value = value");
    expect(setter).toContain("setSearchInputState(value)");
  });

  it("Enter reads the box itself, never the delayed state alone", () => {
    expect(between("const handleSearch = useCallback(", "clearPosBarcodeSubmitTimers();")).toContain("?.value?.trim()");
    expect(between("const handlePosBarcodeSubmit = useCallback(", "if (!rawValue) return;")).toContain(
      "barcodeInputRef.current?.value?.trim()",
    );
  });
});
