-- Fix 1: Drop the problematic single-row constraint from barcode_sequence
ALTER TABLE barcode_sequence DROP CONSTRAINT IF EXISTS single_row_only;

-- Fix 2: Convert id column to use proper auto-increment sequence
ALTER TABLE barcode_sequence ALTER COLUMN id DROP DEFAULT;

-- Create sequence for barcode_sequence id
CREATE SEQUENCE IF NOT EXISTS barcode_sequence_id_seq;

-- Set the sequence as the default for the id column
ALTER TABLE barcode_sequence ALTER COLUMN id SET DEFAULT nextval('barcode_sequence_id_seq');

-- Set the sequence ownership
ALTER SEQUENCE barcode_sequence_id_seq OWNED BY barcode_sequence.id;

-- Initialize the sequence from current max id + 1
SELECT setval('barcode_sequence_id_seq', COALESCE((SELECT MAX(id) FROM barcode_sequence), 0) + 1, false);

-- Fix 3: Initialize missing barcode sequences for organizations
-- For Organization 3 (SM SLOON) - organization_number = 3, starting barcode: 30001001
INSERT INTO barcode_sequence (organization_id, next_barcode, updated_at)
VALUES ('0336aad0-d3b5-4a55-9c9c-4555e10fb33a', 30001001, NOW())
ON CONFLICT (organization_id) DO NOTHING;

-- For Organization 4 (SM Saloon) - organization_number = 4, starting barcode: 40001001
INSERT INTO barcode_sequence (organization_id, next_barcode, updated_at)
VALUES ('9bd93065-2c41-464d-b50c-97cc7a1eb68f', 40001001, NOW())
ON CONFLICT (organization_id) DO NOTHING;

-- Fix 4: Clean up orphaned purchase bill sequences with NULL organization_id
DELETE FROM bill_number_sequence 
WHERE organization_id IS NULL;