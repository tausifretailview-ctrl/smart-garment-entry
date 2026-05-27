import * as React from "react";
import {
  isForceDesktopViewEnabled,
  setForceDesktopView,
  subscribeForceDesktopView,
} from "@/lib/desktopViewPreference";

export function useForceDesktopView(): boolean {
  const [forced, setForced] = React.useState(() => isForceDesktopViewEnabled());

  React.useEffect(() => subscribeForceDesktopView(() => setForced(isForceDesktopViewEnabled())), []);

  return forced;
}

export function useDesktopViewActions() {
  const forced = useForceDesktopView();

  const enableDesktopView = React.useCallback(() => setForceDesktopView(true), []);
  const disableDesktopView = React.useCallback(() => setForceDesktopView(false), []);

  return { forced, enableDesktopView, disableDesktopView };
}

/** Desktop header + sidebar (not mobile tab bar). */
export function useShowDesktopChrome(): boolean {
  const forced = useForceDesktopView();
  const [isLgUp, setIsLgUp] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return forced || isLgUp;
}
