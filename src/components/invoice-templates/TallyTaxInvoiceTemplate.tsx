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
  declarationText?: string;
  termsConditions?: string[];
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolder?: string;
    branch?: string;
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

const formatDate = (date: Date): string => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

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
  paymentMethod, declarationText, bankDetails, qrCodeUrl, upiId,
  showHSN = true, showGSTBreakdown = true, showBankDetails = true, notes,
}) => {
  const sellerState = getStateFromGSTIN(gstNumber);
  const buyerState = getStateFromGSTIN(customerGSTIN);
  const isInterState = gstNumber && customerGSTIN && gstNumber.substring(0, 2) !== customerGSTIN.substring(0, 2);

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
  const colCount = showHSN ? 8 : 7;
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
  const cellNoRowBorder: React.CSSProperties = { borderLeft: b, borderRight: b, borderTop: 'none', borderBottom: 'none', padding: '2px 5px', fontSize: '10px', lineHeight: '1.3' };
  const cell: React.CSSProperties = { border: b, padding: '2px 5px', fontSize: '10px', lineHeight: '1.3' };
  const hCell: React.CSSProperties = { ...cell, fontWeight: 'bold', textAlign: 'center', backgroundColor: '#f5f5f5', fontSize: '9px' };

  return (
    <div style={{
      width: '210mm', height: '297mm', padding: '10mm',
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
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '1px' }}>{businessName}</div>
                <div style={{ fontSize: '9px', whiteSpace: 'pre-line' }}>{address}</div>
                {gstNumber && <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '2px' }}>GSTIN/UIN: {gstNumber}</div>}
                {sellerState.name && <div style={{ fontSize: '9px' }}>State Name: {sellerState.name}, Code: {sellerState.code}</div>}
                {mobile && <div style={{ fontSize: '9px' }}>Contact: {mobile}</div>}
                {email && <div style={{ fontSize: '9px' }}>E-Mail: {email}</div>}
              </div>
            </div>
          </div>
          <div style={{ width: '42%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <tbody>
                {[
                  ['Invoice No.', invoiceNumber],
                  ['Dated', formatDate(invoiceDate)],
                  ['Mode/Terms of Payment', paymentMethod || 'Cash'],
                  ['Buyer\'s Order No.', ''],
                  ['Dispatched through', customerTransportDetails || ''],
                  ['Destination', ''],
                ].map(([label, value], i) => (
                  <tr key={i}>
                    <td style={{ borderBottom: b, borderRight: b, padding: '1px 5px', fontWeight: 'bold', width: '50%' }}>{label}</td>
                    <td style={{ borderBottom: b, padding: '1px 5px' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Buyer Details */}
        <div style={{ display: 'flex', borderBottom: b, flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '4px 8px', borderRight: b }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>Consignee (Ship to)</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{customerName || 'Walk-in Customer'}</div>
            {customerAddress && <div style={{ fontSize: '9px', whiteSpace: 'pre-line' }}>{customerAddress}</div>}
            {customerGSTIN && <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '1px' }}>GSTIN/UIN: {customerGSTIN}</div>}
            {buyerState.name && <div style={{ fontSize: '9px' }}>State Name: {buyerState.name}, Code: {buyerState.code}</div>}
            {customerMobile && <div style={{ fontSize: '9px' }}>Contact: {customerMobile}</div>}
          </div>
          <div style={{ width: '42%', padding: '4px 8px' }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>Buyer (Bill to)</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{customerName || 'Walk-in Customer'}</div>
            {customerAddress && <div style={{ fontSize: '9px', whiteSpace: 'pre-line' }}>{customerAddress}</div>}
            {customerGSTIN && <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '1px' }}>GSTIN/UIN: {customerGSTIN}</div>}
            {buyerState.name && <div style={{ fontSize: '9px' }}>State Name: {buyerState.name}, Code: {buyerState.code}</div>}
            {customerMobile && <div style={{ fontSize: '9px' }}>Contact: {customerMobile}</div>}
          </div>
        </div>

        {/* ===== ITEMS TABLE (flex-grow to fill remaining space) ===== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
            <thead>
              <tr>
                <th style={{ ...hCell, width: '28px' }}>Sl No.</th>
                <th style={{ ...hCell, textAlign: 'left' }}>Description of Goods</th>
                {showHSN && <th style={{ ...hCell, width: '65px' }}>HSN/SAC</th>}
                <th style={{ ...hCell, width: '55px' }}>Quantity</th>
                <th style={{ ...hCell, width: '75px' }}>Rate (Incl. Tax)</th>
                <th style={{ ...hCell, width: '70px' }}>Rate</th>
                <th style={{ ...hCell, width: '30px' }}>per</th>
                <th style={{ ...hCell, width: '80px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const gstPct = item.gstPercent || 0;
                const gstAmt = gstPct > 0 ? (item.total * gstPct) / (100 + gstPct) : 0;
                const taxableAmt = item.total - gstAmt;
                const rateInclTax = item.qty > 0 ? item.total / item.qty : 0;
                const rateExclTax = item.qty > 0 ? taxableAmt / item.qty : 0;
                const halfRate = gstPct / 2;
                return (
                  <tr key={index}>
                    <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top' }}>{index + 1}</td>
                    <td style={{ ...cellNoRowBorder, verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{item.particulars}</div>
                      {item.color && <div style={{ fontSize: '9px', color: '#444' }}>Color: {item.color}</div>}
                      {item.barcode && <div style={{ fontSize: '9px', color: '#333' }}>IMEI: {item.barcode}</div>}
                    </td>
                    {showHSN && <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top' }}>{item.hsn}</td>}
                    <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top' }}>{item.qty} Pcs</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', verticalAlign: 'top' }}>{fmt(rateInclTax)}</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', verticalAlign: 'top' }}>{fmt(rateExclTax)}</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'center', verticalAlign: 'top' }}>Pcs</td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', verticalAlign: 'top' }}>{fmt(taxableAmt)}</td>
                  </tr>
                );
              })}
              {/* Blank filler rows — minimum 5 total content rows */}
              {Array.from({ length: blankRowsNeeded }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td style={cellNoRowBorder}>&nbsp;</td>
                  <td style={cellNoRowBorder}></td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                  <td style={cellNoRowBorder}></td>
                </tr>
              ))}
              {/* CGST/SGST/IGST summary rows at bottom */}
              {showGSTBreakdown && !isInterState && totalCgst > 0 && (
                <>
                  <tr>
                    <td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '9px' }}>OUTPUT CGST@{summaryGstRate / 2}%</td>
                    {showHSN && <td style={cellNoRowBorder}></td>}
                    <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{summaryGstRate / 2} %</td>
                    <td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{fmt(totalCgst)}</td>
                  </tr>
                  <tr>
                    <td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '9px' }}>OUTPUT SGST@{summaryGstRate / 2}%</td>
                    {showHSN && <td style={cellNoRowBorder}></td>}
                    <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{summaryGstRate / 2} %</td>
                    <td style={cellNoRowBorder}></td>
                    <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{fmt(totalSgst)}</td>
                  </tr>
                </>
              )}
              {showGSTBreakdown && isInterState && totalIgst > 0 && (
                <tr>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '9px' }}>OUTPUT IGST@{summaryGstRate}%</td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{summaryGstRate} %</td>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{fmt(totalIgst)}</td>
                </tr>
              )}
              {/* Round Off */}
              {roundOff !== 0 && (
                <tr>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, paddingLeft: '16px', fontSize: '9px' }}>ROUND OFF</td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td><td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: 'right', fontSize: '9px' }}>{roundOff >= 0 ? '' : '(-)'}{fmt(Math.abs(roundOff))}</td>
                </tr>
              )}
              {/* Total Row */}
              <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                <td style={{ ...cell, textAlign: 'center' }}></td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>Total</td>
                {showHSN && <td style={cell}></td>}
                <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{totalQty} Pcs</td>
                <td style={cell}></td><td style={cell}></td><td style={cell}></td>
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
          <div style={{ flex: 1, padding: '5px 8px', borderRight: b, fontSize: '9px' }}>
            {gstNumber && <div style={{ marginBottom: '3px' }}><strong>Company's PAN:</strong> {gstNumber.substring(2, 12)}</div>}
            <div style={{ fontWeight: 'bold', marginBottom: '1px' }}>Declaration:</div>
            <div style={{ whiteSpace: 'pre-line', lineHeight: '1.2', fontSize: '8px' }}>
              {declarationText || defaultDeclaration}
            </div>
          </div>

          {showBankDetails && bankDetails && (bankDetails.bankName || bankDetails.accountNumber) && (
            <div style={{ flex: 1, padding: '5px 8px', borderRight: b, fontSize: '9px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Company's Bank Details:</div>
              {bankDetails.accountHolder && <div>A/c Holder: <strong>{bankDetails.accountHolder}</strong></div>}
              {bankDetails.bankName && <div>Bank: <strong>{bankDetails.bankName}</strong></div>}
              {bankDetails.accountNumber && <div>A/c No.: <strong>{bankDetails.accountNumber}</strong></div>}
              {(bankDetails.branch || bankDetails.ifscCode) && (
                <div>Branch & IFSC: <strong>{[bankDetails.branch, bankDetails.ifscCode].filter(Boolean).join(' & ')}</strong></div>
              )}
            </div>
          )}

          <div style={{ width: '28%', padding: '5px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
            {qrCodeUrl && <img src={qrCodeUrl} alt="UPI QR" style={{ width: '70px', height: '70px' }} />}
            <div style={{ marginTop: 'auto', paddingTop: '6px', width: '100%' }}>
              <div style={{ fontSize: '9px', marginBottom: '1px' }}>for {businessName}</div>
              <div style={{ borderBottom: b, width: '75%', margin: '14px auto 3px' }}></div>
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
