import { describe, expect, it } from "vitest";
import { ListPageSkeleton, ListTableSkeleton } from "./ListPageSkeleton";
import { FormPageSkeleton } from "./FormPageSkeleton";
import { ReportPageSkeleton } from "./ReportPageSkeleton";

describe("route-shaped page shells", () => {
  it("exports List / Form / Report shells for bucket PRs", () => {
    expect(typeof ListPageSkeleton).toBe("function");
    expect(typeof ListTableSkeleton).toBe("function");
    expect(typeof FormPageSkeleton).toBe("function");
    expect(typeof ReportPageSkeleton).toBe("function");
  });
});
