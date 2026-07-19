import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md hover:scale-[1.01] active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80",
        // Dashboard / filter chips — blue fill + white label/icon on hover (same as shortcut bar)
        outline:
          "border border-input bg-background text-foreground shadow-sm hover:bg-primary hover:border-primary hover:text-primary-foreground hover:shadow-md hover:[&_svg]:text-primary-foreground active:bg-primary/90 active:text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground border border-border shadow-sm hover:bg-primary hover:border-primary hover:text-primary-foreground hover:shadow-md hover:[&_svg]:text-primary-foreground active:bg-primary/90 active:text-primary-foreground",
        ghost:
          "text-foreground hover:bg-primary hover:text-primary-foreground hover:[&_svg]:text-primary-foreground active:bg-primary/90 active:text-primary-foreground",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success: "bg-success text-success-foreground shadow-sm hover:bg-success/90 active:bg-success/80",
        accent: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 active:bg-accent/80",
        brand: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80",
        "brand-outline":
          "border border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:[&_svg]:text-primary-foreground active:bg-primary/90 active:text-primary-foreground",
      },
      size: {
        default: "h-10 px-5 py-2 text-sm",
        sm: "h-8 rounded-[6px] px-3 text-xs",
        lg: "h-11 rounded-[6px] px-6 text-sm",
        icon: "h-10 w-10",
        xs: "h-7 rounded-[4px] px-2 text-xs",
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
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
