/**
 * One-click "Apply ₹… Now" credit banner on POS.
 *
 * Default off. That banner subtracts credit on screen and never saves it.
 * Cashiers apply credit with the S/R chevron until the Rule B save path
 * awaits `apply_pos_credit`. Do not flip this on in production before that ships.
 */
export const POS_APPLY_CREDIT_BANNER_ENABLED = false;
