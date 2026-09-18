/** @vitest-environment jsdom */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { handleEnterAsTab } from "./utils";

function enterEvent(target: HTMLElement) {
  const preventDefault = vi.fn();
  const event = {
    key: "Enter",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target,
    preventDefault,
  } as unknown as ReactKeyboardEvent;
  return { event, preventDefault };
}

describe("handleEnterAsTab", () => {
  it("moves focus to the next field inside data-entry-form", () => {
    const root = document.createElement("div");
    root.setAttribute("data-entry-form", "");
    const first = document.createElement("input");
    first.id = "product_name";
    const second = document.createElement("input");
    second.id = "category";
    root.append(first, second);
    document.body.append(root);
    first.focus();

    const { event, preventDefault } = enterEvent(first);
    handleEnterAsTab(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(second);
    root.remove();
  });

  it("advances from a combobox trigger to the next input", () => {
    const root = document.createElement("div");
    root.setAttribute("data-entry-form", "");
    const combo = document.createElement("button");
    combo.setAttribute("role", "combobox");
    combo.type = "button";
    const next = document.createElement("input");
    root.append(combo, next);
    document.body.append(root);

    const { event, preventDefault } = enterEvent(combo);
    handleEnterAsTab(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    root.remove();
  });

  it("does not steal Enter from a regular button (Save Product)", () => {
    const root = document.createElement("div");
    root.setAttribute("data-entry-form", "");
    const input = document.createElement("input");
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save Product";
    root.append(input, save);
    document.body.append(root);

    const { event, preventDefault } = enterEvent(save);
    handleEnterAsTab(event);

    expect(preventDefault).not.toHaveBeenCalled();
    root.remove();
  });
});
