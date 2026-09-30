import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { lazyWithRetry } from "@/lib/chunkLoadRetry";
import { reloadAppWithUpdateCheck } from "@/lib/appReload";
import { FormPageSkeleton } from "@/components/skeletons/FormPageSkeleton";
import { Button } from "@/components/ui/button";

type PanelModule = { default: ComponentType<unknown> };
type PanelLoader = () => Promise<PanelModule>;

/** After this long on the skeleton, offer Retry / Refresh instead of an endless blank panel. */
export const SLOW_SETTINGS_PANEL_MS = 8_000;

function SettingsPanelLoading({ onRetry }: { onRetry: () => void }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_SETTINGS_PANEL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div>
      <FormPageSkeleton groups={1} fieldsPerGroup={4} className="p-4" />
      {slow && (
        <div className="flex flex-col items-center gap-2 pb-3 text-center">
          <p className="text-sm text-muted-foreground">
            This section is taking longer than expected to load.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                void reloadAppWithUpdateCheck();
              }}
            >
              Refresh app
            </Button>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </div>
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
 * `SLOW_SETTINGS_PANEL_MS`, shows Retry / Refresh app.
 */
export function createSettingsPanel(loader: PanelLoader) {
  function Panel() {
    const [attempt, setAttempt] = useState(0);
    const Lazy = useMemo(() => lazyWithRetry(loader), [attempt]);
    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    return (
      <Suspense key={attempt} fallback={<SettingsPanelLoading onRetry={retry} />}>
        <Lazy />
      </Suspense>
    );
  }

  const preload = () => {
    void loader().catch(() => {});
  };

  return { Panel, preload };
}
