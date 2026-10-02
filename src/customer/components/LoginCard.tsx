import { useState } from "react";
import { accountErrorMessage, loginWithMobile } from "../lib/account";

/** Log in with the mobile number given at billing. */
export default function LoginCard({ onDone, title }: { onDone: () => void; title?: string }) {
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await loginWithMobile(mobile);
      onDone();
    } catch (err) {
      setMsg(accountErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="c-card" onSubmit={(e) => void submit(e)}>
      <b>{title ?? "See all your bills & offers"}</b>
      <p className="c-muted" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
        Enter the mobile number you gave at billing to see your bills, returns, balance and offers.
      </p>
      <input
        className="c-input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="10-digit mobile number"
        maxLength={14}
        value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/[^\d+ ]/g, ""))}
      />
      <button type="submit" className="c-btn" disabled={busy || mobile.replace(/\D/g, "").length < 10}>
        {busy ? "Opening…" : "Continue"}
      </button>
      {msg ? <p className="c-hint">{msg}</p> : null}
    </form>
  );
}
