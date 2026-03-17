

## Fix: Auto-Initialize Barcode Sequence for New Organizations

### Problem
When a new organization is created, the `generate_next_barcode` function initializes the sequence at `1` instead of using the organization's number prefix (e.g., org #21 should start at `21001001`). This has already caused issues for YOJAK (org #12, got barcode `1`) and AJMERA TRADERS (org #19, got barcode `1`).

**Root cause**: Line 36 of `generate_next_barcode` does `INSERT INTO barcode_sequence ... VALUES (p_organization_id, 1)` — hardcoded `1` instead of computing from `organization_number`.

### Current Data Showing the Bug
| Org | # | next_barcode | Expected Start |
|-----|---|-------------|----------------|
| YOJAK | 12 | 2 | 120001001 |
| AJMERA TRADERS | 19 | 13 | 190001001 |
| SAAJ (manual fix) | 20 | 20001001 | ✅ correct |

### Plan

**1. Update `generate_next_barcode` SQL function** (migration)

Change the upsert default from `1` to a computed value based on `organization_number`:
- Look up `organization_number` from `organizations` table
- Compute starting barcode: `org_number * 10,000,000 + 1001` (for org_number >= 10, gives 9-digit; for < 10, gives 8-digit)
- Use this as the initial `next_barcode` value in the INSERT

```sql
-- Compute proper starting value
SELECT COALESCE(organization_number, 1) INTO v_org_number
FROM organizations WHERE id = p_organization_id;

v_starting_barcode := (v_org_number * 10000000) + 1001;

INSERT INTO barcode_sequence (organization_id, next_barcode)
VALUES (p_organization_id, v_starting_barcode)
ON CONFLICT (organization_id) DO NOTHING;
```

**2. Fix existing broken sequences** (data fix via insert tool)

Fix YOJAK (#12) and AJMERA TRADERS (#19) which got wrong starting values:
```sql
UPDATE barcode_sequence SET next_barcode = 120001001 WHERE organization_id = (SELECT id FROM organizations WHERE organization_number = 12);
UPDATE barcode_sequence SET next_barcode = 190001001 WHERE organization_id = (SELECT id FROM organizations WHERE organization_number = 19);
```

**3. Also update `create_organization` RPC** (migration)

Add barcode_sequence initialization right after the org INSERT, so the sequence row exists immediately with the correct prefix — no reliance on first barcode generation call.

### Files Changed
- New migration: Update `generate_next_barcode` function to compute starting value from `organization_number`
- New migration: Update `create_organization` function to initialize barcode_sequence
- Data fix: Correct YOJAK and AJMERA TRADERS sequences

