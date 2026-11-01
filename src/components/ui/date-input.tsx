import * as React from "react";

import { cn } from "@/lib/utils";
import { ddMmYyyyDigitsToYmd, maskDdMmYyyyDigits, ymdToDdMmYyyy } from "@/lib/dateDisplay";

/**
 * Date field that always shows and accepts dd/mm/yyyy.
 *
 * A native <input type="date"> takes its display order from the browser's own
 * language (Chrome "English (United States)" shows mm/dd/yyyy even when Windows
 * is set to dd/mm/yyyy), so shops saw month-first dates. This keeps the same
 * contract as the native input — `value` / `onChange` use "yyyy-MM-dd" and
 * `e.target.value` — so every `<Input type="date">` can use it unchanged:
 *
 * - the visible box is a text input showing dd/mm/yyyy (type digits, slashes are added);
 * - a hidden native date input holds the real value, gets the caller's `onChange`,
 *   and opens the browser's calendar from the calendar icon (or Alt+Down / F4).
 */
const CALENDAR_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M16 2v4M8 2v4M3 10h18'/%3E%3C/svg%3E\")";

/** Width of the clickable calendar-icon zone at the right edge of the box. */
const PICKER_ZONE_PX = 30;

const NATIVE_VALUE_SETTER =
  typeof window !== "undefined"
    ? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
    : undefined;

const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (
    {
      className,
      style,
      value,
      defaultValue,
      onChange,
      min,
      max,
      name,
      required,
      step,
      disabled,
      readOnly,
      placeholder,
      onBlur,
      onKeyDown,
      onClick,
      type: _type,
      ...rest
    },
    ref,
  ) => {
    const nativeRef = React.useRef<HTMLInputElement | null>(null);
    const isControlled = value !== undefined;
    const [innerYmd, setInnerYmd] = React.useState(() => String(defaultValue ?? ""));
    const ymd = isControlled ? String(value ?? "") : innerYmd;
    // Text being typed; null shows the committed value.
    const [draft, setDraft] = React.useState<string | null>(null);
    const shown = draft ?? ymdToDdMmYyyy(ymd);

    const setNativeRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        nativeRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      },
      [ref],
    );

    /** Write a yyyy-MM-dd value to the native input so React fires the caller's onChange. */
    const commit = (next: string) => {
      const el = nativeRef.current;
      if (!el || el.value === next) return;
      if (NATIVE_VALUE_SETTER) NATIVE_VALUE_SETTER.call(el, next);
      else el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const openPicker = () => {
      const el = nativeRef.current;
      if (!el || disabled || readOnly) return;
      try {
        el.showPicker();
      } catch {
        el.focus();
        el.click();
      }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      let digits = raw.replace(/\D/g, "").slice(0, 8);
      // Backspace over an auto-added "/" removes the digit before it.
      if (
        draft !== null &&
        raw.length < draft.length &&
        digits === draft.replace(/\D/g, "")
      ) {
        digits = digits.slice(0, -1);
      }
      setDraft(maskDdMmYyyyDigits(digits));
      if (digits.length === 8) {
        const next = ddMmYyyyDigitsToYmd(digits);
        if (next) commit(next);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (draft !== null && draft.replace(/\D/g, "").length === 0 && ymd) commit("");
      setDraft(null);
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "F4" || (e.altKey && e.key === "ArrowDown")) {
        e.preventDefault();
        openPicker();
      }
      onKeyDown?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX >= rect.right - PICKER_ZONE_PX) openPicker();
      onClick?.(e);
    };

    return (
      <>
        <input
          {...rest}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          placeholder={placeholder || "dd/mm/yyyy"}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          className={cn(
            "flex h-8 w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground tabular-nums ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color,box-shadow] duration-150 ease-out hover:!border-primary",
            className,
            "!pr-7",
          )}
          style={{
            backgroundImage: CALENDAR_ICON,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.45rem center",
            backgroundSize: "14px 14px",
            ...style,
          }}
        />
        <input
          ref={setNativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          {...(isControlled ? { value: ymd } : { defaultValue })}
          onChange={(e) => {
            if (!isControlled) setInnerYmd(e.target.value);
            setDraft(null);
            onChange?.(e);
          }}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: 0,
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </>
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
