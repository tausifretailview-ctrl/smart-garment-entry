import * as XLSX from 'xlsx';
import { format } from 'date-fns';

// GST Slabs supported
export const GST_SLABS = [0, 5, 12, 18, 28] as const;
export type GSTSlab = typeof GST_SLABS[number];

export interface GSTBreakup {
  taxable_0: number;
  taxable_5: number; cgst_2_5: number; sgst_2_5: number; igst_5: number;
  taxable_12: number; cgst_6: number; sgst_6: number; igst_12: number;
  taxable_18: number; cgst_9: number; sgst_9: number; igst_18: number;
  taxable_28: number; cgst_14: number; sgst_14: number; igst_28: number;
}

// FIX G9: Add IGST columns to SalesRegisterRow
export interface SalesRegisterRow {
  sno: number;
  invoiceNo: string;
  invoiceDate: string;
  partyName: string;
  gstin: string;
  taxable_0: number;
  taxable_5: number;
  cgst_2_5: number;
  sgst_2_5: number;
  igst_5: number;
  taxable_12: number;
  cgst_6: number;
  sgst_6: number;
  igst_12: number;
  taxable_18: number;
  cgst_9: number;
  sgst_9: number;
  igst_18: number;
  taxable_28: number;
  cgst_14: number;
  sgst_14: number;
  igst_28: number;
  invoiceValue: number;
}

export interface SaleReturnRegisterRow {
  sno: number;
  invoiceNo: string;
  invoiceDate: string;
  partyName: string;
  gstin: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  invoiceValue: number;
}

export interface PurchaseRegisterRow {
  sno: number;
  invoiceNo: string;
  invoiceDate: string;
  partyName: string;
  gstin: string;
  taxable_0: number;
  taxable_5: number;
  cgst_2_5: number;
  sgst_2_5: number;
  igst_5: number;
  taxable_12: number;
  cgst_6: number;
  sgst_6: number;
  igst_12: number;
  taxable_18: number;
  cgst_9: number;
  sgst_9: number;
  igst_18: number;
  taxable_28: number;
  cgst_14: number;
  sgst_14: number;
  igst_28: number;
  invoiceValue: number;
}

export interface PurchaseReturnRegisterRow {
  sno: number;
  invoiceNo: string;
  invoiceDate: string;
  partyName: string;
  gstin: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  invoiceValue: number;
}

// Extract state code from GSTIN (first 2 digits)
export const extractStateCode = (gstin: string | null): string => {
  if (!gstin || gstin.length < 2) return '';
  return gstin.substring(0, 2);
};

// Validate GSTIN format (basic validation)
export const validateGSTIN = (gstin: string | null): boolean => {
  if (!gstin) return false;
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin.toUpperCase());
};

// Determine if transaction is inter-state (IGST) or intra-state (CGST/SGST)
export const isInterState = (businessGSTIN: string | null, partyGSTIN: string | null): boolean => {
  const businessState = extractStateCode(businessGSTIN);
  const partyState = extractStateCode(partyGSTIN);
  
  // If party doesn't have GSTIN (B2C), assume intra-state
  if (!partyState) return false;
  
  return businessState !== partyState;
};

// Calculate taxable amount from total (for inclusive GST)
export const calculateTaxableFromInclusive = (total: number, gstPercent: number): number => {
  if (gstPercent === 0) return total;
  return total / (1 + gstPercent / 100);
};

