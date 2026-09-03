import { useEffect, useMemo, useState } from "react";
import { validateEnquiryInput } from "@/lib/storefrontEnquiry";
import { submitStorefrontEnquiry } from "./storefrontClient";
import { EllaUpiPayBlock } from "./EllaUpiPayBlock";
import { ellaCopy } from "./storefrontTheme";
import {
  ellaCartCount,
  ellaCartSummaryText,
  ellaCartTotal,
  updateEllaCartQty,
  type EllaCartLine,
} from "./ellaCart";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { useLockBodyScroll } from "./ellaLockBody";

type Step = "cart" | "checkout" | "done";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => ellaCartTotal(cart), [cart]);
  const totalLabel = formatStorefrontPrice(total);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const proceedCheckout = () => {
    if (cart.length === 0) return;
    if (total <= 0) {
      setError("Cart total is unavailable — please enquire instead.");
      return;
    }
    setError(null);
    setStep("checkout");
  };

  const confirmOrder = async () => {
    setError(null);
    const message = [`Store order`, ellaCartSummaryText(cart), `Total: ${totalLabel}`].join(" · ");
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

  return (
    <>
      <button type="button" className="ella-scrim" aria-label="Close cart" onClick={onClose} />
      <section className="ella-sheet ella-sheet-tall" role="dialog" aria-modal="true" aria-labelledby="ella-cart-title">
        <div className="ella-sheet-scroll">
          <div className="ella-sheet-head">
            <div>
              <div className="ella-eyebrow">Bag</div>
              <h2 id="ella-cart-title" className="ella-display ella-sheet-name">
                {step === "checkout" ? "Pay via UPI" : step === "done" ? "Thank you" : "Your cart"}
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
                    <li key={line.productId} className="ella-cart-line">
                      {line.image ? (
                        <img className="ella-cart-thumb" src={line.image} alt="" />
                      ) : (
                        <div className="ella-cart-thumb ella-cart-thumb-ph" />
                      )}
                      <div className="ella-cart-meta">
                        <div className="ella-display ella-cart-name">{line.name}</div>
                        <div className="ella-eyebrow">{line.code}</div>
                        {line.priceLabel ? <div className="ella-price">{line.priceLabel}</div> : null}
                        <div className="ella-qty-controls ella-qty-controls-inline">
                          <button
                            type="button"
                            className="ella-qty-btn"
                            aria-label="Decrease quantity"
                            onClick={() => onCartChange(updateEllaCartQty(cart, line.productId, line.qty - 1))}
                          >
                            −
                          </button>
                          <span className="ella-qty-value">{line.qty}</span>
                          <button
                            type="button"
                            className="ella-qty-btn"
                            aria-label="Increase quantity"
                            onClick={() => onCartChange(updateEllaCartQty(cart, line.productId, line.qty + 1))}
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
                    <button type="button" className="ella-btn" onClick={proceedCheckout} disabled={total <= 0}>
                      Proceed to payment
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {step === "checkout" ? (
            <>
              <div className="ella-cart-total">
                <span>{ellaCartCount(cart)} {ellaCartCount(cart) === 1 ? "piece" : "pieces"}</span>
                <span className="ella-price">{totalLabel}</span>
              </div>

              <form
                className="ella-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirmOrder();
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
                {error ? <p className="ella-error">{error}</p> : null}

                <EllaUpiPayBlock
                  upiId={upiId}
                  upiBusinessName={upiBusinessName || shopName}
                  amount={total}
                  note="Ella store order"
                />

                <div className="ella-form-actions">
                  <button type="submit" className="ella-btn" disabled={submitting}>
                    {submitting ? "Sending" : "I have paid — confirm order"}
                  </button>
                  <button type="button" className="ella-btn ella-btn-outline" onClick={() => setStep("cart")}>
                    Back to cart
                  </button>
                </div>
              </form>
              <p className="ella-form-note">{ellaCopy.enquiryNote}</p>
            </>
          ) : null}

          {step === "done" ? (
            <div className="ella-success" role="status">
              Thank you. Your order is noted — the studio will confirm once UPI payment is verified.
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
