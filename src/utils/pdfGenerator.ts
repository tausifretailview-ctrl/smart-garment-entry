import jsPDF from 'jspdf';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  qty: number;
  rate: number;
  total: number;
}

interface InvoiceData {
  billNo: string;
  date: Date;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  items: InvoiceItem[];
  subTotal: number;
  discount: number;
  grandTotal: number;
  tenderAmount: number;
  cashPaid: number;
  refundCash: number;
  upiPaid: number;
  paymentMethod?: string;
  businessName?: string;
  businessAddress?: string;
  businessContact?: string;
  businessEmail?: string;
  gstNumber?: string;
  logo?: string;
}

export const generateInvoicePDF = async (data: InvoiceData) => {
  // Create A5 vertical PDF (148mm x 210mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = 148;
  const pageHeight = 210;
  const margin = 5;
  let yPos = margin;

  // Helper function to add text
  const addText = (text: string, x: number, y: number, options?: any) => {
    pdf.text(text, x, y, options);
  };

  // Helper function to add line
  const addLine = (x1: number, y1: number, x2: number, y2: number) => {
    pdf.line(x1, y1, x2, y2);
  };

  // Header Section
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  addText(data.businessName || 'BUSINESS NAME', pageWidth / 2, yPos + 5, { align: 'center' });
  
  yPos += 8;
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  if (data.businessAddress) {
    const addressLines = pdf.splitTextToSize(data.businessAddress, pageWidth - 2 * margin);
    addressLines.forEach((line: string) => {
      addText(line, pageWidth / 2, yPos, { align: 'center' });
      yPos += 3;
    });
  }

  if (data.businessContact) {
    addText(`CONTACT : ${data.businessContact}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 3;
  }

  if (data.businessEmail) {
    addText(`EMAIL: ${data.businessEmail}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 3;
  }

  yPos += 2;
  addLine(margin, yPos, pageWidth - margin, yPos);
  yPos += 3;

  // Bill Title
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  addText('BILL OF SUPPLY', pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;

  // Customer and Bill Details in two columns
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  
  const leftColX = margin + 2;
  const rightColX = pageWidth - margin - 35;
  
  addText(`NAME : ${data.customerName}`, leftColX, yPos);
  addText(`BILL NO : ${data.billNo}`, rightColX, yPos);
  yPos += 3.5;
  
  addText(`MOB NO : ${data.customerMobile || ''}`, leftColX, yPos);
  addText(`DATE : ${data.date.toLocaleDateString('en-GB')}`, rightColX, yPos);
  yPos += 3.5;
  
  if (data.customerAddress) {
    addText(`ADDRESS : ${data.customerAddress}`, leftColX, yPos);
  }
  addText(`TIME : ${data.date.toLocaleTimeString('en-US')}`, rightColX, yPos);
  yPos += 5;

  // Items Table
  const tableStartY = yPos;
  const colWidths = [10, 52, 15, 10, 15, 18, 18];
  const colPositions = colWidths.reduce((acc, width, i) => {
    acc.push(i === 0 ? margin : acc[i - 1] + colWidths[i - 1]);
    return acc;
  }, [] as number[]);

  // Table Header
  pdf.setFillColor(230, 230, 230);
  pdf.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
  
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  const headers = ['SR', 'PARTICULARS', 'SIZE', 'HSN', 'QTY', 'MRP/RATE', 'TOTAL'];
  headers.forEach((header, i) => {
    addText(header, colPositions[i] + 1, yPos + 3.5);
  });
  
  yPos += 5;
  addLine(margin, yPos, pageWidth - margin, yPos);

  // Table Rows
  pdf.setFont('helvetica', 'normal');
  data.items.forEach((item) => {
    yPos += 4;
    
    // Check if we need a new page
    if (yPos > pageHeight - 50) {
      pdf.addPage();
      yPos = margin + 10;
    }

    addText(item.sr.toString(), colPositions[0] + 1, yPos);
    
    const particularText = pdf.splitTextToSize(item.particulars, colWidths[1] - 2);
    addText(particularText[0], colPositions[1] + 1, yPos);
    
    addText(item.size, colPositions[2] + 1, yPos);
    addText(item.hsn || '', colPositions[3] + 1, yPos);
    addText(item.qty.toString(), colPositions[4] + 1, yPos);
    addText(item.rate.toFixed(2), colPositions[5] + 1, yPos);
    addText(item.total.toFixed(2), colPositions[6] + 1, yPos);
  });

  yPos += 4;
  addLine(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  // Totals Section
  const totalsX = pageWidth - margin - 40;
  pdf.setFont('helvetica', 'normal');
  
  addText(`SUB TOTAL:`, totalsX, yPos);
  addText(data.subTotal.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 4;

  addText(`Payment Mode:`, totalsX, yPos);
  addText(data.paymentMethod?.toUpperCase() || 'CASH', totalsX + 30, yPos, { align: 'right' });
  yPos += 4;

  addText(`Tender Amt:`, totalsX, yPos);
  addText(data.tenderAmount.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 4;

  addText(`Cash Paid:`, totalsX, yPos);
  addText(data.cashPaid.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 4;

  addText(`Refund Cash:`, totalsX, yPos);
  addText(data.refundCash.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 4;

  addText(`UPI Paid:`, totalsX, yPos);
  addText(data.upiPaid.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 5;

  addLine(margin, yPos, pageWidth - margin, yPos);
  yPos += 1;
  addLine(margin, yPos, pageWidth - margin, yPos);
  yPos += 4;

  // Grand Total Section
  const leftSideX = margin + 2;
  
  addText(`TOTAL:`, leftSideX, yPos);
  addText(data.subTotal.toFixed(2), leftSideX + 35, yPos, { align: 'right' });
  
  addText(`MRP TOTAL:`, totalsX, yPos);
  addText(data.subTotal.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 4;

  addText(`Dis (Rs) :`, leftSideX, yPos);
  addText(data.discount.toFixed(2), leftSideX + 35, yPos, { align: 'right' });
  
  addText(`TOTAL DIS:`, totalsX, yPos);
  addText(data.discount.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  addText(`G.TOTAL:`, totalsX, yPos);
  addText(data.grandTotal.toFixed(2), totalsX + 30, yPos, { align: 'right' });
  yPos += 6;

  // Terms and Conditions
  pdf.setFontSize(6.5);
  pdf.setFont('helvetica', 'normal');
  const terms = [
    '1. GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
    '2. NO EXCHANGE WITHOUT BARCODE & BILL.',
    '3. EXCHANGE TIME : 01:00 TO 04:00 PM.',
    '4. THANK YOU !!! VISIT AGAIN . . .'
  ];

  terms.forEach((term) => {
    addText(term, leftSideX, yPos);
    yPos += 3;
  });

  yPos += 3;
  addLine(margin, yPos, pageWidth - margin, yPos);
  yPos += 4;

  // Footer - Declaration and Signature
  pdf.setFontSize(6.5);
  addText('Declaration : Composition taxable person, not eligible to collect tax on supplies.', leftSideX, yPos);
  yPos += 8;

  pdf.setFont('helvetica', 'bold');
  addText('Authorised Signatory', pageWidth - margin - 30, yPos);

  return pdf;
};

export const printInvoicePDF = async (data: InvoiceData) => {
  const pdf = await generateInvoicePDF(data);
  
  // Get the PDF as a blob
  const pdfBlob = pdf.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  
  // Create a hidden iframe for printing
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'absolute';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = 'none';
  
  document.body.appendChild(printFrame);
  
  // Load PDF in iframe and trigger print
  printFrame.onload = function() {
    try {
      // Give the PDF time to fully render
      setTimeout(() => {
        if (printFrame.contentWindow) {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        }
      }, 500);
    } catch (e) {
      console.error('Print failed:', e);
    }
    
    // Cleanup after print dialog closes
    setTimeout(() => {
      document.body.removeChild(printFrame);
      URL.revokeObjectURL(pdfUrl);
    }, 2000);
  };
  
  printFrame.src = pdfUrl;
};

export const downloadInvoicePDF = async (data: InvoiceData, filename?: string) => {
  const pdf = await generateInvoicePDF(data);
  pdf.save(filename || `invoice-${data.billNo}.pdf`);
};
