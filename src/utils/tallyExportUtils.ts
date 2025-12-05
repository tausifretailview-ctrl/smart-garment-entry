import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { isInterState, calculateTaxableFromInclusive } from './gstRegisterUtils';

// Tally-compatible date format
const formatTallyDate = (date: string | Date) => {
  return format(new Date(date), 'dd-MMM-yyyy');
};

// Format currency for Tally (2 decimal places)
const formatAmount = (amount: number) => {
  return Number(amount.toFixed(2));
};

// Extract state code from GSTIN (first 2 digits)
const getStateCode = (gstin: string | null | undefined): string => {
  if (!gstin || gstin.length < 2) return '';
  return gstin.substring(0, 2);
};

// Calculate GST for a single item
const calculateItemGST = (
  lineTotal: number,
  gstPercent: number,
  isInterStateTransaction: boolean,
  taxType: 'inclusive' | 'exclusive' = 'exclusive'
) => {
  let taxableAmount: number;
  let gstAmount: number;

  if (taxType === 'inclusive') {
    taxableAmount = calculateTaxableFromInclusive(lineTotal, gstPercent);
    gstAmount = lineTotal - taxableAmount;
  } else {
    taxableAmount = lineTotal;
    gstAmount = taxableAmount * (gstPercent / 100);
  }

  taxableAmount = Math.round(taxableAmount * 100) / 100;
  gstAmount = Math.round(gstAmount * 100) / 100;

  if (isInterStateTransaction) {
    return {
      taxableAmount,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: gstPercent,
      igstAmount: gstAmount
    };
  } else {
    return {
      taxableAmount,
      cgstRate: gstPercent / 2,
      cgstAmount: Math.round((gstAmount / 2) * 100) / 100,
      sgstRate: gstPercent / 2,
      sgstAmount: Math.round((gstAmount / 2) * 100) / 100,
      igstRate: 0,
      igstAmount: 0
    };
  }
};

// Interfaces
interface TallyLedgerMaster {
  name: string;
  parent: string;
  gstin: string;
  address: string;
  mobile: string;
  openingBalance: number;
  balanceType: string;
}

interface TallyStockItem {
  name: string;
  under: string;
  units: string;
  hsnCode: string;
  gstRate: number;
  standardRate: number;
}

