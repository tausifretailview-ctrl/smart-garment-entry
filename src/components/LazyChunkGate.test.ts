/**
 * @vitest-environment jsdom
 */
import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyChunkGate } from "./LazyChunkGate";

function Hello() {
  return createElement("div", { "data-loaded": "1" }, "invoice-ready");
}

describe("LazyChunkGate", () => {
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
  });

  function render(node: ReturnType<typeof createElement>) {
    act(() => {
      root.render(node);
    });
  }

  it("shows an explicit loading state and does not render the child while the import is in flight", async () => {
    let resolve: (value: { default: ComponentType<object> }) => void = () => {};
    const pending = new Promise<{ default: ComponentType<object> }>((r) => {
      resolve = r;
    });

    render(
      createElement(LazyChunkGate, {
        variant: "inline",
        loader: () => pending,
        componentProps: {},
        title: "Invoice preview",
        loadingMessage: "Loading invoice layout…",
        timeoutMs: 60_000,
      }),
    );

    expect(container.querySelector("[data-lazy-chunk-loading]")).toBeTruthy();
    expect(container.textContent).toContain("Loading invoice layout…");
    expect(container.querySelector("[data-loaded]")).toBeNull();
    expect(container.querySelector("[data-lazy-chunk-error]")).toBeNull();

    await act(async () => {
      resolve({ default: Hello });
      await pending;
      await Promise.resolve();
    });

    expect(container.querySelector("[data-loaded]")).toBeTruthy();
    expect(container.textContent).toContain("invoice-ready");
    expect(container.querySelector("[data-lazy-chunk-loading]")).toBeNull();
  });

  it("shows Retry after a failed import and recovers when Retry remounts a new lazy factory", async () => {
    let calls = 0;
    const loader = () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("stale hashed chunk"));
      return Promise.resolve({ default: Hello });
    };

    render(
      createElement(LazyChunkGate, {
        variant: "inline",
        loader,
        componentProps: {},
        title: "Invoice preview",
        loadingMessage: "Loading invoice layout…",
        errorTitle: "Could not load invoice preview",
        timeoutMs: 60_000,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector("[data-lazy-chunk-error]")).toBeTruthy();
    expect(container.textContent).toContain("Could not load invoice preview");
    expect(container.textContent).toContain("Retry");
    expect(container.querySelector("[data-loaded]")).toBeNull();
    expect(calls).toBe(1);

    const retry = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Retry");
    expect(retry).toBeTruthy();

    await act(async () => {
      retry!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toBe(2);
    expect(container.querySelector("[data-loaded]")).toBeTruthy();
    expect(container.textContent).toContain("invoice-ready");
    expect(container.querySelector("[data-lazy-chunk-error]")).toBeNull();
  });

  it("keeps the in-flight import after UI timeout so a late chunk still opens", async () => {
    let resolve: (value: { default: ComponentType<object> }) => void = () => {};
    const pending = new Promise<{ default: ComponentType<object> }>((r) => {
      resolve = r;
    });

    render(
      createElement(LazyChunkGate, {
        variant: "inline",
        loader: () => pending,
        componentProps: {},
        title: "Size-wise stock",
        loadingMessage: "Loading size stock…",
        errorTitle: "Could not open size stock",
        timeoutMs: 40,
      }),
    );

    expect(container.querySelector("[data-lazy-chunk-loading]")).toBeTruthy();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(container.querySelector("[data-lazy-chunk-error]")).toBeTruthy();
    expect(container.textContent).toContain("Could not open size stock");
    expect(container.querySelector("[data-loaded]")).toBeNull();

    await act(async () => {
      resolve({ default: Hello });
      await pending;
      await Promise.resolve();
    });

    expect(container.querySelector("[data-loaded]")).toBeTruthy();
    expect(container.textContent).toContain("invoice-ready");
    expect(container.querySelector("[data-lazy-chunk-error]")).toBeNull();
  });
});
