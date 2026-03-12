// ─────────────────────────────────────────────────────────────────
// ESC/POS Command Generator for 80mm Thermal Receipt Printers
// Compatible with: Epson TM-T82, TVS RP3200, Sam4s Ellix, Rugtek RP76, Sewoo LK-T212
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

const SEPARATOR = '-'.repeat(48);
const DOUBLE_SEP = '='.repeat(48);

export interface EscPosReceiptItem {
  sr: number;
  particulars: string;
  qty: number;
  rate: number;
  total: number;
  size?: string;
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

  items: EscPosReceiptItem[];

  subTotal: number;
  discount: number;
  saleReturnAdjust?: number;
  grandTotal: number;
  roundOff?: number;

  gstBreakdown?: {
    cgst: number;
    sgst: number;
  };

  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  refundCash?: number;

  termsConditions?: string;
  cashier?: string;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;

  openDrawer?: boolean;
  drawerPin?: 'pin2' | 'pin5';
  paperWidth?: 48 | 32;
}

export const generateEscPosReceipt = (data: EscPosReceiptData): string => {
  const W = data.paperWidth || 48;
  const LF = ESCPOS.LF;
  const sep = '-'.repeat(W);
  const dblSep = '='.repeat(W);
  let r = '';

  // 1. Initialize
  r += ESCPOS.INIT;
  r += ESCPOS.CODEPAGE_PC437;

  // 2. Business header
  r += ESCPOS.ALIGN_CENTER;
  r += ESCPOS.BOLD_ON;
  r += ESCPOS.DOUBLE_BOTH;
  r += (data.businessName || 'STORE').substring(0, 24) + LF;
  r += ESCPOS.NORMAL_SIZE;
  r += ESCPOS.BOLD_OFF;

  if (data.businessAddress) {
    r += data.businessAddress.substring(0, W) + LF;
  }
  if (data.businessPhone) {
    r += 'Ph: ' + data.businessPhone + LF;
  }
  if (data.businessGSTIN) {
    r += 'GSTIN: ' + data.businessGSTIN + LF;
  }

  // 3. Document title
  const docTitle = data.documentType === 'quotation' ? 'QUOTATION'
    : data.documentType === 'sale-order' ? 'SALE ORDER'
    : 'TAX INVOICE';
  r += ESCPOS.BOLD_ON;
  r += '*** ' + docTitle + ' ***' + LF;
  r += ESCPOS.BOLD_OFF;

  // 4. Bill info
  r += ESCPOS.ALIGN_LEFT;
  r += sep + LF;

  const billLabel = data.documentType === 'quotation' ? 'Quotation No' : 'Bill No';
  const dateStr = data.date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  r += padRight(billLabel + ': ' + data.billNo, Math.floor(W / 2));
  r += padLeft('Date: ' + dateStr, Math.ceil(W / 2)) + LF;

  if (data.cashier) {
    r += 'Cashier: ' + data.cashier.substring(0, W - 10) + LF;
  }

  // 5. Customer info
  if (data.customerName && data.customerName !== 'Walk-in Customer') {
    r += sep + LF;
    r += 'Customer: ' + data.customerName.substring(0, W - 10) + LF;
    if (data.customerPhone) {
      r += 'Ph: ' + data.customerPhone + LF;
    }
  }

  // 6. Items header
  r += sep + LF;
  r += ESCPOS.BOLD_ON;
  if (W >= 48) {
    r += padRight('#', 3) + padRight('ITEM', 25) + padLeft('QTY', 5) + padLeft('AMT', 10) + LF;
  } else {
    r += padRight('#', 2) + padRight('ITEM', 16) + padLeft('QTY', 4) + padLeft('AMT', 8) + LF;
  }
  r += ESCPOS.BOLD_OFF;
  r += sep + LF;

  // 7. Items
  let totalQty = 0;
  data.items.forEach((item) => {
    totalQty += item.qty;
    const srStr = String(item.sr);
    const itemName = item.particulars + (item.size ? ' ' + item.size : '');
    const qtyStr = String(item.qty);
    const amtStr = 'Rs.' + Math.round(item.total).toLocaleString('en-IN');

    if (W >= 48) {
      const nameWidth = W - 3 - 5 - 10;
      r += padRight(srStr, 3) + padRight(itemName.substring(0, nameWidth), nameWidth) + padLeft(qtyStr, 5) + padLeft(amtStr, 10) + LF;
      if (itemName.length > nameWidth) {
        r += '   ' + itemName.substring(nameWidth, nameWidth * 2) + LF;
      }
      if (item.qty > 1) {
        r += '   ' + 'Rs.' + Math.round(item.rate) + ' x ' + item.qty + LF;
      }
    } else {
      r += padRight(srStr, 2) + padRight(itemName.substring(0, 16), 16) + padLeft(qtyStr, 4) + padLeft(amtStr, 8) + LF;
    }
  });

  // 8. Totals section
  r += sep + LF;

  const totalItems = data.items.length;
  r += 'Items: ' + totalItems + '   ' + 'Total Qty: ' + totalQty + LF;
  r += sep + LF;

  const amtWidth = W >= 48 ? 12 : 10;
  const labelWidth = W - amtWidth;

  r += padRight('Sub Total:', labelWidth) + padLeft('Rs.' + Math.round(data.subTotal).toLocaleString('en-IN'), amtWidth) + LF;

  if (data.discount > 0) {
    r += padRight('Discount:', labelWidth) + padLeft('-Rs.' + Math.round(data.discount).toLocaleString('en-IN'), amtWidth) + LF;
  }

  if (data.saleReturnAdjust && data.saleReturnAdjust > 0) {
    r += padRight('Return Adj:', labelWidth) + padLeft('-Rs.' + Math.round(data.saleReturnAdjust).toLocaleString('en-IN'), amtWidth) + LF;
  }

  if (data.gstBreakdown && (data.gstBreakdown.cgst > 0 || data.gstBreakdown.sgst > 0)) {
    r += padRight('CGST:', labelWidth) + padLeft('Rs.' + Math.round(data.gstBreakdown.cgst).toLocaleString('en-IN'), amtWidth) + LF;
    r += padRight('SGST:', labelWidth) + padLeft('Rs.' + Math.round(data.gstBreakdown.sgst).toLocaleString('en-IN'), amtWidth) + LF;
  }

  if (data.roundOff && data.roundOff !== 0) {
    r += padRight('Round Off:', labelWidth) + padLeft((data.roundOff > 0 ? '+' : '') + Math.round(data.roundOff), amtWidth) + LF;
  }

  r += dblSep + LF;
  r += ESCPOS.BOLD_ON;
  r += ESCPOS.DOUBLE_HEIGHT;
  r += padRight('TOTAL:', labelWidth) + padLeft('Rs.' + Math.round(data.grandTotal).toLocaleString('en-IN'), amtWidth) + LF;
  r += ESCPOS.NORMAL_SIZE;
  r += ESCPOS.BOLD_OFF;
  r += dblSep + LF;

  // 9. Payment breakdown
  const cashPaid = data.cashPaid || 0;
  const upiPaid = data.upiPaid || 0;
  const cardPaid = data.cardPaid || 0;
  const refundCash = data.refundCash || 0;

  if (cashPaid > 0) {
    r += padRight('Cash:', labelWidth) + padLeft('Rs.' + Math.round(cashPaid).toLocaleString('en-IN'), amtWidth) + LF;
  }
  if (upiPaid > 0) {
    r += padRight('UPI:', labelWidth) + padLeft('Rs.' + Math.round(upiPaid).toLocaleString('en-IN'), amtWidth) + LF;
  }
  if (cardPaid > 0) {
    r += padRight('Card:', labelWidth) + padLeft('Rs.' + Math.round(cardPaid).toLocaleString('en-IN'), amtWidth) + LF;
  }
  if (refundCash > 0) {
    r += padRight('Change:', labelWidth) + padLeft('Rs.' + Math.round(refundCash).toLocaleString('en-IN'), amtWidth) + LF;
  }

  // 10. Points
  if (data.pointsRedemptionValue && data.pointsRedemptionValue > 0) {
    r += sep + LF;
    r += padRight('Points Redeemed:', labelWidth) + padLeft(String(data.pointsRedeemed || 0), amtWidth) + LF;
    r += padRight('Points Value:', labelWidth) + padLeft('Rs.' + Math.round(data.pointsRedemptionValue), amtWidth) + LF;
  }
  if (data.pointsBalance && data.pointsBalance > 0) {
    r += padRight('Points Balance:', labelWidth) + padLeft(String(Math.round(data.pointsBalance)), amtWidth) + LF;
  }

  // 11. Footer
  r += sep + LF;
  r += ESCPOS.ALIGN_CENTER;

  if (data.termsConditions) {
    const lines = data.termsConditions.split('\n').slice(0, 4);
    lines.forEach(line => {
      if (line.trim()) r += line.substring(0, W) + LF;
    });
  } else {
    r += 'Thank you for your purchase!' + LF;
    r += 'Visit us again' + LF;
  }

  // 12. Paper feed + cut + optional drawer
  r += ESCPOS.FEED(4);
  r += ESCPOS.CUT_PARTIAL;

  if (data.openDrawer) {
    r += data.drawerPin === 'pin5' ? ESCPOS.DRAWER_PIN5 : ESCPOS.DRAWER_PIN2;
  }

  return r;
};
