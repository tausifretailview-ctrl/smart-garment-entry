# Accounting engine — Phase 2 rollout runbook

**Purpose:** Enable double-entry auto-journaling per organization safely, with verification, monitoring, and rollback.

**Prerequisites (already done in Phase 1):**

- Tables: `chart_of_accounts`, `journal_entries`, `journal_lines`
- Columns: `sales.journal_status`, `sales.journal_error`, `purchase_bills.journal_status`, `purchase_bills.journal_error`
- Flag: `settings.accounting_engine_enabled` (default `false`)
- App: sale/purchase flows post journals only when flag is `true`; Journal Vouchers UI + failed-posting alerts (where deployed)

---

## Roles

| Role | Responsibility |
|------|----------------|
| **DB admin** | Run SQL enable/disable, migrations, health queries |
| **App owner** | Confirm deployed frontend/backend version includes flag + journaling |
| **Support** | Watch failed-ledger alerts; escalate if spike |

---

## Wave plan

| Wave | Tenants | When to advance |
|------|---------|-----------------|
| **2A** | Internal + 1 pilot (e.g. DEMO) | Pilot stable 24–48h |
| **2B** | 3–5 low-volume friendly tenants | No unexplained `failed`; pending drift understood |
| **2C** | Larger batches | Same + support load OK |
| **2D** (optional) | New orgs default `true` | Product decision + docs |

---

## Pre-enable checklist (per organization)

1. **Org UUID** recorded: `________________________`
2. **App version** includes accounting flag + `recordSaleJournalEntry` / `recordPurchaseJournalEntry` gating.
3. **Schema** on this Supabase project:
   - `journal_entries`, `journal_lines`, `chart_of_accounts` exist
   - `settings.accounting_engine_enabled` exists
4. **Smoke test** (optional on staging): one POS sale + one purchase → journal row + balanced lines.

---

## Enable (single org)

```sql
update public.settings
set accounting_engine_enabled = true,
    updated_at = now()
where organization_id = '<ORG_UUID>';
```

**Verify:**

```sql
select organization_id, accounting_engine_enabled
from public.settings
where organization_id = '<ORG_UUID>';
```

---

## Rollback (single org)

```sql
update public.settings
set accounting_engine_enabled = false,
    updated_at = now()
where organization_id = '<ORG_UUID>';
```

**Note:** Existing `journal_entries` / `journal_lines` are not deleted (audit trail). New sales/purchases stop auto-posting until re-enabled.

---

## Health checks (run daily per enabled org)

**Replace `<ORG_UUID>` below.**

### 1) Journal status distribution

```sql
select 'sales' as source, journal_status, count(*)::int as cnt
from public.sales
where organization_id = '<ORG_UUID>'
  and deleted_at is null
group by journal_status
union all
select 'purchase_bills', journal_status, count(*)::int
from public.purchase_bills
where organization_id = '<ORG_UUID>'
  and deleted_at is null
group by journal_status
order by source, journal_status;
```

### 2) Recent failures (investigate any row)

```sql
select 'sales' as source, id, created_at, journal_error
from public.sales
where organization_id = '<ORG_UUID>'
  and journal_status = 'failed'
  and deleted_at is null
union all
select 'purchase_bills', id, created_at, journal_error
from public.purchase_bills
where organization_id = '<ORG_UUID>'
  and journal_status = 'failed'
  and deleted_at is null
order by created_at desc
limit 25;
```

### 3) Drift: journal exists but sale still `pending`

```sql
select s.id as sale_id, s.created_at, s.journal_status, je.id as journal_entry_id
from public.sales s
join public.journal_entries je
  on je.organization_id = s.organization_id
 and je.reference_type = 'Sale'
 and je.reference_id = s.id
where s.organization_id = '<ORG_UUID>'
  and s.deleted_at is null
  and s.journal_status = 'pending'
order by s.created_at desc
limit 50;
```

**Fix drift (sales only — run after confirming rows):**

```sql
update public.sales s
set journal_status = 'posted',
    journal_error = null
from public.journal_entries je
where s.organization_id = '<ORG_UUID>'
  and s.journal_status = 'pending'
  and je.organization_id = s.organization_id
  and je.reference_type = 'Sale'
  and je.reference_id = s.id
returning s.id;
```

**Same pattern for `purchase_bills`** with `reference_type = 'Purchase'`.

### 4) Latest journal balance sanity (sample)

```sql
select
  je.id,
  je.reference_type,
  je.reference_id,
  je.total_amount,
  coalesce(sum(jl.debit_amount), 0) as total_debit,
  coalesce(sum(jl.credit_amount), 0) as total_credit
from public.journal_entries je
left join public.journal_lines jl on jl.journal_entry_id = je.id
where je.organization_id = '<ORG_UUID>'
group by je.id, je.reference_type, je.reference_id, je.total_amount
having coalesce(sum(jl.debit_amount), 0) <> coalesce(sum(jl.credit_amount), 0)
order by je.created_at desc
limit 20;
```

Expect **0 rows**. If any appear, stop rollout for that org and investigate.

---

## Escalation thresholds

| Signal | Action |
|--------|--------|
| Any sustained `journal_status = failed` after retry | Log `journal_error`; fix root cause before expanding wave |
| Many `pending` with matching `journal_entries` | Run drift fix; fix app “fire-and-forget” update if recurring |
| Imbalanced journal lines query returns rows | **Stop** enablement; DB/app bug |

---

## Communication snippet (tenants)

> We’re upgrading accounting for your shop. Billing and stock work as before. If your team sees a ledger or accounting alert, please contact support with the date and bill number.

---

## Phase 2 scope reminder (product)

- **In scope:** Widen org enablement; stabilize sale/purchase posting + monitoring; optional: wire expense/salary/payment vouchers to same ledger (separate dev tasks).
- **Out of scope for Phase 2:** Full historical backfill for all old bills (plan as Phase 3 unless required).

---

## Document control

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 2026-05-02 | Initial Phase 2 runbook |
