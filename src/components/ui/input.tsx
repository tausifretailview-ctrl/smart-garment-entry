import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, ...props }, ref) => {
    const shouldUppercase = (!type || type === "text") && !className?.includes("no-uppercase");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (shouldUppercase && e.target.value !== e.target.value.toUpperCase()) {
        const cursor = e.target.selectionStart;
        e.target.value = e.target.value.toUpperCase();
        requestAnimationFrame(() => {
          e.target.setSelectionRange(cursor, cursor);
        });
        const upperEvent = {
          ...e,
          target: { ...e.target, value: e.target.value.toUpperCase() },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange?.(upperEvent);
      } else {
        onChange?.(e);
      }
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          shouldUppercase && "uppercase",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
