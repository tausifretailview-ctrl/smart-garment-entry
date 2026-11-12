import type React from "react";

/** Discount boxes: no spinner arrows, mouse wheel or ArrowUp/Down nudging (cashiers changed discounts by mistake). */
export const POS_PLAIN_NUMBER_CLASS =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export const posPlainNumberProps = {
  inputMode: "decimal" as const,
  onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  },
};
