// ─────────────────────────────────────────────────────────────────
// ESC/POS Command Generator for Thermal Receipt Printers
// Supports 80mm (48 chars) and 58mm (32 chars) widths
// Compatible with: Epson TM-T82, TVS RP3200, Sam4s, Rugtek, Sewoo
// ─────────────────────────────────────────────────────────────────

const ESC = '\x1B';
const GS  = '\x1D';

export const ESCPOS = {
  INIT:            ESC + '@',
  LF:              '\x0A',
  CUT_PARTIAL:     GS  + 'VA\x05',
  CUT_FULL:        GS  + 'VA\x00',

  ALIGN_LEFT:      ESC + 'a\x00',
  ALIGN_CENTER:    ESC + 'a\x01',
  ALIGN_RIGHT:     ESC + 'a\x02',

  BOLD_ON:         ESC + 'E\x01',
  BOLD_OFF:        ESC + 'E\x00',

  DOUBLE_HEIGHT:   ESC + '!\x10',
  DOUBLE_WIDTH:    ESC + '!\x20',
  DOUBLE_BOTH:     ESC + '!\x30',
  NORMAL_SIZE:     ESC + '!\x00',

  FEED: (n: number) => ESC + 'd' + String.fromCharCode(Math.min(n, 255)),

  DRAWER_PIN2:     ESC + 'p\x00\x19\xFA',
  DRAWER_PIN5:     ESC + 'p\x01\x19\xFA',

  CODEPAGE_PC437:  ESC + 't\x00',
};

// ─── Helper functions ────────────────────────────────────────────

const padRight = (text: string, width: number): string => {
  if (!text) return ' '.repeat(width);
  if (text.length >= width) return text.substring(0, width);
  return text + ' '.repeat(width - text.length);
};

const padLeft = (text: string, width: number): string => {
  if (!text) return ' '.repeat(width);
  if (text.length >= width) return text.substring(0, width);
  return ' '.repeat(width - text.length) + text;
};

