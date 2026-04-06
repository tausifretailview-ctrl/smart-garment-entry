
-- Fix 11 invoices created on April 6, 2026 that got wrong series INV/25-26 instead of INV/26-27
-- Renumber them sequentially starting from INV/26-27/82

UPDATE sales SET sale_number = 'INV/26-27/82' WHERE id = '54194b6d-255c-4a8e-8632-a021b9fc730c';
UPDATE sales SET sale_number = 'INV/26-27/83' WHERE id = '5ff94597-0221-42ea-8f8a-c6e0a3c7b72b';
UPDATE sales SET sale_number = 'INV/26-27/84' WHERE id = '011e48c6-7f64-4ea9-9015-b12101789e69';
UPDATE sales SET sale_number = 'INV/26-27/85' WHERE id = 'cfffcf6c-0330-49dc-a758-e48aa934ac24';
UPDATE sales SET sale_number = 'INV/26-27/86' WHERE id = '55b9913d-be9a-40ff-845a-8f2edb5a1943';
UPDATE sales SET sale_number = 'INV/26-27/87' WHERE id = '0d28e831-2667-4a1e-a551-767ecdad17a3';
UPDATE sales SET sale_number = 'INV/26-27/88' WHERE id = 'dfe92807-a372-4003-baa2-2104a783195b';
UPDATE sales SET sale_number = 'INV/26-27/89' WHERE id = '4b9df900-9432-4060-8cdd-6adca5b3af9a';
UPDATE sales SET sale_number = 'INV/26-27/90' WHERE id = '5fbf6f96-6223-47da-a1ee-a8bd37c79122';
UPDATE sales SET sale_number = 'INV/26-27/91' WHERE id = '00737a2a-33a7-440c-8039-1d62ab63d727';
UPDATE sales SET sale_number = 'INV/26-27/92' WHERE id = 'c13e9af2-60bd-44bd-8637-488c9f9e3306';

-- Update the sequence counter so next invoice will be INV/26-27/93
UPDATE bill_number_sequences 
SET last_number = 92 
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'KS FOOTWEAR') 
AND series = 'INV/26-27';

-- Also reset the wrong 25-26 counter back to 903 (last valid one)
UPDATE bill_number_sequences 
SET last_number = 903 
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'KS FOOTWEAR') 
AND series = 'INV/25-26';
