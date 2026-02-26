/**
 * Encodes a purchase price into an alphabetic code using a custom alphabet mapping.
 * Each digit (0-9) is mapped to a letter in the provided alphabet.
 * 
 * Format: MMCODEYR (e.g., 02UNSS25 for month=02, code=UNSS, year=25)
 * If no date is provided, uses current date.
 * 
 * @param price - The purchase price to encode
 * @param alphabet - A 10-character string mapping digits 0-9 to letters (default: "ABCDEFGHIK")
 * @param billDate - Optional bill date string (ISO format) for month/year prefix/suffix
 * @returns The encoded alphabetic code (e.g., "02UNSS25")
 */
export const encodePurchasePrice = (price: number, alphabet?: string, billDate?: string): string => {
  // Default alphabet if not provided (0=A, 1=B, 2=C, ..., 9=K)
  const codeAlphabet = alphabet || "ABCDEFGHIK";
  
  // Validate alphabet length
  if (codeAlphabet.length !== 10) {
    console.warn("Invalid alphabet length (must be 10 characters), using default");
    return encodePurchasePrice(price, "ABCDEFGHIK", billDate);
  }
  
  // Validate alphabet contains only letters
  if (!/^[A-Z]{10}$/i.test(codeAlphabet)) {
    console.warn("Invalid alphabet (must contain only letters A-Z), using default");
    return encodePurchasePrice(price, "ABCDEFGHIK", billDate);
  }
  
  // Get integer part only (ignore decimals)
  const intPrice = Math.floor(Math.abs(price));
  
  // Convert number to string to process each digit
  const priceStr = intPrice.toString();
  
  // Map each digit to corresponding letter from alphabet
  const encodedCode = priceStr.split('').map(digit => {
    const index = parseInt(digit);
    return codeAlphabet.toUpperCase()[index];
  }).join('');
  
  // Use bill date or current date for month/year
  const date = billDate ? new Date(billDate) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  
  // Format: MMCODEYR (e.g., 02UNSS25)
  return `${month}${encodedCode}${year}`;
};

/**
 * Calculates the effective purchase price for encoding.
 * If includeGst is true: pur_price + (pur_price * gst_per / 100)
 * Otherwise: just pur_price
 */
export const getEffectivePurchasePrice = (
  purPrice: number,
  gstPer: number = 0,
  includeGst: boolean = false
): number => {
  if (!includeGst || gstPer <= 0) return purPrice;
  return Math.round(purPrice + (purPrice * gstPer / 100));
};

/**
 * Validates a purchase code alphabet string.
 * Must be exactly 10 unique uppercase letters (A-Z).
 * 
 * @param alphabet - The alphabet string to validate
 * @returns true if valid, false otherwise
 */
export const validatePurchaseCodeAlphabet = (alphabet: string): boolean => {
  // Must be exactly 10 characters
  if (alphabet.length !== 10) return false;
  
  // Must be all uppercase letters A-Z
  if (!/^[A-Z]{10}$/.test(alphabet)) return false;
  
  // Must have unique characters (no duplicates)
  const uniqueChars = new Set(alphabet.split(''));
  if (uniqueChars.size !== 10) return false;
  
  return true;
};
