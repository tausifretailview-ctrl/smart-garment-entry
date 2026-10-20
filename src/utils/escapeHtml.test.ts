import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escapeHtml";

describe("escapeHtml", () => {
  it("turns markup into plain text", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("keeps ordinary names readable and handles empty values", () => {
    expect(escapeHtml("Shirt & Tie 'XL'")).toBe("Shirt &amp; Tie &#39;XL&#39;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(499)).toBe("499");
  });
});
