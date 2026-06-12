import type { WheelEvent as ReactWheelEvent } from "react";

function isVerticallyScrollable(el: HTMLElement): boolean {
  const { overflowY } = window.getComputedStyle(el);
  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    el.scrollHeight > el.clientHeight + 1
  );
}

/**
 * Route wheel delta to this overflow container and block parent panes from stealing scroll
 * (Electron WebView + nested `data-tab-scroll` / Accounts / dashboard layouts).
 */
export function onWheelScrollContainer(
  event: ReactWheelEvent<HTMLElement> | WheelEvent,
): void {
  if ("ctrlKey" in event && (event.ctrlKey || event.metaKey)) return;

  const el = event.currentTarget as HTMLElement;
  if (!isVerticallyScrollable(el)) return;

  const maxTop = el.scrollHeight - el.clientHeight;
  const nextTop = Math.min(maxTop, Math.max(0, el.scrollTop + event.deltaY));

  if (nextTop !== el.scrollTop) {
    el.scrollTop = nextTop;
    event.preventDefault();
  }
  event.stopPropagation();
}

/** Nearest scrollable ancestor of the event target (for portaled popovers). */
export function findScrollableAncestor(start: EventTarget | null): HTMLElement | null {
  let node = start as HTMLElement | null;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement && isVerticallyScrollable(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

let globalWheelFixInstalled = false;

/**
 * Desktop fallback: when the hovered overflow region should scroll but the WebView
 * scrolls a parent instead, apply delta to the innermost scrollable element.
 */
export function initScrollWheelFix(): void {
  if (typeof window === "undefined" || globalWheelFixInstalled) return;
  globalWheelFixInstalled = true;

  document.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || event.metaKey) return;

      const scrollable = findScrollableAncestor(event.target);
      if (!scrollable) return;

      const maxTop = scrollable.scrollHeight - scrollable.clientHeight;
      const nextTop = Math.min(
        maxTop,
        Math.max(0, scrollable.scrollTop + event.deltaY),
      );

      if (nextTop === scrollable.scrollTop) {
        event.stopPropagation();
        return;
      }

      scrollable.scrollTop = nextTop;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, passive: false },
  );
}
