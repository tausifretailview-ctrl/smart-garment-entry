import React from 'react';

interface InvoiceTemplateHTMLProps {
  businessName: string;
  businessAddress: string;
  businessContact: string;
  businessEmail: string;
  billNo: string;
  date: Date;
  time: string;
  customerName: string;
  customerMobile: string;
  items: Array<{
    sr: number;
    particulars: string;
    size: string;
    qty: number;
    rate: number;
    discPercent: number;
    total: number;
  }>;
  subTotal: number;
  discountAmount: number;
  netAmount: number;
  paymentMethod: string;
  cashPaid: number;
  upiPaid: number;
  cardPaid: number;
  mrpTotal: number;
  declarationText?: string;
  termsList?: string[];
}

export const InvoiceTemplateHTML: React.FC<InvoiceTemplateHTMLProps> = ({
  businessName,
  businessAddress,
  businessContact,
  businessEmail,
  billNo,
  date,
  time,
  customerName,
  customerMobile,
  items,
  subTotal,
  discountAmount,
  netAmount,
  paymentMethod,
  cashPaid,
  upiPaid,
  cardPaid,
  mrpTotal,
  declarationText = 'Declaration: Composition taxable person, not eligible to collect tax on supplies.',
  termsList = [
    'GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
    'NO EXCHANGE WITHOUT BARCODE & BILL.',
    'EXCHANGE TIME: 01:00 TO 04:00 PM.'
  ]
}) => {
  return (
    <div style={{
      width: '148mm',
      minHeight: '210mm',
      margin: '0 auto',
      padding: '10mm',
      fontFamily: 'Arial, sans-serif',
      fontSize: '10px',
      boxSizing: 'border-box',
      backgroundColor: 'white'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '10mm' }}>
        <h1 style={{ fontSize: '14px', margin: 0, fontWeight: 'bold', color: '#E91E63' }}>
          {businessName}
        </h1>
        <address style={{ fontStyle: 'normal', marginTop: '2px', lineHeight: 1.3 }}>
          {businessAddress}<br />
          CONTACT: {businessContact} | EMAIL: {businessEmail}
        </address>
        <h2 style={{ fontSize: '12px', margin: '5px 0', fontWeight: 'bold' }}>BILL OF SUPPLY</h2>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5mm', borderBottom: '1px dashed #ccc', paddingBottom: '3px' }}>
        <div style={{ width: '48%' }}>
          <div style={{ marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '50px' }}>Name:</span> {customerName}
          </div>
          <div style={{ marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '50px' }}>Mob No:</span> {customerMobile || '-'}
          </div>
        </div>
        <div style={{ width: '48%', textAlign: 'right' }}>
          <div style={{ marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold' }}>Bill No:</span> {billNo}
          </div>
          <div style={{ marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold' }}>Date:</span> {date.toLocaleDateString('en-GB')}
          </div>
          <div style={{ marginBottom: '1px' }}>
            <span style={{ fontWeight: 'bold' }}>Time:</span> {time}
          </div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '5mm', marginBottom: '5mm' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'left', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '5%' }}>SR</th>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'left', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '45%' }}>Particulars</th>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'center', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '10%' }}>Size</th>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'center', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '10%' }}>Qty</th>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'right', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '10%' }}>Rate</th>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'right', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '10%' }}>Disc%</th>
            <th style={{ border: '1px solid #eee', padding: '4px', textAlign: 'right', backgroundColor: '#f7f7f7', fontSize: '9px', textTransform: 'uppercase', width: '10%' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sr}>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>{item.sr}</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>{item.particulars}</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'center' }}>{item.size}</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'center' }}>{item.qty}</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'right' }}>{item.rate.toFixed(2)}</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'right' }}>{item.discPercent.toFixed(1)}%</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'right' }}>{item.total.toFixed(2)}</td>
            </tr>
          ))}
          {Array.from({ length: 5 }).map((_, idx) => (
            <tr key={`blank-${idx}`}>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
              <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px' }}>&nbsp;</td>
            </tr>
          ))}
          <tr>
            <td colSpan={6} style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'right', borderTop: '2px solid #ccc', backgroundColor: '#f7f7f7', fontWeight: 'bold' }}>TOTAL:</td>
            <td style={{ border: '1px solid #eee', padding: '4px', fontSize: '9px', textAlign: 'right', borderTop: '2px solid #ccc', backgroundColor: '#f7f7f7', fontWeight: 'bold' }}>{subTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ width: '100%', marginTop: '5mm', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '50%', maxWidth: '60mm', borderTop: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Sub Total:</span>
            <span style={{ fontWeight: 'bold' }}>{subTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Discount (Rs):</span>
            <span style={{ fontWeight: 'bold' }}>{discountAmount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ fontWeight: 'bold', fontSize: '11px' }}>NET AMOUNT:</span>
            <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{netAmount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', marginTop: '5px' }}>
            <span>Payment Mode:</span>
            <span>{paymentMethod}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Cash Paid:</span>
            <span>{cashPaid.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>UPI Paid:</span>
            <span>{upiPaid.toFixed(2)}</span>
          </div>
          {cardPaid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>Card Paid:</span>
              <span>{cardPaid.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>MRP Total:</span>
            <span>{mrpTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '10mm', borderTop: '1px solid #eee', paddingTop: '5mm' }}>
        <div style={{ marginTop: '5mm', padding: '3px', backgroundColor: '#ffffe0', border: '1px dashed #ccc', textAlign: 'center', fontSize: '8px' }}>
          {declarationText}
        </div>

        <ol style={{ listStyle: 'decimal', paddingLeft: '15px', margin: '5px 0' }}>
          {termsList.map((term, idx) => (
            <li key={idx} style={{ marginBottom: '2px', fontSize: '9px' }}>{term}</li>
          ))}
        </ol>

        <div style={{ textAlign: 'center', marginTop: '5mm', fontWeight: 'bold' }}>
          THANK YOU !!! VISIT AGAIN...
        </div>
      </div>
    </div>
  );
};
