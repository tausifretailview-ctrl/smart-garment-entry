import { describe, expect, it } from "vitest";
import { reducer, type ToasterToast } from "./use-toast";

type ToastState = { toasts: ToasterToast[] };

const destructiveToast = (id = "err-1"): ToasterToast => ({
  id,
  variant: "destructive",
  title: "Error",
  description: "Failed to load sales",
  open: true,
});

const successToast = (id = "ok-1"): ToasterToast => ({
  id,
  title: "Saved",
  open: true,
});

describe("destructive toast dismiss", () => {
  it("removes a destructive toast on DISMISS so OK actually clears it", () => {
    const added = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: destructiveToast() });
    expect(added.toasts).toHaveLength(1);

    const dismissed = reducer(added, { type: "DISMISS_TOAST", toastId: "err-1" });
    expect(dismissed.toasts).toEqual([]);
  });

  it("does not leave a dismissed destructive toast that can re-surface later", () => {
    let state: ToastState = reducer(
      { toasts: [] },
      { type: "ADD_TOAST", toast: destructiveToast("cn-fail") },
    );
    state = reducer(state, { type: "DISMISS_TOAST", toastId: "cn-fail" });

    const stillOpen = state.toasts.filter(
      (t) => t.variant === "destructive" && t.open !== false,
    );
    expect(stillOpen).toEqual([]);
    expect(state.toasts.find((t) => t.id === "cn-fail")).toBeUndefined();
  });

  it("dismiss-all removes sticky errors immediately and only queues the rest", () => {
    let state: ToastState = reducer(
      { toasts: [] },
      { type: "ADD_TOAST", toast: destructiveToast("err") },
    );
    state = reducer(state, { type: "ADD_TOAST", toast: successToast("ok") });
    // TOAST_LIMIT is 1 — last add wins; seed both explicitly:
    state = { toasts: [destructiveToast("err"), successToast("ok")] };

    state = reducer(state, { type: "DISMISS_TOAST" });
    expect(state.toasts.find((t) => t.id === "err")).toBeUndefined();
    expect(state.toasts.find((t) => t.id === "ok")?.open).toBe(false);
  });

  it("marks non-destructive toasts closed on dismiss without dropping them yet", () => {
    const added = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: successToast() });
    const dismissed = reducer(added, { type: "DISMISS_TOAST", toastId: "ok-1" });
    expect(dismissed.toasts).toHaveLength(1);
    expect(dismissed.toasts[0].open).toBe(false);
  });
});
