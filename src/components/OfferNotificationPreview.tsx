/**
 * How an offer notification looks on a customer's Android phone (expanded), so the shop can
 * judge the title, text and photo before sending. Mirrors src/customer/lib/pushDisplay.ts:
 * offer code added as its own line, photo as the large picture, two buttons.
 */
export function OfferNotificationPreview({
  title,
  body,
  offerCode,
  imageUrl,
}: {
  title: string;
  body: string;
  offerCode: string;
  imageUrl: string;
}) {
  const code = offerCode.trim();
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Preview on the customer's phone</div>
      <div className="rounded-2xl bg-slate-800 p-2.5 text-slate-100 shadow-inner">
        <div className="rounded-xl bg-slate-700/80 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className="inline-block h-4 w-4 rounded bg-teal-600" aria-hidden="true" />
            <span>Bill &amp; Offers · now</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold leading-snug break-words">{title.trim() || "Offer title"}</div>
          <div className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-slate-200 break-words">
            {body.trim() || "Your offer message"}
            {code ? `\n🏷️ Code: ${code}` : ""}
          </div>
          {imageUrl ? (
            <img src={imageUrl} alt="" className="mt-2 aspect-[2/1] w-full rounded-lg object-cover" />
          ) : null}
          <div className="mt-2 flex gap-4 text-[12px] font-semibold text-teal-300">
            <span>🛍️ View offer</span>
            <span>💬 WhatsApp shop</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Android shows the photo as a large picture (best as a wide 2:1 photo, e.g. 1200×600, with the main text in the
        middle). iPhone shows the title and message only. Tapping opens the offer page with the photo, code and your call
        / WhatsApp buttons.
      </p>
    </div>
  );
}
