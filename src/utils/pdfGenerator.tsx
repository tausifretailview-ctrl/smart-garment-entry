import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import { InvoiceTemplateHTML } from '@/components/InvoiceTemplateHTML';

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
  time?: string;
  mrpTotal?: number;
  cardPaid?: number;
  declarationText?: string;
  termsList?: string[];
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
  const colWidths = [10, 58, 15, 15, 15, 18, 18];
  const colPositions = colWidths.reduce((acc, width, i) => {
    acc.push(i === 0 ? margin : acc[i - 1] + colWidths[i - 1]);
    return acc;
  }, [] as number[]);

  // Draw table border
  const tableWidth = pageWidth - 2 * margin;
  
  // Table Header
  pdf.setFillColor(230, 230, 230);
  pdf.rect(margin, yPos, tableWidth, 5, 'FD');
  
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  const headers = ['SR', 'PARTICULARS', 'SIZE', 'QTY', 'DISC%', 'MRP/RATE', 'TOTAL'];
  headers.forEach((header, i) => {
    addText(header, colPositions[i] + 1, yPos + 3.5);
  });
  
  yPos += 5;
  addLine(margin, yPos, pageWidth - margin, yPos);

  // Table Rows with borders
  pdf.setFont('helvetica', 'normal');
  const itemsStartY = yPos;
  
  // Add actual items
  data.items.forEach((item, index) => {
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
    addText(item.qty.toString(), colPositions[3] + 1, yPos);
    
    // Calculate actual unit price from total
    const actualUnitPrice = item.total / item.qty;
    // Calculate and show discount percentage based on MRP vs actual price
    const discountPercent = item.sp > 0 ? ((item.sp - actualUnitPrice) / item.sp * 100) : 0;
    if (discountPercent > 0.1) {
      addText(discountPercent.toFixed(1) + '%', colPositions[4] + 1, yPos);
    } else {
      addText('-', colPositions[4] + 1, yPos);
    }
    
    addText(item.sp.toFixed(2), colPositions[5] + 1, yPos);
    addText(item.total.toFixed(2), colPositions[6] + 1, yPos);
  });
  
  // Add 5 blank rows
  const blankRowsToAdd = 5;
  for (let i = 0; i < blankRowsToAdd; i++) {
    yPos += 4;
    // Just add empty space, no text
  }

  yPos += 4;
  
  // Draw table borders
  const tableHeight = yPos - itemsStartY;
  pdf.setDrawColor(0);
  pdf.rect(margin, itemsStartY - 5, tableWidth, tableHeight + 5);
  
  // Draw vertical lines for columns
  colPositions.forEach((pos, i) => {
    if (i > 0) {
      addLine(pos, itemsStartY - 5, pos, yPos);
    }
  });
  
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

  addText(`Cash Paid:`, totalsX, yPos);
  addText(data.cashPaid.toFixed(2), totalsX + 30, yPos, { align: 'right' });
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

  // Footer - Declaration only (removed signature)
  pdf.setFontSize(6.5);
  addText('Declaration : Composition taxable person, not eligible to collect tax on supplies.', leftSideX, yPos);

  return pdf;
};

export const printInvoicePDF = async (data: InvoiceData) => {
  console.log('Starting PDF generation...');
  const pdf = await generateInvoicePDF(data);
  console.log('PDF generated successfully');
  
  // Download the PDF directly - this is more reliable than printing
  const fileName = `invoice-${data.billNo}-${Date.now()}.pdf`;
  pdf.save(fileName);
  console.log('PDF download initiated:', fileName);
};

export const downloadInvoicePDF = async (data: InvoiceData, filename?: string): Promise<void> => {
  const pdf = await generateInvoicePDF(data);
  const name = filename || `invoice-${data.billNo}-${Date.now()}.pdf`;
  pdf.save(name);
  console.log('PDF saved as:', name);
};

