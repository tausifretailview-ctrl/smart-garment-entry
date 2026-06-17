import { Capacitor } from "@capacitor/core";

export type PdfDeliveryResult = "shared" | "downloaded" | "opened";

/**
 * Save or share a PDF on mobile browsers and Capacitor APK WebViews.
 * Desktop browsers use a normal anchor download.
 */
export async function deliverPdfBlob(
  blob: Blob,
  fileName: string,
): Promise<PdfDeliveryResult> {
  const safeName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const file = new File([blob], safeName, { type: "application/pdf" });
  const isNative = Capacitor.isNativePlatform();

  if (typeof navigator.share === "function") {
    try {
      const canShareFiles =
        typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({ files: [file], title: safeName });
        return "shared";
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw err;
      }
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
  link.download = safeName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);

  return "downloaded";
}

export function shouldUseMobileDocumentDelivery(): boolean {
  return Capacitor.isNativePlatform() || window.innerWidth < 768;
}
