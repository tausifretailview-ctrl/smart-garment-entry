import { describe, expect, it } from "vitest";
import { isPushSetupProblem, pushFailureMessage } from "./pushFailureMessage";

describe("pushFailureMessage", () => {
  it("hides setup codes from customers", () => {
    expect(pushFailureMessage("token: vapid_wrong_length_62_bytes")).toBe(
      "Notifications are not available for this shop yet.",
    );
    expect(pushFailureMessage("token: not_configured")).toBe("Notifications are not available for this shop yet.");
    expect(isPushSetupProblem("token: vapid_wrong_length_62_bytes")).toBe(true);
  });
  it("keeps the existing messages", () => {
    expect(pushFailureMessage("denied")).toMatch(/blocked/);
    expect(pushFailureMessage("unsupported")).toMatch(/Chrome on Android/);
    expect(pushFailureMessage("register: timeout")).toBe(
      "Could not turn on notifications. Please try again. (register: timeout)",
    );
    expect(isPushSetupProblem("register: timeout")).toBe(false);
  });
});
