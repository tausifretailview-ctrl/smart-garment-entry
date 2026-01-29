

## Make Enterprise-Grade Security Badge More Visible

### Problem
The "Enterprise-Grade Security" icon and text are too small and not visible to users on the login page.

### Solution
Increase the size of the ISO certification logo and enlarge the security text to make it more prominent and readable.

### Changes

**File: `src/pages/OrgAuth.tsx`**

| Element | Current | New |
|---------|---------|-----|
| ISO Logo height | `h-8` (32px) | `h-14` (56px) |
| Title font | `text-xs` | `text-base` (16px) |
| Title weight | `font-bold` | `font-bold` (keep) |
| Description font | `text-[10px]` | `text-sm` (14px) |
| Gap spacing | `gap-1` | `gap-2` |
| Margin top | `mt-0.5` | `mt-1` |

This will make the security badge approximately **75% larger** and much more noticeable to users.

