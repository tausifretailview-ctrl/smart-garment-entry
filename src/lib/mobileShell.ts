import { localDayBounds } from "@/lib/localDayBounds";

/** Shared mobile shell spacing (bottom nav + safe area). */
export const MOBILE_BOTTOM_NAV_HEIGHT = "4.25rem";

/** Default mobile / native home — business overview dashboard. */
export const MOBILE_DEFAULT_LANDING_PATH = "/mobile-dashboard";

/** Mobile sales invoice hub. */
export const MOBILE_SALES_PATH = "/mobile-sales";

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
  return localDayBounds(startYmd, endYmd);
}

/** Sale types shown on mobile home (ERP invoice + POS). */
export const MOBILE_HOME_SALE_TYPES = ["invoice", "pos"] as const;
