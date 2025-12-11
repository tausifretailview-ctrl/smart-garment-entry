/**
 * Encodes a purchase price into an alphabetic code using a custom alphabet mapping.
 * Each digit (0-9) is mapped to a letter in the provided alphabet.
 * 
 * @param price - The purchase price to encode
 * @param alphabet - A 10-character string mapping digits 0-9 to letters (default: "ABCDEFGHIK")
 * @returns The encoded alphabetic code (e.g., 100 -> "BAA" with default alphabet)
 * 
 * @example
 * encodePurchasePrice(100, "ABCDEFGHIK") // Returns "BAA"
 * encodePurchasePrice(250, "ABCDEFGHIK") // Returns "CFA"
 * encodePurchasePrice(1999, "ZYXWVUTSRQ") // Returns "ZQQQQ"
 */
export const encodePurchasePrice = (price: number, alphabet?: string): string => {
  // Default alphabet if not provided (0=A, 1=B, 2=C, ..., 9=K)
  const codeAlphabet = alphabet || "ABCDEFGHIK";
  
  // Validate alphabet length
  if (codeAlphabet.length !== 10) {
    console.warn("Invalid alphabet length (must be 10 characters), using default");
    return encodePurchasePrice(price, "ABCDEFGHIK");
  }
  
  // Validate alphabet contains only letters
  if (!/^[A-Z]{10}$/i.test(codeAlphabet)) {
    console.warn("Invalid alphabet (must contain only letters A-Z), using default");
    return encodePurchasePrice(price, "ABCDEFGHIK");
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
  
  // Add "001" prefix to make the code harder to estimate
  return `001${encodedCode}`;
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