// FIX G10: Calculate GST breakup — accumulate exact values, round only at the end
export const calculateGSTBreakup = (
  items: Array<{ gst_percent: number; line_total: number; unit_price?: number; quantity?: number }>,
  taxType: 'inclusive' | 'exclusive' = 'inclusive',
  isInterStateTransaction: boolean = false
): GSTBreakup => {
  const breakup: GSTBreakup = {
    taxable_0: 0,
    taxable_5: 0, cgst_2_5: 0, sgst_2_5: 0, igst_5: 0,
    taxable_12: 0, cgst_6: 0, sgst_6: 0, igst_12: 0,
    taxable_18: 0, cgst_9: 0, sgst_9: 0, igst_18: 0,
    taxable_28: 0, cgst_14: 0, sgst_14: 0, igst_28: 0,
  };

  items.forEach(item => {
    const gstPercent = item.gst_percent || 0;
    let taxableAmount: number;
    let gstAmount: number;

    if (taxType === 'inclusive') {
      // line_total includes GST — extract taxable
      taxableAmount = item.line_total / (1 + gstPercent / 100);
      gstAmount = item.line_total - taxableAmount;
    } else {
      // line_total is taxable amount (GST exclusive); GST is added on top
      taxableAmount = item.line_total;
      gstAmount = taxableAmount * (gstPercent / 100);
    }

    // FIX G10: Do NOT round per item — accumulate exact values

    switch (gstPercent) {
      case 0:
        breakup.taxable_0 += taxableAmount;
        break;
      case 5:
        breakup.taxable_5 += taxableAmount;
        if (isInterStateTransaction) {
          breakup.igst_5 += gstAmount;
        } else {
          breakup.cgst_2_5 += gstAmount / 2;
          breakup.sgst_2_5 += gstAmount / 2;
        }
        break;
      case 12:
        breakup.taxable_12 += taxableAmount;
        if (isInterStateTransaction) {
          breakup.igst_12 += gstAmount;
        } else {
          breakup.cgst_6 += gstAmount / 2;
          breakup.sgst_6 += gstAmount / 2;
        }
        break;
      case 18:
        breakup.taxable_18 += taxableAmount;
        if (isInterStateTransaction) {
          breakup.igst_18 += gstAmount;
        } else {
          breakup.cgst_9 += gstAmount / 2;
          breakup.sgst_9 += gstAmount / 2;
        }
        break;
      case 28:
        breakup.taxable_28 += taxableAmount;
        if (isInterStateTransaction) {
          breakup.igst_28 += gstAmount;
        } else {
          breakup.cgst_14 += gstAmount / 2;
          breakup.sgst_14 += gstAmount / 2;
        }
        break;
    }
  });

  // Round all values at the end (invoice-level rounding)
  Object.keys(breakup).forEach(key => {
    breakup[key as keyof GSTBreakup] = Math.round(breakup[key as keyof GSTBreakup] * 100) / 100;
  });

  return breakup;
};

// Calculate total invoice value from breakup
export const calculateInvoiceValue = (breakup: GSTBreakup): number => {
  const taxable = breakup.taxable_0 + breakup.taxable_5 + breakup.taxable_12 + breakup.taxable_18 + breakup.taxable_28;
  const cgst = breakup.cgst_2_5 + breakup.cgst_6 + breakup.cgst_9 + breakup.cgst_14;
  const sgst = breakup.sgst_2_5 + breakup.sgst_6 + breakup.sgst_9 + breakup.sgst_14;
  const igst = breakup.igst_5 + breakup.igst_12 + breakup.igst_18 + breakup.igst_28;
  return Math.round((taxable + cgst + sgst + igst) * 100) / 100;
};

