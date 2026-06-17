import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export type InvoicePdfPageFormat = "a4" | "a5" | "thermal";

export interface CaptureElementToPdfOptions {
  pageFormat?: InvoicePdfPageFormat;
  thermalPaper?: "58mm" | "80mm";
  /** Lower scale on phones to reduce memory use. */
  mobileOptimized?: boolean;
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
  } = options;

  const scale = mobileOptimized ? 1.5 : 2;
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const imageType = mobileOptimized ? "JPEG" : "PNG";
  const imageQuality = 0.92;
  const imgData = canvas.toDataURL(
    mobileOptimized ? "image/jpeg" : "image/png",
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
