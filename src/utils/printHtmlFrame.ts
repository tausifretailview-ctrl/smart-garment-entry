/**
 * Print a full HTML document from a hidden frame on the current page: the print dialog opens
 * over the screen the user is on, the same way bills print, and no extra window is left open.
 */
const FRAME_ATTR = "data-ezzy-print-frame";

export function printHtmlInFrame(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // A frame from an earlier print is no longer needed.
    document.querySelectorAll(`iframe[${FRAME_ATTR}]`).forEach((f) => f.remove());

    const frame = document.createElement("iframe");
    frame.setAttribute(FRAME_ATTR, "true");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.title = "Print";
    frame.style.cssText = "position:absolute;width:0;height:0;top:-10px;left:-10px;border:0;";

    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) {
        frame.remove();
        reject(err instanceof Error ? err : new Error(String(err)));
      } else {
        resolve();
      }
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        finish(new Error("Could not open the print view. Try again."));
        return;
      }
      win.addEventListener("afterprint", () => {
        window.setTimeout(() => frame.remove(), 300);
      });
      const fonts = (win.document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      const ready = Promise.race([
        fonts ?? Promise.resolve(),
        new Promise((r) => window.setTimeout(r, 1500)),
      ]);
      void ready.then(() => {
        try {
          win.focus();
          win.print();
          finish();
        } catch (e) {
          finish(e);
        }
      });
    };

    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
