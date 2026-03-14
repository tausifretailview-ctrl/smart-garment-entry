

## Plan: Reset Barcode Sequence for GOPI ETHNIC COLLECTION

**Current state:** Organization has `next_barcode = 141`, `organization_number = 18`.

**Action:** Use the data insert tool to upsert `barcode_sequence` so `next_barcode = 18001001` for this organization (ID: `c2bd3701-8f43-467e-a9c5-e21a608c5f3b`).

```sql
INSERT INTO barcode_sequence (organization_id, next_barcode, updated_at)
VALUES ('c2bd3701-8f43-467e-a9c5-e21a608c5f3b', 18001001, now())
ON CONFLICT (organization_id) 
DO UPDATE SET next_barcode = 18001001, updated_at = now();
```

This bypasses the RPC formula (which would produce 180001001 — 9 digits) and directly sets the sequence to **18001001** (8 digits), matching your existing barcode style.

After execution, we'll verify with `generate_next_barcode` to confirm it returns `18001001`.

No code file changes needed — this is a data-only operation.