interface TallySalesVoucher {
  date: string;
  voucherNo: string;
  partyLedger: string;
  partyGstin: string;
  itemName: string;
  hsnCode: string;
  qty: number;
  rate: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

interface TallyPurchaseVoucher {
  date: string;
  voucherNo: string;
  partyLedger: string;
  partyGstin: string;
  itemName: string;
  hsnCode: string;
  qty: number;
  rate: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

interface TallyReceiptVoucher {
  date: string;
  voucherNo: string;
  partyLedger: string;
  amount: number;
  paymentMode: string;
  referenceNo: string;
}

// Transform customers to Tally Ledger Masters
export const transformCustomersToLedgers = (customers: any[]): TallyLedgerMaster[] => {
  return customers.map(customer => ({
    name: customer.customer_name || 'Unknown',
    parent: 'Sundry Debtors',
    gstin: customer.gst_number || '',
    address: customer.address || '',
    mobile: customer.phone || '',
    openingBalance: formatAmount(customer.opening_balance || 0),
    balanceType: (customer.opening_balance || 0) >= 0 ? 'Dr' : 'Cr'
  }));
};

// Transform suppliers to Tally Ledger Masters
export const transformSuppliersToLedgers = (suppliers: any[]): TallyLedgerMaster[] => {
  return suppliers.map(supplier => ({
    name: supplier.supplier_name || 'Unknown',
    parent: 'Sundry Creditors',
    gstin: supplier.gst_number || '',
    address: supplier.address || '',
    mobile: supplier.phone || '',
    openingBalance: formatAmount(supplier.opening_balance || 0),
    balanceType: (supplier.opening_balance || 0) >= 0 ? 'Cr' : 'Dr'
  }));
};

// Transform products to Tally Stock Items
export const transformProductsToStockItems = (products: any[]): TallyStockItem[] => {
  return products.map(product => ({
    name: product.product_name || 'Unknown',
    under: product.category || 'Primary',
    units: 'Nos',
    hsnCode: product.hsn_code || '',
    gstRate: product.gst_per || 0,
    standardRate: formatAmount(product.default_sale_price || 0)
  }));
};

// Helper function to extract serial number from voucher number (e.g., "POS/25-26/71" -> 71)
const extractSerialNumber = (voucherNo: string): number => {
  if (!voucherNo) return 0;
  const parts = voucherNo.split('/');
  const lastPart = parts[parts.length - 1];
  return parseInt(lastPart, 10) || 0;
};

// Transform sales to Tally Sales Vouchers
export const transformSalesToVouchers = (
  sales: any[], 
  orgGstin: string
): TallySalesVoucher[] => {
  const vouchers: TallySalesVoucher[] = [];
  
  // Sort sales by date and sale_number before processing
  const sortedSales = [...sales].sort((a, b) => {
    // First sort by date
    const dateA = new Date(a.sale_date).getTime();
    const dateB = new Date(b.sale_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    // Then sort by voucher serial number
    const serialA = extractSerialNumber(a.sale_number);
    const serialB = extractSerialNumber(b.sale_number);
    return serialA - serialB;
  });
  
  sortedSales.forEach(sale => {
    const saleItems = sale.sale_items || [];
    const customerGstin = sale.customer_gstin || '';
    const isInterStateTransaction = isInterState(orgGstin, customerGstin);
    
    saleItems.forEach((item: any) => {
      const gstBreakup = calculateItemGST(
        item.line_total || 0,
        item.gst_percent || 0,
        isInterStateTransaction,
        (sale.tax_type as 'inclusive' | 'exclusive') || 'exclusive'
      );
      
      vouchers.push({
        date: formatTallyDate(sale.sale_date),
        voucherNo: sale.sale_number || '',
        partyLedger: sale.customer_name || 'Cash Sales',
        partyGstin: customerGstin,
        itemName: item.product_name || '',
        hsnCode: item.hsn_code || '',
        qty: item.quantity || 0,
        rate: formatAmount(item.unit_price || 0),
        taxableAmount: formatAmount(gstBreakup.taxableAmount),
        cgstRate: gstBreakup.cgstRate,
        cgstAmount: formatAmount(gstBreakup.cgstAmount),
        sgstRate: gstBreakup.sgstRate,
        sgstAmount: formatAmount(gstBreakup.sgstAmount),
        igstRate: gstBreakup.igstRate,
        igstAmount: formatAmount(gstBreakup.igstAmount),
        totalAmount: formatAmount(item.line_total || 0)
      });
    });
  });
  
  return vouchers;
};

// Transform purchases to Tally Purchase Vouchers
export const transformPurchasesToVouchers = (
  purchases: any[], 
  orgGstin: string
): TallyPurchaseVoucher[] => {
  const vouchers: TallyPurchaseVoucher[] = [];
  
  // Sort purchases by date and bill number
  const sortedPurchases = [...purchases].sort((a, b) => {
    const dateA = new Date(a.bill_date).getTime();
    const dateB = new Date(b.bill_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    const serialA = extractSerialNumber(a.software_bill_no || a.supplier_invoice_no || '');
    const serialB = extractSerialNumber(b.software_bill_no || b.supplier_invoice_no || '');
    return serialA - serialB;
  });
  
  sortedPurchases.forEach(purchase => {
    const purchaseItems = purchase.purchase_items || [];
    const supplierGstin = purchase.supplier?.gst_number || '';
    const isInterStateTransaction = isInterState(orgGstin, supplierGstin);
    
    purchaseItems.forEach((item: any) => {
      const lineTotal = item.line_total || (item.qty * item.pur_price);
      const gstBreakup = calculateItemGST(
        lineTotal,
        item.gst_per || 0,
        isInterStateTransaction,
        'exclusive'
      );
      
      vouchers.push({
        date: formatTallyDate(purchase.bill_date),
        voucherNo: purchase.software_bill_no || purchase.supplier_invoice_no || '',
        partyLedger: purchase.supplier_name || 'Cash Purchases',
        partyGstin: supplierGstin,
        itemName: item.product_name || '',
        hsnCode: item.hsn_code || '',
        qty: item.qty || 0,
        rate: formatAmount(item.pur_price || 0),
        taxableAmount: formatAmount(gstBreakup.taxableAmount),
        cgstRate: gstBreakup.cgstRate,
        cgstAmount: formatAmount(gstBreakup.cgstAmount),
        sgstRate: gstBreakup.sgstRate,
        sgstAmount: formatAmount(gstBreakup.sgstAmount),
        igstRate: gstBreakup.igstRate,
        igstAmount: formatAmount(gstBreakup.igstAmount),
        totalAmount: formatAmount(lineTotal)
      });
    });
  });
  
  return vouchers;
};

// Transform sale returns to Tally Credit Note Vouchers
export const transformSaleReturnsToCreditNotes = (
  saleReturns: any[],
  orgGstin: string
): TallySalesVoucher[] => {
  const vouchers: TallySalesVoucher[] = [];
  
  // Sort sale returns by date and return number
  const sortedReturns = [...saleReturns].sort((a, b) => {
    const dateA = new Date(a.return_date).getTime();
    const dateB = new Date(b.return_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    const serialA = extractSerialNumber(a.return_number || '');
    const serialB = extractSerialNumber(b.return_number || '');
    return serialA - serialB;
  });
  
  sortedReturns.forEach(saleReturn => {
    const returnItems = saleReturn.sale_return_items || [];
    const customerGstin = saleReturn.customer_gstin || '';
    const isInterStateTransaction = isInterState(orgGstin, customerGstin);
    
    returnItems.forEach((item: any) => {
      const gstBreakup = calculateItemGST(
        item.line_total || 0,
        item.gst_percent || 0,
        isInterStateTransaction,
        'exclusive'
      );
      
      vouchers.push({
        date: formatTallyDate(saleReturn.return_date),
        voucherNo: saleReturn.return_number || '',
        partyLedger: saleReturn.customer_name || 'Cash Sales',
        partyGstin: customerGstin,
        itemName: item.product_name || '',
        hsnCode: item.hsn_code || '',
        qty: item.quantity || 0,
        rate: formatAmount(item.unit_price || 0),
        taxableAmount: formatAmount(gstBreakup.taxableAmount),
        cgstRate: gstBreakup.cgstRate,
        cgstAmount: formatAmount(gstBreakup.cgstAmount),
        sgstRate: gstBreakup.sgstRate,
        sgstAmount: formatAmount(gstBreakup.sgstAmount),
        igstRate: gstBreakup.igstRate,
        igstAmount: formatAmount(gstBreakup.igstAmount),
        totalAmount: formatAmount(item.line_total || 0)
      });
    });
  });
  
  return vouchers;
};

// Transform purchase returns to Tally Debit Note Vouchers
export const transformPurchaseReturnsToDebitNotes = (
  purchaseReturns: any[],
  orgGstin: string
): TallyPurchaseVoucher[] => {
  const vouchers: TallyPurchaseVoucher[] = [];
  
  // Sort purchase returns by date and return number
  const sortedReturns = [...purchaseReturns].sort((a, b) => {
    const dateA = new Date(a.return_date).getTime();
    const dateB = new Date(b.return_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    const serialA = extractSerialNumber(a.return_number || '');
    const serialB = extractSerialNumber(b.return_number || '');
    return serialA - serialB;
  });
  
  sortedReturns.forEach(purchaseReturn => {
    const returnItems = purchaseReturn.purchase_return_items || [];
    const supplierGstin = purchaseReturn.supplier?.gst_number || '';
    const isInterStateTransaction = isInterState(orgGstin, supplierGstin);
    
    returnItems.forEach((item: any) => {
      const gstBreakup = calculateItemGST(
        item.line_total || 0,
        item.gst_per || 0,
        isInterStateTransaction,
        'exclusive'
      );
      
      vouchers.push({
        date: formatTallyDate(purchaseReturn.return_date),
        voucherNo: purchaseReturn.return_number || '',
        partyLedger: purchaseReturn.supplier_name || 'Cash Purchases',
        partyGstin: supplierGstin,
        itemName: item.product_name || '',
        hsnCode: item.hsn_code || '',
        qty: item.qty || 0,
        rate: formatAmount(item.pur_price || 0),
        taxableAmount: formatAmount(gstBreakup.taxableAmount),
        cgstRate: gstBreakup.cgstRate,
        cgstAmount: formatAmount(gstBreakup.cgstAmount),
        sgstRate: gstBreakup.sgstRate,
        sgstAmount: formatAmount(gstBreakup.sgstAmount),
        igstRate: gstBreakup.igstRate,
        igstAmount: formatAmount(gstBreakup.igstAmount),
        totalAmount: formatAmount(item.line_total || 0)
      });
    });
  });
  
  return vouchers;
};

// Transform voucher entries (receipts) to Tally Receipt Vouchers
export const transformReceiptsToVouchers = (vouchers: any[]): TallyReceiptVoucher[] => {
  return vouchers
    .filter(v => v.voucher_type === 'RECEIPT')
    .sort((a, b) => {
      const dateA = new Date(a.voucher_date).getTime();
      const dateB = new Date(b.voucher_date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return extractSerialNumber(a.voucher_number || '') - extractSerialNumber(b.voucher_number || '');
    })
    .map(voucher => ({
      date: formatTallyDate(voucher.voucher_date),
      voucherNo: voucher.voucher_number || '',
      partyLedger: voucher.description || 'Cash',
      amount: formatAmount(voucher.total_amount || 0),
      paymentMode: 'Cash',
      referenceNo: voucher.reference_id || ''
    }));
};

// Transform voucher entries (payments) to Tally Payment Vouchers
export const transformPaymentsToVouchers = (vouchers: any[]): TallyReceiptVoucher[] => {
  return vouchers
    .filter(v => v.voucher_type === 'PAYMENT')
    .sort((a, b) => {
      const dateA = new Date(a.voucher_date).getTime();
      const dateB = new Date(b.voucher_date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return extractSerialNumber(a.voucher_number || '') - extractSerialNumber(b.voucher_number || '');
    })
    .map(voucher => ({
      date: formatTallyDate(voucher.voucher_date),
      voucherNo: voucher.voucher_number || '',
      partyLedger: voucher.description || 'Cash',
      amount: formatAmount(voucher.total_amount || 0),
      paymentMode: 'Cash',
      referenceNo: voucher.reference_id || ''
    }));
};

// Generate Excel workbook for Tally import
export const generateTallyExcel = (data: {
  ledgerMasters?: TallyLedgerMaster[];
  stockItems?: TallyStockItem[];
  salesVouchers?: TallySalesVoucher[];
  purchaseVouchers?: TallyPurchaseVoucher[];
  creditNotes?: TallySalesVoucher[];
  debitNotes?: TallyPurchaseVoucher[];
  receiptVouchers?: TallyReceiptVoucher[];
  paymentVouchers?: TallyReceiptVoucher[];
}) => {
  const workbook = XLSX.utils.book_new();
  
  // Sheet 1: Ledger Masters
  if (data.ledgerMasters && data.ledgerMasters.length > 0) {
    const ledgerData = data.ledgerMasters.map(l => ({
      'Name': l.name,
      'Parent': l.parent,
      'GSTIN/UIN': l.gstin,
      'Address': l.address,
      'Mobile': l.mobile,
      'Opening Balance': l.openingBalance,
      'Balance Type': l.balanceType
    }));
    const ledgerSheet = XLSX.utils.json_to_sheet(ledgerData);
    XLSX.utils.book_append_sheet(workbook, ledgerSheet, 'Ledger Masters');
  }
  
  // Sheet 2: Stock Items
  if (data.stockItems && data.stockItems.length > 0) {
    const stockData = data.stockItems.map(s => ({
      'Name': s.name,
      'Under': s.under,
      'Units': s.units,
      'HSN/SAC': s.hsnCode,
      'GST Rate (%)': s.gstRate,
      'Standard Rate': s.standardRate
    }));
    const stockSheet = XLSX.utils.json_to_sheet(stockData);
    XLSX.utils.book_append_sheet(workbook, stockSheet, 'Stock Items');
  }
  
  // Sheet 3: Sales Vouchers
  if (data.salesVouchers && data.salesVouchers.length > 0) {
    const salesData = data.salesVouchers.map(s => ({
      'Date': s.date,
      'Voucher No': s.voucherNo,
      'Party Ledger': s.partyLedger,
      'Party GSTIN': s.partyGstin,
      'Item Name': s.itemName,
      'HSN/SAC': s.hsnCode,
      'Qty': s.qty,
      'Rate': s.rate,
      'Taxable Amount': s.taxableAmount,
      'CGST Rate (%)': s.cgstRate,
      'CGST Amount': s.cgstAmount,
      'SGST Rate (%)': s.sgstRate,
      'SGST Amount': s.sgstAmount,
      'IGST Rate (%)': s.igstRate,
      'IGST Amount': s.igstAmount,
      'Total Amount': s.totalAmount
    }));
    const salesSheet = XLSX.utils.json_to_sheet(salesData);
    XLSX.utils.book_append_sheet(workbook, salesSheet, 'Sales Vouchers');
  }
  
  // Sheet 4: Purchase Vouchers
  if (data.purchaseVouchers && data.purchaseVouchers.length > 0) {
    const purchaseData = data.purchaseVouchers.map(p => ({
      'Date': p.date,
      'Voucher No': p.voucherNo,
      'Party Ledger': p.partyLedger,
      'Party GSTIN': p.partyGstin,
      'Item Name': p.itemName,
      'HSN/SAC': p.hsnCode,
      'Qty': p.qty,
      'Rate': p.rate,
      'Taxable Amount': p.taxableAmount,
      'CGST Rate (%)': p.cgstRate,
      'CGST Amount': p.cgstAmount,
      'SGST Rate (%)': p.sgstRate,
      'SGST Amount': p.sgstAmount,
      'IGST Rate (%)': p.igstRate,
      'IGST Amount': p.igstAmount,
      'Total Amount': p.totalAmount
    }));
    const purchaseSheet = XLSX.utils.json_to_sheet(purchaseData);
    XLSX.utils.book_append_sheet(workbook, purchaseSheet, 'Purchase Vouchers');
  }
  
  // Sheet 5: Credit Notes (Sale Returns)
  if (data.creditNotes && data.creditNotes.length > 0) {
    const creditData = data.creditNotes.map(c => ({
      'Date': c.date,
      'Voucher No': c.voucherNo,
      'Party Ledger': c.partyLedger,
      'Party GSTIN': c.partyGstin,
      'Item Name': c.itemName,
      'HSN/SAC': c.hsnCode,
      'Qty': c.qty,
      'Rate': c.rate,
      'Taxable Amount': c.taxableAmount,
      'CGST Rate (%)': c.cgstRate,
      'CGST Amount': c.cgstAmount,
      'SGST Rate (%)': c.sgstRate,
      'SGST Amount': c.sgstAmount,
      'IGST Rate (%)': c.igstRate,
      'IGST Amount': c.igstAmount,
      'Total Amount': c.totalAmount
    }));
    const creditSheet = XLSX.utils.json_to_sheet(creditData);
    XLSX.utils.book_append_sheet(workbook, creditSheet, 'Credit Notes');
  }
  
  // Sheet 6: Debit Notes (Purchase Returns)
  if (data.debitNotes && data.debitNotes.length > 0) {
    const debitData = data.debitNotes.map(d => ({
      'Date': d.date,
      'Voucher No': d.voucherNo,
      'Party Ledger': d.partyLedger,
      'Party GSTIN': d.partyGstin,
      'Item Name': d.itemName,
      'HSN/SAC': d.hsnCode,
      'Qty': d.qty,
      'Rate': d.rate,
      'Taxable Amount': d.taxableAmount,
      'CGST Rate (%)': d.cgstRate,
      'CGST Amount': d.cgstAmount,
      'SGST Rate (%)': d.sgstRate,
      'SGST Amount': d.sgstAmount,
      'IGST Rate (%)': d.igstRate,
      'IGST Amount': d.igstAmount,
      'Total Amount': d.totalAmount
    }));
    const debitSheet = XLSX.utils.json_to_sheet(debitData);
    XLSX.utils.book_append_sheet(workbook, debitSheet, 'Debit Notes');
  }
  
  // Sheet 7: Receipt Vouchers
  if (data.receiptVouchers && data.receiptVouchers.length > 0) {
    const receiptData = data.receiptVouchers.map(r => ({
      'Date': r.date,
      'Voucher No': r.voucherNo,
      'Party Ledger': r.partyLedger,
      'Amount': r.amount,
      'Payment Mode': r.paymentMode,
      'Reference No': r.referenceNo
    }));
    const receiptSheet = XLSX.utils.json_to_sheet(receiptData);
    XLSX.utils.book_append_sheet(workbook, receiptSheet, 'Receipt Vouchers');
  }
  
  // Sheet 8: Payment Vouchers
  if (data.paymentVouchers && data.paymentVouchers.length > 0) {
    const paymentData = data.paymentVouchers.map(p => ({
      'Date': p.date,
      'Voucher No': p.voucherNo,
      'Party Ledger': p.partyLedger,
      'Amount': p.amount,
      'Payment Mode': p.paymentMode,
      'Reference No': p.referenceNo
    }));
    const paymentSheet = XLSX.utils.json_to_sheet(paymentData);
    XLSX.utils.book_append_sheet(workbook, paymentSheet, 'Payment Vouchers');
  }
  
  return workbook;
};

// Download workbook
export const downloadTallyExcel = (workbook: XLSX.WorkBook, filename: string) => {
  XLSX.writeFile(workbook, filename);
};
