

# Add WhatsApp Message to Fee Collection Receipt

## What Will Change

After collecting a student's fees, the receipt screen will show two new buttons alongside "Print Receipt":
- **Send WhatsApp** -- opens WhatsApp with a pre-formatted fee receipt message sent to the student's phone/guardian phone
- The existing Print button remains as-is

## How It Works

1. After fee collection succeeds, the receipt dialog already shows receipt details
2. A new "WhatsApp" button will appear next to "Print Receipt"
3. Clicking it will compose a message like:

```
Dear [Student Name],

Fee Receipt - [School Name]
Receipt #: RCP-XXXXX
Date: 11/02/2026

Fee Details:
- ACADEMIC FEES: Rs.6,000.00

Total Paid: Rs.6,000.00
Payment Mode: Cash

Thank you!
```

4. Opens WhatsApp via `wa.me` link using the existing `useWhatsAppSend` hook
5. Phone number is picked from student's `phone` or `guardian_phone` field

## Technical Details

### File Modified: `src/components/school/FeeCollectionDialog.tsx`

1. Import `useWhatsAppSend` hook
2. Add a `sendWhatsApp` button in the receipt view (line ~248, next to Print and Close buttons)
3. Build the WhatsApp message from `receiptData` and `student` details
4. Use `student.phone || student.guardian_phone` as the recipient number
5. Add `MessageCircle` icon from lucide-react for the WhatsApp button

No new files, no database changes needed. The existing `useWhatsAppSend` hook handles phone formatting and clipboard copy automatically.
