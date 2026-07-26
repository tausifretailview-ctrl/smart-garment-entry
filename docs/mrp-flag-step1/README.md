# MRP Flag — Step 1 (settings migration)

**Status: BLOCKED in this agent environment — awaiting operator run in Supabase SQL Editor (or any session with service-role / DB write access).**

This checkout only has the Supabase **publishable** key. There is no `SUPABASE_SERVICE_ROLE_KEY`, database URL, or `psql`/`supabase` CLI available here, so the production `UPDATE` cannot be executed from Cursor.

## Operator checklist (run in order)

1. Open Supabase SQL Editor on the **production** project.
2. Run [`01-backup.sql`](./01-backup.sql) → **Download as CSV** → save next to this folder as  
   `backup-purchase_settings-YYYYMMDD.csv` (keep for rollback).
3. Run [`02-guard.sql`](./02-guard.sql) → must return **0 rows**.  
   If any row appears: **stop**, drop that org from the list, reassess.
4. Run [`03-update.sql`](./03-update.sql) → expect **`UPDATE 14`**.  
   Any other count: **stop and report**. Do not start Step 2.
5. Reply in chat with: backup filename, guard row count (0), update row count (14).

Rollback if needed: [`04-rollback.sql`](./04-rollback.sql) (only if 1b was clean).

## Rules (do not violate)

- Only where `purchase_settings->>'show_mrp' IS NULL`.
- Never overwrite explicit `false` (e.g. org `e8fbf0d8…` is **not** in this list).
- Merge with `||` — never replace the whole JSON object.
- No code (Step 2/3) until this reports 14 and is approved.
