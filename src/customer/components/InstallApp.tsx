import { useEffect, useState } from "react";
import { chromeIntentUrl, installMode, onInstallChange, promptInstall, type InstallMode } from "../lib/install";

function useInstallMode(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(() => installMode());
  useEffect(() => onInstallChange(() => setMode(installMode())), []);
  return mode;
}

/**
 * "Install app" card: puts the shop's Bill & Offers app on the home screen. Shown on every
 * page a customer lands on (bill link, notification, login, account) until it is installed.
 * Installed apps get notifications more reliably, and iPhones only get them once installed.
 */
export default function InstallAppCard({ shopName, compact = false }: { shopName?: string; compact?: boolean }) {
  const mode = useInstallMode();
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  if (mode === "installed" || mode === "none") return null;

  const onInstall = async () => {
    if (mode === "prompt") {
      setBusy(true);
      await promptInstall();
      setBusy(false);
      return;
    }
    if (mode === "open-in-chrome") {
      window.location.href = chromeIntentUrl(window.location.href);
      return;
    }
    setShowSteps((s) => !s);
  };

  return (
    <div className={compact ? "c-card c-install c-install-compact no-print" : "c-card c-install no-print"}>
      <div className="c-install-row">
        <img className="c-install-icon" src="/icon-192.png" alt="" width={48} height={48} />
        <div className="c-install-text">
          <b>Get the {shopName ? `${shopName} ` : ""}app</b>
          <span>Bills, offers &amp; alerts in one tap. Free, no Play Store needed.</span>
        </div>
      </div>
      <button type="button" className="c-btn c-btn-install" disabled={busy} onClick={() => void onInstall()}>
        {busy ? "Opening…" : mode === "open-in-chrome" ? "Open in Chrome to install" : "Install app"}
      </button>
      {showSteps && mode === "ios" ? (
        <ol className="c-steps">
          <li>
            Tap the <b>Share</b> button <span aria-hidden="true">⬆️</span> at the bottom of Safari.
          </li>
          <li>
            Choose <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>Open the app from your home screen and turn on notifications.</li>
        </ol>
      ) : null}
      {showSteps && mode === "menu" ? (
        <ol className="c-steps">
          <li>
            Tap the browser menu <b>⋮</b> at the top right.
          </li>
          <li>
            Choose <b>Install app</b> or <b>Add to Home screen</b>.
          </li>
          <li>If you don't see it, open this page in Chrome.</li>
        </ol>
      ) : null}
    </div>
  );
}
