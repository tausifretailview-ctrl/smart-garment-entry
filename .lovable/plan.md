## Make `app-downloads` bucket public for APK distribution

**Goal:** Allow the APK file (`EzzyERP-1.1.0.apk`) to be downloaded via a direct public URL without authentication.

### Steps

1. **Flip bucket to Public**
   - Use `supabase--storage_update_bucket` to set `app-downloads` → `public: true`.
   - Note: if workspace policy `cloud_block_public_buckets` is enabled, this call will fail and you'll need to enable public buckets in Settings → Privacy & Security first.

2. **Add public read RLS policy on `storage.objects`**
   - Migration creating a SELECT policy scoped to `bucket_id = 'app-downloads'` for the `anon` and `authenticated` roles, so the public URL resolves without a token.
   - Keep write/update/delete restricted (no policy added) so only service role / dashboard uploads can modify files.

### Result

The URL below will work for anyone:
```
https://lkbbrqcsbhqjvsxiorvp.supabase.co/storage/v1/object/public/app-downloads/EzzyERP-1.1.0.apk
```

No frontend code changes. No other buckets affected.
