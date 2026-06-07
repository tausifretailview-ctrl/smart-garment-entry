import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildNavPerfReport,
  copyNavPerfReport,
  getNavPerfSnapshot,
  getNavPerfTransitions,
  isNavigationPerfEnabled,
  printNavPerfReport,
  setNavigationPerfEnabled,
} from "@/lib/navigationPerfDiagnostics";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

function getPathSegment(pathname: string, orgSlug?: string): string {
  if (orgSlug && pathname.startsWith(`/${orgSlug}`)) {
    return pathname.slice(orgSlug.length + 2) || "";
  }
  return pathname.replace(/^\//, "");
}

export function NavigationPerfPanel() {
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const location = useLocation();
  const { orgSlug } = useOrgNavigation();

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!isNavigationPerfEnabled()) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!isNavigationPerfEnabled()) return;
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!isNavigationPerfEnabled()) return null;

  const snapshot = getNavPerfSnapshot();
  const transitions = getNavPerfTransitions().slice(-5).reverse();
  const currentPath = getPathSegment(location.pathname, orgSlug);
  void tick;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="fixed bottom-14 right-3 z-[9999] rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-black shadow-lg hover:bg-amber-400"
        title="Navigation perf (Ctrl+Shift+P)"
      >
        NavPerf
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-[9999] w-[min(420px,calc(100vw-1.5rem))] max-h-[70vh] overflow-auto rounded-lg border border-amber-500/40 bg-background/95 p-3 text-xs shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-amber-500">Phase 0 — Nav Perf</p>
          <p className="text-[10px] text-muted-foreground">Ctrl+Shift+P to hide</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => printNavPerfReport()}>
            Log
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void copyNavPerfReport()}>
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px]"
            onClick={() => setVisible(false)}
          >
            ×
          </Button>
        </div>
      </div>

      <div className="space-y-2 font-mono text-[11px]">
        <div className="rounded border p-2">
          <p>
            <span className="text-muted-foreground">URL path:</span> {currentPath || "(dashboard)"}
          </p>
          <p>
            <span className="text-muted-foreground">Render:</span>{" "}
            <span
              className={cn(
                snapshot.renderPath === "tab-cache" ? "text-green-500" : "text-amber-500",
              )}
            >
              {snapshot.renderPath}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Mounted tabs:</span>{" "}
            {snapshot.mountedTabPaths.length ? snapshot.mountedTabPaths.join(", ") : "(none)"}
          </p>
          <p>
            <span className="text-muted-foreground">Electron single-tab:</span>{" "}
            {String(snapshot.environment.electronSingleTab)}
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold">Recent transitions</p>
          {transitions.length === 0 ? (
            <p className="text-muted-foreground">Switch dashboards to record timings…</p>
          ) : (
            <ul className="space-y-1">
              {transitions.map((t) => (
                <li key={t.id} className="rounded border p-2">
                  <p>
                    {t.fromPath || "start"} → <strong>{t.toPath}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    {Math.round(t.totalMs ?? 0)}ms · {t.classification} · render={t.renderPath ?? "?"}
                  </p>
                  <p className="text-muted-foreground">
                    chunk {t.chunkLoadMs ?? 0}ms · data {t.dataFetchMs ?? 0}ms · remount{" "}
                    {t.wasRemount ? "yes" : "no"} · spinner {t.showedLoadingUi ? "yes" : "no"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details>
          <summary className="cursor-pointer text-muted-foreground">Full report preview</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[10px]">
            {buildNavPerfReport()}
          </pre>
        </details>

        <Button
          size="sm"
          variant="destructive"
          className="h-7 w-full text-[10px]"
          onClick={() => {
            setNavigationPerfEnabled(false);
            window.location.reload();
          }}
        >
          Disable diagnostics & reload
        </Button>
      </div>
    </div>
  );
}
