

## Enlarge Sidebar - Font Size Only

### Overview
Increase the sidebar width and font size to make it more prominent. No changes to menu order or structure.

### Changes

#### 1. Increase Sidebar Width

**File: `src/components/ui/sidebar.tsx` (Line 17)**

| Before | After |
|--------|-------|
| `SIDEBAR_WIDTH = "240px"` | `SIDEBAR_WIDTH = "280px"` |

#### 2. Update Inline Width Style

**File: `src/components/AppSidebar.tsx` (Line 92)**

| Before | After |
|--------|-------|
| `style={{ width: '240px' }}` | `style={{ width: '280px' }}` |

#### 3. Increase Font Size

**File: `src/components/AppSidebar.tsx` (Line 93)**

| Before | After |
|--------|-------|
| `text-[15px]` | `text-[16px]` |

### Files to Modify

| File | Line | Change |
|------|------|--------|
| `src/components/ui/sidebar.tsx` | 17 | `SIDEBAR_WIDTH` from `240px` to `280px` |
| `src/components/AppSidebar.tsx` | 92 | Inline `width` from `240px` to `280px` |
| `src/components/AppSidebar.tsx` | 93 | Font size from `15px` to `16px` |

### What Stays the Same
- All menu items remain in their current order
- No menu sections are added or removed
- Master menu stays in place
- All other styling unchanged

