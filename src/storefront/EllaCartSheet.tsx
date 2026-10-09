import { useEffect, useMemo, useState } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { checkShopOfferCode, loadShopperPerks, submitStorefrontEnquiry } from "./storefrontClient";
import { EllaUpiPayBlock } from "./EllaUpiPayBlock";
import { ellaCopy } from "./storefrontTheme";
import {
  ellaCartCount,
  ellaCartSummaryText,
  ellaCartTotal,
  removeEllaCartLine,
  updateEllaCartQty,
  type EllaCartLine,
} from "./ellaCart";
import {
  ELLA_ADVANCE_PERCENT,
  buildEllaOrderMessage,
  ellaAdvanceAmount,
  ellaHasMadeToOrder,
  ellaOrderDueLater,
  ellaPayableNow,
  validateEllaOrderDetails,
  type EllaCustomerDetails,
  type EllaPaymentMethod,
} from "./ellaOrder";
import {
  ellaOrderSavings,
  ellaRedeemablePoints,
  normalizeShopperMobile,
  offerHasWebsiteDiscount,
  shopperAppUrl,
  type StorefrontOffer,
  type StorefrontPerks,
} from "./ellaPerks";
import { useLockBodyScroll } from "./ellaLockBody";
import { buildEllaOrderWhatsAppText, ellaShopWhatsAppUrl, openEllaWhatsApp } from "./ellaWhatsApp";

type Step = "bag" | "details" | "payment" | "done";

