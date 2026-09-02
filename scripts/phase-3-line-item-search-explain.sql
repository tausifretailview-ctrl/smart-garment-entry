-- INDEX ONLY — running this file is supposed to fail.
-- SQL editor Run executes the whole buffer, which previously hit
-- search_line_item_sale_ids (42883: function does not exist) before migrate.
--
-- BEFORE migrate, paste ONE of these entire files and Run:
--   scripts/phase-3-before-00-ranking.sql
--   scripts/phase-3-before-0b-rpc-exists.sql
--   scripts/phase-3-before-E-invoice-join.sql
--   scripts/phase-3-before-F-pos-exists.sql
--
-- AFTER migrate only:
--   scripts/phase-3-after-C-shared-rpc.sql
--   scripts/phase-3-after-G-org-column.sql
--
-- Do not paste docs/*.md into the SQL editor.

DO $$
BEGIN
  RAISE EXCEPTION
    'Do not run this index file. BEFORE migrate open scripts/phase-3-before-00-ranking.sql (then E, then F). AFTER migrate only: scripts/phase-3-after-*.sql';
END
$$;
