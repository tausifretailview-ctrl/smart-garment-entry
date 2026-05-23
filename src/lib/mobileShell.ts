/** Shared mobile shell spacing (bottom nav + safe area). */
export const MOBILE_BOTTOM_NAV_HEIGHT = "4.25rem";

/** Default mobile home — sales invoice hub (MobileBottomNav). */
export const MOBILE_DEFAULT_LANDING_PATH = "/mobile-sales";

/** Owner-style sales screen (FullScreenLayout + OwnerBottomNav). */
export const MOBILE_OWNER_SALES_PATH = "/owner-sales";

export const mobileMainPaddingClass =
  "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] lg:pb-14";

export const mobileMainContentClass =
  `flex-1 overflow-auto relative z-[1] min-w-0 p-3 sm:p-4 ${mobileMainPaddingClass}`;

export const mobileFullscreenMainClass =
  "flex-1 overflow-hidden relative z-[1] min-h-0";

/** Inclusive local-day bounds for `sales.sale_date` (timestamptz-safe). */
export function mobileSalesDateBounds(startYmd: string, endYmd: string) {
  return {
    startIso: `${startYmd}T00:00:00`,
    endIso: `${endYmd}T23:59:59.999`,
  };
}

/** Sale types shown on mobile home (ERP invoice + POS). */
export const MOBILE_HOME_SALE_TYPES = ["invoice", "pos"] as const;
