---
name: Barcode Provenance & Re-purchase Behaviour
description: product_variants.barcode_source ('generated'|'external') decides whether re-purchase forks a new barcode; IMEI products prompt per unit
type: feature
---
- `product_variants.barcode_source`: `'generated'` (from `generate_next_barcode` RPC) or `'external'` (manufacturer EAN/UPC or human-scanned/typed). Never infer provenance from length — org-prefixed generated codes can be 12/13 digits too.
- Backfilled once via `public.is_valid_gtin_or_imei()` (GTIN-8/12/13/14 mod-10, 15-digit Luhn IMEI) → `'external'`, everything else `'generated'`.
- Re-purchase (PurchaseEntry): fork a NEW variant + new barcode only when the barcode is `'generated'` AND prices changed. External EAN/UPC stays on the same SKU (an EAN does not change when cost changes, and forking would hit the (product_id,color,size,barcode) unique index).
- IMEI/serialized products (mobile ERP + `requires_imei`): never reuse and never auto-generate. Re-purchase adds placeholder lines and queues the IMEIScanDialog per line so each unit gets its own scanned IMEI (unit-as-variant).
