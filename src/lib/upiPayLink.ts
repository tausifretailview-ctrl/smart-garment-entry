/** Build a UPI deep link (NPCI spec) for QR codes and mobile pay buttons. */
export function buildUpiPayLink(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const upiId = params.upiId.trim();
  if (!upiId) return "";
  const amount = Math.max(0, Number(params.amount) || 0);
  const name = encodeURIComponent(params.payeeName.trim() || "Store");
  const note = params.note?.trim() ? `&tn=${encodeURIComponent(params.note.trim())}` : "";
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${name}&am=${amount.toFixed(2)}&cu=INR${note}`;
}
