/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SizeStockDialog } from "./SizeStockDialog";

vi.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: null }),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, node);
}

describe("SizeStockDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("opens the size-wise stock report chrome, not the lazy-chunk gate", () => {
    act(() => {
      root.render(
        wrap(createElement(SizeStockDialog, { open: true, onOpenChange: () => {} })),
      );
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("Size Stock");
    expect(text).toContain("Search products...");
    expect(text).not.toContain("Could not open size stock");
    expect(text).not.toContain("Loading size stock");
  });
});
