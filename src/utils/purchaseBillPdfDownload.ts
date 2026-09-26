import type React from "react";

export type PurchaseBillPdfPaper = "a4" | "a5";

export async function downloadPurchaseBillPDF(
  printRef: React.RefObject<HTMLDivElement>,
  billNumber: string,
  paper: PurchaseBillPdfPaper = "a4",
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const { default: jsPDF } = await import("jspdf");

  const element = printRef.current;
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const pageW = paper === "a4" ? 210 : 148;
  const pageH = paper === "a4" ? 297 : 210;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pageW, pageH],
  });

  const pageHeightPx = (pageH / pageW) * imgWidth;
  if (imgHeight <= pageHeightPx + 2) {
    pdf.addImage(imgData, "PNG", 0, 0, pageW, pageH);
  } else {
    let y = 0;
    let page = 0;
    while (y < imgHeight) {
      if (page > 0) pdf.addPage([pageW, pageH], "portrait");
      const sliceH = Math.min(pageHeightPx, imgHeight - y);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = imgWidth;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, imgWidth, sliceH);
        ctx.drawImage(canvas, 0, y, imgWidth, sliceH, 0, 0, imgWidth, sliceH);
        const sliceHMm = (sliceH / imgWidth) * pageW;
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, pageW, sliceHMm);
      }
      y += pageHeightPx;
      page += 1;
    }
  }

  const safeNo = (billNumber || "bill").replace(/[/\\?%*:|"<>]/g, "-");
  pdf.save(`PurchaseBill-${safeNo}.pdf`);
}
