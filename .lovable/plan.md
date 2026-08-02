## Blank-page reliability fix

The recording and current logs confirm two related cold-start races:
- `OrgLayout` force-renders after the organization sync timeout even when tenant setup is incomplete.
- For a cacheable dashboard such as Purchase Bills, the route `<Outlet>` and hidden tab-cache pane can load/mount the same page concurrently; the shell later swaps between them when the pane reports ready. This can leave skeletons visible, duplicate page queries, or require repeated refreshes.

### Changes
1. **Make the visible route the single owner during cold reload**
   - Update `OrgLayout` so the current dashboard is rendered by one path only.
   - Keep the route Outlet visible while its lazy page loads, without simultaneously mounting a hidden copy of that same active page.
   - Hand over to tab cache only after a confirmed pane mount, preserving existing in-app tab persistence.

2. **Prevent half-initialized organization rendering**
   - Replace the current 12-second “force render” behavior with a guarded organization-sync recovery attempt.
   - Continue showing the boot state until the URL organization and active organization match.
   - If recovery genuinely fails, show an actionable retry state rather than an empty workspace.

3. **Reduce competing cold-start work**
   - Defer background tab/page prefetch until the visible page has mounted.
   - Avoid duplicate prefetch calls for the active dashboard.
   - Keep existing slow-network protections and only warm inactive pages when the browser is idle.

4. **Cache the repeated field-sales access check**
   - Add an appropriate `staleTime`/cache policy to `useFieldSalesAccess` so ordinary dashboard mounts do not repeat the same backend lookup.
   - Preserve organization/user-specific query keys and behavior.

5. **Verify the affected flows**
   - Test direct cold reload on Purchase Bills, main dashboard, POS Dashboard, Accounts, and Barcode Printing.
   - Test navigation back from POS and repeated refreshes under throttled network conditions.
   - Confirm there is one page mount/query sequence, no `Sync timeout reached` or `Tab pane not ready` warning, and no blank workspace or permanently stuck skeleton.

No database or business-data changes are required.