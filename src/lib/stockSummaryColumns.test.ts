import { describe, expect, it } from "vitest";
import { sanitizeHiddenColumns, toggleHiddenColumn } from "./stockSummaryColumns";

describe("sanitizeHiddenColumns", () => {
  it("keeps only known column keys per view", () => {
    expect(
      sanitizeHiddenColumns({ variants: ["opening", "product", "opening", 3], articles: ["status", "stock"] }),
    ).toEqual({ variants: ["opening"], articles: ["status"] });
  });

  it("falls back to nothing hidden for bad input", () => {
    expect(sanitizeHiddenColumns(null)).toEqual({ variants: [], articles: [] });
    expect(sanitizeHiddenColumns("x")).toEqual({ variants: [], articles: [] });
  });
});

describe("toggleHiddenColumn", () => {
  it("hides then shows a column for one view only", () => {
    const hidden = toggleHiddenColumn({ variants: [], articles: [] }, "variants", "opening");
    expect(hidden).toEqual({ variants: ["opening"], articles: [] });
    expect(toggleHiddenColumn(hidden, "variants", "opening")).toEqual({ variants: [], articles: [] });
  });
});
