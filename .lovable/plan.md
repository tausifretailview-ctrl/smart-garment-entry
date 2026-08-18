# Security audit — read-only report (18 Aug 2026)

Nothing was changed, fixed, rotated or deleted. All output below is from live queries
run in this session.

## Part A — traces of exploitation

**1. auth.users password/update history — NOT AVAILABLE.** The audit role has no access
to the `auth` schema (`ERROR: permission denied for schema auth`). This check cannot be
answered from here; it needs a session with elevated database access. Undetermined.

**2. organization_members added in last 120 days — 26 rows.** All follow the normal
onboarding shape: one `admin` row per newly created shop, plus two `manager` rows
(MULUND MOBILITY 09 Aug, RANAWAT'S BLING 23 Jul) and one `user` row (DUA BY SALEEM'S
21 Jul). Most recent: PAYAL SHOES admin 14 Aug 09:42 UTC — the same day as the
`temp-reset-pw` cleanup, so worth a one-line confirmation with the owner, but it matches
the org-creation pattern (a matching `user_roles` admin row was written 0.45 s later).
No membership row exists that lacks a corresponding org-creation event.

**3. user_roles — 38 rows, exactly one `platform_admin`** (`b6a1a764…`, created_at NULL,
i.e. the original seed row). No second platform-admin grant. Everything else is
`admin`/`manager`/`user` created in step with the memberships in (2).

**4/5. backup_logs.** Most recent automatic run 12 Aug 17:30 UTC across ~22 orgs; one
manual backup 17 Aug. Per-org coverage shows first-seen dates that track org onboarding
(18 Jul, 19 Jul, 31 Jul, 5/7/10/11 Aug cohorts) and no interior gap followed by a resumed
series — the shape a retention purge would leave. Two real operational failures, not
security events: KS FOOTWEAR (`4bc73037…`) `failed` on 11 and 12 Aug, and `a1bac661…`
`failed` on 11 Aug. **No org's history is truncated at its start.**

**Edge function logs for `/functions/v1/temp-reset-pw` — GONE.** The analytics store
returns a single log row in total (`function_edge_logs`, one entry from today). Retention
has already rolled past 14 Aug. This is not "no evidence found"; the evidence window has
expired. Whether that function was ever called cannot be determined from surviving data.

Conclusion for Part A: **no traces of exploitation are visible in the data that survives.**
That is not the same as no compromise. The two records that would have shown it —
`auth.users` update timestamps and edge logs — are respectively inaccessible to this role
and already expired.

## Part B — siblings of the three patterns

**6. `verify_jwt = false` functions (22 in config.toml) and their own caller check:**

| Function | Own check |
|---|---|
| auto-backup | shared secret (`isInternalDispatch`) else `getUser()` + role — fixed 14 Aug |
| scheduled-backup | shared secret, 403 otherwise — fixed 14 Aug |
| backup-to-drive | `getUser()` (l.144) |
| update-google-secrets | `getUser()` + admin/platform_admin role |
| send-sms | `getUser()` (l.43) |
| send-whatsapp | `getUser()` (l.497) |
| generate-einvoice / cancel-einvoice / test-einvoice-connection | `getUser()` |
| ai-assistant | `getUser()` (l.809) |
| create-payment-link | `getUser()` (l.39) |
| generate-gstr1 | `getClaims(token)` 401 + 403 org check |
| get-users | `getUser(token)` + admin/manager role |
| razorpay-webhook | HMAC signature (`RAZORPAY_WEBHOOK_SECRET`) |
| phonepe-webhook | `x-verify` checksum, 401 on missing/invalid |
| portal-auth | none by design (OTP entry point) |
| portal-catalogue / portal-order | `x-portal-token` looked up in `portal_sessions` |
| get-public-invoice | none — unguessable sale UUID (payload gated 14 Aug) |
| download-apk / download-windows | none — public installers, intentional |
| serve-wappconnect-pdf | none — path allowlist only (see 9) |
| **sync-whatsapp-templates** | **none — see below** |

`run-drift-detection` and `run-invariant-digest` are **not** in config.toml, so they keep
the default `verify_jwt = true`. Good, but that is implicit; worth pinning explicitly.

**7. Authorisation decided by request body.** After the 14 Aug fix, only one instance
remains where a body value alone selects the tenant with no caller identity at all:
`sync-whatsapp-templates/index.ts:76` reads `organizationId` from `req.json()` and at
l.86 opens a **service-role** client with it. Everywhere else the body org id is checked
against the verified caller. Adjacent body-driven values that are checked: `auto-backup`
`retentionDays` (now behind the secret), `reset-organization` `confirmationName`
(behind `getUser()`), `generate-gstr1` `organization_id` (403-checked).

**8. `SUPABASE_SERVICE_ROLE_KEY` without establishing the caller:**

- `sync-whatsapp-templates` — key l.86, caller check: **none**
- `serve-wappconnect-pdf` — key l.40, caller check: **none** (path allowlist only)
- `get-public-invoice` — key l.34, caller check: **none** (by design, UUID-gated)
- `download-apk` l.61 / `download-windows` l.68 — **none** (public artefacts, intentional)
- `portal-catalogue` / `portal-order` — key l.13, but session token validated first
- all others read the key only after `getUser()` / signature / dispatch secret

