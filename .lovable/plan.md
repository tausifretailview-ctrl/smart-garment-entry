

# Mobile Reports Hub Enhancement Plan

## Overview

Create a dedicated **Mobile Reports Hub** that provides quick, categorized access to all key reports (Stock, Sales, Purchase, Cashier, Size-wise Stock) with built-in filters for mobile users.

---

## Current State

### What Exists
- `MobileReportsSummary.tsx` - Shows 4 stat cards + 6 report links (basic list)
- `MobileMoreMenu.tsx` - Has Reports section with 6 items buried in menu
- `MobileQuickActions.tsx` - 4 quick action buttons (POS, Payments, Stock, Reports)
- Bottom nav: Home → POS → Inventory → Accounts → More

### Problems for Mobile
1. **Reports scattered** - Hidden under "More" menu, not prominent
2. **No quick filters** - Desktop reports have filters, mobile doesn't
3. **No categorization** - All reports mixed together
4. **Size-wise stock** - Not accessible from mobile-friendly UI
5. **Too many taps** - User needs 3+ taps to reach any report

---

## Implementation Plan

### 1. Create Dedicated Mobile Reports Page

**New File**: `src/pages/mobile/MobileReportsHub.tsx`

A full-screen reports hub with:
- Quick filter chips (Today / This Week / This Month)
- Report categories with icons and descriptions
- Direct links to filtered reports

**Layout Structure**:
```
┌────────────────────────────────────┐
│ Reports                            │
├────────────────────────────────────┤
│ [Today] [This Week] [This Month]  │
├────────────────────────────────────┤
│ ═══ STOCK REPORTS ═══              │
│ ┌──────────────────────────────┐  │
│ │ 📦 Stock Report         →   │  │
│ │ View current inventory       │  │
│ ├──────────────────────────────┤  │
│ │ 📊 Size-wise Stock       →   │  │
│ │ Stock by product + size      │  │
│ ├──────────────────────────────┤  │
│ │ 📈 Item-wise Stock       →   │  │
│ │ Aggregated by product        │  │
│ └──────────────────────────────┘  │
│                                    │
│ ═══ SALES REPORTS ═══              │
│ ┌──────────────────────────────┐  │
│ │ 💰 Sales Report         →   │  │
│ │ All sales invoices           │  │
│ ├──────────────────────────────┤  │
│ │ 📅 Daily Cashier        →   │  │
│ │ Cash summary for day         │  │
│ └──────────────────────────────┘  │
│                                    │
│ ═══ PURCHASE REPORTS ═══           │
│ ┌──────────────────────────────┐  │
│ │ 🛒 Purchase Report      →   │  │
│ └──────────────────────────────┘  │
└────────────────────────────────────┘
```

### 2. Update Bottom Navigation

**File**: `src/components/mobile/MobileBottomNav.tsx`

Replace "Inventory" tab with "Reports" tab for easier access:
- Keep Inventory accessible via More menu
- Make Reports a primary navigation item

**OR** Add a Reports quick-access inside the existing flow

### 3. Add Quick Date Filter Component

**New File**: `src/components/mobile/MobileDateFilterChips.tsx`

Reusable filter chips:
- Today / This Week / This Month / Custom
- Pass selected period to report pages via URL params

### 4. Enhanced Report Cards

Each report card shows:
- Icon with category color
- Report name
- Brief description
- Chevron for navigation
- Optional: Quick stat preview (e.g., "5 low stock items")

### 5. Size-wise Stock Quick Access

