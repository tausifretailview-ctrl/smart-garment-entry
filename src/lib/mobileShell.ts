/** Shared mobile shell spacing (bottom nav + safe area). */
export const MOBILE_BOTTOM_NAV_HEIGHT = "4.25rem";

export const mobileMainPaddingClass =
  "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] lg:pb-14";

export const mobileMainContentClass =
  `flex-1 overflow-auto relative z-[1] min-w-0 p-3 sm:p-4 ${mobileMainPaddingClass}`;

export const mobileFullscreenMainClass =
  "flex-1 overflow-hidden relative z-[1] min-h-0";
