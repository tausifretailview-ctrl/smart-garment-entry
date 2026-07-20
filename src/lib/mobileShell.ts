import { localDayBounds } from "@/lib/localDayBounds";

/** Shared mobile shell spacing (bottom nav + safe area). */
export const MOBILE_BOTTOM_NAV_HEIGHT = "4.25rem";

/** Default mobile / native home — business overview dashboard (reporting-only APK). */
export const MOBILE_DEFAULT_LANDING_PATH = "/mobile-dashboard";

/** Mobile sales invoice hub. */
export const MOBILE_SALES_PATH = "/mobile-sales";

/** Owner-style sales screen (FullScreenLayout + OwnerBottomNav). */
export const MOBILE_OWNER_SALES_PATH = "/owner-sales";

/** Mobile accounts summary hub. */
export const MOBILE_ACCOUNTS_PATH = "/mobile-accounts";

/** Mobile reports hub (owner-native reports). */
export const MOBILE_REPORTS_PATH = "/owner-reports";

export const mobileMainPaddingClass =
  "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] lg:pb-14";

/** Mobile outer shell — fixed viewport height, no scroll (pages scroll internally). */
export const mobileShellOuterClass =
  "flex h-dvh max-h-dvh min-h-0 w-full overflow-hidden bg-background";

/** Mobile inset column — flex child that passes height to page scroll containers. */
export const mobileShellInsetClass =
  "flex flex-col flex-1 min-h-0 overflow-hidden min-w-0";

/** Single scroll container per mobile page (attach pull-to-refresh ref here). */
export const mobilePageScrollClass =
  "h-full min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain";

export const mobilePageScrollWithNavClass = `${mobilePageScrollClass} pb-24`;

export const mobileMainContentClass =
  "flex flex-1 flex-col min-h-0 overflow-hidden relative z-[1] min-w-0 p-3 sm:p-4";

export const mobileFullscreenMainClass =
  "flex-1 overflow-hidden relative z-[1] min-h-0";

/** Inclusive local-day bounds for `sales.sale_date` (timestamptz-safe). */
export function mobileSalesDateBounds(startYmd: string, endYmd: string) {
  return localDayBounds(startYmd, endYmd);
}

/** Sale types shown on mobile home (ERP invoice + POS). */
export const MOBILE_HOME_SALE_TYPES = ["invoice", "pos"] as const;
