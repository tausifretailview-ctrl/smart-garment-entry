import { captureElementToPdfBlob } from "@/utils/invoiceElementToPdf";

/**
 * Wait until every <img> inside `el` has loaded (or errored / timed out).
 * Critical for the org logo inside the invoice template.
 */
async function waitForImages(el: HTMLElement, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  if (imgs.length === 0) {
    if (el.querySelector('[data-qr-pending="true"]')) {
      await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 1500)));
      return waitForImages(el, Math.max(0, timeoutMs - 1500));
    }
    return;
  }
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight !== 0) return resolve();
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          img.addEventListener("load", finish, { once: true });
          img.addEventListener("error", finish, { once: true });
          setTimeout(finish, timeoutMs);
        }),
    ),
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Capture a fully-rendered DOM element (the live invoice template) into a
 * multi-page A4 PDF and return it as a plain base64 string (no `data:` prefix).
 * Used for sending the user's selected invoice template via WhatsApp.
 */
export async function captureElementToPdfBase64(
  el: HTMLElement,
  opts: {
    extraSettleMs?: number;
    pageFormat?: "a4" | "a5";
    /** WappConnect WhatsApp invoice PDF — border/font clone fixes only. */
    wappConnectPdf?: boolean;
  } = {},
): Promise<string> {
  // Let React commit + layout settle (settings/logo may still be loading).
  await nextFrame();
  await nextFrame();
  if (opts.extraSettleMs && opts.extraSettleMs > 0) {
    await new Promise((r) => setTimeout(r, opts.extraSettleMs));
  }
  await waitForImages(el);
  await nextFrame();

  const pageFormat = opts.pageFormat ?? "a4";
  const blob = await captureElementToPdfBlob(el, {
    pageFormat,
    wappConnectPdf: opts.wappConnectPdf === true,
  });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}