export function EllaCartSheet({
  slug,
  shopName,
  shopWhatsApp,
  upiId,
  upiBusinessName,
  cart,
  onCartChange,
  onClose,
}: {
  slug: string;
  shopName: string;
  shopWhatsApp?: string | null;
  upiId?: string | null;
  upiBusinessName?: string | null;
  cart: EllaCartLine[];
  onCartChange: (next: EllaCartLine[]) => void;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  const [step, setStep] = useState<Step>("bag");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [method, setMethod] = useState<EllaPaymentMethod>("upi");
  const [upiReference, setUpiReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState("");
  const [orderWaHref, setOrderWaHref] = useState<string | null>(null);
  const [perks, setPerks] = useState<StorefrontPerks | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [offer, setOffer] = useState<StorefrontOffer | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const subtotal = useMemo(() => ellaCartTotal(cart), [cart]);
  const count = ellaCartCount(cart);
  const hasMto = useMemo(() => ellaHasMadeToOrder(cart), [cart]);
  const mobile = normalizeShopperMobile(customerPhone);
  const savings = useMemo(
    () => ellaOrderSavings({ subtotal, offer, perks, usePoints }),
    [subtotal, offer, perks, usePoints],
  );
  const total = savings.payable;
  const payNow = ellaPayableNow(total, method);
  const dueLater = ellaOrderDueLater(total, method);
  const pointsOffer = ellaRedeemablePoints(Math.max(0, subtotal - savings.codeDiscount), perks);
  const appUrl = shopperAppUrl(
    perks?.appSubdomain ?? null,
    String(import.meta.env.VITE_CUSTOMER_PAGE_DOMAIN ?? ""),
  );

  // Points live on the mobile number (same customer in the ERP and the app).
  useEffect(() => {
    if (!mobile) {
      setPerks(null);
      setUsePoints(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadShopperPerks(slug, mobile).then((next) => {
        if (!cancelled) setPerks(next);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, mobile]);

  const applyCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setCheckingCode(true);
    setCodeMessage(null);
    const result = await checkShopOfferCode(slug, code);
    setCheckingCode(false);
    if (result.status === "valid") {
      setOffer(result.offer);
      const off = ellaOrderSavings({ subtotal, offer: result.offer, perks: null, usePoints: false }).codeDiscount;
      if (!offerHasWebsiteDiscount(result.offer)) {
        setCodeMessage(`${result.offer.title || "Offer"} added. The shop applies it on your bill.`);
      } else if (off <= 0 && result.offer.minOrder) {
        setCodeMessage(`Add items worth ${formatStorefrontPrice(result.offer.minOrder)} or more to use this code.`);
      } else {
        setCodeMessage(`${result.offer.title || "Offer"} applied.`);
      }
    } else {
      setOffer(null);
      setCodeMessage(
        result.status === "invalid"
          ? "This code is not valid or has ended."
          : "Could not check the code right now. Mention it on WhatsApp and the shop will apply it.",
      );
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const customer: EllaCustomerDetails = { customerName, customerPhone, address, pincode };

  const goToDetails = () => {
    if (cart.length === 0) return;
    if (subtotal <= 0) {
      setError("Cart total is unavailable — please enquire instead.");
      return;
    }
    setError(null);
    setStep("details");
  };

  const goToPayment = () => {
    const checked = validateEnquiryInput({
      customerName,
      customerPhone,
      message: ellaCartSummaryText(cart),
      productId: cart.length === 1 ? cart[0].productId : null,
    });
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    if (!mobile) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }
    if (address.trim().length < 10) {
      setError("Please enter a full delivery address");
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      setError("Please enter a valid 6-digit PIN code");
      return;
    }
    setError(null);
    setStep("payment");
  };

  const placeOrder = async () => {
    setError(null);
    const detailsCheck = validateEllaOrderDetails(customer, payNow > 0 ? method : "cod", upiReference);
    if (detailsCheck.ok === false) {
      setError(detailsCheck.error);
      return;
    }
    const message = buildEllaOrderMessage({ cart, total, method, customer, upiReference, savings });
    const checked = validateEnquiryInput({
      customerName,
      customerPhone: mobile ?? customerPhone,
      message,
      productId: cart.length === 1 ? cart[0].productId : null,
    });
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitStorefrontEnquiry({
        slug,
        customerName: checked.value.customerName,
        customerPhone: checked.value.customerPhone,
        message: checked.value.message,
        productId: checked.value.productId,
      });
      if (!result.ok) {
        setError(
          result.status === 429
            ? "Too many requests. Please try again later."
            : result.error || "Could not place the order",
        );
        return;
      }
      const ref = `EN-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(count).padStart(2, "0")}`;
      const waHref = ellaShopWhatsAppUrl(
        buildEllaOrderWhatsAppText({ shopName, orderRef: ref, cart, total, method, customer, upiReference, savings }),
        shopWhatsApp,
      );
      setOrderRef(ref);
      setOrderWaHref(waHref);
      setStep("done");
      openEllaWhatsApp(waHref);
    } catch {
      setError("Could not place the order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    step === "details" ? "Your details" : step === "payment" ? "Payment" : step === "done" ? "Order placed" : "Your bag";

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close bag" onClick={onClose} />
      <section
        className="ella-sheet ella-sheet-tall"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ella-cart-title"
      >
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">Bag</div>
              <h2 id="ella-cart-title" className="ella-display ella-sheet-name">
                {heading}
              </h2>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {step !== "done" ? (
            <ol className="ella-steps" aria-label="Checkout progress">
              {(["bag", "details", "payment"] as Step[]).map((id, index) => (
                <li
                  key={id}
                  className={`ella-step${step === id ? " ella-step-active" : ""}${
                    (["bag", "details", "payment"] as Step[]).indexOf(step) > index ? " ella-step-done" : ""
                  }`}
                >
                  <span className="ella-step-n">{index + 1}</span>
                  {id === "bag" ? "Bag" : id === "details" ? "Details" : "Payment"}
                </li>
              ))}
            </ol>
          ) : null}

          {step === "bag" ? (
            <>
              {cart.length === 0 ? (
                <p className="ella-empty-inline">Your bag is empty.</p>
              ) : (
                <ul className="ella-cart-list">
                  {cart.map((line) => (
                    <li key={line.key} className="ella-cart-line">
                      {line.image ? (
                        <img className="ella-cart-thumb" src={line.image} alt="" loading="lazy" />
                      ) : (
                        <div className="ella-cart-thumb ella-cart-thumb-ph" />
                      )}
                      <div className="ella-cart-meta">
                        <div className="ella-display ella-cart-name">{line.name}</div>
                        <div className="ella-eyebrow">
                          {line.code}
                          {line.size ? ` · Size ${line.size}` : ""}
                        </div>
                        {line.priceLabel ? <div className="ella-price">{line.priceLabel}</div> : null}
                        <div className="ella-cart-line-foot">
                          <div className="ella-qty-controls ella-qty-controls-inline">
                            <button
                              type="button"
                              className="ella-qty-btn"
                              aria-label="Decrease quantity"
                              onClick={() => onCartChange(updateEllaCartQty(cart, line.key, line.qty - 1))}
                            >
                              −
                            </button>
                            <span className="ella-qty-value">{line.qty}</span>
                            <button
                              type="button"
                              className="ella-qty-btn"
                              aria-label="Increase quantity"
                              disabled={line.maxQty != null && line.qty >= line.maxQty}
                              onClick={() => onCartChange(updateEllaCartQty(cart, line.key, line.qty + 1))}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ella-link-underline"
                            onClick={() => onCartChange(removeEllaCartLine(cart, line.key))}
                          >
                            Remove
                          </button>
                        </div>
                        {line.maxQty != null && line.maxQty <= 3 ? (
                          <div className="ella-stock-note ella-stock-note-low">
                            Only {line.maxQty} left in this size
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {cart.length > 0 ? (
                <>
                  <div className="ella-cart-total">
                    <span>Total</span>
                    <span className="ella-price">{formatStorefrontPrice(subtotal) || "—"}</span>
                  </div>
                  {error ? <p className="ella-error">{error}</p> : null}
                  <div className="ella-form-actions">
                    <button type="button" className="ella-btn" onClick={goToDetails} disabled={subtotal <= 0}>
                      Continue to details
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {step === "details" ? (
            <form
              className="ella-form"
              onSubmit={(e) => {
                e.preventDefault();
                goToPayment();
              }}
            >
              <label>
                <span>Name</span>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required autoComplete="name" />
              </label>
              <label>
                <span>Mobile number (WhatsApp)</span>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="10-digit mobile"
                />
              </label>
              <p className="ella-form-note">
                Your bill, reward points and offers are kept on this number.
                {perks?.pointsEnabled && perks.points > 0
                  ? ` You have ${perks.points} reward points.`
                  : ""}
              </p>
              <label>
                <span>Delivery address</span>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  required
                  autoComplete="street-address"
                />
              </label>
              <label>
                <span>PIN code</span>
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
              </label>
              {error ? <p className="ella-error">{error}</p> : null}
              <div className="ella-form-actions">
                <button type="submit" className="ella-btn">
                  Continue to payment
                </button>
                <button type="button" className="ella-btn ella-btn-outline" onClick={() => setStep("bag")}>
                  Back to bag
                </button>
              </div>
            </form>
          ) : null}

          {step === "payment" ? (
            <>
              <div className="ella-cart-total">
                <span>
                  {count} {count === 1 ? "piece" : "pieces"}
                </span>
                <span className="ella-price">{formatStorefrontPrice(subtotal)}</span>
              </div>

              <div className="ella-perks">
                <div className="ella-utr-field">
                  <span>Offer code</span>
                  <div className="ella-code-row">
                    <input
                      value={codeInput}
                      onChange={(e) => {
                        setCodeInput(e.target.value.toUpperCase().slice(0, 40));
                        if (offer) setOffer(null);
                        setCodeMessage(null);
                      }}
                      placeholder="Code from the shop's app or message"
                      aria-label="Offer code"
                      autoCapitalize="characters"
                    />
                    <button
                      type="button"
                      className="ella-btn ella-btn-outline"
                      disabled={checkingCode || !codeInput.trim()}
                      onClick={() => void applyCode()}
                    >
                      {checkingCode ? "Checking" : "Apply"}
                    </button>
                  </div>
                </div>
                {codeMessage ? <p className="ella-form-note">{codeMessage}</p> : null}

                {perks?.pointsEnabled && perks.points > 0 ? (
                  pointsOffer.points > 0 ? (
                    <label className="ella-points-toggle">
                      <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
                      <span>
                        Use {pointsOffer.points} of your {perks.points} reward points (
                        {formatStorefrontPrice(pointsOffer.amount)} off)
                      </span>
                    </label>
                  ) : (
                    <p className="ella-form-note">
                      You have {perks.points} reward points. They can be used on a bigger order or at the shop.
                    </p>
                  )
                ) : null}
              </div>

              <div className="ella-pay-options" role="radiogroup" aria-label="Payment method">
                <PayOption
                  id="upi"
                  active={method === "upi"}
                  title="UPI — pay now"
                  body="Scan the QR or open any UPI app, then paste the reference number so the studio can verify it against the bank feed."
                  amount={formatStorefrontPrice(total)}
                  onPick={setMethod}
                />
                {hasMto ? (
                  <PayOption
                    id="advance"
                    active={method === "advance"}
                    title={`${ELLA_ADVANCE_PERCENT}% advance`}
                    body="For made-to-order pieces. The balance is payable before dispatch."
                    amount={formatStorefrontPrice(ellaAdvanceAmount(total))}
                    onPick={setMethod}
                  />
                ) : null}
              </div>

              <EllaUpiPayBlock
                upiId={upiId}
                upiBusinessName={upiBusinessName || shopName}
                amount={payNow}
                note={`Ella order ${cart.map((l) => l.code).join(",").slice(0, 40)}`}
              />
              <label className="ella-utr-field">
                <span>UPI reference number</span>
                <input
                  value={upiReference}
                  onChange={(e) => setUpiReference(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 24))}
                  inputMode="numeric"
                  placeholder="12-digit UTR from your payment app"
                  required
                />
              </label>

              <div className="ella-pay-summary">
                {savings.codeDiscount > 0 ? (
                  <div>
                    <span>Offer {savings.offerCode}</span>
                    <span>-{formatStorefrontPrice(savings.codeDiscount)}</span>
                  </div>
                ) : null}
                {savings.pointsAmount > 0 ? (
                  <div>
                    <span>{savings.pointsRedeemed} reward points</span>
                    <span>-{formatStorefrontPrice(savings.pointsAmount)}</span>
                  </div>
                ) : null}
                {savings.codeDiscount > 0 || savings.pointsAmount > 0 ? (
                  <div>
                    <span>Order total</span>
                    <span>{formatStorefrontPrice(total)}</span>
                  </div>
                ) : null}
                <div>
                  <span>To pay now</span>
                  <span className="ella-price">{formatStorefrontPrice(payNow) || "—"}</span>
                </div>
                {dueLater > 0 ? (
                  <div>
                    <span>Balance before dispatch</span>
                    <span>{formatStorefrontPrice(dueLater)}</span>
                  </div>
                ) : null}
              </div>

              {error ? <p className="ella-error">{error}</p> : null}

              <div className="ella-form-actions">
                <button type="button" className="ella-btn" disabled={submitting} onClick={() => void placeOrder()}>
                  {submitting ? "Placing order" : "Place order"}
                </button>
                <button type="button" className="ella-btn ella-btn-outline" onClick={() => setStep("details")}>
                  Back
                </button>
              </div>
              <p className="ella-form-note">{ellaCopy.enquiryNote}</p>
            </>
          ) : null}

          {step === "done" ? (
            <div className="ella-success" role="status">
              <div className="ella-display ella-success-title">Thank you</div>
              <p>
                Order {orderRef} is in. We will mark payment verified once your UPI reference lands — usually within an hour on working days.
              </p>
              <div className="ella-track">
                {[
                  ["Order placed", "Created in Ezzy ERP"],
                  ["Payment verified", "Studio checks the bank feed"],
                  ["Packed at studio", "Stock moved out of your size"],
                  ["Dispatched", "Tracking sent on WhatsApp"],
                ].map(([title, body], index) => (
                  <div key={title} className={`ella-track-row${index === 0 ? " ella-track-row-done" : ""}`}>
                    <span className="ella-track-dot" aria-hidden />
                    <span>
                      <span className="ella-display ella-track-title">{title}</span>
                      <span className="ella-track-body">{body}</span>
                    </span>
                  </div>
                ))}
              </div>
              {appUrl ? (
                <p className="ella-form-note">
                  Once the shop makes your bill, it shows in the {shopName || "shop"} app with your reward points and
                  offers.{" "}
                  <a className="ella-link-underline" href={appUrl} target="_blank" rel="noreferrer">
                    Open the app
                  </a>
                </p>
              ) : null}
              {orderWaHref ? (
                <div className="ella-wa-confirm">
                  <p>Send your order details to the studio on WhatsApp so we can confirm it faster.</p>
                  <a className="ella-btn ella-btn-wa" href={orderWaHref} target="_blank" rel="noreferrer">
                    <WhatsAppMark />
                    Send order on WhatsApp
                  </a>
                </div>
              ) : null}
              <div className="ella-form-actions">
                <button
                  type="button"
                  className={orderWaHref ? "ella-btn ella-btn-outline" : "ella-btn"}
                  onClick={() => {
                    onCartChange([]);
                    onClose();
                  }}
                >
                  Continue shopping
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

function PayOption({
  id,
  active,
  disabled,
  title,
  body,
  amount,
  onPick,
}: {
  id: EllaPaymentMethod;
  active: boolean;
  disabled?: boolean;
  title: string;
  body: string;
  amount: string;
  onPick: (next: EllaPaymentMethod) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      className={`ella-pay-option${active ? " ella-pay-option-active" : ""}`}
      onClick={() => onPick(id)}
    >
      <span className="ella-pay-radio" aria-hidden />
      <span className="ella-pay-copy">
        <span className="ella-pay-head">
          <span className="ella-display ella-pay-title">{title}</span>
          <span className="ella-pay-amount">{amount}</span>
        </span>
        <span className="ella-pay-body">{body}</span>
      </span>
    </button>
  );
}

export function WhatsAppMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2Zm5.8 14.1c-.25.7-1.43 1.33-1.98 1.38-.53.05-1.02.24-3.45-.72-2.9-1.14-4.74-4.1-4.88-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.37c.26-.29.57-.36.76-.36l.54.01c.17 0 .41-.07.64.49.24.57.8 1.97.87 2.11.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.37-.43.5-.14.14-.29.29-.12.57.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.41.29.14.45.12.62-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.64-.14.26.09 1.66.78 1.94.93.29.14.48.21.55.33.07.12.07.69-.18 1.39Z" />
    </svg>
  );
}
