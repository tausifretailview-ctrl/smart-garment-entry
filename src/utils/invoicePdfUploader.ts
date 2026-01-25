import jsPDF from 'jspdf';
import { supabase } from "@/integrations/supabase/client";

export interface InvoicePdfData {
  billNo: string;
  billDate: Date;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGst?: string;
  items: Array<{
    particulars: string;
    size: string;
    quantity: number;
    rate: number;
    mrp: number;
    discount?: number;
    gstPercent?: number;
    total: number;
    hsnCode?: string;
    color?: string;
  }>;
  grossAmount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  paymentMethod?: string;
  paidAmount?: number;
  // Business info
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyGst?: string;
}

/**
 * Generate a simple PDF invoice using jsPDF
 */
export function generateInvoicePdfBlob(data: InvoicePdfData): Blob {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = 20;

  // Header - Company Name
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text(data.companyName || 'Tax Invoice', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // Company details
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  if (data.companyAddress) {
    pdf.text(data.companyAddress, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
  }
  if (data.companyPhone) {
    pdf.text(`Phone: ${data.companyPhone}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
  }
  if (data.companyGst) {
    pdf.text(`GSTIN: ${data.companyGst}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
  }

  yPos += 5;
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Invoice details row
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Invoice No: ${data.billNo}`, margin, yPos);
  const dateStr = data.billDate instanceof Date 
    ? data.billDate.toLocaleDateString('en-IN') 
    : new Date(data.billDate).toLocaleDateString('en-IN');
  pdf.text(`Date: ${dateStr}`, pageWidth - margin, yPos, { align: 'right' });
  yPos += 10;

  // Customer details
  pdf.setFont('helvetica', 'bold');
  pdf.text('Bill To:', margin, yPos);
  yPos += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.customerName || 'Walk-in Customer', margin, yPos);
  yPos += 5;
  if (data.customerPhone) {
    pdf.text(`Phone: ${data.customerPhone}`, margin, yPos);
    yPos += 5;
  }
  if (data.customerAddress) {
    const addressLines = pdf.splitTextToSize(data.customerAddress, 80);
    pdf.text(addressLines, margin, yPos);
    yPos += addressLines.length * 4;
  }
  if (data.customerGst) {
    pdf.text(`GSTIN: ${data.customerGst}`, margin, yPos);
    yPos += 5;
  }

  yPos += 5;

  // Items table header
  const colWidths = [10, 55, 15, 15, 20, 20, 25, 20];
  const colX = [margin];
  for (let i = 1; i < colWidths.length; i++) {
    colX.push(colX[i - 1] + colWidths[i - 1]);
  }

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  
  const headers = ['#', 'Particulars', 'Size', 'Qty', 'Rate', 'MRP', 'Disc%', 'Amount'];
  headers.forEach((header, i) => {
    pdf.text(header, colX[i] + 1, yPos);
  });
  yPos += 6;

  // Items
  pdf.setFont('helvetica', 'normal');
  data.items.forEach((item, index) => {
    if (yPos > 260) {
      pdf.addPage();
      yPos = 20;
    }
    
    const row = [
      (index + 1).toString(),
      item.particulars.substring(0, 25),
      item.size || '-',
      item.quantity.toString(),
      item.rate.toFixed(0),
      item.mrp.toFixed(0),
      (item.discount || 0).toFixed(1),
      item.total.toFixed(2)
    ];
    
    row.forEach((cell, i) => {
      pdf.text(cell, colX[i] + 1, yPos);
    });
    yPos += 5;
  });

  yPos += 5;
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  // Totals
  const totalsX = pageWidth - margin - 60;
  pdf.setFont('helvetica', 'normal');
  pdf.text('Gross Amount:', totalsX, yPos);
  pdf.text(`₹${data.grossAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
  yPos += 5;

  if (data.discountAmount > 0) {
    pdf.text('Discount:', totalsX, yPos);
    pdf.text(`-₹${data.discountAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 5;
  }

  if (data.taxAmount > 0) {
    pdf.text('GST:', totalsX, yPos);
    pdf.text(`₹${data.taxAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 5;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.text('Net Amount:', totalsX, yPos);
  pdf.text(`₹${data.netAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
  yPos += 8;

  // Payment info
  if (data.paymentMethod) {
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Payment: ${data.paymentMethod}`, margin, yPos);
    if (data.paidAmount !== undefined) {
      pdf.text(`Paid: ₹${data.paidAmount.toFixed(2)}`, margin + 60, yPos);
    }
  }

  // Footer
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.text('Thank you for your business!', pageWidth / 2, 285, { align: 'center' });

  return pdf.output('blob');
}

/**
 * Generate and upload invoice PDF to Supabase Storage
 * Returns the public URL of the uploaded PDF
 */
export async function generateAndUploadInvoicePDF(
  data: InvoicePdfData,
  organizationId: string
): Promise<string> {
  try {
    // Generate PDF blob
    const pdfBlob = generateInvoicePdfBlob(data);
    
    // Create unique filename
    const timestamp = Date.now();
    const safeInvoiceNo = data.billNo.replace(/[^a-zA-Z0-9-]/g, '_');
    const fileName = `${organizationId}/${safeInvoiceNo}_${timestamp}.pdf`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('invoice-pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Error uploading invoice PDF:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('invoice-pdfs')
      .getPublicUrl(fileName);
    
    if (!urlData?.publicUrl) {
      throw new Error('Failed to get public URL for uploaded PDF');
    }
    
    console.log('Invoice PDF uploaded successfully:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error in generateAndUploadInvoicePDF:', error);
    throw error;
  }
}

/**
 * Delete an invoice PDF from storage
 */
export async function deleteInvoicePDF(publicUrl: string): Promise<void> {
  try {
    // Extract path from public URL
    const urlParts = publicUrl.split('/invoice-pdfs/');
    if (urlParts.length < 2) return;
    
    const filePath = urlParts[1];
    
    await supabase.storage
      .from('invoice-pdfs')
      .remove([filePath]);
      
    console.log('Invoice PDF deleted:', filePath);
  } catch (error) {
    console.error('Error deleting invoice PDF:', error);
  }
}
