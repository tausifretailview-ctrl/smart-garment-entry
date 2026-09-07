import * as React from "react";
import {
  getMobileUiTheme,
  setMobileUiTheme,
  subscribeMobileUiTheme,
  type MobileUiTheme,
} from "@/lib/mobileUiTheme";

/** Current mobile screen theme ("classic" | "premium"), live across tabs/components. */
export function useMobileUiTheme(): MobileUiTheme {
  const [theme, setTheme] = React.useState<MobileUiTheme>(() => getMobileUiTheme());

  React.useEffect(() => subscribeMobileUiTheme(() => setTheme(getMobileUiTheme())), []);

  return theme;
}

export function useMobileUiThemeActions() {
  const theme = useMobileUiTheme();
  const setTheme = React.useCallback((next: MobileUiTheme) => setMobileUiTheme(next), []);
  return { theme, setTheme };
}
