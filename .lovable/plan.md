
## Slug Uniqueness: Impact Analysis & Safe Implementation Plan

### Answering Your Question: Will Existing Organization URLs Change?

After checking the live database, here is the exact impact on all 16 organizations:

**15 organizations: ZERO impact** - Their slugs are already lowercase and valid. Their login URLs will not change at all.

**1 organization affected by data fix:**
- Org #7: `Adtech-accounts` → becomes `adtech-accounts`
- Current login URL: `inventoryshop.in/Adtech-accounts`
- New login URL: `inventoryshop.in/adtech-accounts`
- Note: Browser URL routing is case-sensitive, so `Adtech-accounts` and `adtech-accounts` are treated differently. After the fix, users of Adtech-Accounts will need to use the lowercase URL.

**All other orgs are unaffected:**
- gurukrupasarees, sm-hair-replacement, ks-footwear, miranos-clothing, tirtha-cosmetics, pushpak-motor-parts, ella-noor, demo, bombay-coldchain-solutions, yojak, steaphiin-international-high-school, al-nisa-couture, velvet-exclusive-ladies-wear-bags, lotus-dry-fruits, adtechagency — all remain exactly as they are.

---

### What the Plan Does (No Harm to Existing Setup)

**Part 1 - Data Fix (One-time SQL, affects only Adtech-Accounts)**
```sql
UPDATE organizations 
SET slug = lower(slug) 
WHERE slug != lower(slug);
-- Only affects: Adtech-accounts → adtech-accounts
```

**Part 2 - UI Changes in PlatformAdmin.tsx (Purely additive)**
- Add a live slug preview below the Organization Name field in the "Create Organization" dialog
- Add a real-time availability indicator (green checkmark / red X) with 500ms debounce
- Allow admin to manually override the auto-generated slug before creating
- Catch unique constraint errors and show friendly message instead of raw DB error

**Part 3 - UI Changes in OrganizationManagement.tsx (Purely additive)**
- Show the slug clearly labeled in the General tab (it currently shows the full URL only)
- Add a slug edit field with real-time availability check (so org admins can change their login URL slug if needed)

---

### Technical Details

```text
Files to edit:
1. src/pages/PlatformAdmin.tsx
   - Add: customSlug state (string), slugPreview computed value, isSlugAvailable state
   - Add: useEffect with 500ms debounce to check slug availability via Supabase query
   - Add: Slug preview + availability badge in Create Organization dialog
   - Add: Optional custom slug override input field
   - Add: Friendly error detection for "unique constraint" errors

2. src/pages/OrganizationManagement.tsx  
   - Add: editableSlug state, isCheckingSlug state, isSlugAvailable state
   - Add: Slug input field in General tab (currently only shows full Login URL read-only)
   - Add: Save slug button with uniqueness check before updating

Slug validation regex (same as DB function):
  const toSlug = (name: string) =>
    name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();

Availability check (excludes current org when editing):
  .from('organizations')
  .select('id', { count: 'exact', head: true })
  .eq('slug', slug)
  .neq('id', currentOrg.id)  // excluded when editing self
```

---

### Summary: Safe to Approve

- 15 of 16 organizations: **No change whatsoever**
- Org #7 (Adtech-Accounts): Login URL changes from `/Adtech-accounts` to `/adtech-accounts` (lowercase only)
- All UI changes are **additive only** — new fields and checks added, nothing removed or broken
- The UNIQUE constraint is already in place at the database level, so this plan only improves the user-facing experience to match what the database already enforces
