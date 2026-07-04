/** Shared layout flags for payment tabs in dialog vs full-page workspace. */
export function resolvePaymentTabLayout(opts: {
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const shell = Boolean(opts.embedded || opts.fullPage);
  const compact = Boolean(opts.embedded && !opts.fullPage);
  return { shell, compact };
}
