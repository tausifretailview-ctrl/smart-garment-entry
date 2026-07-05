import { cn } from "@/lib/utils";
import {
  electronWindowClose,
  electronWindowMinimize,
  electronWindowToggleMaximize,
  isElectronShell,
} from "@/lib/electronShell";

export function DesktopWindowControls({ className }: { className?: string }) {
  if (!isElectronShell()) return null;

  return (
    <div className={cn("erp-win-controls flex items-stretch shrink-0", className)}>
      <button
        type="button"
        className="erp-win-control"
        aria-label="Minimize"
        onClick={() => electronWindowMinimize()}
      >
        &#9472;
      </button>
      <button
        type="button"
        className="erp-win-control"
        aria-label="Maximize"
        onClick={() => electronWindowToggleMaximize()}
      >
        &#9723;
      </button>
      <button
        type="button"
        className="erp-win-control erp-win-control--close"
        aria-label="Close"
        onClick={() => electronWindowClose()}
      >
        &#10005;
      </button>
    </div>
  );
}
