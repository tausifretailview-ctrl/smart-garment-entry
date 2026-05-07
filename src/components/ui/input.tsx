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
          "flex h-[24px] w-full rounded-[2px] border border-input bg-background px-2 py-1 text-[12.5px] text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-75",
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
