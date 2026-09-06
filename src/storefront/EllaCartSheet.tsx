import { useEffect, useMemo, useState } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { submitStorefrontEnquiry } from "./storefrontClient";
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
  ELLA_COD_FEE,
  ELLA_COD_MAX,
  buildEllaOrderMessage,
  ellaAdvanceAmount,
  ellaCodEligible,
  ellaHasMadeToOrder,
  ellaOrderDueLater,
  ellaPayableNow,
  validateEllaOrderDetails,
  type EllaCustomerDetails,
  type EllaPaymentMethod,
} from "./ellaOrder";
import { useLockBodyScroll } from "./ellaLockBody";

type Step = "bag" | "details" | "payment" | "done";

export function EllaCartSheet({
  slug,
  shopName,
  upiId,
  upiBusinessName,
  cart,
  onCartChange,
  onClose,
}: {
  slug: string;
  shopName: string;
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

  const total = useMemo(() => ellaCartTotal(cart), [cart]);
  const count = ellaCartCount(cart);
  const codAllowed = useMemo(() => ellaCodEligible(cart, total), [cart, total]);
  const hasMto = useMemo(() => ellaHasMadeToOrder(cart), [cart]);
  const payNow = ellaPayableNow(total, method);
  const dueLater = ellaOrderDueLater(total, method);

  useEffect(() => {
    if (method === "cod" && !codAllowed) setMethod("upi");
  }, [codAllowed, method]);

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
    if (total <= 0) {
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
    const detailsCheck = validateEllaOrderDetails(customer, method, upiReference);
    if (detailsCheck.ok === false) {
      setError(detailsCheck.error);
      return;
    }
    const message = buildEllaOrderMessage({ cart, total, method, customer, upiReference });
    const checked = validateEnquiryInput({
      customerName,
      customerPhone,
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
      setOrderRef(`EN-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(count).padStart(2, "0")}`);
      setStep("done");
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
                    <span className="ella-price">{formatStorefrontPrice(total) || "—"}</span>
                  </div>
                  {error ? <p className="ella-error">{error}</p> : null}
                  <div className="ella-form-actions">
                    <button type="button" className="ella-btn" onClick={goToDetails} disabled={total <= 0}>
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
                <span>Phone / WhatsApp</span>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
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
                <span className="ella-price">{formatStorefrontPrice(total)}</span>
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
                <PayOption
                  id="cod"
                  active={method === "cod"}
                  disabled={!codAllowed}
                  title="Cash on delivery"
                  body={
                    codAllowed
                      ? `Ready-to-wear only. An ${formatStorefrontPrice(ELLA_COD_FEE)} handling fee applies.`
                      : `Not available on this order — COD is ready-to-wear only, up to ${formatStorefrontPrice(ELLA_COD_MAX)}.`
                  }
                  amount={codAllowed ? `+ ${formatStorefrontPrice(ELLA_COD_FEE)}` : "—"}
                  onPick={setMethod}
                />
              </div>

              {method !== "cod" ? (
                <>
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
                </>
              ) : null}

              <div className="ella-pay-summary">
                <div>
                  <span>To pay now</span>
                  <span className="ella-price">{formatStorefrontPrice(payNow) || "—"}</span>
                </div>
                {dueLater > 0 ? (
                  <div>
                    <span>{method === "cod" ? "Pay on delivery" : "Balance before dispatch"}</span>
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
                Order {orderRef} is in. {method === "cod"
                  ? "We will call to confirm before dispatch."
                  : "We will mark payment verified once your UPI reference lands — usually within an hour on working days."}
              </p>
              <div className="ella-track">
                {[
                  ["Order placed", "Created in Ezzy ERP"],
                  [method === "cod" ? "Order confirmed by call" : "Payment verified", "Studio checks the bank feed"],
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
              <div className="ella-form-actions">
                <button
                  type="button"
                  className="ella-btn"
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
