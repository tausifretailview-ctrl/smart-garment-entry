/**
 * Customer-facing text for a failed "Turn on notifications".
 * Setup problems on our side (missing Firebase config, a wrong VAPID key in the deploy)
 * are not something the customer can fix, so they get a plain message instead of a code.
 */
export function pushFailureMessage(reason: string | undefined): string {
  const r = reason ?? "unknown";
  if (r === "denied") {
    return "Notifications are blocked for this site. Allow them in your browser settings, then try again.";
  }
  if (r === "unsupported") return "This browser cannot receive notifications. Try Chrome on Android.";
  if (/(^|\s)(vapid_|not_configured)/.test(r)) return "Notifications are not available for this shop yet.";
  return `Could not turn on notifications. Please try again. (${r})`;
}

/** True when the failure is a shop setup problem (log it for support). */
export function isPushSetupProblem(reason: string | undefined): boolean {
  return /(^|\s)(vapid_|not_configured)/.test(reason ?? "");
}
