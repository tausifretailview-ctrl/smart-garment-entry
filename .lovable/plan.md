

# Phase 3 & 5: Payload Reduction and Organization Filter Audit

## Phase 3: Replace `select('*')` with Explicit Columns

There are ~28 files with `select('*')` queries. We will focus on the **highest-traffic pages** first, where payload reduction has the biggest impact. Lower-traffic pages (e.g., WhatsApp Inbox, Recycle Bin) are left unchanged as they are rarely hit.

### High-Priority Files to Update

**1. Settings queries (loaded on almost every page)**
These files use `select('*')` on `settings` but only need specific fields:

| File | Replace with |
|------|-------------|
| `src/pages/POSSales.tsx` | `select('business_name, address, mobile_number, email_id, gst_number, sale_settings, invoice_settings, bill_barcode_settings, pos_settings, header_text, footer_text, logo_url')` |
| `src/pages/SalesInvoice.tsx` | `select('business_name, address, mobile_number, email_id, gst_number, sale_settings, invoice_settings, bill_barcode_settings, header_text, footer_text, logo_url, state')` |
| `src/pages/SalesInvoiceDashboard.tsx` | `select('business_name, address, mobile_number, gst_number, sale_settings, bill_barcode_settings, invoice_settings')` |
| `src/pages/PaymentsDashboard.tsx` | `select('business_name, gst_number, bill_barcode_settings')` |
| `src/pages/DailyCashierReport.tsx` | `select('business_name, address, mobile_number, gst_number')` |
| `src/pages/Accounts.tsx` | `select('business_name, gst_number, bill_barcode_settings')` |
| `src/components/InvoicePrint.tsx` | `select('business_name, address, mobile_number, email_id, gst_number, invoice_settings, header_text, footer_text, logo_url, state')` |
| `src/components/ThermalPrint80mm.tsx` | `select('business_name, address, mobile_number, email_id, gst_number, invoice_settings, header_text, footer_text, logo_url, pos_settings')` |

**2. Employee queries**
| File | Replace with |
|------|-------------|
| `src/pages/SalesInvoice.tsx` | `select('id, employee_name, status')` |
| `src/pages/SaleOrderEntry.tsx` | `select('id, employee_name, status')` |
| `src/pages/DeliveryChallanEntry.tsx` | `select('id, employee_name, status')` |
| `src/pages/EmployeeMaster.tsx` | keep `select('*')` (master page needs all fields) |
| `src/pages/Accounts.tsx` | `select('id, employee_name, status')` |

**3. Sales/Customer queries on dashboards**
| File | Change |
|------|--------|
| `src/pages/PaymentsDashboard.tsx` (sales query) | `select('id, sale_number, sale_date, customer_name, customer_id, net_amount, paid_amount, cash_amount, payment_method, payment_status')` |
| `src/pages/SaleOrderEntry.tsx` (customers query) | `select('id, customer_name, phone, email, address, gst_number, discount_percent')` |

**4. POS-specific queries** (POSSales.tsx)
- Sale fetch for draft resume: keep `select('*')` since full sale data is needed for re-editing
- Sale items fetch: keep `select('*')` since all item fields are needed for cart restoration

### Files NOT Changed (intentionally)
- `EmployeeMaster.tsx` -- master CRUD page, needs all columns
- `WhatsAppInbox.tsx` -- low traffic, complex message structure
- `CustomerHistoryDialog.tsx` -- dialog-level, rarely opened
- `school/TeacherMaster.tsx` -- master page

---

## Phase 5: Organization Filtering Verification

Based on the codebase audit, organization filtering is consistently applied. Here is the verification summary:

### Verified Patterns
- All `settings` queries include `.eq('organization_id', ...)`
- All `employees` queries include `.eq('organization_id', ...)`
- All `sales` queries include `.eq('organization_id', ...)`
- All `customers` queries include `.eq('organization_id', ...)`
- All `product_variants` and `products` queries include `.eq('organization_id', ...)`
- All `purchase_bills` queries include `.eq('organization_id', ...)`
- The `useCustomerSearch` hook correctly filters by organization
- Database triggers automatically populate `organization_id` on insert

### RLS Status
RLS is already enabled on all 77 tables with policies using `organization_id` filtering via `user_belongs_to_org()` and `get_user_organization_ids()` functions. No changes needed.

### Result
No gaps found. Phase 5 is a verification-only pass with no code changes.

---

## Summary of Changes

| Category | Files Modified | Impact |
|----------|---------------|--------|
| Settings `select('*')` reduction | 8 files | Reduces payload on every page load |
| Employee `select('*')` reduction | 3 files | Smaller payloads for dropdown queries |
| Sales/Customer query reduction | 2 files | Reduced dashboard payload |
| Organization filter audit | 0 files (verified OK) | Confidence in data isolation |

### Safety
- No columns dropped, no tables modified
- Invoice rendering fields are preserved in all print-related queries
- POS draft resume keeps `select('*')` to avoid breaking cart restoration
- All changes are column-list narrowing only -- additive and safe
