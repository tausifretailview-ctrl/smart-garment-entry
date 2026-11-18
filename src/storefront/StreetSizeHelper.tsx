import { useCallback, useMemo, useState } from "react";
import {
  SIZE_PROFILE_STORAGE_KEY,
  cmToFeetInches,
  feetInchesToCm,
  isValidSizeProfile,
  parseSizeProfile,
  sizeGuideRows,
  sizeMeasureName,
  sizeScaleFor,
  suggestSize,
  type SizeFit,
  type SizeGender,
  type SizeProfile,
  type SizeScale,
  type SizeSuggestion,
  type StorefrontSizeHelper,
} from "@/lib/sizeHelper";

function readProfile(): SizeProfile | null {
  try {
    return parseSizeProfile(window.localStorage.getItem(SIZE_PROFILE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** The shopper's height / weight / fit, kept in this browser only. */
export function useStreetSizeProfile(): [SizeProfile | null, (profile: SizeProfile | null) => void] {
  const [profile, setProfile] = useState<SizeProfile | null>(readProfile);
  const save = useCallback((next: SizeProfile | null) => {
    setProfile(next);
    try {
      if (next) window.localStorage.setItem(SIZE_PROFILE_STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(SIZE_PROFILE_STORAGE_KEY);
    } catch {
      /* storage blocked — the size is remembered for this page only */
    }
  }, []);
  return [profile, save];
}

/** Scale + suggestion for one product; both null when the helper does not apply to it. */
export function useStreetSizeSuggestion(
  product: { name: string; sourceCategory: string | null; sectionLabel: string | null; sizes: Array<{ label: string }> },
  config: StorefrontSizeHelper | undefined,
  profile: SizeProfile | null,
): { scale: SizeScale | null; suggestion: SizeSuggestion | null } {
  return useMemo(() => {
    if (!config?.enabled) return { scale: null, suggestion: null };
    const sizes = product.sizes.map((s) => s.label);
    const category = `${product.sourceCategory || ""} ${product.sectionLabel || ""}`;
    const scale = sizeScaleFor({ name: product.name, category, sizes });
    if (!scale || !profile) return { scale, suggestion: null };
    return { scale, suggestion: suggestSize(sizes, scale, profile, config.charts) };
  }, [config, product.name, product.sourceCategory, product.sectionLabel, product.sizes, profile]);
}

const FITS: Array<{ id: SizeFit; label: string }> = [
  { id: "snug", label: "Snug" },
  { id: "regular", label: "Regular" },
  { id: "loose", label: "Loose" },
];
const GENDERS: Array<{ id: SizeGender; label: string }> = [
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
];

/**
 * Product page "Find my size": height, weight and fit in, a suggested size out, with the size
 * guide it came from. Shown only for products the helper can size (see sizeScaleFor).
 */
export function StreetSizeHelper({
  sizes,
  scale,
  suggestion,
  config,
  profile,
  onSaveProfile,
  onPick,
}: {
  sizes: Array<{ label: string; inStock: boolean; stockLabel: string }>;
  scale: SizeScale;
  suggestion: SizeSuggestion | null;
  config: StorefrontSizeHelper;
  profile: SizeProfile | null;
  onSaveProfile: (profile: SizeProfile | null) => void;
  /** Selects the suggested size on the page (only called when it is in stock). */
  onPick: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const start = profile ? cmToFeetInches(profile.heightCm) : { feet: 5, inches: 6 };
  const [gender, setGender] = useState<SizeGender>(profile?.gender ?? scale.gender);
  const [feet, setFeet] = useState(start.feet);
  const [inches, setInches] = useState(start.inches);
  const [weight, setWeight] = useState(profile ? String(profile.weightKg) : "");
  const [fit, setFit] = useState<SizeFit>(profile?.fit ?? "regular");
  const [error, setError] = useState<string | null>(null);

  const measure = sizeMeasureName(scale);
  const guide = useMemo(() => sizeGuideRows(sizes.map((s) => s.label), scale, config.charts), [sizes, scale, config.charts]);
  const suggested = suggestion ? sizes.find((s) => s.label === suggestion.label) ?? null : null;

  const submit = () => {
    const next = { gender, heightCm: feetInchesToCm(feet, inches), weightKg: Number(weight), fit };
    if (!isValidSizeProfile(next)) {
      setError("Enter your weight in kg (30 to 180).");
      return;
    }
    setError(null);
    onSaveProfile(next);
    const result = suggestSize(sizes.map((s) => s.label), scale, next, config.charts);
    const option = result ? sizes.find((s) => s.label === result.label) : null;
    if (result && !result.beyondRange && option?.inStock) onPick(result.label);
    setOpen(false);
  };

  return (
    <div className="st-fit">
      <div className="st-fit-bar">
        {suggestion && suggested ? (
          <span className={`st-fit-result${suggested.inStock && !suggestion.beyondRange ? "" : " st-fit-warn"}`} role="status">
            {suggestion.beyondRange ? (
              <>Your estimate is above the largest size here ({suggestion.label}).</>
            ) : (
              <>
                Your size: <strong>{suggestion.label}</strong>
                {suggested.inStock ? ` · ${suggested.stockLabel}` : " · sold out right now"}
              </>
            )}
          </span>
        ) : null}
        <button type="button" className="st-link st-fit-open" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {profile ? "Change my details" : "Find my size"}
        </button>
        <button type="button" className="st-link st-fit-guide-open" aria-expanded={guideOpen} onClick={() => setGuideOpen((v) => !v)}>
          Size guide
        </button>
      </div>

      {open ? (
        <div className="st-fit-panel" role="group" aria-label="Find my size">
          <div className="st-fit-row">
            <span className="st-fit-label">For</span>
            <div className="st-fit-seg" role="radiogroup" aria-label="For">
              {GENDERS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={gender === g.id}
                  className={`st-fit-seg-btn${gender === g.id ? " st-on" : ""}`}
                  onClick={() => setGender(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="st-fit-row">
            <span className="st-fit-label">Height</span>
            <div className="st-fit-inline">
              <select aria-label="Height, feet" value={feet} onChange={(e) => setFeet(Number(e.target.value))}>
                {[4, 5, 6].map((f) => (
                  <option key={f} value={f}>
                    {f} ft
                  </option>
                ))}
              </select>
              <select aria-label="Height, inches" value={inches} onChange={(e) => setInches(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {i} in
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="st-fit-row">
            <label className="st-fit-label" htmlFor="st-fit-weight">
              Weight
            </label>
            <div className="st-fit-inline">
              <input
                id="st-fit-weight"
                type="number"
                inputMode="numeric"
                min={30}
                max={180}
                placeholder="kg"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="st-fit-unit">kg</span>
            </div>
          </div>
          <div className="st-fit-row">
            <span className="st-fit-label">Fit you like</span>
            <div className="st-fit-seg" role="radiogroup" aria-label="Fit you like">
              {FITS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={fit === f.id}
                  className={`st-fit-seg-btn${fit === f.id ? " st-on" : ""}`}
                  onClick={() => setFit(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="st-fit-error">{error}</p> : null}
          <div className="st-fit-actions">
            <button type="button" className="st-btn st-btn-solid st-btn-sm" onClick={submit}>
              Show my size
            </button>
            {profile ? (
              <button
                type="button"
                className="st-link"
                onClick={() => {
                  onSaveProfile(null);
                  setOpen(false);
                }}
              >
                Forget my details
              </button>
            ) : null}
          </div>
          <p className="st-fit-note">
            An estimate from your height and weight, kept on this phone only. If you know your {measure} measure, check
            the size guide.
          </p>
        </div>
      ) : null}

      {guideOpen && guide.length > 0 ? (
        <table className="st-fit-guide">
          <caption>Size guide: body {measure} each size fits</caption>
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">Up to (in)</th>
              <th scope="col">Up to (cm)</th>
            </tr>
          </thead>
          <tbody>
            {guide.map((row) => (
              <tr key={row.label} className={suggestion?.label === row.label && !suggestion.beyondRange ? "st-on" : undefined}>
                <th scope="row">{row.label}</th>
                <td>{row.inches}</td>
                <td>{row.cm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
