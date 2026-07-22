import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { applyWappConnectInvoicePdfCloneFixes } from "@/utils/wappConnectInvoicePdfCapture";

export type InvoicePdfPageFormat = "a4" | "a5" | "thermal";

export interface CaptureElementToPdfOptions {
  pageFormat?: InvoicePdfPageFormat;
  thermalPaper?: "58mm" | "80mm";
  /** Lower scale on phones to reduce memory use. */
  mobileOptimized?: boolean;
  /**
   * WappConnect WhatsApp invoice PDF only — applies html2canvas clone fixes
   * so borders/fonts align. Does not affect print or Meta PDF paths.
   */
  wappConnectPdf?: boolean;
}

async function rasterizeElement(
  element: HTMLElement,
  mobileOptimized: boolean,
  wappConnectPdf = false,
): Promise<HTMLCanvasElement> {
  // Prefer crisp type for WhatsApp attachments even on narrow Electron windows.
  const scale = wappConnectPdf ? 2 : mobileOptimized ? 1.5 : 2;
  return html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    ...(wappConnectPdf
      ? {
          onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
            applyWappConnectInvoicePdfCloneFixes(clonedDoc, clonedElement);
          },
        }
      : {}),
  });
}

/**
 * Retail ERP / multi-page invoices render one `.retail-erp-invoice-template` per
 * physical page — capture each at exact page size instead of slicing one tall image.
 */
async function capturePagedInvoiceTemplatesToPdfBlob(
  element: HTMLElement,
  pageFormat: "a4" | "a5",
  mobileOptimized: boolean,
  wappConnectPdf = false,
): Promise<Blob | null> {
  const pageEls = Array.from(
    element.querySelectorAll<HTMLElement>(".retail-erp-invoice-template"),
  );
  if (pageEls.length === 0) return null;

  const jsPdfFormat = pageFormat === "a5" ? "a5" : "a4";
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: jsPdfFormat,
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  // WappConnect: always PNG for sharper invoice text on WhatsApp.
  const useJpeg = mobileOptimized && !wappConnectPdf;
  const imageType = useJpeg ? "JPEG" : "PNG";
  const imageQuality = 0.92;

  for (let i = 0; i < pageEls.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await rasterizeElement(pageEls[i], mobileOptimized, wappConnectPdf);
    const imgData = canvas.toDataURL(
      useJpeg ? "image/jpeg" : "image/png",
      imageQuality,
    );
    pdf.addImage(imgData, imageType, 0, 0, pdfWidth, pdfHeight);
  }

  return pdf.output("blob");
}

/**
 * Render a hidden/visible invoice DOM node to a PDF blob (html2canvas + jsPDF).
 * Shared by Sales Invoice download and native print preview.
 */
export async function captureElementToPdfBlob(
  element: HTMLElement,
  options: CaptureElementToPdfOptions = {},
): Promise<Blob> {
  const {
    pageFormat = "a4",
    thermalPaper = "80mm",
    mobileOptimized = window.innerWidth < 768,
    wappConnectPdf = false,
  } = options;

  if (pageFormat === "a4" || pageFormat === "a5") {
    const paged = await capturePagedInvoiceTemplatesToPdfBlob(
      element,
      pageFormat,
      mobileOptimized,
      wappConnectPdf,
    );
    if (paged) return paged;
  }

  const canvas = await rasterizeElement(element, mobileOptimized, wappConnectPdf);

  const useJpeg = mobileOptimized && !wappConnectPdf;
  const imageType = useJpeg ? "JPEG" : "PNG";
  const imageQuality = 0.92;
  const imgData = canvas.toDataURL(
    useJpeg ? "image/jpeg" : "image/png",
    imageQuality,
  );

  if (pageFormat === "thermal") {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [thermalPaper === "58mm" ? 58 : 80, 297],
    });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const scaledHeight = (imgHeight * pdfWidth) / imgWidth;
    const pageHeight = pdf.internal.pageSize.getHeight();
    const totalPages = Math.max(1, Math.ceil(scaledHeight / pageHeight));

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage([thermalPaper === "58mm" ? 58 : 80, 297]);
      const sourceY = (page * pageHeight * imgWidth) / pdfWidth;
      const sourceH = Math.min((pageHeight * imgWidth) / pdfWidth, imgHeight - sourceY);
      const sliceHeight = (sourceH * pdfWidth) / imgWidth;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = imgWidth;
      pageCanvas.height = Math.ceil(sourceH);
      const ctx = pageCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceH, 0, 0, imgWidth, Math.ceil(sourceH));
        const pageImg = pageCanvas.toDataURL(mobileOptimized ? "image/jpeg" : "image/png", imageQuality);
        pdf.addImage(pageImg, imageType, 0, 0, pdfWidth, sliceHeight);
      }
    }

    return pdf.output("blob");
  }

  const jsPdfFormat = pageFormat === "a5" ? "a5" : "a4";
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: jsPdfFormat,
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const scaledHeight = (imgHeight * pdfWidth) / imgWidth;
  const singlePageThreshold = pdfHeight * 1.05;

  if (scaledHeight <= singlePageThreshold) {
    pdf.addImage(imgData, imageType, 0, 0, pdfWidth, Math.min(scaledHeight, pdfHeight));
    return pdf.output("blob");
  }

  const pixelsPerPage = (pdfHeight / scaledHeight) * imgHeight;
  const totalPages = Math.ceil(scaledHeight / pdfHeight);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    const sourceY = page * pixelsPerPage;
    const sourceH = Math.min(pixelsPerPage, imgHeight - sourceY);
    const sliceScaledHeight = (sourceH * pdfWidth) / imgWidth;

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = imgWidth;
    pageCanvas.height = Math.ceil(sourceH);
    const ctx = pageCanvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceH, 0, 0, imgWidth, Math.ceil(sourceH));
      const pageImgData = pageCanvas.toDataURL(
        mobileOptimized ? "image/jpeg" : "image/png",
        imageQuality,
      );
      pdf.addImage(pageImgData, imageType, 0, 0, pdfWidth, sliceScaledHeight);
    }
  }

  return pdf.output("blob");
}
