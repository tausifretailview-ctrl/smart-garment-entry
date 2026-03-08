/**
 * Core sale-related types used across financial hooks.
 * Replaces scattered `any` casts in useSaveSale, POS components, etc.
 */

export interface SaleItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_percent: number;
  discount_percent: number;
  line_total: number;
  size: string;
  barcode?: string;
  hsn_code?: string;
  color?: string | null;
}

export interface SaleData {
  items: SaleItem[];
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  grossAmount: number;
  discountAmount: number;
  flatDiscountPercent: number;
  flatDiscountAmount: number;
  saleReturnAdjust: number;
  roundOff: number;
  netAmount: number;
  refundAmount?: number;
  salesman?: string | null;
  notes?: string | null;
  pointsRedeemedAmount?: number;
}

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later';
export type PaymentStatus = 'completed' | 'pending' | 'partial' | 'hold';

export interface PaymentBreakdown {
  cashAmount: number;
  cardAmount: number;
  upiAmount: number;
  totalPaid: number;
  refundAmount: number;
}
