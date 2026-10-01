/** Convert rupee amount (integer-friendly) to words for payment receipts. */
export function paymentAmountToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  if (num === 0) return "Zero";

  const crores = Math.floor(num / 10000000);
  const lakhs = Math.floor((num % 10000000) / 100000);
  const thousands = Math.floor((num % 100000) / 1000);
  const hundreds = Math.floor((num % 1000) / 100);
  const remainder = Math.floor(num % 100);

  let words = "";

  if (crores > 0) words += convertTwoDigit(crores) + " Crore ";
  if (lakhs > 0) words += convertTwoDigit(lakhs) + " Lakh ";
  if (thousands > 0) words += convertTwoDigit(thousands) + " Thousand ";
  if (hundreds > 0) words += ones[hundreds] + " Hundred ";

  if (remainder > 0) {
    if (remainder < 10) words += ones[remainder];
    else if (remainder < 20) words += teens[remainder - 10];
    else {
      words += tens[Math.floor(remainder / 10)];
      if (remainder % 10 > 0) words += " " + ones[remainder % 10];
    }
  }

  const decimal = Math.round((num % 1) * 100);
  if (decimal > 0) {
    words += " and " + convertTwoDigit(decimal) + " Paise";
  }

  return words.trim();

  function convertTwoDigit(n: number): string {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    return tens[Math.floor(n / 10)] + (n % 10 > 0 ? " " + ones[n % 10] : "");
  }
}
