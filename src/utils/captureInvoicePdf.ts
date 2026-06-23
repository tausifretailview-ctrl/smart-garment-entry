import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Wait until every <img> inside `el` has loaded (or errored / timed out).
 * Critical for the org logo inside the invoice template.
 */
async function waitForImages(el: HTMLElement, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  if (imgs.length === 0) return;
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
  opts: { extraSettleMs?: number } = {},
): Promise<string> {
  // Let React commit + layout settle (settings/logo may still be loading).
  await nextFrame();
  await nextFrame();
  if (opts.extraSettleMs && opts.extraSettleMs > 0) {
    await new Promise((r) => setTimeout(r, opts.extraSettleMs));
  }
  await waitForImages(el);
  await nextFrame();

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  let heightLeft = imgH;
  let position = 0;

  pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  const dataUri = pdf.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}