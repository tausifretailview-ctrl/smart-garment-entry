import { useEffect, useMemo, useRef } from "react";
import {
  isNavigationPerfEnabled,
  recordComponentMount,
  recordComponentUnmount,
  recordDataFetchEnd,
  recordDataFetchStart,
  recordLoadingUi,
  recordTimeToInteractive,
} from "@/lib/navigationPerfDiagnostics";

/** Record page mount/unmount — detects Outlet remounts vs tab-cache reuse. */
export function useNavPerfPage(path: string, meta?: Record<string, unknown>): void {
  useEffect(() => {
    if (!isNavigationPerfEnabled()) return;
    const mountAt = performance.now();
    recordComponentMount(path, meta);
    const id = requestAnimationFrame(() => {
      recordTimeToInteractive(path, performance.now() - mountAt, { kind: "first-paint" });
    });
    return () => {
      cancelAnimationFrame(id);
      recordComponentUnmount(path);
    };
    // meta is diagnostic-only; omit from deps to avoid remount loops on inline objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
}

/** Watch React Query or manual loading flags for a named fetch. */
export function useNavPerfQueryWatch(
  label: string,
  path: string,
  options: {
    isLoading: boolean;
    isFetching?: boolean;
    rowCount?: number;
    blockedUi?: boolean;
  },
): void {
  const startedAtRef = useRef<number | null>(null);
  const reportedLoadingUiRef = useRef(false);

  useEffect(() => {
    if (!isNavigationPerfEnabled()) return;

    const busy = options.isLoading || options.isFetching === true;

    if (busy && startedAtRef.current == null) {
      startedAtRef.current = performance.now();
      recordDataFetchStart(label, path);
    }

    if (options.blockedUi && busy && !reportedLoadingUiRef.current) {
      reportedLoadingUiRef.current = true;
      recordLoadingUi(path, label, { blocked: true });
    }

    if (!busy && startedAtRef.current != null) {
      recordDataFetchEnd(label, path, performance.now() - startedAtRef.current, {
        rowCount: options.rowCount,
      });
      startedAtRef.current = null;
      reportedLoadingUiRef.current = false;
    }
  }, [
    label,
    path,
    options.isLoading,
    options.isFetching,
    options.rowCount,
    options.blockedUi,
  ]);
}

/** Wrap a manual async fetch (useEffect + Supabase). */
export function useNavPerfManualFetch(): {
  start: (label: string, path: string) => void;
  end: (label: string, path: string, meta?: Record<string, unknown>) => void;
  loadingUi: (path: string, kind: string) => void;
} {
  const timersRef = useRef<Map<string, number>>(new Map());

  return useMemo(
    () => ({
      start(label: string, path: string) {
        if (!isNavigationPerfEnabled()) return;
        const key = `${path}:${label}`;
        timersRef.current.set(key, performance.now());
        recordDataFetchStart(label, path);
      },
      end(label: string, path: string, meta?: Record<string, unknown>) {
        if (!isNavigationPerfEnabled()) return;
        const key = `${path}:${label}`;
        const startedAt = timersRef.current.get(key);
        if (startedAt == null) return;
        recordDataFetchEnd(label, path, performance.now() - startedAt, meta);
        timersRef.current.delete(key);
      },
      loadingUi(path: string, kind: string) {
        if (!isNavigationPerfEnabled()) return;
        recordLoadingUi(path, kind);
      },
    }),
    [],
  );
}
