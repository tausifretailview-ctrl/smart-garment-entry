import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import './InvoicePrint.css';

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

interface InvoicePrintProps {
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
  gstin?: string;
}

export const InvoicePrint = React.forwardRef<HTMLDivElement, InvoicePrintProps>(
  (props, ref) => {
    const {
      billNo,
      date,
      customerName,
      customerAddress,
      customerMobile,
      items,
      subTotal,
      discount,
      grandTotal,
      tenderAmount,
      cashPaid,
      refundCash,
      upiPaid,
      gstin
    } = props;

    const { currentOrganization } = useOrganization();
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
      fetchSettings();
    }, [currentOrganization?.id]);

    const fetchSettings = async () => {
      if (!currentOrganization?.id) return;
      
      try {
        const { data, error } = await (supabase as any)
          .from('settings')
          .select('*')
          .eq('organization_id', currentOrganization.id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setSettings(data);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    return (
      <div ref={ref} className="invoice-print">
        {/* Header */}
        <div className="header">
          <div className="logo-section">
            {settings?.bill_barcode_settings?.logo_url ? (
              <img src={settings.bill_barcode_settings.logo_url} alt="Company Logo" className="shop-logo" />
            ) : (
              <img src="/placeholder.svg" alt="Shop Logo" className="shop-logo" />
            )}
          </div>
          <div className="shop-details">
            <h1 className="shop-name">{settings?.business_name || 'OWN FASHION'}</h1>
            <p className="shop-address">
              {settings?.address || 'Shop No.2, Sumati Paradise, Plot No.227, Sec No.R4, Vadhghar Node, Pushpak, Panvel - 420206.'}
            </p>
            <p className="shop-contact">
              {settings?.mobile_number ? `CONTACT : ${settings.mobile_number}` : 'CONTACT : 9326320664'}
              {settings?.email_id && ` | EMAIL: ${settings.email_id}`}
              {settings?.gst_number && ` | GSTIN: ${settings.gst_number}`}
            </p>
          </div>
        </div>

        <div className="bill-info-container">
          {/* Left Section */}
          <div className="customer-section">
            <h2 className="bill-type">BILL OF SUPPLY</h2>
            <div className="customer-details">
              <p><strong>NAME :</strong> {customerName}</p>
              <p><strong>MOB NO :</strong> {customerMobile}</p>
            </div>
          </div>

          {/* Right Section */}
          <div className="bill-details">
            {gstin && <p><strong>GSTIN:</strong></p>}
            <p><strong>BILL NO :</strong> {billNo}</p>
            <p><strong>DATE :</strong> {format(date, 'dd-MM-yyyy')}</p>
            <p><strong>TIME :</strong> {format(date, 'hh:mm:ss a')}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>SR</th>
              <th style={{ width: '30%' }}>PARTICULARS</th>
              <th style={{ width: '10%' }}>SIZE</th>
              <th style={{ width: '12%' }}>HSN</th>
              <th style={{ width: '10%' }}>SP</th>
              <th style={{ width: '8%' }}>QTY</th>
              <th style={{ width: '12%' }}>MRP/RATE</th>
              <th style={{ width: '13%' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sr}>
                <td>{item.sr}</td>
                <td>
                  <div>{item.particulars}</div>
                  <div className="barcode-text"><strong>BC:{item.barcode}</strong></div>
                </td>
                <td>{item.size}</td>
                <td>{item.hsn}</td>
                <td>{item.sp}</td>
                <td>{item.qty}</td>
                <td>{item.rate.toFixed(2)}</td>
                <td>{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Section */}
        <div className="footer-section">
          <div className="declaration">
            <p><strong>Declaration :</strong> Composition taxable person,</p>
            <p>not eligible to collect tax on supplies.</p>
          </div>
          <div className="totals-right">
            <p><strong>SUB TOTAL:</strong> {subTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="payment-section">
          <div className="payment-left">
            <p><strong>Tender Amt:</strong> {tenderAmount.toFixed(2)}</p>
            <p><strong>Cash Paid:</strong> {cashPaid.toFixed(2)}</p>
            <p><strong>Refund Cash:</strong> {refundCash.toFixed(2)}</p>
            <p><strong>UPI Paid:</strong> {upiPaid.toFixed(2)}</p>
          </div>
          <div className="payment-right">
            <p><strong>TOTAL:</strong> {subTotal.toFixed(2)}</p>
            <p><strong>Dis (Rs) :</strong> {discount.toFixed(2)}</p>
            <p><strong>MRP TOTAL:</strong> {subTotal.toFixed(2)}</p>
            <p><strong>TOTAL DIS:</strong> {discount.toFixed(2)}</p>
            <p className="grand-total"><strong>G.TOTAL:</strong> <span className="total-amount">{grandTotal.toFixed(2)}</span></p>
          </div>
        </div>

        {/* Terms */}
        <div className="terms-section">
          <div className="terms-left">
            {settings?.bill_barcode_settings?.footer_text ? (
              <p>{settings.bill_barcode_settings.footer_text}</p>
            ) : (
              <>
                <p>1. GOODS ONCE SOLD WILL NOT BE TAKEN BACK.</p>
                <p>2. NO EXCHANGE WITHOUT BARCODE & BILL.</p>
                <p>3. EXCHANGE TIME : 01:00 TO 04:00 PM.</p>
                <p>4. THANK YOU !!! VISIT AGAIN . . .</p>
              </>
            )}
          </div>
          <div className="terms-right">
            <div className="barcode-image">
              <svg viewBox="0 0 100 40">
                <rect x="2" y="0" width="2" height="40" fill="black"/>
                <rect x="6" y="0" width="1" height="40" fill="black"/>
                <rect x="9" y="0" width="3" height="40" fill="black"/>
                <rect x="14" y="0" width="1" height="40" fill="black"/>
                <rect x="17" y="0" width="2" height="40" fill="black"/>
                <rect x="21" y="0" width="1" height="40" fill="black"/>
                <rect x="24" y="0" width="3" height="40" fill="black"/>
                <rect x="29" y="0" width="2" height="40" fill="black"/>
                <rect x="33" y="0" width="1" height="40" fill="black"/>
                <rect x="36" y="0" width="2" height="40" fill="black"/>
                <rect x="40" y="0" width="3" height="40" fill="black"/>
                <rect x="45" y="0" width="1" height="40" fill="black"/>
                <rect x="48" y="0" width="2" height="40" fill="black"/>
                <rect x="52" y="0" width="1" height="40" fill="black"/>
                <rect x="55" y="0" width="3" height="40" fill="black"/>
                <rect x="60" y="0" width="2" height="40" fill="black"/>
                <rect x="64" y="0" width="1" height="40" fill="black"/>
                <rect x="67" y="0" width="2" height="40" fill="black"/>
                <rect x="71" y="0" width="3" height="40" fill="black"/>
                <rect x="76" y="0" width="1" height="40" fill="black"/>
                <rect x="79" y="0" width="2" height="40" fill="black"/>
                <rect x="83" y="0" width="1" height="40" fill="black"/>
                <rect x="86" y="0" width="3" height="40" fill="black"/>
                <rect x="91" y="0" width="2" height="40" fill="black"/>
                <rect x="95" y="0" width="3" height="40" fill="black"/>
              </svg>
              <p className="barcode-number">1</p>
            </div>
            <p className="signatory">Authorised Signatory</p>
          </div>
        </div>

      </div>
    );
  }
);

InvoicePrint.displayName = 'InvoicePrint';
