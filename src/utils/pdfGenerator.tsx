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
  upiId?: string;
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
  
  let root;
  
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
    root = createRoot(container);
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
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const scaledWidth = pdfWidth;
    const scaledHeight = (canvas.height * pdfWidth) / canvas.width;
    
    if (scaledHeight <= pdfHeight) {
      pdf.addImage(imgData, 'PNG', 0, 0, scaledWidth, scaledHeight);
    } else {
      const totalPages = Math.ceil(scaledHeight / pdfHeight);
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        const sourceY = page * (canvas.height / totalPages);
        const sourceH = canvas.height / totalPages;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.ceil(sourceH);
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);
          const pageImgData = pageCanvas.toDataURL('image/png');
          pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        }
      }
    }
    
    // Download PDF
    const fileName = `invoice-${data.billNo}-${Date.now()}.pdf`;
    pdf.save(fileName);
    
    console.log('PDF download initiated:', fileName);
    
    // Cleanup
    if (root) root.unmount();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  } catch (error) {
    console.error('Error generating HTML invoice PDF:', error);
    // Safe cleanup
    try {
      if (root) root.unmount();
    } catch (e) {
      console.error('Error unmounting root:', e);
    }
    try {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    } catch (e) {
      console.error('Error removing container:', e);
    }
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
  
  let root;
  
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
    root = createRoot(container);
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
    
    // Create A5-sized HTML print window using the rendered image (more reliable preview)
    const pageWidthMm = 148; // A5 width
    const pageHeightMm = 210; // A5 height

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      console.error('Failed to open print window - popup may be blocked');
      // Cleanup
      if (root) root.unmount();
      if (container.parentNode) {
        document.body.removeChild(container);
      }
      return;
    }

    // Build HTML with the invoice image and A5 page setup
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Invoice</title>
          <style>
            @page {
              size: ${pageWidthMm}mm ${pageHeightMm}mm;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              width: ${pageWidthMm}mm;
              height: ${pageHeightMm}mm;
            }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              background: #ffffff;
            }
            img {
              max-width: 100%;
              max-height: 100%;
            }
          </style>
          <script>
            window.onafterprint = function() {
              window.close();
            };
          </script>
        </head>
        <body>
          <img src="${imgData}" alt="Invoice" />
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait a bit to ensure image is loaded, then trigger print
    printWindow.onload = () => {
      try {
        printWindow.focus();
        printWindow.print();
        console.log('Print dialog opened with image preview');
      } catch (e) {
        console.error('Print error:', e);
      }
    };

    // Cleanup after a short delay to ensure print dialog has opened
    setTimeout(() => {
      try {
        if (root) root.unmount();
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }, 1000);
  } catch (error) {
    console.error('Error printing invoice:', error);
    // Safe cleanup
    try {
      if (root) root.unmount();
    } catch (e) {
      console.error('Error unmounting root:', e);
    }
    try {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    } catch (e) {
      console.error('Error removing container:', e);
    }
    throw error;
  }
};

export const printA5BillFormat = async (data: InvoiceData): Promise<void> => {
  console.log('Starting A5 Bill Print...');
  
  // Create temporary container div
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);
  
  let root;
  
  try {
    // Import A5BillFormat component
    const { A5BillFormat } = await import('@/components/A5BillFormat');
    const { createRoot } = await import('react-dom/client');
    
    // Transform InvoiceData to BillData
    const billData = {
      invoiceNo: data.billNo,
      date: data.date.toLocaleDateString('en-GB'),
      customerName: data.customerName,
      customerPhone: data.customerMobile,
      paymentMethod: data.paymentMethod,
      items: data.items.map(item => ({
        name: item.particulars,
        variant: item.size,
        barcode: item.barcode,
        quantity: item.qty,
        price: item.rate,
        total: item.total
      })),
      subtotal: data.subTotal,
      tax: 0,
      discount: data.discount,
      grandTotal: data.grandTotal,
      organization: {
        name: data.businessName || 'BUSINESS NAME',
        address: data.businessAddress || '',
        phone: data.businessContact || '',
        email: data.businessEmail,
        logo: data.logo,
        upiId: data.upiId,
        terms: data.declarationText
      }
    };
    
    // Render A5BillFormat component into container
    root = createRoot(container);
    root.render(<A5BillFormat data={billData} />);
    
    // Wait for rendering and QR code generation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Use html2canvas to capture the rendered component
    const canvas = await html2canvas(container.firstChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 559, // 148mm in pixels at 96 DPI
      height: 794  // 210mm in pixels at 96 DPI
    });
    
    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png');
    
    // Create print window with A5 content positioned at top-left of A4
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
      console.error('Failed to open print window - popup may be blocked');
      if (root) root.unmount();
      if (container.parentNode) {
        document.body.removeChild(container);
      }
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Invoice ${data.billNo}</title>
          <style>
            @media print {
              @page {
                size: A4 portrait;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
              .print-container {
                width: 148mm;
                height: 210mm;
                position: absolute;
                top: 0;
                left: 0;
                overflow: hidden;
              }
              .print-container img {
                width: 148mm;
                height: auto;
                display: block;
              }
            }
            body {
              margin: 0;
              padding: 0;
            }
            .print-container {
              width: 148mm;
              margin: 0;
              padding: 0;
            }
            .print-container img {
              width: 100%;
              height: auto;
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            <img src="${imgData}" alt="Invoice" />
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  window.close();
                }, 500);
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Cleanup
    setTimeout(() => {
      if (root) root.unmount();
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error printing A5 bill:', error);
    // Safe cleanup
    try {
      if (root) root.unmount();
    } catch (e) {
      console.error('Error unmounting root:', e);
    }
    try {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    } catch (e) {
      console.error('Error removing container:', e);
    }
    throw error;
  }
};
