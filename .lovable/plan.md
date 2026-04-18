
The user wants to know how admins and other users can change/update their organization login passwords. Let me check existing infrastructure.

Need to check:
1. Is there a Profile page with password change?
2. Is there existing user management UI for admins?
3. Auth context

From the file list I see: `src/pages/Profile.tsx`, `src/components/UserManagement.tsx`, `supabase/functions/create-org-user/`, `supabase/functions/create-user/`. Let me check what exists.
<lov-tool-use id="toolu_vrtx_015hYpsaCAbg9f7bTcLoQns5" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Profile.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01SReCy7GewVnx5nwFSYMHfK" name="code--search_files" integration-id="code" data="{\"query\": \"updateUser|resetPasswordForEmail|admin.updateUserById\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts,supabase/functions/**/*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01QbUNswLcdoYgohjJvcMoX2" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Profile.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01XsFd87bKQnHWZJfJevipio" name="code--search_files" integration-id="code" data="{\"query\": \"updateUser|resetPasswordForEmail|admin\\\\.updateUserById|change password|new_password\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts,supabase/functions/**/*.ts\"}">
</lov-tool-use>
No existing password change UI. Let me check the create-user edge function and Auth page for context.
<lov-tool-use id="toolu_vrtx_01T7dmC1KkX3dwrxU2b7Gff7" name="code--search_files" integration-id="code" data="{\"query\": \"resetPasswordForEmail\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts\"}">
</lov-tool-use>
<lov-plan>
There is currently **no password change UI** in the app. I'll add two flows so admins and users can manage passwords.

## What gets built

### 1. "Change Password" card on Profile page (every logged-in user)
On `src/pages/Profile.tsx`, add a new card with:
- Current password, new password (min 6), confirm password fields
- Calls `supabase.auth.updateUser({ password: newPassword })` after re-authenticating with current password via `signInWithPassword`
- Toast on success / error, also calls `logError` on failure

### 2. "Reset Password" action in User Management (admin-only)
On `src/components/UserManagement.tsx` (the org users table at Settings → Users), for each user row add a "Reset Password" button that opens a small dialog where the org admin enters a new password. It calls a new edge function:

**New edge function `supabase/functions/admin-reset-user-password/index.ts`**
- Verifies caller is an `admin` of the same `organization_id` as the target user (via `organization_members`)
- Uses `supabase.auth.admin.updateUserById(targetUserId, { password })` with the service role key
- Validates: password length 6–128, target must belong to caller's org
- Logs to audit trail (`log_audit` RPC, action `USER_PASSWORD_RESET`)

### 3. "Forgot Password?" link on Auth page
On `src/pages/Auth.tsx` (and `src/pages/OrgAuth.tsx` if used), add a "Forgot password?" link that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`.

**New page `src/pages/ResetPassword.tsx`** at route `/reset-password`:
- Public route (added in `src/App.tsx`)
- Detects `type=recovery` in URL hash
- Shows new-password form, calls `supabase.auth.updateUser({ password })`
- Redirects to login on success

## Files touched
- `src/pages/Profile.tsx` — add Change Password card
- `src/components/UserManagement.tsx` — add Reset Password button + dialog
- `supabase/functions/admin-reset-user-password/index.ts` — NEW edge function
- `src/pages/Auth.tsx` (and `OrgAuth.tsx` if present) — add "Forgot password?" link
- `src/pages/ResetPassword.tsx` — NEW page
- `src/App.tsx` — register `/reset-password` route

## Acceptance
- Any logged-in user can change their own password from Profile.
- Org admin can reset any user-in-their-org password from Settings → Users.
- Anyone can request a password-reset email from the login screen and complete it via the `/reset-password` page.
- All operations scoped to the caller's organization; no cross-tenant password changes possible.
