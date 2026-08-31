import { Capacitor } from "@capacitor/core";

export type FileDeliveryResult = "shared" | "downloaded" | "opened";

/** @deprecated Use FileDeliveryResult — kept so existing type imports stay valid. */
export type PdfDeliveryResult = FileDeliveryResult;

/** Android WebView share sheets can hang forever. Fall through to download. */
export const FILE_SHARE_TIMEOUT_MS = 12_000;

function withShareTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const err = new Error("share-timeout");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Save or share any file blob on mobile browsers and Capacitor APK WebViews.
 * Desktop browsers use a normal anchor download.
 */
export async function deliverFileBlob(
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<FileDeliveryResult> {
  const file = new File([blob], fileName, { type: mimeType });
  const isNative = Capacitor.isNativePlatform();

  if (typeof navigator.share === "function") {
    try {
      const canShareFiles =
        typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await withShareTimeout(navigator.share({ files: [file], title: fileName }), FILE_SHARE_TIMEOUT_MS);
        return "shared";
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  if (isNative) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return "opened";
    }
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);

  return "downloaded";
}

/** Back-compat wrapper — existing invoice/print callers keep working unchanged. */
export async function deliverPdfBlob(blob: Blob, fileName: string): Promise<FileDeliveryResult> {
  const safeName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  return deliverFileBlob(blob, safeName, "application/pdf");
}

export function shouldUseMobileDocumentDelivery(): boolean {
  return Capacitor.isNativePlatform() || window.innerWidth < 768;
}
