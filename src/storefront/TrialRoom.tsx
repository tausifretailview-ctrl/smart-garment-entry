import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trialRoomProductAllowed } from "@/lib/trialRoom";
import { useLockBodyScroll } from "./ellaLockBody";
import { requestTryOn } from "./storefrontClient";
import { rememberedTrialRoomPhoto, rememberTrialRoomPhoto, trialRoomPhotoFromFile } from "./trialRoomPhoto";
import "./trial-room.css";

/**
 * AI Trial Room: "Try it on" for one product, on every store theme.
 *
 * The shopper adds a photo of themselves, the store sends it (scaled down) with the product to
 * the storefront-try-on function and shows the preview that comes back. The photo is kept only
 * in this tab's memory, so the next product can reuse it; it is never written to the phone's
 * storage or saved by the shop.
 */

const WORKING_LINES = ["Reading your photo…", "Fitting the outfit…", "Adding the finishing touches…"];

type Step =
  | { kind: "photo"; error?: string }
  | { kind: "working" }
  | { kind: "result"; image: string };

function TrialRoomSheet({
  slug,
  productId,
  productName,
  productPhoto,
  onClose,
}: {
  slug: string;
  productId: string;
  productName: string;
  productPhoto: string;
  onClose: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(rememberedTrialRoomPhoto);
  const [step, setStep] = useState<Step>({ kind: "photo" });
  const [showBefore, setShowBefore] = useState(false);
  const [line, setLine] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useLockBodyScroll(true);

  useEffect(() => {
    alive.current = true;
    // Escape closes only the trial room, not the product sheet under it (capture + stop).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      alive.current = false;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (step.kind !== "working") return;
    setLine(0);
    const id = window.setInterval(() => setLine((n) => Math.min(WORKING_LINES.length - 1, n + 1)), 6000);
    return () => window.clearInterval(id);
  }, [step.kind]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = await trialRoomPhotoFromFile(file);
      rememberTrialRoomPhoto(next);
      setPhoto(next);
      setStep({ kind: "photo" });
    } catch (err) {
      setStep({ kind: "photo", error: err instanceof Error ? err.message : "This photo could not be opened" });
    }
  };

  const tryOn = useCallback(async () => {
    if (!photo) return;
    setStep({ kind: "working" });
    setShowBefore(false);
    const result = await requestTryOn({ slug, productId, photoUrl: productPhoto, photo });
    if (!alive.current) return;
    setStep(
      result.ok && result.image
        ? { kind: "result", image: result.image }
        : { kind: "photo", error: result.error || "The trial room is not available right now. Please try again." },
    );
  }, [photo, slug, productId, productPhoto]);

  const fileName = `${productName.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "try-on"}.jpg`;

  const share = async (image: string) => {
    try {
      const blob = await (await fetch(image)).blob();
      const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: productName });
        return;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = image;
    a.download = fileName;
    a.click();
  };

  return createPortal(
    <div className="tr-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tr-sheet" role="dialog" aria-modal="true" aria-label="Trial room" data-testid="trial-room">
        <div className="tr-head">
          <div>
            <p className="tr-eyebrow">AI Trial Room</p>
            <h2 className="tr-title">{productName}</h2>
          </div>
          <button type="button" className="tr-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {step.kind === "result" ? (
          <div className="tr-body">
            <div className="tr-result">
              <img
                src={showBefore && photo ? photo : step.image}
                alt={showBefore ? "Your photo" : `You wearing ${productName}`}
                data-testid="trial-room-result"
              />
              {photo ? (
                <div className="tr-toggle" role="group" aria-label="Compare">
                  <button type="button" className={showBefore ? "" : "tr-on"} onClick={() => setShowBefore(false)}>
                    Try-on
                  </button>
                  <button type="button" className={showBefore ? "tr-on" : ""} onClick={() => setShowBefore(true)}>
                    Your photo
                  </button>
                </div>
              ) : null}
            </div>
            <p className="tr-note">AI preview. Colour, fit and length can look different in real life.</p>
            <div className="tr-actions">
              <button type="button" className="tr-btn tr-btn-solid" onClick={() => void share(step.image)}>
                Save / share
              </button>
              <button type="button" className="tr-btn" onClick={() => setStep({ kind: "photo" })}>
                Try another photo
              </button>
            </div>
          </div>
        ) : step.kind === "working" ? (
          <div className="tr-body tr-working" aria-live="polite" data-testid="trial-room-working">
            <div className="tr-pair">
              {photo ? <img src={photo} alt="" /> : null}
              <span className="tr-plus" aria-hidden>
                +
              </span>
              <img src={productPhoto} alt="" />
            </div>
            <div className="tr-spinner" aria-hidden />
            <p className="tr-working-line">{WORKING_LINES[line]}</p>
            <p className="tr-note">This takes about 20 seconds. Please keep this page open.</p>
          </div>
        ) : (
          <div className="tr-body">
            <div className="tr-pair">
              {photo ? (
                <img src={photo} alt="Your photo" data-testid="trial-room-photo" />
              ) : (
                <div className="tr-placeholder">
                  <span aria-hidden>🙂</span>
                  Your photo
                </div>
              )}
              <span className="tr-plus" aria-hidden>
                +
              </span>
              <img src={productPhoto} alt={productName} />
            </div>

            {step.error ? (
              <p className="tr-error" role="alert" data-testid="trial-room-error">
                {step.error}
              </p>
            ) : null}

            {!photo ? (
              <ul className="tr-tips">
                <li>Stand straight, facing the camera, in good light.</li>
                <li>Show yourself from head to at least the waist.</li>
                <li>One person in the photo, plain clothes work best.</li>
              </ul>
            ) : null}

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              data-testid="trial-room-camera"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="trial-room-file"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <div className="tr-actions">
              {photo ? (
                <button type="button" className="tr-btn tr-btn-solid" onClick={() => void tryOn()} data-testid="trial-room-go">
                  Try it on
                </button>
              ) : null}
              <button type="button" className={`tr-btn${photo ? "" : " tr-btn-solid"}`} onClick={() => cameraRef.current?.click()}>
                {photo ? "Retake" : "Take a photo"}
              </button>
              <button type="button" className="tr-btn" onClick={() => galleryRef.current?.click()}>
                {photo ? "Choose another" : "Choose from gallery"}
              </button>
            </div>
            <p className="tr-note">
              Use your own photo. It is sent only to make this preview and is not saved by the shop.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The "Try it on" button for a product page. Renders nothing unless the shop switched the trial
 * room on and the product has a photo.
 */
export function TryOnButton({
  enabled,
  slug,
  productId,
  productName,
  productPhoto,
  productCategory,
  className = "tr-open",
  label = "Try it on",
}: {
  enabled: boolean | undefined;
  /** Innerwear, swimwear and nightwear get no try-on (see trialRoomProductAllowed). */
  productCategory?: string | null;
  slug: string;
  productId: string;
  productName: string;
  /** The product photo on screen (https). */
  productPhoto: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!enabled || !productPhoto || !/^https:\/\//i.test(productPhoto)) return null;
  if (!trialRoomProductAllowed({ name: productName, category: productCategory })) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-testid="try-on-button">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 3l1.6 3.9L17.5 8.5l-3.9 1.6L12 14l-1.6-3.9L6.5 8.5l3.9-1.6L12 3z" strokeLinejoin="round" />
          <path d="M18.5 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open ? (
        <TrialRoomSheet
          slug={slug}
          productId={productId}
          productName={productName}
          productPhoto={productPhoto}
          onClose={close}
        />
      ) : null}
    </>
  );
}
