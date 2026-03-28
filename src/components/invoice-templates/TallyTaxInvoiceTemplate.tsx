import React from 'react';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  qty: number;
  rate: number;
  mrp?: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  gstPercent?: number;
  discountPercent?: number;
}

interface TallyTaxInvoiceTemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceTime?: string;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  customerTransportDetails?: string;
  salesman?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
  declarationText?: string;
  termsConditions?: string[];
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolder?: string;
    branch?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
  };
  qrCodeUrl?: string;
  upiId?: string;
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  notes?: string;
  format?: string;
  financerDetails?: {
    financer_name: string;
    loan_number?: string;
    emi_amount?: number;
    tenure?: number;
    down_payment?: number;
  } | null;
  [key: string]: any;
}

const numberToIndianWords = (num: number): string => {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convertChunk = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertChunk(n % 100) : '');
  };
  const absNum = Math.abs(Math.round(num));
  const rupees = Math.floor(absNum);
  const paise = Math.round((absNum - rupees) * 100);
  let result = '';
  if (rupees === 0) { result = 'Zero'; } else {
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const hundred = rupees % 1000;
    if (crore > 0) result += convertChunk(crore) + ' Crore ';
    if (lakh > 0) result += convertChunk(lakh) + ' Lakh ';
    if (thousand > 0) result += convertChunk(thousand) + ' Thousand ';
    if (hundred > 0) result += convertChunk(hundred);
  }
  result = result.trim();
  if (paise > 0) result += ' and ' + convertChunk(paise) + ' Paise';
  return result + ' Only';
};

const fmt = (amount: number): string => amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

const getStateFromGSTIN = (gstin?: string): { name: string; code: string } => {
  if (!gstin || gstin.length < 2) return { name: '', code: '' };
  const m: Record<string, string> = {
    '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand',
    '06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim',
    '12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura',
    '17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha',
    '22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','26':'Dadra & Nagar Haveli',
    '27':'Maharashtra','29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala',
    '33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar','36':'Telangana','37':'Andhra Pradesh',
  };
  const code = gstin.substring(0, 2);
  return { name: m[code] || '', code };
};

const MIN_ITEM_ROWS = 5;

