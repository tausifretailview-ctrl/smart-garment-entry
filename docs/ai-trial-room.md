# AI Trial Room (website "Try it on")

A shopper opens a product on the shop's website, taps **Try it on**, adds a photo of themselves
and gets an AI preview of themselves wearing that product. Works on all three store themes.

## How it works

1. The store scales the photo down (1024 px longest side, JPEG) and sends it with the store slug
   and product id to the public edge function `storefront-try-on`.
2. The function checks, in order: the store is published, the shop switched the trial room on,
   the product is listed in that store (the product photo is read from the database, never from
   the request), the AI key exists, then the limits.
3. It calls the AI image model through the Lovable AI gateway (`LOVABLE_API_KEY`, the same key
   `read-purchase-bill` and `ai-assistant` use) and returns the picture.

**Privacy:** the shopper's photo and the preview are not stored, in the database or in storage.
The only record is a usage row in `storefront_tryons` (shop, product, a salted hash of the
visitor's IP, ok / error). The store keeps the photo in the tab's memory so the next product can
reuse it; it is not written to the phone's storage.

**Limits:** per shop per 24 hours (default 50, set in Website → Theme, max 1000) and 6 try-ons
per visitor per hour. A refused request does not use up the limit. No usage table = the function
refuses (fails closed).

**Products left out:** innerwear, swimwear and nightwear never get a try-on (matched on product
name and category): the store shows no button and the function refuses.

**Cost:** each try-on is one AI image generation, billed to the Lovable AI credits of the
project. That is why it is off until a shop turns it on.

## Setup (once)

1. Run `supabase/migrations/20270511120000_storefront_trial_room.sql` in the SQL editor.
2. Deploy the edge function `storefront-try-on` (Lovable deploys functions for this project). It
   is pinned as public in `supabase/config.toml` (`verify_jwt = false`).
3. Make sure the function has `LOVABLE_API_KEY`. Optional secret `TRIAL_ROOM_MODEL` picks the
   image model; without it the function tries `google/gemini-2.5-flash-image`, then
   `google/gemini-2.5-flash-image-preview`.
4. In **Website → Theme → AI Trial Room**, the panel shows what is still missing. When all three
   are in place, turn it on and set the daily limit.

The store shows the button only when the database lists the `trial_room` feature (step 1) and
the shop's switch is on, so a half-finished setup never shows a dead button.

## Code

- Rules shared by the store, the settings panel and the function: `supabase/functions/_shared/trialRoom.ts`
  (re-exported as `src/lib/trialRoom.ts`), tests in `src/lib/trialRoom.test.ts`.
- Function: `supabase/functions/storefront-try-on/index.ts`.
- Store UI: `src/storefront/TrialRoom.tsx`, `trial-room.css`; e2e `e2e/storefront-trial-room.spec.ts`.
- Settings: `src/components/website/StoreTrialRoomSettings.tsx`.