**9. Unauthenticated endpoints keyed by an unguessable id.**
- `get-public-invoice?saleId=<uuid>` — returns sale header, line items, customer name,
  **phone, address**, customer **GSTIN**, shop GSTIN, salesman, notes, payment split.
  `bank_details` now only when the shop opted in. **No costs.** Phone/address/GSTIN still
  leave the building unconditionally on a link that gets forwarded over WhatsApp.
- `serve-wappconnect-pdf?path=<orgId>/wappconnect/<file>.pdf` — returns the rendered
  invoice PDF. Guard is structural only (UUID/folder/`.pdf`, no traversal); it does not
  bind the file to the caller. The filename is the only secret, and the response is served
  `Cache-Control: public, max-age=31536000`.

## Part C — database-side exposure

**10. Advisor: 354 findings.** Dominant classes: `rls_enabled_no_policy` (3, INFO),
`extension_in_public` (WARN), and a large block of
`anon_security_definer_function_executable` (WARN) — see 14.
**11. Tables in `public` with RLS disabled: none (0 rows).**
**12. Effectively-open policies:** 10, all scoped to `{service_role}` only
(`batch_stock`, `bill_number_sequence`, `portal_sessions`, `stock_alerts`,
`stock_movements`). No `true` policy is reachable by `anon` or `authenticated`.
Note: ~78 policies show `qual IS NULL` in the naive query — those are INSERT policies
whose real predicate is `with_check`; re-running with `with_check` included clears them.
**13. `SECURITY DEFINER` functions without pinned `search_path`: none (0 rows).**
**14. EXECUTE on money-path functions: `PUBLIC`, i.e. `anon` can call them.** 140
`SECURITY DEFINER` functions in `public` are anon-executable, including
`apply_school_fee_receipt`, `reconcile_customer_balance`/`_v2`,
`run_nightly_balance_reconciliation`, `soft_delete_voucher`, `restore_voucher`,
`generate_voucher_number`, `zero_unscanned_stock_settlement`,
`reverse_unscanned_stock_settlement`, `settle_stock_session`,
`invoice_reconcile_outstanding`, `compute_sale_settlement_v2`. Several of these write.
This is the single largest unexamined surface found.

## Part D — secrets and repository hygiene

**15.** No service-role key, provider token, Google service-account JSON or private key is
committed, and `git log -S` across all history for `SUPABASE_SERVICE_ROLE_KEY=` and
`service_role"` returns nothing. Tracked credential-shaped files: `.env` (publishable key
only — fine), plus `.env.example`, `.env.test.example`, `android/keystore.properties.example`.
`supabase/functions/temp-reset-pw` is confirmed tracked in history at `23c8e4619`, removed
at `8bd1bf3f2` — it is still recoverable from history in any existing clone.
**16.** No `SERVICE_ROLE` reference anywhere under `src/`. Clean.
**17. Repository visibility — undetermined from here.** No GitHub API access in this
sandbox; the change date is not visible either. Needs a human check on the repo settings page.

---

## Act tonight

1. **`sync-whatsapp-templates` — unauthenticated write, any org.** `verify_jwt = false`,
   no caller check, `organizationId` straight from the body into a service-role client.
   Any anonymous caller can force a template resync for any tenant and, via the stale-key
   sweep at l.190, **delete that tenant's `whatsapp_meta_templates` rows**. Same shape as
   the `auto-backup` hole. Reachable right now.
2. **Anon `EXECUTE` on writing money functions.** `soft_delete_voucher`,
   `zero_unscanned_stock_settlement`, `apply_school_fee_receipt`,
   `run_nightly_balance_reconciliation` and peers are callable by `anon` over PostgREST.
   Each needs its internal org/role guard read before deciding — but until that read is
   done, treat as reachable unauthenticated write.

## Act deliberately

3. **`serve-wappconnect-pdf`** — bearer-URL invoice PDFs, no caller binding, cached
   publicly for a year. Same trust model as `get-public-invoice`; acceptable only if the
   filename is high-entropy. Verify how the filename is generated.
4. **`get-public-invoice` PII** — phone, address and GSTIN still ship unconditionally.
   Consider gating them the way `bank_details` now is.
5. **Service-role key rotation** — still outstanding, and `temp-reset-pw` lives on in git
   history. Human task, out of shop hours.
6. **`run-drift-detection` / `run-invariant-digest`** — protected only by the config default.
   Pin `verify_jwt = true` explicitly so a future config edit cannot silently open them.
7. **`extension_in_public` and 3 RLS-enabled-no-policy tables** — advisor INFO/WARN, no
   evidence of exposure.
8. **Retention** — edge logs expired before this audit could read them. If forensic
   capability matters, ship log export before the next incident, not after.

Ranked by exploitability: (1) and (2) are unauthenticated writes. (3)–(4) are reads
guarded by unguessable ids. (5)–(8) are hygiene.
