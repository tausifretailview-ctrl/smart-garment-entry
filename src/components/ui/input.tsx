import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, ...props }, ref) => {
    const shouldUppercase = (!type || type === "text") && !className?.includes("no-uppercase") && !props.id?.includes("password") && !props.id?.includes("email");

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
          "flex h-11 w-full rounded-md border border-input bg-card px-4 py-2 text-[15px] font-medium text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground placeholder:font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
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