export const TallyTaxInvoiceTemplate: React.FC<TallyTaxInvoiceTemplateProps> = ({
  businessName, address, mobile, email, gstNumber, logoUrl,
  invoiceNumber, invoiceDate, invoiceTime,
  customerName, customerAddress, customerMobile, customerGSTIN, customerTransportDetails,
  salesman, items, subtotal, discount, taxableAmount,
  cgstAmount = 0, sgstAmount = 0, igstAmount = 0, totalTax, roundOff, grandTotal,
  paymentMethod, cashAmount, cardAmount, upiAmount, creditAmount,
  declarationText, termsConditions, bankDetails, qrCodeUrl, upiId,
  showHSN = true, showGSTBreakdown = true, showBankDetails = true, notes,
  financerDetails,
}) => {
  const sellerState = getStateFromGSTIN(gstNumber);
  const buyerState = getStateFromGSTIN(customerGSTIN);
  const isInterState = gstNumber && customerGSTIN && gstNumber.substring(0, 2) !== customerGSTIN.substring(0, 2);

  // Normalize bankDetails (support both snake_case and camelCase)
  const normBank = bankDetails ? {
    bankName: bankDetails.bankName || (bankDetails as any).bank_name || '',
    accountNumber: bankDetails.accountNumber || (bankDetails as any).account_number || '',
    ifscCode: bankDetails.ifscCode || (bankDetails as any).ifsc_code || '',
    accountHolder: bankDetails.accountHolder || (bankDetails as any).account_holder || '',
    branch: bankDetails.branch || '',
  } : null;

  const hsnBreakup: Record<string, { hsn: string; taxableValue: number; rate: number; cgst: number; sgst: number; igst: number; total: number }> = {};
  items.forEach(item => {
    const gstPct = item.gstPercent || 0;
    const gstAmt = gstPct > 0 ? (item.total * gstPct) / (100 + gstPct) : 0;
    const taxable = item.total - gstAmt;
    const hsn = item.hsn || 'N/A';
    const key = `${hsn}-${gstPct}`;
    if (!hsnBreakup[key]) hsnBreakup[key] = { hsn, taxableValue: 0, rate: gstPct, cgst: 0, sgst: 0, igst: 0, total: 0 };
    hsnBreakup[key].taxableValue += taxable;
    if (isInterState) { hsnBreakup[key].igst += gstAmt; } else { hsnBreakup[key].cgst += gstAmt / 2; hsnBreakup[key].sgst += gstAmt / 2; }
    hsnBreakup[key].total += gstAmt;
  });

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  // Column count: Sl No, Description, [HSN], Quantity, Rate(Incl), Rate, Amount = 6 or 7
  const colCount = showHSN ? 7 : 6;
  const defaultDeclaration = `We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.\nWARRANTY TO CUSTOMER IS DIRECTLY FROM MANUFACTURER.\nDEALER IS NOT RESPONSIBLE. GOODS ONCE SOLD WILL NOT BE TAKEN BACK OR EXCHANGED.`;

  // Count actual content rows (product rows + tax summary rows + round off)
  let contentRows = items.length;
  // Aggregate GST totals for bottom summary
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  let summaryGstRate = 0;
  items.forEach(item => {
    const gstPct = item.gstPercent || 0;
    if (gstPct > 0) {
      const gstAmt = (item.total * gstPct) / (100 + gstPct);
      if (isInterState) { totalIgst += gstAmt; } else { totalCgst += gstAmt / 2; totalSgst += gstAmt / 2; }
      summaryGstRate = gstPct; // use last non-zero rate for label
    }
  });
  if (showGSTBreakdown && (totalCgst > 0 || totalSgst > 0)) contentRows += 2;
  if (showGSTBreakdown && totalIgst > 0) contentRows += 1;
  if (roundOff !== 0) contentRows++;
  const blankRowsNeeded = Math.max(0, MIN_ITEM_ROWS - contentRows);

  const b = '1px solid #000';
  const cellNoRowBorder: React.CSSProperties = { borderLeft: b, borderRight: b, borderTop: 'none', borderBottom: 'none', padding: '3px 5px', fontSize: '10px', lineHeight: '1.4' };
  const cell: React.CSSProperties = { border: b, padding: '3px 5px', fontSize: '10px', lineHeight: '1.4' };
  const hCell: React.CSSProperties = { ...cell, fontWeight: 'bold', textAlign: 'center', backgroundColor: '#f0f0f0', fontSize: '9px', padding: '4px 5px' };

  return (
    <div style={{
      width: '210mm', height: '297mm', padding: '8mm',
      fontFamily: "'Arial', 'Helvetica', sans-serif", fontSize: '10px',
      color: '#000', background: '#fff', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Outer border — full page height flex container */}
      <div style={{ border: '2px solid #000', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ===== HEADER SECTION (fixed) ===== */}
        {/* Title */}
        <div style={{ textAlign: 'center', borderBottom: b, padding: '4px 0', fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px', flexShrink: 0 }}>
          TAX INVOICE
        </div>

        {/* Seller + Invoice Details */}
        <div style={{ display: 'flex', borderBottom: b, flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '5px 8px', borderRight: b }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {logoUrl && <img src={logoUrl} alt="Logo" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />}
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '2px' }}>{businessName}</div>
                <div style={{ fontSize: '11px', whiteSpace: 'pre-line' }}>{address}</div>
                {gstNumber && <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '2px' }}>GSTIN/UIN: {gstNumber}</div>}
                {sellerState.name && <div style={{ fontSize: '9px' }}>State Name: {sellerState.name}, Code: {sellerState.code}</div>}
                {mobile && <div style={{ fontSize: '9px' }}>Contact: {mobile}</div>}
                {email && <div style={{ fontSize: '9px' }}>E-Mail: {email}</div>}
              </div>
            </div>
          </div>
          <div style={{ width: '42%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <tbody>
                <tr>
                  <td style={{ borderBottom: b, borderRight: b, padding: '3px 6px', fontWeight: 'bold', width: '50%', fontSize: '9px', backgroundColor: '#f8f8f8' }}>Invoice No.</td>
                  <td style={{ borderBottom: b, padding: '3px 6px', fontSize: '10px' }}>{invoiceNumber}</td>
                </tr>
                <tr>
                  <td style={{ borderBottom: b, borderRight: b, padding: '3px 6px', fontWeight: 'bold', width: '50%', fontSize: '9px', backgroundColor: '#f8f8f8' }}>Dated</td>
                  <td style={{ borderBottom: b, padding: '3px 6px', fontSize: '10px' }}>{formatDate(invoiceDate)}</td>
                </tr>
                <tr>
                  <td style={{ borderBottom: b, borderRight: b, padding: '3px 6px', fontWeight: 'bold', width: '50%', fontSize: '9px', backgroundColor: '#f8f8f8' }}>Mode/Terms of Payment</td>
                  <td style={{ borderBottom: b, padding: '3px 6px', lineHeight: '1.3' }}>
                    {(() => {
                      const parts: string[] = [];
                      if (cashAmount && cashAmount > 0) parts.push(`Cash ₹${fmt(cashAmount)}`);
                      if (upiAmount && upiAmount > 0) parts.push(`UPI ₹${fmt(upiAmount)}`);
                      if (cardAmount && cardAmount > 0) parts.push(`Card ₹${fmt(cardAmount)}`);
                      if (creditAmount && creditAmount > 0) parts.push(`Credit ₹${fmt(creditAmount)}`);
                      return (
                        <span style={{ fontSize: parts.length > 1 ? '8px' : '10px' }}>
                          {parts.length > 0 ? parts.join(' | ') : (paymentMethod || 'Cash')}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: b, borderRight: b, padding: '3px 6px', fontWeight: 'bold', width: '50%', fontSize: '9px', backgroundColor: '#f8f8f8' }}>Buyer's Order No.</td>
                  <td style={{ borderBottom: b, padding: '3px 6px', fontSize: '10px' }}></td>
                </tr>
                <tr>
                  <td style={{ borderBottom: b, borderRight: b, padding: '3px 6px', fontWeight: 'bold', width: '50%', fontSize: '9px', backgroundColor: '#f8f8f8' }}>Dispatched through</td>
                  <td style={{ borderBottom: b, padding: '3px 6px', fontSize: '10px' }}>{customerTransportDetails || ''}</td>
                </tr>
                <tr>
                  <td style={{ borderBottom: b, borderRight: b, padding: '3px 6px', fontWeight: 'bold', width: '50%', fontSize: '9px', backgroundColor: '#f8f8f8' }}>Salesman</td>
                  <td style={{ borderBottom: b, padding: '3px 6px', fontSize: '10px' }}>{salesman || ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Consignee + Finance Details */}
        <div style={{ display: 'flex', borderBottom: b, flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '4px 8px', borderRight: b }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>Consignee (Ship to)</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{customerName || 'Walk-in Customer'}</div>
            {customerAddress && <div style={{ fontSize: '9px', whiteSpace: 'pre-line' }}>{customerAddress}</div>}
            <div style={{
              fontSize: '10px', fontWeight: 'bold', marginTop: '3px',
              padding: '1px 4px', borderRadius: '2px', display: 'inline-block',
              backgroundColor: customerGSTIN ? '#f0f7f0' : '#fff8f0',
              border: `0.5px solid ${customerGSTIN ? '#4a9e4a' : '#ccc'}`
            }}>
              GSTIN: {customerGSTIN || 'Not Provided'}
            </div>
            {buyerState.name && <div style={{ fontSize: '9px', marginTop: '2px' }}>State Name: {buyerState.name}, Code: {buyerState.code}</div>}
            {customerMobile && <div style={{ fontSize: '9px' }}>Contact: {customerMobile}</div>}
          </div>
          <div style={{ width: '42%', padding: '4px 8px' }}>
            {financerDetails?.financer_name ? (
              <>
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '3px', textDecoration: 'underline' }}>
                  Finance / EMI Details
                </div>
                <div style={{ fontSize: '9.5px', lineHeight: '1.6' }}>
                  <div><strong>Financer:</strong> {financerDetails.financer_name}</div>
                  {financerDetails.loan_number && (
                    <div><strong>Loan No:</strong> {financerDetails.loan_number}</div>
                  )}
                  {financerDetails.down_payment != null && financerDetails.down_payment > 0 && (
                    <div><strong>Down Payment:</strong> ₹{fmt(financerDetails.down_payment)}</div>
                  )}
                  {financerDetails.emi_amount != null && financerDetails.emi_amount > 0 && (
                    <div><strong>EMI Amount:</strong> ₹{fmt(financerDetails.emi_amount)}/month</div>
                  )}
                  {financerDetails.tenure != null && financerDetails.tenure > 0 && (
                    <div><strong>Tenure:</strong> {financerDetails.tenure} months</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>Buyer (Bill to)</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{customerName || 'Walk-in Customer'}</div>
                {customerAddress && <div style={{ fontSize: '9px', whiteSpace: 'pre-line' }}>{customerAddress}</div>}
                <div style={{
                  fontSize: '10px', fontWeight: 'bold', marginTop: '3px',
                  padding: '1px 4px', borderRadius: '2px', display: 'inline-block',
                  backgroundColor: customerGSTIN ? '#f0f7f0' : '#fff8f0',
                  border: `0.5px solid ${customerGSTIN ? '#4a9e4a' : '#ccc'}`
                }}>
                  GSTIN: {customerGSTIN || 'Not Provided'}
                </div>
                {buyerState.name && <div style={{ fontSize: '9px', marginTop: '2px' }}>State Name: {buyerState.name}, Code: {buyerState.code}</div>}
                {customerMobile && <div style={{ fontSize: '9px' }}>Contact: {customerMobile}</div>}
              </>
            )}
          </div>
        </div>

        {/* ===== ITEMS TABLE (flex-grow to fill remaining space) ===== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
            <thead>
              <tr>
                <th style={{ ...hCell, width: '42px' }}>Sl No.</th>
                <th style={{ ...hCell, textAlign: 'left' }}>Description of Goods</th>
                {showHSN && <th style={{ ...hCell, width: '60px' }}>HSN/SAC</th>}
                <th style={{ ...hCell, width: '58px' }}>Quantity</th>
                <th style={{ ...hCell, width: '72px' }}>Rate (Incl. Tax)</th>
                <th style={{ ...hCell, width: '68px' }}>Rate</th>
                <th style={{ ...hCell, width: '90px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const gstPct = item.gstPercent || 0;
                const gstAmt = gstPct > 0 ? (item.total * gstPct) / (100 + gstPct) : 0;
                const taxableAmt = item.total - gstAmt;
                const rateInclTax = item.qty > 0 ? item.total / item.qty : 0;
                const rateExclTax = item.qty > 0 ? taxableAmt / item.qty : 0;
                return (
                  <tr key={index}>
                    <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top', width: '42px', fontWeight: 'bold' }}>{index + 1}</td>
                    <td style={{ ...cellNoRowBorder, verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '11px', lineHeight: '1.4' }}>{item.particulars}</div>
                      {item.color && (
                        <div style={{ fontSize: '9px', color: '#333', marginTop: '1px' }}>
                          <strong>Color:</strong> {item.color}
                        </div>
                      )}
                      {item.barcode && (
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#000', fontFamily: 'monospace', marginTop: '2px' }}>
                          IMEI: {item.barcode}
                        </div>
                      )}
                    </td>
                    {showHSN && (
                      <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top', fontSize: '10px' }}>
                        {item.hsn}
                      </td>
                    )}
                    <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top', fontWeight: '600' }}>{item.qty} Pcs</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', verticalAlign: 'top', fontWeight: '600' }}>{fmt(rateInclTax)}</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', verticalAlign: 'top' }}>{fmt(rateExclTax)}</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', verticalAlign: 'top', fontWeight: '600' }}>{fmt(taxableAmt)}</td>
                  </tr>
                );
              })}
              {/* Blank filler rows */}
              {Array.from({ length: blankRowsNeeded }).map((_, i) => (
                <tr key={`blank-${i}`} style={{ height: '22px' }}>
                  <td style={{ ...cellNoRowBorder, width: '42px' }}>&nbsp;</td>
                  <td style={cellNoRowBorder}></td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                  <td style={cellNoRowBorder}></td>
                </tr>
              ))}
              {/* CGST/SGST summary rows */}
              {showGSTBreakdown && !isInterState && totalCgst > 0 && (
                <>
                  <tr>
                    <td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '10px' }}>OUTPUT CGST@{summaryGstRate / 2}%</td>
                    {showHSN && <td style={cellNoRowBorder}></td>}
                    <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{summaryGstRate / 2} %</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{fmt(totalCgst)}</td>
                  </tr>
                  <tr>
                    <td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '10px' }}>OUTPUT SGST@{summaryGstRate / 2}%</td>
                    {showHSN && <td style={cellNoRowBorder}></td>}
                    <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{summaryGstRate / 2} %</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{fmt(totalSgst)}</td>
                  </tr>
                </>
              )}
              {showGSTBreakdown && isInterState && totalIgst > 0 && (
                <tr>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '10px' }}>OUTPUT IGST@{summaryGstRate}%</td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{summaryGstRate} %</td>
                  <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{fmt(totalIgst)}</td>
                </tr>
              )}
              {/* Round Off */}
              {roundOff !== 0 && (
                <tr>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '9px' }}>ROUND OFF</td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{roundOff >= 0 ? '' : '(-)'}{fmt(Math.abs(roundOff))}</td>
                </tr>
              )}
              {/* Total Row */}
              <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                <td style={{ ...cell, textAlign: 'center' }}></td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>Total</td>
                {showHSN && <td style={cell}></td>}
                <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{totalQty} Pcs</td>
                <td style={cell}></td><td style={cell}></td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>₹{fmt(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ===== FOOTER SECTION (fixed at bottom) ===== */}
        {/* Amount in Words */}
        <div style={{ borderTop: b, padding: '3px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '9px', fontWeight: 'bold' }}>Amount Chargeable (in words):</span>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '1px' }}>
                INR {numberToIndianWords(grandTotal)}
              </div>
            </div>
            <div style={{ fontSize: '9px', fontStyle: 'italic', alignSelf: 'flex-end' }}>E. & O.E</div>
          </div>
        </div>

        {/* Notes Section */}
        {notes && notes.trim() && (
          <div style={{ borderTop: b, padding: '3px 8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: '40px' }}>Note:</span>
              <span style={{ fontSize: '9.5px', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{notes}</span>
            </div>
          </div>
        )}

        {/* Terms & Conditions */}
        {termsConditions && termsConditions.length > 0 && (
          <div style={{ borderTop: b, padding: '3px 8px', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>Terms & Conditions:</div>
            <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '9.5px', lineHeight: '1.7' }}>
              {termsConditions.map((term, idx) => (
                <li key={idx} style={{ marginBottom: '2px' }}>{term}</li>
              ))}
            </ol>
          </div>
        )}

        {/* HSN Tax Breakup */}
        {showGSTBreakdown && Object.keys(hsnBreakup).length > 0 && (
          <div style={{ borderTop: b, flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...hCell, textAlign: 'left' }}>HSN/SAC</th>
                  <th style={{ ...hCell, textAlign: 'right' }}>Taxable Value</th>
                  {!isInterState ? (
                    <>
                      <th style={{ ...hCell, textAlign: 'center' }}>CGST Rate</th>
                      <th style={{ ...hCell, textAlign: 'right' }}>CGST Amt</th>
                      <th style={{ ...hCell, textAlign: 'center' }}>SGST Rate</th>
                      <th style={{ ...hCell, textAlign: 'right' }}>SGST Amt</th>
                    </>
                  ) : (
                    <>
                      <th style={{ ...hCell, textAlign: 'center' }}>IGST Rate</th>
                      <th style={{ ...hCell, textAlign: 'right' }}>IGST Amt</th>
                    </>
                  )}
                  <th style={{ ...hCell, textAlign: 'right' }}>Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(hsnBreakup).map((row, idx) => (
                  <tr key={idx}>
                    <td style={cell}>{row.hsn}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{fmt(row.taxableValue)}</td>
                    {!isInterState ? (
                      <>
                        <td style={{ ...cell, textAlign: 'center' }}>{row.rate / 2}%</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmt(row.cgst)}</td>
                        <td style={{ ...cell, textAlign: 'center' }}>{row.rate / 2}%</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmt(row.sgst)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...cell, textAlign: 'center' }}>{row.rate}%</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmt(row.igst)}</td>
                      </>
                    )}
                    <td style={{ ...cell, textAlign: 'right' }}>{fmt(row.total)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                  <td style={{ ...cell, fontWeight: 'bold' }}>Total</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{fmt(taxableAmount)}</td>
                  {!isInterState ? (
                    <>
                      <td style={cell}></td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{fmt(cgstAmount)}</td>
                      <td style={cell}></td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{fmt(sgstAmount)}</td>
                    </>
                  ) : (
                    <>
                      <td style={cell}></td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{fmt(igstAmount || totalTax)}</td>
                    </>
                  )}
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{fmt(totalTax)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ padding: '2px 8px', fontSize: '9px', borderTop: b }}>
              <strong>Tax Amount (in words): </strong>INR {numberToIndianWords(totalTax)}
            </div>
          </div>
        )}

        {/* Declaration + Bank + QR/Signature */}
        <div style={{ display: 'flex', borderTop: b, flexShrink: 0 }}>

          {/* Left: Declaration + Bank Details */}
          <div style={{ flex: 1, padding: '5px 8px', borderRight: b, fontSize: '9px' }}>
            {gstNumber && (
              <div style={{ marginBottom: '3px' }}>
                <strong>Company's PAN:</strong> {gstNumber.substring(2, 12)}
              </div>
            )}
            <div style={{ fontWeight: 'bold', marginBottom: '1px' }}>Declaration:</div>
            <div style={{ whiteSpace: 'pre-line', lineHeight: '1.3', fontSize: '8px', marginBottom: '4px' }}>
              {declarationText || defaultDeclaration}
            </div>

            {/* Bank Details inside declaration column */}
            {showBankDetails && bankDetails && (bankDetails.bankName || bankDetails.accountNumber) && (
              <div style={{ borderTop: '1px dashed #999', paddingTop: '3px', marginTop: '3px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Company's Bank Details:</div>
                {bankDetails.accountHolder && <div>A/c Holder: <strong>{bankDetails.accountHolder}</strong></div>}
                {bankDetails.bankName && <div>Bank: <strong>{bankDetails.bankName}</strong></div>}
                {bankDetails.accountNumber && <div>A/c No.: <strong>{bankDetails.accountNumber}</strong></div>}
                {(bankDetails.branch || bankDetails.ifscCode) && (
                  <div>Branch & IFSC: <strong>{[bankDetails.branch, bankDetails.ifscCode].filter(Boolean).join(' & ')}</strong></div>
                )}
              </div>
            )}
          </div>

          {/* Right: QR Code + Signature */}
          <div style={{ width: '30%', padding: '5px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
            {qrCodeUrl && (
              <div>
                <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px' }} />
                {upiId && <div style={{ fontSize: '8px', marginTop: '2px', color: '#444' }}>{upiId}</div>}
              </div>
            )}
            <div style={{ marginTop: 'auto', paddingTop: '6px', width: '100%' }}>
              <div style={{ fontSize: '9px', marginBottom: '1px' }}>for {businessName}</div>
              <div style={{ borderBottom: b, width: '80%', margin: '18px auto 3px' }}></div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>Authorised Signatory</div>
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div style={{ borderTop: b, textAlign: 'center', padding: '2px 0', fontSize: '8px', color: '#555', flexShrink: 0 }}>
          This is a Computer Generated Invoice
        </div>
      </div>
    </div>
  );
};
