# Update Vastrakala `newtemp` WhatsApp template

## What will change
- Keep the existing template name `newtemp` and all seven body parameters unchanged, so POS invoice mapping continues to work.
- Remove the IMAGE header, which removes the large shop-logo preview from WhatsApp messages.
- Replace it with a TEXT header: `VASTRAKALA SAREES & LADIES WEAR`.
- Add the saved shop address near the top of the message body: `MAHARANA PRATAP CHOWK, LAXMI ROAD, KOLHAPUR`.
- Keep customer name, invoice number, amount, invoice link, Instagram, and Google Review placeholders in their existing order.

## Meta review and rollout
- Submit the edited template to Meta. Editing an approved template can return it to `PENDING`; it must be approved again before the changed version is usable.
- Refresh the app's synced template record after submission.
- Do not switch to another template or alter POS billing logic.

## Verification
- Confirm Meta accepted the edit and report its returned status.
- Confirm the stored template has a TEXT header, no IMAGE header, and exactly seven body parameters.
- Do not send a customer test message unless requested.