// Generate Excel workbook with 5 sheets (including POS Sales)
export const generateGSTRegisterExcel = (
  salesData: SalesRegisterRow[],
  saleReturnData: SaleReturnRegisterRow[],
  purchaseData: PurchaseRegisterRow[],
  purchaseReturnData: PurchaseReturnRegisterRow[],
  businessName: string,
  businessGSTIN: string,
  fromDate: Date,
  toDate: Date,
  posSalesData?: SalesRegisterRow[]
): XLSX.WorkBook => {
  const workbook = XLSX.utils.book_new();
  const dateRange = `${format(fromDate, 'dd-MMMM-yyyy')} TO ${format(toDate, 'dd-MMMM-yyyy')}`;
  const printDate = format(new Date(), 'dd-MM-yyyy HH:mm');

  const createHeader = (sheetName: string) => [
    [`${sheetName}`],
    [`Business Name: ${businessName}`],
    [`GSTIN: ${businessGSTIN}`],
    [`Period: ${dateRange}`],
    [`Print Date: ${printDate}`],
    [],
  ];

  // FIX G9: Sales headers now include IGST columns
  const salesHeaders = [
    'S.No', 'Invoice No', 'Invoice Date', 'Party Name', 'GSTIN',
    'Taxable 0%',
    'Taxable 5%', 'CGST 2.5%', 'SGST 2.5%', 'IGST 5%',
    'Taxable 12%', 'CGST 6%', 'SGST 6%', 'IGST 12%',
    'Taxable 18%', 'CGST 9%', 'SGST 9%', 'IGST 18%',
    'Taxable 28%', 'CGST 14%', 'SGST 14%', 'IGST 28%',
    'Invoice Value'
  ];

  // FIX G9: Sales rows now include IGST values
  const salesRows = salesData.map(row => [
    row.sno, row.invoiceNo, row.invoiceDate, row.partyName, row.gstin,
    row.taxable_0,
    row.taxable_5, row.cgst_2_5, row.sgst_2_5, row.igst_5,
    row.taxable_12, row.cgst_6, row.sgst_6, row.igst_12,
    row.taxable_18, row.cgst_9, row.sgst_9, row.igst_18,
    row.taxable_28, row.cgst_14, row.sgst_14, row.igst_28,
    row.invoiceValue
  ]);

  const salesTotals = calculateSalesTotals(salesData);
  salesRows.push([
    '', 'TOTAL', '', '', '',
    salesTotals.taxable_0,
    salesTotals.taxable_5, salesTotals.cgst_2_5, salesTotals.sgst_2_5, salesTotals.igst_5,
    salesTotals.taxable_12, salesTotals.cgst_6, salesTotals.sgst_6, salesTotals.igst_12,
    salesTotals.taxable_18, salesTotals.cgst_9, salesTotals.sgst_9, salesTotals.igst_18,
    salesTotals.taxable_28, salesTotals.cgst_14, salesTotals.sgst_14, salesTotals.igst_28,
    salesTotals.invoiceValue
  ]);

  const salesSheetData = [...createHeader('SALES REGISTER'), salesHeaders, ...salesRows];
  const salesSheet = XLSX.utils.aoa_to_sheet(salesSheetData);
  setColumnWidths(salesSheet, [5, 15, 12, 25, 18, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, salesSheet, 'Sales Register');

  // ===== Sale Return Register Sheet =====
  const saleReturnHeaders = [
    'S.No', 'Credit Note No', 'Date', 'Party Name', 'GSTIN',
    'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Value'
  ];

  const saleReturnRows = saleReturnData.map(row => [
    row.sno, row.invoiceNo, row.invoiceDate, row.partyName, row.gstin,
    row.taxableValue, row.cgst, row.sgst, row.igst, row.invoiceValue
  ]);

  const saleReturnTotals = calculateReturnTotals(saleReturnData);
  saleReturnRows.push([
    '', 'TOTAL', '', '', '',
    saleReturnTotals.taxableValue, saleReturnTotals.cgst, saleReturnTotals.sgst, 
    saleReturnTotals.igst, saleReturnTotals.invoiceValue
  ]);

  const saleReturnSheetData = [...createHeader('SALE RETURN REGISTER'), saleReturnHeaders, ...saleReturnRows];
  const saleReturnSheet = XLSX.utils.aoa_to_sheet(saleReturnSheetData);
  setColumnWidths(saleReturnSheet, [5, 15, 12, 25, 18, 14, 12, 12, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, saleReturnSheet, 'Sale Return Register');

  // ===== Purchase Register Sheet =====
  const purchaseHeaders = [
    'S.No', 'Invoice No', 'Invoice Date', 'Party Name', 'GSTIN',
    'Taxable 0%', 'Taxable 5%', 'CGST 2.5%', 'SGST 2.5%', 'IGST 5%',
    'Taxable 12%', 'CGST 6%', 'SGST 6%', 'IGST 12%',
    'Taxable 18%', 'CGST 9%', 'SGST 9%', 'IGST 18%',
    'Taxable 28%', 'CGST 14%', 'SGST 14%', 'IGST 28%',
    'Invoice Value'
  ];

  const purchaseRows = purchaseData.map(row => [
    row.sno, row.invoiceNo, row.invoiceDate, row.partyName, row.gstin,
    row.taxable_0, row.taxable_5, row.cgst_2_5, row.sgst_2_5, row.igst_5,
    row.taxable_12, row.cgst_6, row.sgst_6, row.igst_12,
    row.taxable_18, row.cgst_9, row.sgst_9, row.igst_18,
    row.taxable_28, row.cgst_14, row.sgst_14, row.igst_28,
    row.invoiceValue
  ]);

  const purchaseTotals = calculatePurchaseTotals(purchaseData);
  purchaseRows.push([
    '', 'TOTAL', '', '', '',
    purchaseTotals.taxable_0, purchaseTotals.taxable_5, purchaseTotals.cgst_2_5, purchaseTotals.sgst_2_5, purchaseTotals.igst_5,
    purchaseTotals.taxable_12, purchaseTotals.cgst_6, purchaseTotals.sgst_6, purchaseTotals.igst_12,
    purchaseTotals.taxable_18, purchaseTotals.cgst_9, purchaseTotals.sgst_9, purchaseTotals.igst_18,
    purchaseTotals.taxable_28, purchaseTotals.cgst_14, purchaseTotals.sgst_14, purchaseTotals.igst_28,
    purchaseTotals.invoiceValue
  ]);

  const purchaseSheetData = [...createHeader('PURCHASE REGISTER'), purchaseHeaders, ...purchaseRows];
  const purchaseSheet = XLSX.utils.aoa_to_sheet(purchaseSheetData);
  setColumnWidths(purchaseSheet, [5, 15, 12, 25, 18, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, purchaseSheet, 'Purchase Register');

  // ===== Purchase Return Register Sheet =====
  const purchaseReturnHeaders = [
    'S.No', 'Debit Note No', 'Date', 'Party Name', 'GSTIN',
    'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Value'
  ];

  const purchaseReturnRows = purchaseReturnData.map(row => [
    row.sno, row.invoiceNo, row.invoiceDate, row.partyName, row.gstin,
    row.taxableValue, row.cgst, row.sgst, row.igst, row.invoiceValue
  ]);

  const purchaseReturnTotals = calculateReturnTotals(purchaseReturnData);
  purchaseReturnRows.push([
    '', 'TOTAL', '', '', '',
    purchaseReturnTotals.taxableValue, purchaseReturnTotals.cgst, purchaseReturnTotals.sgst,
    purchaseReturnTotals.igst, purchaseReturnTotals.invoiceValue
  ]);

  const purchaseReturnSheetData = [...createHeader('PURCHASE RETURN REGISTER'), purchaseReturnHeaders, ...purchaseReturnRows];
  const purchaseReturnSheet = XLSX.utils.aoa_to_sheet(purchaseReturnSheetData);
  setColumnWidths(purchaseReturnSheet, [5, 15, 12, 25, 18, 14, 12, 12, 12, 14]);
  XLSX.utils.book_append_sheet(workbook, purchaseReturnSheet, 'Purchase Return Register');

  // ===== POS Sales Register Sheet =====
  if (posSalesData && posSalesData.length > 0) {
    const posSalesRows = posSalesData.map(row => [
      row.sno, row.invoiceNo, row.invoiceDate, row.partyName, row.gstin,
      row.taxable_0,
      row.taxable_5, row.cgst_2_5, row.sgst_2_5, row.igst_5,
      row.taxable_12, row.cgst_6, row.sgst_6, row.igst_12,
      row.taxable_18, row.cgst_9, row.sgst_9, row.igst_18,
      row.taxable_28, row.cgst_14, row.sgst_14, row.igst_28,
      row.invoiceValue
    ]);

    const posSalesTotals = calculateSalesTotals(posSalesData);
    posSalesRows.push([
      '', 'TOTAL', '', '', '',
      posSalesTotals.taxable_0,
      posSalesTotals.taxable_5, posSalesTotals.cgst_2_5, posSalesTotals.sgst_2_5, posSalesTotals.igst_5,
      posSalesTotals.taxable_12, posSalesTotals.cgst_6, posSalesTotals.sgst_6, posSalesTotals.igst_12,
      posSalesTotals.taxable_18, posSalesTotals.cgst_9, posSalesTotals.sgst_9, posSalesTotals.igst_18,
      posSalesTotals.taxable_28, posSalesTotals.cgst_14, posSalesTotals.sgst_14, posSalesTotals.igst_28,
      posSalesTotals.invoiceValue
    ]);

    const posSalesSheetData = [...createHeader('POS SALES REGISTER'), salesHeaders, ...posSalesRows];
    const posSalesSheet = XLSX.utils.aoa_to_sheet(posSalesSheetData);
    setColumnWidths(posSalesSheet, [5, 15, 12, 25, 18, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 14]);
    XLSX.utils.book_append_sheet(workbook, posSalesSheet, 'POS Sales Register');
  }

  return workbook;
};

// Helper to set column widths
const setColumnWidths = (sheet: XLSX.WorkSheet, widths: number[]) => {
  sheet['!cols'] = widths.map(w => ({ wch: w }));
};

// FIX G9: Calculate totals for sales (now includes IGST)
const calculateSalesTotals = (data: SalesRegisterRow[]) => ({
  taxable_0: round(data.reduce((sum, r) => sum + r.taxable_0, 0)),
  taxable_5: round(data.reduce((sum, r) => sum + r.taxable_5, 0)),
  cgst_2_5: round(data.reduce((sum, r) => sum + r.cgst_2_5, 0)),
  sgst_2_5: round(data.reduce((sum, r) => sum + r.sgst_2_5, 0)),
  igst_5: round(data.reduce((sum, r) => sum + r.igst_5, 0)),
  taxable_12: round(data.reduce((sum, r) => sum + r.taxable_12, 0)),
  cgst_6: round(data.reduce((sum, r) => sum + r.cgst_6, 0)),
  sgst_6: round(data.reduce((sum, r) => sum + r.sgst_6, 0)),
  igst_12: round(data.reduce((sum, r) => sum + r.igst_12, 0)),
  taxable_18: round(data.reduce((sum, r) => sum + r.taxable_18, 0)),
  cgst_9: round(data.reduce((sum, r) => sum + r.cgst_9, 0)),
  sgst_9: round(data.reduce((sum, r) => sum + r.sgst_9, 0)),
  igst_18: round(data.reduce((sum, r) => sum + r.igst_18, 0)),
  taxable_28: round(data.reduce((sum, r) => sum + r.taxable_28, 0)),
  cgst_14: round(data.reduce((sum, r) => sum + r.cgst_14, 0)),
  sgst_14: round(data.reduce((sum, r) => sum + r.sgst_14, 0)),
  igst_28: round(data.reduce((sum, r) => sum + r.igst_28, 0)),
  invoiceValue: round(data.reduce((sum, r) => sum + r.invoiceValue, 0)),
});

// Calculate totals for purchases
const calculatePurchaseTotals = (data: PurchaseRegisterRow[]) => ({
  taxable_0: round(data.reduce((sum, r) => sum + r.taxable_0, 0)),
  taxable_5: round(data.reduce((sum, r) => sum + r.taxable_5, 0)),
  cgst_2_5: round(data.reduce((sum, r) => sum + r.cgst_2_5, 0)),
  sgst_2_5: round(data.reduce((sum, r) => sum + r.sgst_2_5, 0)),
  igst_5: round(data.reduce((sum, r) => sum + r.igst_5, 0)),
  taxable_12: round(data.reduce((sum, r) => sum + r.taxable_12, 0)),
  cgst_6: round(data.reduce((sum, r) => sum + r.cgst_6, 0)),
  sgst_6: round(data.reduce((sum, r) => sum + r.sgst_6, 0)),
  igst_12: round(data.reduce((sum, r) => sum + r.igst_12, 0)),
  taxable_18: round(data.reduce((sum, r) => sum + r.taxable_18, 0)),
  cgst_9: round(data.reduce((sum, r) => sum + r.cgst_9, 0)),
  sgst_9: round(data.reduce((sum, r) => sum + r.sgst_9, 0)),
  igst_18: round(data.reduce((sum, r) => sum + r.igst_18, 0)),
  taxable_28: round(data.reduce((sum, r) => sum + r.taxable_28, 0)),
  cgst_14: round(data.reduce((sum, r) => sum + r.cgst_14, 0)),
  sgst_14: round(data.reduce((sum, r) => sum + r.sgst_14, 0)),
  igst_28: round(data.reduce((sum, r) => sum + r.igst_28, 0)),
  invoiceValue: round(data.reduce((sum, r) => sum + r.invoiceValue, 0)),
});

// Calculate totals for returns
const calculateReturnTotals = (data: SaleReturnRegisterRow[] | PurchaseReturnRegisterRow[]) => ({
  taxableValue: round(data.reduce((sum, r) => sum + r.taxableValue, 0)),
  cgst: round(data.reduce((sum, r) => sum + r.cgst, 0)),
  sgst: round(data.reduce((sum, r) => sum + r.sgst, 0)),
  igst: round(data.reduce((sum, r) => sum + r.igst, 0)),
  invoiceValue: round(data.reduce((sum, r) => sum + r.invoiceValue, 0)),
});

const round = (num: number) => Math.round(num * 100) / 100;

// Download workbook as file
export const downloadGSTRegisterExcel = (
  workbook: XLSX.WorkBook,
  businessGSTIN: string,
  fromDate: Date,
  toDate: Date
) => {
  const filename = `Sale_Purchase_Register_${businessGSTIN}_${format(fromDate, 'd-MMMM-yyyy')}_TO_${format(toDate, 'd-MMMM-yyyy')}.xlsx`;
  XLSX.writeFile(workbook, filename);
};
