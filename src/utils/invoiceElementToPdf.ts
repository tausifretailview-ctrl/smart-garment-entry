import type html2canvasType from "html2canvas";
import type jsPDFType from "jspdf";
import { applyWappConnectInvoicePdfCloneFixes } from "@/utils/wappConnectInvoicePdfCapture";
import { resolveInvoicePdfRasterOptions } from "@/utils/invoicePdfRaster";

/** Lazily loaded — keeps html2canvas + jsPDF (~350 KB gz) off the initial payload. */
let html2canvasPromise: Promise<typeof html2canvasType> | null = null;
const loadHtml2Canvas = (): Promise<typeof html2canvasType> =>
  (html2canvasPromise ??= import("html2canvas").then((m) => m.default));

let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> =>
  (jsPdfPromise ??= import("jspdf").then((m) => m.default));

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
  const { scale } = resolveInvoicePdfRasterOptions({ mobileOptimized, wappConnectPdf });
  const html2canvas = await loadHtml2Canvas();
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
  const jsPDF = await loadJsPdf();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: jsPdfFormat,
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const { imageType, mimeType, imageQuality } = resolveInvoicePdfRasterOptions({
    mobileOptimized,
    wappConnectPdf,
  });

  for (let i = 0; i < pageEls.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await rasterizeElement(pageEls[i], mobileOptimized, wappConnectPdf);
    const imgData = canvas.toDataURL(mimeType, imageQuality);
    // Fit without stretching — full-bleed stretch warped WhatsApp (WappConnect) A5 Retail ERP PDFs.
    const canvasAspect = canvas.width / Math.max(1, canvas.height);
    const pageAspect = pdfWidth / Math.max(0.001, pdfHeight);
    let drawW = pdfWidth;
    let drawH = pdfHeight;
    let offsetX = 0;
    let offsetY = 0;
    if (canvasAspect > pageAspect) {
      drawH = pdfWidth / canvasAspect;
      offsetY = (pdfHeight - drawH) / 2;
    } else {
      drawW = pdfHeight * canvasAspect;
      offsetX = (pdfWidth - drawW) / 2;
    }
    pdf.addImage(imgData, imageType, offsetX, offsetY, drawW, drawH);
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

  const { imageType, mimeType, imageQuality } = resolveInvoicePdfRasterOptions({
    mobileOptimized,
    wappConnectPdf,
  });
  const imgData = canvas.toDataURL(mimeType, imageQuality);

  if (pageFormat === "thermal") {
    const jsPDF = await loadJsPdf();
    const rollWidth = thermalPaper === "58mm" ? 58 : 80;
    // Size the page to the receipt content instead of a fixed 297mm sheet —
    // a fixed height left a long blank tail and made the receipt look mis-aligned.
    const contentHeight = Math.max(
      40,
      Math.round(((canvas.height * rollWidth) / Math.max(1, canvas.width)) * 100) / 100,
    );
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [rollWidth, contentHeight],
    });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeightThermal = pdf.internal.pageSize.getHeight();
    // Single continuous page, edge to edge across the roll width.
    pdf.addImage(imgData, imageType, 0, 0, pdfWidth, pdfHeightThermal);
    return pdf.output("blob");
  }

  const jsPdfFormat = pageFormat === "a5" ? "a5" : "a4";
  const jsPDF = await loadJsPdf();
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
      const pageImgData = pageCanvas.toDataURL(mimeType, imageQuality);
      pdf.addImage(pageImgData, imageType, 0, 0, pdfWidth, sliceScaledHeight);
    }
  }

  return pdf.output("blob");
}
