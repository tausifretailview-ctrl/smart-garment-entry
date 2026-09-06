import { useEffect, useMemo, useState } from "react";
import { submitStorefrontEnquiry } from "./storefrontClient";
import { EllaUpiPayBlock } from "./EllaUpiPayBlock";
import { ellaCopy } from "./storefrontTheme";
import {
  ellaCartCount,
  ellaCartLineKey,
  ellaCartTotal,
  updateEllaCartQty,
  type EllaCartLine,
} from "./ellaCart";
import { formatEllaOrderMessage, validateEllaCheckout, type EllaPaymentMethod } from "./ellaOrder";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { useLockBodyScroll } from "./ellaLockBody";

type Step = "cart" | "details" | "payment" | "done";

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
  const [step, setStep] = useState<Step>("cart");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<EllaPaymentMethod>("upi");
  const [upiReference, setUpiReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => ellaCartTotal(cart), [cart]);
  const totalLabel = formatStorefrontPrice(total);
  const details = { customerName, customerPhone, address, pincode, paymentMethod, upiReference };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const proceedDetails = () => {
    if (cart.length === 0) return;
    if (total <= 0) {
      setError("Cart total is unavailable — please enquire instead.");
      return;
    }
    setError(null);
    setStep("details");
  };

  const proceedPayment = () => {
    const checked = validateEllaCheckout({ ...details, paymentMethod: "cod", upiReference: "" }, cart);
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    setError(null);
    setStep("payment");
  };

  const placeOrder = async () => {
    setError(null);
    const checked = validateEllaCheckout(details, cart);
    if (checked.ok === false) {
      setError(checked.error);
      return;
    }
    const message = formatEllaOrderMessage(cart, checked.value);
    setSubmitting(true);
    try {
      const result = await submitStorefrontEnquiry({
        slug,
        customerName: checked.value.customerName,
        customerPhone: checked.value.customerPhone,
        message,
        productId: cart.length === 1 ? cart[0].productId : null,
      });
      if (!result.ok) {
        setError(result.status === 429 ? "Too many requests. Please try again later." : result.error || "Could not send");
        return;
      }
      setStep("done");
    } catch {
      setError("Could not confirm order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    step === "details" ? "Your details" : step === "payment" ? "Pay via UPI" : step === "done" ? "Thank you" : "Your cart";

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close cart" onClick={onClose} />
      <section className="ella-sheet ella-sheet-tall" role="dialog" aria-modal="true" aria-labelledby="ella-cart-title">
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">Bag</div>
              <h2 id="ella-cart-title" className="ella-display ella-sheet-name">
                {title}
              </h2>
            </div>
            <button type="button" className="ella-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {step === "cart" ? (
            <>
              {cart.length === 0 ? (
                <p className="ella-empty-inline">Your cart is empty.</p>
              ) : (
                <ul className="ella-cart-list">
                  {cart.map((line) => (
                    <li key={ellaCartLineKey(line)} className="ella-cart-line">
                      {line.image ? (
                        <img className="ella-cart-thumb" src={line.image} alt="" />
                      ) : (
                        <div className="ella-cart-thumb ella-cart-thumb-ph" />
                      )}
                      <div className="ella-cart-meta">
                        <div className="ella-display ella-cart-name">{line.name}</div>
                        <div className="ella-eyebrow">
                          {line.code}
                          {line.size ? ` · ${line.size}` : ""}
                        </div>
                        {line.priceLabel ? <div className="ella-price">{line.priceLabel}</div> : null}
                        <div className="ella-qty-controls ella-qty-controls-inline">
                          <button
                            type="button"
                            className="ella-qty-btn"
                            aria-label="Decrease quantity"
                            onClick={() => onCartChange(updateEllaCartQty(cart, ellaCartLineKey(line), line.qty - 1))}
                          >
                            −
                          </button>
                          <span className="ella-qty-value">{line.qty}</span>
                          <button
                            type="button"
                            className="ella-qty-btn"
                            aria-label="Increase quantity"
                            disabled={line.qty >= line.maxQty}
                            onClick={() => onCartChange(updateEllaCartQty(cart, ellaCartLineKey(line), line.qty + 1))}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {cart.length > 0 ? (
                <>
                  <div className="ella-cart-total">
                    <span>Total</span>
                    <span className="ella-price">{totalLabel || "—"}</span>
                  </div>
                  {error ? <p className="ella-error">{error}</p> : null}
                  <div className="ella-form-actions">
                    <button type="button" className="ella-btn" onClick={proceedDetails} disabled={total <= 0}>
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
                proceedPayment();
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
                <span>Address</span>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} required rows={3} autoComplete="street-address" />
              </label>
              <label>
                <span>Pincode</span>
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
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
                <button type="button" className="ella-btn ella-btn-outline" onClick={() => setStep("cart")}>
                  Back to bag
                </button>
              </div>
            </form>
          ) : null}

          {step === "payment" ? (
            <>
              <div className="ella-cart-total">
                <span>
                  {ellaCartCount(cart)} {ellaCartCount(cart) === 1 ? "piece" : "pieces"}
                </span>
                <span className="ella-price">{totalLabel}</span>
              </div>

              <form
                className="ella-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void placeOrder();
                }}
              >
                <label>
                  <span>Payment</span>
                  <select
                    className="ella-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as EllaPaymentMethod)}
                  >
                    <option value="upi">UPI</option>
                    <option value="cod">Cash on delivery</option>
                    <option value="advance">Advance / partial</option>
                  </select>
                </label>

                {paymentMethod === "upi" ? (
                  <>
                    <EllaUpiPayBlock
                      upiId={upiId}
                      upiBusinessName={upiBusinessName || shopName}
                      amount={total}
                      note="Ella store order"
                    />
                    <label>
                      <span>UPI reference</span>
                      <input
                        value={upiReference}
                        onChange={(e) => setUpiReference(e.target.value)}
                        required
                        placeholder="UTR / reference after paying"
                      />
                    </label>
                  </>
                ) : null}

                {error ? <p className="ella-error">{error}</p> : null}

                <div className="ella-form-actions">
                  <button type="submit" className="ella-btn" disabled={submitting}>
                    {submitting ? "Sending" : paymentMethod === "upi" ? "I have paid — confirm order" : "Place order"}
                  </button>
                  <button type="button" className="ella-btn ella-btn-outline" onClick={() => setStep("details")}>
                    Back to details
                  </button>
                </div>
              </form>
              <p className="ella-form-note">{ellaCopy.enquiryNote}</p>
            </>
          ) : null}

          {step === "done" ? (
            <div className="ella-success" role="status">
              Thank you. Your order is noted — the studio will confirm once payment is verified.
              <div className="ella-form-actions" style={{ marginTop: 16 }}>
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
