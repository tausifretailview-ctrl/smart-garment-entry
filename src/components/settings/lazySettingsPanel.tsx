import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { lazyWithRetry } from "@/lib/chunkLoadRetry";
import { reloadAppWithUpdateCheck } from "@/lib/appReload";
import { claimNewerBuildReload, newerServerEntryScript } from "@/lib/appBuildCheck";
import { FormPageSkeleton } from "@/components/skeletons/FormPageSkeleton";
import { Button } from "@/components/ui/button";

type PanelModule = { default: ComponentType<unknown> };
type PanelLoader = () => Promise<PanelModule>;

/** After this long on the skeleton, offer Reload app instead of an endless blank panel. */
export const SLOW_SETTINGS_PANEL_MS = 8_000;

/**
 * A panel still on its skeleton means its code never finished downloading: the tab runs an
 * older build after a deploy, or the request stalled when the PC woke from sleep. Re-rendering
 * waits on that same pending download, so only a reload helps. If a newer build is live,
 * reload onto it once by ourselves (once per server build, so it cannot loop).
 */
function SettingsPanelLoading() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_SETTINGS_PANEL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!slow) return;
    let cancelled = false;
    void newerServerEntryScript().then((serverEntry) => {
      if (!cancelled && serverEntry && claimNewerBuildReload(serverEntry)) void reloadAppWithUpdateCheck();
    });
    return () => {
      cancelled = true;
    };
  }, [slow]);

  return (
    <div>
      <FormPageSkeleton groups={1} fieldsPerGroup={4} className="p-4" />
      {slow && (
        <div className="flex flex-col items-center gap-2 pb-3 text-center">
          <p className="text-sm text-muted-foreground">
            This section is taking longer than expected to load. Reload loads it fresh.
          </p>
          <Button
            size="sm"
            onClick={() => {
              void reloadAppWithUpdateCheck();
            }}
          >
            Reload app
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A Settings tab section loaded on demand.
 *
 * `preload` warms the chunk before the tab is opened (hover, focus, idle) so the first
 * click does not sit on a skeleton. It is a plain dynamic import: the browser shares the
 * request with the real render, and a failed speculative warm must never reload the app.
 * `Panel` retries transient chunk failures and, if the chunk is still pending after
 * `SLOW_SETTINGS_PANEL_MS`, shows Reload app (and reloads by itself onto a newer build).
 */
export function createSettingsPanel(loader: PanelLoader) {
  function Panel() {
    const Lazy = useMemo(() => lazyWithRetry(loader), []);
    return (
      <Suspense fallback={<SettingsPanelLoading />}>
        <Lazy />
      </Suspense>
    );
  }

  const preload = () => {
    void loader().catch(() => {});
  };

  return { Panel, preload };
}
