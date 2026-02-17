

# Fix "Organization Not Found" Screen

## Problem
When users navigate to an incorrect organization URL (e.g., typo in slug), they see an "Organization Not Found" error with only a "Go to General Login" button. This is unhelpful -- users need a way to enter the correct org slug and go directly to their login page.

## Solution
Update the "Organization Not Found" error screen in `OrgAuth.tsx` to include:
1. An input field where users can type their correct organization slug
2. A "Go to Login" button that navigates to `/{slug}` 
3. Keep the existing "Go to General Login" button as a secondary option

## File Changes

**`src/pages/OrgAuth.tsx`** -- Update the `!organization` error block (around lines 230-248):
- Add a text input for entering the org slug (pre-filled with the current incorrect slug for easy editing)
- Add a "Go to Organization Login" primary button
- Change "Go to General Login" to a secondary/outline button
- Show the domain prefix (e.g., `inventoryshop.in/`) for clarity, matching the OrganizationSetup pattern

