import { useCallback, useRef, useState } from "react";

const DEFAULT_THRESHOLD = 80;

function isScrollContainerAtTop(el: HTMLElement | null | undefined): boolean {
  if (el) {
    if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 2) {
      return false;
    }
    return true;
  }
  const main = typeof document !== "undefined" ? document.querySelector("main") : null;
  if (main && main.scrollHeight > main.clientHeight + 1 && main.scrollTop > 2) {
    return false;
  }
  if (typeof window !== "undefined" && window.scrollY > 2) {
    return false;
  }
  return true;
}

export interface UsePullToRefreshOptions {
  /** Minimum downward pull in px to trigger refresh */
  threshold?: number;
  disabled?: boolean;
  /** Delay before hiding the spinner (ms) */
  minSpinnerMs?: number;
}

export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  options: UsePullToRefreshOptions = {}
) {
  const { threshold = DEFAULT_THRESHOLD, disabled = false, minSpinnerMs = 400 } = options;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const canPull = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const runRefresh = useCallback(async () => {
    if (disabled || isRefreshing) return;
    setIsRefreshing(true);
    const started = Date.now();
    try {
      await onRefreshRef.current();
    } finally {
      const elapsed = Date.now() - started;
      const wait = Math.max(0, minSpinnerMs - elapsed);
      window.setTimeout(() => setIsRefreshing(false), wait);
    }
  }, [disabled, isRefreshing, minSpinnerMs]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      touchStartY.current = e.touches[0].clientY;
      canPull.current = isScrollContainerAtTop(scrollRef.current);
    },
    [disabled]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !canPull.current) return;
      const diff = e.changedTouches[0].clientY - touchStartY.current;
      if (diff > threshold && isScrollContainerAtTop(scrollRef.current)) {
        void runRefresh();
      }
      canPull.current = false;
    },
    [disabled, threshold, runRefresh]
  );

  const pullHandlers = {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };

  return {
    scrollRef,
    isRefreshing,
    pullHandlers,
    refresh: runRefresh,
  };
}
