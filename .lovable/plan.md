# Deploy the current code — findings and what I can actually deploy

## What I checked (read-only)

| Address | Served by | Main script file live now |
| --- | --- | --- |
| app.inventoryshop.in | Vercel | `assets/index-MgcQLCMA.js` |
| inventoryshop.in | Lovable hosting | `assets/index-DwweVdcP.js` |
| smart-garment-entry.lovable.app | Lovable hosting | `assets/index-DwweVdcP.js` |

So `app.inventoryshop.in` — the address where the warnings appear — is served by a **different hosting service (Vercel)** than the Lovable-published site, and it is running a different build. The two are deployed by two separate pipelines.

The fix you mention is present in the current code here: the in-flight chunk guard exists in `src/components/TabCachedPages.tsx` (line 517), with tests locking it in place. So this is purely a delivery gap, as you said.

## The constraint

I can publish the Lovable-hosted copy (inventoryshop.in and the lovable.app address) from a fresh build of the current code. I cannot trigger the Vercel deploy for app.inventoryshop.in from here — no access to that account from this environment. That one has to be redeployed from the Vercel dashboard (Deployments > Redeploy from the latest commit on main, with "use existing build cache" switched off).

## Proposed steps

1. Publish a fresh build of the current code to the Lovable-hosted addresses.
2. Re-check the live script file name on those addresses and confirm it changed from `index-DwweVdcP.js`.
3. Report back the exact Vercel action needed for app.inventoryshop.in, so the person with dashboard access can trigger it — or, if you prefer, point app.inventoryshop.in at the Lovable hosting instead so there is only one place to deploy from.
4. After the Vercel redeploy lands, verify the script file is no longer `index-MgcQLCMA.js` / `erpBootstrap-caabJsik.js` and that the Soft-retry / Tab pane warnings are gone on WhatsApp Logs and Settings under a throttled connection.

No code changes, no migration changes. A publish always builds from the current code, so every recently merged fix ships together.

## Open question

Do you want me to publish the Lovable side now, or is app.inventoryshop.in the only address that matters (in which case the deploy has to happen in Vercel and I can only verify afterwards)?
