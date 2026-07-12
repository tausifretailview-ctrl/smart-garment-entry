import { useMemo, useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";

export type CustomerPhoneLookupRow = {
  id: string;
  customer_name: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
};

interface CustomerPhoneLookupInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  /** When user picks an existing customer from the dropdown. */
  onExistingCustomerSelect: (customer: CustomerPhoneLookupRow) => void;
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function CustomerPhoneLookupInput({
  value,
  onChange,
  onBlur,
  name,
  placeholder = "Enter mobile number",
  autoFocus,
  disabled,
  className,
  onExistingCustomerSelect,
}: CustomerPhoneLookupInputProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneDigits = normalizePhoneDigits(value);
  const searchEnabled = phoneDigits.length >= 3;

  const { filteredCustomers, isLoading } = useCustomerSearch(searchEnabled ? value : "", {
    enabled: searchEnabled,
  });

  const phoneMatches = useMemo(() => {
    if (!searchEnabled) return [];
    return filteredCustomers.filter((customer) => {
      const customerDigits = normalizePhoneDigits(customer.phone || "");
      return customerDigits.includes(phoneDigits);
    });
  }, [filteredCustomers, phoneDigits, searchEnabled]);

  const exactMatch = useMemo(
    () => phoneMatches.find((customer) => normalizePhoneDigits(customer.phone || "") === phoneDigits),
    [phoneMatches, phoneDigits],
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [value, phoneMatches.length]);

  useEffect(() => {
    if (!searchEnabled) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [searchEnabled, value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectCustomer = (customer: CustomerPhoneLookupRow) => {
    onExistingCustomerSelect(customer);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || phoneMatches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, phoneMatches.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && phoneMatches[highlightIndex]) {
      event.preventDefault();
      event.stopPropagation();
      selectCustomer(phoneMatches[highlightIndex]);
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && searchEnabled;

  return (
    <div ref={containerRef} className="relative">
      <Input
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onFocus={() => {
          if (searchEnabled) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn(className, exactMatch && "border-amber-500 focus-visible:ring-amber-500/30")}
        autoComplete="off"
        inputMode="tel"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[60] rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking existing numbers...
            </div>
          ) : phoneMatches.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">
              No customer found with this mobile number.
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {exactMatch ? "Mobile already registered — select to use" : "Matching mobile numbers"}
              </div>
              <ul className="max-h-44 overflow-y-auto py-1">
                {phoneMatches.map((customer, index) => {
                  const isExact = normalizePhoneDigits(customer.phone || "") === phoneDigits;
                  return (
                    <li key={customer.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                          index === highlightIndex && "bg-accent",
                        )}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectCustomer(customer);
                        }}
                      >
                        <UserCheck className={cn("mt-0.5 h-4 w-4 shrink-0", isExact ? "text-amber-600" : "text-muted-foreground")} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium uppercase">{customer.customer_name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {customer.phone}
                            {customer.email ? ` · ${customer.email}` : ""}
                          </div>
                        </div>
                        {isExact && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                            Exists
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