Add direct link to Stock Report with `?tab=sizewise` parameter:
- Opens stock report in size-wise view
- Mobile-optimized table with horizontal scroll

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/mobile/MobileReportsHub.tsx` | Main reports hub page |
| `src/components/mobile/MobileDateFilterChips.tsx` | Reusable date filter chips |
| `src/components/mobile/MobileReportCard.tsx` | Styled report link card |

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add route for `/mobile-reports` |
| `src/components/mobile/MobileBottomNav.tsx` | Add Reports to quick access OR update matchPaths |
| `src/pages/mobile/MobileMoreMenu.tsx` | Keep reports section, add link to Reports Hub |

---

## Report Categories & Links

### Stock Reports
| Report | Path | Description |
|--------|------|-------------|
| Stock Report | `/stock-report` | Current inventory levels |
| Size-wise Stock | `/stock-report?tab=sizewise` | Stock grouped by size |
| Item-wise Stock | `/item-wise-stock` | Aggregated by product name |
| Stock Analysis | `/stock-analysis` | Low stock & movement history |

### Sales Reports
| Report | Path | Description |
|--------|------|-------------|
| Sales Report | `/sales-invoice-dashboard` | All sales invoices |
| Daily Cashier | `/daily-cashier-report` | Payment-wise summary |
| Item-wise Sales | `/item-wise-sales` | Sales by product |
| Customer Sales | `/sales-report-by-customer` | Sales by customer |

### Purchase Reports
| Report | Path | Description |
|--------|------|-------------|
| Purchase Report | `/purchase-bills` | All purchase bills |
| Supplier Report | `/purchase-report-by-supplier` | Purchases by supplier |

### Financial Reports
| Report | Path | Description |
|--------|------|-------------|
| Profit Analysis | `/net-profit-analysis` | Gross/Net profit |
| GST Report | `/gst-reports` | GST summaries |

---

## Technical Implementation

### MobileReportsHub Component Structure
```tsx
// src/pages/mobile/MobileReportsHub.tsx
export default function MobileReportsHub() {
  const { orgNavigate } = useOrgNavigation();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("today");

  const reportCategories = [
    {
      title: "Stock Reports",
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      reports: [
        { icon: Package, label: "Stock Report", path: "/stock-report", desc: "Current inventory" },
        { icon: Grid3X3, label: "Size-wise Stock", path: "/stock-report?tab=sizewise", desc: "By size" },
        { icon: Layers, label: "Item-wise Stock", path: "/item-wise-stock", desc: "By product" },
        { icon: TrendingDown, label: "Stock Analysis", path: "/stock-analysis", desc: "Low stock alerts" },
      ]
    },
    {
      title: "Sales Reports",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      reports: [
        { icon: BarChart3, label: "Sales Report", path: "/sales-invoice-dashboard", desc: "All invoices" },
        { icon: Calendar, label: "Daily Cashier", path: "/daily-cashier-report", desc: "Cash summary" },
        { icon: ShoppingBag, label: "Item-wise Sales", path: "/item-wise-sales", desc: "By product" },
      ]
    },
    // ... more categories
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b px-4 py-4">
        <h1 className="text-xl font-semibold">Reports</h1>
      </div>

      {/* Date Filter Chips */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        <Chip active={selectedPeriod === "today"} onClick={() => setSelectedPeriod("today")}>Today</Chip>
        <Chip active={selectedPeriod === "week"} onClick={() => setSelectedPeriod("week")}>This Week</Chip>
        <Chip active={selectedPeriod === "month"} onClick={() => setSelectedPeriod("month")}>This Month</Chip>
      </div>

      {/* Report Categories */}
      <div className="px-4 space-y-6">
        {reportCategories.map(category => (
          <div key={category.title}>
            <h2 className="text-sm font-medium text-muted-foreground uppercase mb-3">
              {category.title}
            </h2>
            <Card>
              {category.reports.map((report, index) => (
                <MobileReportCard 
                  key={report.path}
                  {...report}
                  categoryColor={category.color}
                  onClick={() => orgNavigate(report.path)}
                  showDivider={index < category.reports.length - 1}
                />
              ))}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### MobileReportCard Component
```tsx
// src/components/mobile/MobileReportCard.tsx
interface MobileReportCardProps {
  icon: React.ElementType;
  label: string;
  desc: string;
  categoryColor: string;
  onClick: () => void;
  showDivider?: boolean;
}

export const MobileReportCard = ({
  icon: Icon,
  label,
  desc,
  categoryColor,
  onClick,
  showDivider
}: MobileReportCardProps) => (
  <>
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 active:bg-muted/50 transition-colors touch-manipulation"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
          <Icon className={cn("h-5 w-5", categoryColor)} />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
    {showDivider && <Separator className="ml-16" />}
  </>
);
```

### Route Addition
```tsx
// In App.tsx routes
<Route path="mobile-reports" element={<MobileReportsHub />} />
```

### Bottom Nav Update Option
```tsx
// Option A: Replace Inventory with Reports in bottom nav
const navItems: NavItem[] = [
  { icon: Home, label: "Home", path: "/" },
  { icon: ShoppingCart, label: "POS", path: "/pos-sales" },
  { icon: BarChart3, label: "Reports", path: "/mobile-reports" }, // NEW
  { icon: Wallet, label: "Accounts", path: "/accounts" },
  { icon: MoreHorizontal, label: "More", path: "/mobile-more" },
];
```

---

## UX Benefits

1. **One-tap access** - Reports hub directly from bottom nav
2. **Categorized** - Stock, Sales, Purchase, Financial grouped
3. **Size-wise stock** - Direct link with proper tab parameter
4. **Date filters** - Quick period selection at top
5. **Descriptions** - Users know what each report shows
6. **Touch-friendly** - Large tap targets (44px+ height)

---

## Mobile-First Guidelines Applied

- All report cards minimum 48px height
- Touch targets properly sized
- Horizontal scroll for date chips
- No complex filters on list page
- Filters applied on destination report pages
- Back navigation preserved