const centerText = (text: string, width: number): string => {
  if (text.length >= width) return text.substring(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
};

const leftRight = (left: string, right: string, width: number): string => {
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
};

const fmtINR = (n: number): string => 'Rs.' + Math.round(Math.abs(n)).toLocaleString('en-IN');
const fmtINRDec = (n: number): string => 'Rs.' + Math.abs(n).toFixed(2);

// ─── Interfaces ──────────────────────────────────────────────────

export interface EscPosReceiptItem {
  sr: number;
  particulars: string;
  qty: number;
  rate: number;
  total: number;
  size?: string;
  barcode?: string;
  hsnCode?: string;
}

export interface EscPosGSTEntry {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface EscPosReceiptData {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  businessGSTIN?: string;
  businessEmail?: string;

  billNo: string;
  date: Date;
  documentType?: 'invoice' | 'quotation' | 'sale-order' | 'pos';

  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;

  salesman?: string;

  items: EscPosReceiptItem[];

  subTotal: number;
  discount: number;
  saleReturnAdjust?: number;
  roundOff?: number;
  grandTotal: number;

  gstBreakdown?: {
    cgst: number;
    sgst: number;
  };

  gstRateBreakdown?: EscPosGSTEntry[];

  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  refundCash?: number;

  termsConditions?: string;
  cashier?: string;
  counter?: string;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;

  openDrawer?: boolean;
  drawerPin?: 'pin2' | 'pin5';
  paperWidth?: 48 | 32;
}

// ─── Receipt Generator ──────────────────────────────────────────

export const generateEscPosReceipt = (data: EscPosReceiptData): string => {
  const W = data.paperWidth || 48;
  const LF = ESCPOS.LF;
  const sep = '-'.repeat(W);
  const dblSep = '='.repeat(W);
  let r = '';

  // 1. Initialize
  r += ESCPOS.INIT;
  r += ESCPOS.CODEPAGE_PC437;

  // ═══════ SHOP HEADER ═══════
  r += dblSep + LF;
  r += ESCPOS.ALIGN_CENTER;
  r += ESCPOS.BOLD_ON;
  r += ESCPOS.DOUBLE_BOTH;
  r += centerText((data.businessName || 'STORE').substring(0, 24), Math.min(W, 24)) + LF;
  r += ESCPOS.NORMAL_SIZE;
  r += ESCPOS.BOLD_OFF;

  if (data.businessAddress) {
    // Split address into lines that fit
    const addrLines = data.businessAddress.split(',').map(s => s.trim());
    let currentLine = '';
    addrLines.forEach(part => {
      if ((currentLine + ', ' + part).length > W) {
        if (currentLine) r += centerText(currentLine, W) + LF;
        currentLine = part;
      } else {
        currentLine = currentLine ? currentLine + ', ' + part : part;
      }
    });
    if (currentLine) r += centerText(currentLine, W) + LF;
  }

  if (data.businessPhone) {
    r += centerText('Tel: ' + data.businessPhone, W) + LF;
  }
  if (data.businessGSTIN) {
    r += centerText('GSTIN: ' + data.businessGSTIN, W) + LF;
  }

  r += dblSep + LF;

  // ═══════ DOCUMENT TITLE ═══════
  const docTitle = data.documentType === 'quotation' ? 'QUOTATION'
    : data.documentType === 'sale-order' ? 'SALE ORDER'
    : 'TAX INVOICE';
  r += ESCPOS.ALIGN_CENTER;
  r += ESCPOS.BOLD_ON;
  r += centerText(docTitle, W) + LF;
  r += ESCPOS.BOLD_OFF;

  r += ESCPOS.ALIGN_LEFT;
  r += sep + LF;

  // ═══════ BILL INFO — same line ═══════
  const billLabel = data.documentType === 'quotation' ? 'Qtn' : data.documentType === 'sale-order' ? 'Ord' : 'Bill';
  const dateStr = data.date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = data.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  r += leftRight(billLabel + ': ' + data.billNo, 'Date: ' + dateStr, W) + LF;

  // Time + Salesman on same line
  const timePart = 'Time: ' + timeStr;
  if (data.salesman) {
    r += leftRight(timePart, 'By: ' + data.salesman.substring(0, W >= 48 ? 12 : 8), W) + LF;
  } else if (data.cashier) {
    r += leftRight(timePart, data.cashier.substring(0, W >= 48 ? 12 : 8), W) + LF;
  } else {
    r += timePart + LF;
  }

  // ═══════ CUSTOMER ═══════
  if (data.customerName && data.customerName !== 'Walk-in Customer') {
    r += 'Cust: ' + data.customerName.substring(0, W - 6) + LF;
    if (data.customerPhone) {
      r += 'Mob: ' + data.customerPhone + LF;
    }
  }

  r += sep + LF;

  // ═══════ ITEMS HEADER ═══════
  r += ESCPOS.BOLD_ON;
  if (W >= 48) {
    r += padRight('ITEM', W - 22) + padLeft('QTY', 5) + padLeft('RATE', 8) + padLeft('AMT', 9) + LF;
  } else {
    r += padRight('ITEM', W - 17) + padLeft('QTY', 3) + padLeft('RATE', 7) + padLeft('AMT', 7) + LF;
  }
  r += ESCPOS.BOLD_OFF;
  r += sep + LF;

  // ═══════ ITEMS ═══════
  let totalQty = 0;
  data.items.forEach((item) => {
    totalQty += item.qty;
    const itemName = item.particulars + (item.size ? '-' + item.size : '');

    // Line 1: Item name (full width)
    const maxNameLen = W - 2;
    r += itemName.substring(0, maxNameLen) + LF;

    // Line 2: Barcode (optional)
    if (item.barcode) {
      r += '  BC: ' + item.barcode + LF;
    }

    // Line 3: Qty, Rate, Amount — right aligned
    const qtyStr = String(item.qty);
    const rateStr = Math.round(item.rate).toLocaleString('en-IN');
    const amtStr = Math.round(item.total).toLocaleString('en-IN');

    if (W >= 48) {
      const detail = padLeft(qtyStr, 5) + padLeft(rateStr, 8) + padLeft(amtStr, 9);
      r += padLeft(detail, W) + LF;
    } else {
      const detail = padLeft(qtyStr, 3) + padLeft(rateStr, 7) + padLeft(amtStr, 7);
      r += padLeft(detail, W) + LF;
    }
  });

  r += sep + LF;

  // ═══════ TOTALS ═══════
  const amtW = W >= 48 ? 14 : 10;
  const lblW = W - amtW;

  r += leftRight('SubTotal (' + totalQty + ' items)', fmtINR(data.subTotal), W) + LF;

  if (data.discount > 0) {
    r += leftRight('Discount', '-' + fmtINR(data.discount), W) + LF;
  }

  // Net Amount (after discount)
  const netAmount = data.subTotal - data.discount;
  r += leftRight('Net Amount', fmtINR(netAmount), W) + LF;

  // Round Off — show with sign
  const roundOff = data.roundOff ?? 0;
  if (roundOff !== 0) {
    const roundStr = (roundOff > 0 ? '+' : '-') + fmtINRDec(roundOff);
    r += leftRight('Round Off', roundStr, W) + LF;
  }

  // S/R Adjusted
  if (data.saleReturnAdjust && data.saleReturnAdjust > 0) {
    r += leftRight('S/R Adjusted', '-' + fmtINR(data.saleReturnAdjust), W) + LF;
  }

  // Points Redemption
  if (data.pointsRedemptionValue && data.pointsRedemptionValue > 0) {
    r += leftRight('Points (' + (data.pointsRedeemed || 0) + ' pts)', '-' + fmtINR(data.pointsRedemptionValue), W) + LF;
  }

  // Separator before TOTAL
  r += padLeft(sep.substring(0, 18), W) + LF;

  // GRAND TOTAL
  r += dblSep + LF;
  r += ESCPOS.BOLD_ON;
  r += ESCPOS.DOUBLE_HEIGHT;
  r += leftRight('TOTAL', fmtINR(data.grandTotal), W) + LF;
  r += ESCPOS.NORMAL_SIZE;
  r += ESCPOS.BOLD_OFF;
  r += dblSep + LF;

  // ═══════ YOU SAVED ═══════
  if (data.discount > 0) {
    r += ESCPOS.ALIGN_CENTER;
    r += ESCPOS.BOLD_ON;
    r += '*** You Saved ' + fmtINR(data.discount) + '! ***' + LF;
    r += ESCPOS.BOLD_OFF;
    r += ESCPOS.ALIGN_LEFT;
  }

  // ═══════ GST DETAILS ═══════
  if (data.gstRateBreakdown && data.gstRateBreakdown.length > 0) {
    r += sep + LF;
    r += ' GST DETAILS' + LF;
    if (W >= 48) {
      r += ' GST%  Taxable    CGST     SGST     Total' + LF;
      data.gstRateBreakdown.forEach(gst => {
        const total = gst.cgst + gst.sgst;
        r += (' ' + gst.rate + '%').padEnd(7) +
          fmtINRDec(gst.taxable).padStart(9) +
          fmtINRDec(gst.cgst).padStart(9) +
          fmtINRDec(gst.sgst).padStart(9) +
          fmtINRDec(total).padStart(10) + LF;
      });
    } else {
      r += ' GST%  Taxable  CGST   SGST' + LF;
      data.gstRateBreakdown.forEach(gst => {
        r += (' ' + gst.rate + '%').padEnd(6) +
          fmtINRDec(gst.taxable).padStart(8) +
          fmtINRDec(gst.cgst).padStart(7) +
          fmtINRDec(gst.sgst).padStart(7) + LF;
      });
    }
  } else if (data.gstBreakdown && (data.gstBreakdown.cgst > 0 || data.gstBreakdown.sgst > 0)) {
    r += sep + LF;
    r += ' GST DETAILS' + LF;
    if (data.gstBreakdown.cgst > 0) {
      r += leftRight(' CGST', fmtINRDec(data.gstBreakdown.cgst), W) + LF;
    }
    if (data.gstBreakdown.sgst > 0) {
      r += leftRight(' SGST', fmtINRDec(data.gstBreakdown.sgst), W) + LF;
    }
  }

  r += sep + LF;

  // ═══════ PAYMENT ═══════
  const cashPaid = data.cashPaid || 0;
  const upiPaid = data.upiPaid || 0;
  const cardPaid = data.cardPaid || 0;
  const creditPaid = data.creditPaid || 0;
  const refundCash = data.refundCash || 0;

  if (cashPaid > 0 || upiPaid > 0 || cardPaid > 0 || creditPaid > 0 || data.paymentMethod) {
    r += ' PAYMENT' + LF;
    if (cashPaid > 0) r += leftRight(' Cash', fmtINR(cashPaid), W) + LF;
    if (upiPaid > 0)  r += leftRight(' UPI', fmtINR(upiPaid), W) + LF;
    if (cardPaid > 0)  r += leftRight(' Card', fmtINR(cardPaid), W) + LF;
    if (creditPaid > 0) r += leftRight(' Credit', fmtINR(creditPaid), W) + LF;

    const totalPaid = cashPaid + upiPaid + cardPaid + creditPaid;
    if (totalPaid > 0) {
      r += leftRight(' TOTAL PAID', fmtINR(totalPaid), W) + LF;
    }

    if (refundCash > 0) {
      r += leftRight(' Change', fmtINR(refundCash), W) + LF;
    }

    const balanceDue = data.grandTotal - totalPaid;
    if (balanceDue > 1) {
      r += ESCPOS.BOLD_ON;
      r += leftRight(' BALANCE DUE', fmtINR(balanceDue), W) + LF;
      r += ESCPOS.BOLD_OFF;
    }
  }

  r += dblSep + LF;

  // ═══════ LOYALTY POINTS ═══════
  if (data.pointsBalance && data.pointsBalance > 0) {
    r += leftRight(' Points Balance', String(Math.round(data.pointsBalance)) + ' pts', W) + LF;
    r += sep + LF;
  }

  // ═══════ FOOTER ═══════
  r += ESCPOS.ALIGN_CENTER;

  if (data.termsConditions) {
    const lines = data.termsConditions.split('\n').slice(0, 6);
    lines.forEach(line => {
      if (line.trim()) {
        // Word-wrap long lines
        const trimmed = line.trim();
        if (trimmed.length <= W) {
          r += centerText(trimmed, W) + LF;
        } else {
          r += trimmed.substring(0, W) + LF;
          if (trimmed.length > W) {
            r += trimmed.substring(W, W * 2) + LF;
          }
        }
      }
    });
  } else {
    r += centerText('Thank You! Visit Again!', W) + LF;
  }

  r += sep + LF;
  r += centerText('Thank You! Visit Again!', W) + LF;
  r += dblSep + LF;

  // ═══════ Paper feed + cut + drawer ═══════
  r += ESCPOS.FEED(4);
  r += ESCPOS.CUT_PARTIAL;

  if (data.openDrawer) {
    r += data.drawerPin === 'pin5' ? ESCPOS.DRAWER_PIN5 : ESCPOS.DRAWER_PIN2;
  }

  return r;
};
