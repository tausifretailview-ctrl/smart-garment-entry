import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] text-[12px] font-semibold transition-all duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md hover:scale-[1.01] active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80",
        outline: "border border-input bg-background text-foreground shadow-sm hover:bg-accent/10 hover:border-primary active:bg-accent/20",
        secondary: "bg-secondary text-secondary-foreground border border-border shadow-sm hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-accent/10 text-foreground active:bg-accent/20",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success: "bg-success text-success-foreground shadow-sm hover:bg-success/90 active:bg-success/80",
        accent: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 active:bg-accent/80",
        brand: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80",
        "brand-outline": "border border-primary bg-transparent text-primary hover:bg-primary/10 active:bg-primary/20",
      },
      size: {
        default: "h-9 px-4 py-2 text-[13px]",
        sm: "h-8 rounded-md px-3 text-[12px]",
        lg: "h-10 rounded-md px-6 text-[14px]",
        icon: "h-9 w-9",
        xs: "h-7 rounded-[3px] px-2 text-[11.5px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        data-variant={variant}
        data-size={size ?? "default"}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

function KbdHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 text-[9px] font-mono px-1 rounded-[2px] border border-white/20 bg-black/10 text-inherit opacity-80 leading-[14px]">
      {children}
    </kbd>
  );
}

export { Button, buttonVariants, KbdHint };
