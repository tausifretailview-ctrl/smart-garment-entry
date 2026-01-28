

# Dashboard Enhancement - Add "New Updates" Announcement Box

## Overview
Add a VASY ERP-style "Important Announcement" box on the right side of the main dashboard, showing recent version updates and new features. The box will align with the metric cards section.

## Visual Reference
Based on VASY ERP:
- Right-side panel titled "Important Announcement" or "New Updates"
- Shows version numbers with release dates
- Lists new features and bug fixes as bullet points
- Scrollable content with max-height matching card sections

## Layout Changes

### Current Layout
```
[Sales Overview - 6 cards in a row]
[Purchase Overview - 6 cards in a row]  
[Inventory & Financial - 6 cards in a row]
```

### New Layout
```
[Header with Date Range and Controls] -------------------- [New Updates Box]
[Sales Overview - 5 cards] ------------------------------ [   continues   ]
[Purchase Overview - 5 cards] --------------------------- [   continues   ]
[Inventory & Financial - 5 cards] ----------------------- [   continues   ]
```

## Implementation

### 1. Create New Updates Data (Static for now)
Define update entries with version, date, and feature descriptions:

| Version | Date | Updates |
|---------|------|---------|
| v1.2.5 | 28/01/2026 | Stock validation improvements during invoice edit |
| v1.2.4 | 27/01/2026 | Draft management moved to dashboard banners |
| v1.2.3 | 25/01/2026 | Dashboard resolution enhanced to match ERP style |
| v1.2.2 | 22/01/2026 | Bold black font for draft notifications |
| v1.2.1 | 20/01/2026 | Fixed bugs for better user experience |

### 2. Create NewUpdatesPanel Component
A scrollable card component with:
- Title: "New Updates" with a sparkle/megaphone icon
- Pink/magenta header matching VASY ERP style  
- Scrollable content area with max-height
- Version entries with dates and bullet points

### 3. Update Dashboard Layout
Wrap the main content in a grid layout:

```typescript
<div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
  {/* Left side - Metric cards (3 columns on xl) */}
  <div className="xl:col-span-3 space-y-4">
    {/* Sales Overview */}
    {/* Purchase Overview */}  
    {/* Inventory & Financial */}
  </div>
  
  {/* Right side - New Updates panel (1 column on xl) */}
  <div className="xl:col-span-1">
    <NewUpdatesPanel />
  </div>
</div>
```

### 4. Card Grid Adjustment
Update metric cards from 6 columns to 5 columns on large screens to fit the new layout:
- Current: `grid-cols-3 lg:grid-cols-6`
- New: `grid-cols-3 lg:grid-cols-5`

This ensures cards remain visible without horizontal scroll when the updates panel is present.

---

## File Changes

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Add NewUpdatesPanel component, update layout to grid with sidebar, adjust card grid columns |

---

## Technical Details

### NewUpdatesPanel Component Structure
```typescript
const NewUpdatesPanel = () => {
  const updates = [
    {
      version: "v1.2.5",
      date: "28/01/2026",
      changes: [
        "Stock validation improvements during invoice edit",
        "Fixed aggregation for same variant multiple entries"
      ]
    },
    // ... more updates
  ];

  return (
    <Card className="border-0 shadow-md sticky top-2">
      <CardHeader className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-3 rounded-t-lg">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          New Updates
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {/* Version entries */}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
```

### Styling Specifications
- Header: Pink gradient (`from-pink-500 to-rose-500`) matching VASY
- Border: None, shadow for depth
- Scroll area: Fixed 400px height to match card sections
- Version title: Bold with date in muted color
- Changes: Bullet list with cyan accent dots
- Sticky positioning for larger screens

---

## Expected Outcome
- Dashboard will have a professional right-side "New Updates" panel
- Cards will be slightly smaller (5 columns instead of 6) to accommodate the panel
- The updates panel height will align with the metric card sections
- Responsive: Panel moves below cards on smaller screens (xl breakpoint)
- Matches VASY ERP visual style with pink header and scrollable content

