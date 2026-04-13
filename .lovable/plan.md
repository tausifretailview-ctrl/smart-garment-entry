

## Plan: Support Both Alphabetic and Numeric Purchase Code Mappings

### Problem
Currently, the purchase code system only accepts uppercase letters (A-Z) as the 10-character mapping alphabet. Some customers want to use digits (0-9) as well — for example, mapping `0123456789` so that a price of 500 encodes directly as `500` within the code format `MM50026`.

### Changes

**1. Update `purchaseCodeEncoder.ts` — relax validation to allow letters AND digits**
- `encodePurchasePrice`: Change the regex from `/^[A-Z]{10}$/i` to `/^[A-Z0-9]{10}$/i` so the alphabet can contain digits.
- Remove the `.toUpperCase()` on the alphabet during encoding (digits don't have case).
- `validatePurchaseCodeAlphabet`: Change from `/^[A-Z]{10}$/` to `/^[A-Z0-9]{10}$/` to accept mixed alphanumeric mappings. Keep the uniqueness check.

**2. Update `Settings.tsx` — allow digits in the input field**
- Change the input `onChange` handler regex filter from `/[^A-Z]/g` to `/[^A-Z0-9]/g` so digits aren't stripped.
- Update the validation error message from "Must be exactly 10 unique uppercase letters (A-Z)" to "Must be exactly 10 unique characters (A-Z or 0-9)".
- Update the helper text/example to show that numeric mappings like `0123456789` are also valid.

### Example
With alphabet `0123456789` and price 500, bill date Feb 2025:
- Output: `0250026` (MM=02, code=500, YR=26)

With alphabet `ABCDEFGHIJ` and price 500:
- Output: `02FAA26` (F=5, A=0, A=0)