export const generateInvoiceFromHTML = async (data: InvoiceData): Promise<void> => {
  console.log('Starting HTML-to-PDF generation...');
  
  // Create temporary container div
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);
  
  try {
    // Transform data for HTML template
    const transformedItems = data.items.map((item) => {
      const actualUnitPrice = item.total / item.qty;
      const discPercent = item.sp > 0 ? ((item.sp - actualUnitPrice) / item.sp * 100) : 0;
      
      return {
        sr: item.sr,
        particulars: item.particulars,
        size: item.size,
        qty: item.qty,
        rate: item.sp, // MRP
        discPercent: discPercent,
        total: item.total
      };
    });

    const htmlProps = {
      businessName: data.businessName || 'BUSINESS NAME',
      businessAddress: data.businessAddress || '',
      businessContact: data.businessContact || '',
      businessEmail: data.businessEmail || '',
      logoUrl: data.logo,
      billNo: data.billNo,
      date: data.date,
      time: data.time || data.date.toLocaleTimeString('en-US'),
      customerName: data.customerName,
      customerMobile: data.customerMobile || '',
      items: transformedItems,
      subTotal: data.subTotal,
      discountAmount: data.discount,
      netAmount: data.grandTotal,
      paymentMethod: data.paymentMethod?.toUpperCase() || 'CASH',
      cashPaid: data.cashPaid,
      upiPaid: data.upiPaid,
      cardPaid: data.cardPaid || 0,
      mrpTotal: data.mrpTotal || data.subTotal,
      declarationText: data.declarationText,
      termsList: data.termsList
    };
    
    // Render InvoiceTemplateHTML component into container
    const root = createRoot(container);
    root.render(<InvoiceTemplateHTML {...htmlProps} />);
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Use html2canvas to capture the HTML as canvas
    const canvas = await html2canvas(container.firstChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png');
    
    // Create A5 PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });
    
    // Calculate dimensions to fit A5 (148mm x 210mm)
    const pageWidth = 148;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    
    // Add image to PDF
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    
    // Download PDF
    const fileName = `invoice-${data.billNo}-${Date.now()}.pdf`;
    pdf.save(fileName);
    
    console.log('PDF download initiated:', fileName);
    
    // Cleanup
    root.unmount();
    document.body.removeChild(container);
  } catch (error) {
    console.error('Error generating HTML invoice PDF:', error);
    document.body.removeChild(container);
    throw error;
  }
};

export const printInvoiceDirectly = async (data: InvoiceData): Promise<void> => {
  console.log('Starting direct print...');
  
  // Create temporary container div
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);
  
  try {
    // Transform data for HTML template
    const transformedItems = data.items.map((item) => {
      const actualUnitPrice = item.total / item.qty;
      const discPercent = item.sp > 0 ? ((item.sp - actualUnitPrice) / item.sp * 100) : 0;
      
      return {
        sr: item.sr,
        particulars: item.particulars,
        size: item.size,
        qty: item.qty,
        rate: item.sp, // MRP
        discPercent: discPercent,
        total: item.total
      };
    });

    const htmlProps = {
      businessName: data.businessName || 'BUSINESS NAME',
      businessAddress: data.businessAddress || '',
      businessContact: data.businessContact || '',
      businessEmail: data.businessEmail || '',
      logoUrl: data.logo,
      billNo: data.billNo,
      date: data.date,
      time: data.time || data.date.toLocaleTimeString('en-US'),
      customerName: data.customerName,
      customerMobile: data.customerMobile || '',
      items: transformedItems,
      subTotal: data.subTotal,
      discountAmount: data.discount,
      netAmount: data.grandTotal,
      paymentMethod: data.paymentMethod?.toUpperCase() || 'CASH',
      cashPaid: data.cashPaid,
      upiPaid: data.upiPaid,
      cardPaid: data.cardPaid || 0,
      mrpTotal: data.mrpTotal || data.subTotal,
      declarationText: data.declarationText,
      termsList: data.termsList
    };
    
    // Render InvoiceTemplateHTML component into container
    const root = createRoot(container);
    root.render(<InvoiceTemplateHTML {...htmlProps} />);
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Use html2canvas to capture the HTML as canvas
    const canvas = await html2canvas(container.firstChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png');
    
    // Create A5 PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });
    
    // Calculate dimensions to fit A5 (148mm x 210mm)
    const pageWidth = 148;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    
    // Add image to PDF
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    
    // Open PDF in new window and trigger print
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
        // Clean up URL after printing
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      };
    }
    
    console.log('Print dialog opened');
    
    // Cleanup
    root.unmount();
    document.body.removeChild(container);
  } catch (error) {
    console.error('Error printing invoice:', error);
    document.body.removeChild(container);
    throw error;
  }
};
