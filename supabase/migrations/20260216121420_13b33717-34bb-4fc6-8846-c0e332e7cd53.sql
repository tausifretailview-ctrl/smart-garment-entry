
-- Delete the duplicate (old/empty) settings row
DELETE FROM settings WHERE id = '00000000-0000-0000-0000-000000000001';

-- Prevent future duplicates
ALTER TABLE settings ADD CONSTRAINT settings_organization_id_unique UNIQUE (organization_id);
