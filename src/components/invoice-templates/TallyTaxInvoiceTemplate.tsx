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
  // Pass-through props (unused but accepted for compatibility)
  [key: string]: any;
}

// Convert number to Indian words
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
  if (rupees === 0) {
    result = 'Zero';
  } else {
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
  if (paise > 0) {
    result += ' and ' + convertChunk(paise) + ' Paise';
  }
  return result + ' Only';
};

const formatCurrency = (amount: number, withDecimal = true): string => {
  if (withDecimal) {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(amount).toLocaleString('en-IN');
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

// Extract state code from GSTIN (first 2 digits)
const getStateFromGSTIN = (gstin?: string): { name: string; code: string } => {
  if (!gstin || gstin.length < 2) return { name: '', code: '' };
  const stateCodeMap: Record<string, string> = {
    '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
    '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
    '24': 'Gujarat', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
    '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
  };
  const code = gstin.substring(0, 2);
  return { name: stateCodeMap[code] || '', code };
};

export const TallyTaxInvoiceTemplate: React.FC<TallyTaxInvoiceTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  invoiceTime,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  customerTransportDetails,
  salesman,
  items,
  subtotal,
  discount,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  totalTax,
  roundOff,
  grandTotal,
  paymentMethod,
  declarationText,
  bankDetails,
  qrCodeUrl,
  upiId,
  showHSN = true,
  showGSTBreakdown = true,
  showBankDetails = true,
  notes,
}) => {
  const sellerState = getStateFromGSTIN(gstNumber);
  const buyerState = getStateFromGSTIN(customerGSTIN);
  const isInterState = gstNumber && customerGSTIN && gstNumber.substring(0, 2) !== customerGSTIN.substring(0, 2);

  // Build rate-wise HSN breakup
  const hsnBreakup: Record<string, { hsn: string; taxableValue: number; rate: number; cgst: number; sgst: number; igst: number; total: number }> = {};
  items.forEach(item => {
    const gstPct = item.gstPercent || 0;
    const gstAmt = gstPct > 0 ? (item.total * gstPct) / (100 + gstPct) : 0;
    const taxable = item.total - gstAmt;
    const hsn = item.hsn || 'N/A';
    const key = `${hsn}-${gstPct}`;
    if (!hsnBreakup[key]) {
      hsnBreakup[key] = { hsn, taxableValue: 0, rate: gstPct, cgst: 0, sgst: 0, igst: 0, total: 0 };
    }
    hsnBreakup[key].taxableValue += taxable;
    if (isInterState) {
      hsnBreakup[key].igst += gstAmt;
    } else {
      hsnBreakup[key].cgst += gstAmt / 2;
      hsnBreakup[key].sgst += gstAmt / 2;
    }
    hsnBreakup[key].total += gstAmt;
  });

  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  const cellStyle: React.CSSProperties = { border: '1px solid #000', padding: '3px 6px', fontSize: '11px', lineHeight: '1.4' };
  const headerCellStyle: React.CSSProperties = { ...cellStyle, fontWeight: 'bold', textAlign: 'center', backgroundColor: '#f5f5f5' };

  const defaultDeclaration = `We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.\nWARRANTY TO CUSTOMER IS DIRECTLY FROM MANUFACTURER.\nDEALER IS NOT RESPONSIBLE. GOODS ONCE SOLD WILL NOT BE TAKEN BACK OR EXCHANGED.`;

  return (
    <div style={{
      width: '210mm',
      minHeight: '297mm',
      padding: '10mm',
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      fontSize: '11px',
      color: '#000',
      background: '#fff',
      lineHeight: '1.4',
      boxSizing: 'border-box',
    }}>
      <div style={{ border: '2px solid #000', padding: '0' }}>
        
        {/* Title */}
        <div style={{ textAlign: 'center', borderBottom: '1px solid #000', padding: '6px 0', fontWeight: 'bold', fontSize: '16px', letterSpacing: '2px' }}>
          TAX INVOICE
        </div>

        {/* Header: Seller + Invoice Details */}
        <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
          {/* Seller Details - Left */}
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '1px solid #000' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              {logoUrl && (
                <img src={logoUrl} alt="Logo" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
              )}
              <div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '2px' }}>{businessName}</div>
                <div style={{ fontSize: '10px', whiteSpace: 'pre-line' }}>{address}</div>
                {gstNumber && <div style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '3px' }}>GSTIN/UIN: {gstNumber}</div>}
                {sellerState.name && <div style={{ fontSize: '10px' }}>State Name: {sellerState.name}, Code: {sellerState.code}</div>}
                {mobile && <div style={{ fontSize: '10px' }}>Contact: {mobile}</div>}
                {email && <div style={{ fontSize: '10px' }}>E-Mail: {email}</div>}
              </div>
            </div>
          </div>

          {/* Invoice Details Table - Right */}
          <div style={{ width: '45%', padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
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
                    <td style={{ borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '2px 6px', fontWeight: 'bold', width: '50%' }}>{label}</td>
                    <td style={{ borderBottom: '1px solid #000', padding: '2px 6px' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Buyer Details */}
        <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
          {/* Consignee (Ship to) */}
          <div style={{ flex: 1, padding: '6px 10px', borderRight: '1px solid #000' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>Consignee (Ship to)</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{customerName || 'Walk-in Customer'}</div>
            {customerAddress && <div style={{ fontSize: '10px', whiteSpace: 'pre-line' }}>{customerAddress}</div>}
            {customerGSTIN && <div style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '2px' }}>GSTIN/UIN: {customerGSTIN}</div>}
            {buyerState.name && <div style={{ fontSize: '10px' }}>State Name: {buyerState.name}, Code: {buyerState.code}</div>}
            {customerMobile && <div style={{ fontSize: '10px' }}>Contact: {customerMobile}</div>}
          </div>
          {/* Buyer (Bill to) */}
          <div style={{ width: '45%', padding: '6px 10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>Buyer (Bill to)</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{customerName || 'Walk-in Customer'}</div>
            {customerAddress && <div style={{ fontSize: '10px', whiteSpace: 'pre-line' }}>{customerAddress}</div>}
            {customerGSTIN && <div style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '2px' }}>GSTIN/UIN: {customerGSTIN}</div>}
            {buyerState.name && <div style={{ fontSize: '10px' }}>State Name: {buyerState.name}, Code: {buyerState.code}</div>}
            {customerMobile && <div style={{ fontSize: '10px' }}>Contact: {customerMobile}</div>}
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '30px' }}>Sl No.</th>
              <th style={{ ...headerCellStyle, textAlign: 'left' }}>Description of Goods</th>
              {showHSN && <th style={{ ...headerCellStyle, width: '75px' }}>HSN/SAC</th>}
              <th style={{ ...headerCellStyle, width: '60px' }}>Quantity</th>
              <th style={{ ...headerCellStyle, width: '85px' }}>Rate (Incl. Tax)</th>
              <th style={{ ...headerCellStyle, width: '75px' }}>Rate</th>
              <th style={{ ...headerCellStyle, width: '35px' }}>per</th>
              <th style={{ ...headerCellStyle, width: '90px' }}>Amount</th>
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
                <React.Fragment key={index}>
                  {/* Product Row */}
                  <tr>
                    <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'top' }}>{index + 1}</td>
                    <td style={{ ...cellStyle, verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 'bold' }}>{item.particulars}</div>
                      {item.color && <div style={{ fontSize: '10px', color: '#444' }}>Color: {item.color}</div>}
                      {/* IMEI/Barcode display */}
                      {item.barcode && (
                        <div style={{ fontSize: '10px', color: '#333', marginTop: '1px' }}>
                          IMEI: {item.barcode}
                        </div>
                      )}
                    </td>
                    {showHSN && <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'top' }}>{item.hsn}</td>}
                    <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'top' }}>{item.qty} Pcs</td>
                    <td style={{ ...cellStyle, textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(rateInclTax)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(rateExclTax)}</td>
                    <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'top' }}>Pcs</td>
                    <td style={{ ...cellStyle, textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(taxableAmt)}</td>
                  </tr>
                  {/* Tax rows for this item */}
                  {showGSTBreakdown && gstPct > 0 && !isInterState && (
                    <>
                      <tr>
                        <td style={cellStyle}></td>
                        <td style={{ ...cellStyle, paddingLeft: '20px', fontSize: '10px' }}>OUTPUT CGST@{halfRate}%</td>
                        {showHSN && <td style={cellStyle}></td>}
                        <td style={cellStyle}></td>
                        <td style={cellStyle}></td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>{halfRate} %</td>
                        <td style={cellStyle}></td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>{formatCurrency(gstAmt / 2)}</td>
                      </tr>
                      <tr>
                        <td style={cellStyle}></td>
                        <td style={{ ...cellStyle, paddingLeft: '20px', fontSize: '10px' }}>OUTPUT SGST@{halfRate}%</td>
                        {showHSN && <td style={cellStyle}></td>}
                        <td style={cellStyle}></td>
                        <td style={cellStyle}></td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>{halfRate} %</td>
                        <td style={cellStyle}></td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>{formatCurrency(gstAmt / 2)}</td>
                      </tr>
                    </>
                  )}
                  {showGSTBreakdown && gstPct > 0 && isInterState && (
                    <tr>
                      <td style={cellStyle}></td>
                      <td style={{ ...cellStyle, paddingLeft: '20px', fontSize: '10px' }}>OUTPUT IGST@{gstPct}%</td>
                      {showHSN && <td style={cellStyle}></td>}
                      <td style={cellStyle}></td>
                      <td style={cellStyle}></td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>{gstPct} %</td>
                      <td style={cellStyle}></td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>{formatCurrency(gstAmt)}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {/* Round Off row */}
            {roundOff !== 0 && (
              <tr>
                <td style={cellStyle}></td>
                <td style={{ ...cellStyle, paddingLeft: '20px', fontSize: '10px' }}>ROUND OFF</td>
                {showHSN && <td style={cellStyle}></td>}
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontSize: '10px' }}>
                  {roundOff >= 0 ? '' : '(-)'}{formatCurrency(Math.abs(roundOff))}
                </td>
              </tr>
            )}
            {/* Total Row */}
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...cellStyle, textAlign: 'center' }}></td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>Total</td>
              {showHSN && <td style={cellStyle}></td>}
              <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold' }}>{totalQty} Pcs</td>
              <td style={cellStyle}></td>
              <td style={cellStyle}></td>
              <td style={cellStyle}></td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>₹{formatCurrency(grandTotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* Amount in Words */}
        <div style={{ borderTop: '1px solid #000', padding: '6px 10px', borderBottom: '1px solid #000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 'bold' }}>Amount Chargeable (in words):</span>
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '2px' }}>
                INR {numberToIndianWords(grandTotal)}
              </div>
            </div>
            <div style={{ fontSize: '10px', fontStyle: 'italic', alignSelf: 'flex-end' }}>E. & O.E</div>
          </div>
        </div>

        {/* HSN/SAC Tax Breakup Table */}
        {showGSTBreakdown && Object.keys(hsnBreakup).length > 0 && (
          <div style={{ borderBottom: '1px solid #000' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: 'left' }}>HSN/SAC</th>
                  <th style={{ ...headerCellStyle, textAlign: 'right' }}>Taxable Value</th>
                  {!isInterState ? (
                    <>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>CGST Rate</th>
                      <th style={{ ...headerCellStyle, textAlign: 'right' }}>CGST Amt</th>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>SGST Rate</th>
                      <th style={{ ...headerCellStyle, textAlign: 'right' }}>SGST Amt</th>
                    </>
                  ) : (
                    <>
                      <th style={{ ...headerCellStyle, textAlign: 'center' }}>IGST Rate</th>
                      <th style={{ ...headerCellStyle, textAlign: 'right' }}>IGST Amt</th>
                    </>
                  )}
                  <th style={{ ...headerCellStyle, textAlign: 'right' }}>Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(hsnBreakup).map((row, idx) => (
                  <tr key={idx}>
                    <td style={cellStyle}>{row.hsn}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.taxableValue)}</td>
                    {!isInterState ? (
                      <>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{row.rate / 2}%</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.cgst)}</td>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{row.rate / 2}%</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.sgst)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{row.rate}%</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.igst)}</td>
                      </>
                    )}
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
                {/* Totals */}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                  <td style={{ ...cellStyle, fontWeight: 'bold' }}>Total</td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(taxableAmount)}</td>
                  {!isInterState ? (
                    <>
                      <td style={cellStyle}></td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(cgstAmount)}</td>
                      <td style={cellStyle}></td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(sgstAmount)}</td>
                    </>
                  ) : (
                    <>
                      <td style={cellStyle}></td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(igstAmount || totalTax)}</td>
                    </>
                  )}
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(totalTax)}</td>
                </tr>
              </tbody>
            </table>
            {/* Tax in Words */}
            <div style={{ padding: '4px 10px', fontSize: '10px', borderTop: '1px solid #000' }}>
              <span style={{ fontWeight: 'bold' }}>Tax Amount (in words): </span>
              INR {numberToIndianWords(totalTax)}
            </div>
          </div>
        )}

        {/* Footer: Declaration + Bank + QR/Signature */}
        <div style={{ display: 'flex', borderTop: '0', minHeight: '100px' }}>
          {/* Left: Declaration */}
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '1px solid #000', fontSize: '10px' }}>
            {gstNumber && (
              <div style={{ marginBottom: '4px' }}><strong>Company's PAN:</strong> {gstNumber.substring(2, 12)}</div>
            )}
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Declaration:</div>
            <div style={{ whiteSpace: 'pre-line', lineHeight: '1.3', fontSize: '9px' }}>
              {declarationText || defaultDeclaration}
            </div>
          </div>

          {/* Center: Bank Details */}
          {showBankDetails && bankDetails && (bankDetails.bankName || bankDetails.accountNumber) && (
            <div style={{ flex: 1, padding: '8px 10px', borderRight: '1px solid #000', fontSize: '10px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Company's Bank Details:</div>
              {bankDetails.accountHolder && <div>A/c Holder's Name: <strong>{bankDetails.accountHolder}</strong></div>}
              {bankDetails.bankName && <div>Bank Name: <strong>{bankDetails.bankName}</strong></div>}
              {bankDetails.accountNumber && <div>A/c No.: <strong>{bankDetails.accountNumber}</strong></div>}
              {(bankDetails.branch || bankDetails.ifscCode) && (
                <div>Branch & IFS Code: <strong>{[bankDetails.branch, bankDetails.ifscCode].filter(Boolean).join(' & ')}</strong></div>
              )}
            </div>
          )}

          {/* Right: QR + Signature */}
          <div style={{ width: '30%', padding: '8px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px' }} />
            )}
            <div style={{ marginTop: 'auto', paddingTop: '10px', width: '100%' }}>
              <div style={{ fontSize: '10px', marginBottom: '2px' }}>for {businessName}</div>
              <div style={{ borderBottom: '1px solid #000', width: '80%', margin: '20px auto 4px' }}></div>
              <div style={{ fontSize: '10px', fontWeight: 'bold' }}>Authorised Signatory</div>
            </div>
          </div>
        </div>

        {/* Bottom Footer */}
        <div style={{ borderTop: '1px solid #000', textAlign: 'center', padding: '4px 0', fontSize: '9px', color: '#555' }}>
          This is a Computer Generated Invoice
        </div>
      </div>
    </div>
  );
};
