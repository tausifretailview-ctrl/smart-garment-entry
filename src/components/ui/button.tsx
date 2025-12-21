import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-primary to-secondary text-primary-foreground dark:hover:shadow-glow hover:scale-[1.02] active:scale-[0.98]",
        destructive: "bg-gradient-to-r from-destructive to-destructive/90 text-destructive-foreground dark:hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        outline: "border-2 border-primary bg-background text-primary hover:bg-primary hover:text-primary-foreground hover:scale-[1.02] active:scale-[0.98]",
        secondary: "bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground dark:hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:scale-[1.02] active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-gradient-to-r from-success to-success/90 text-success-foreground dark:hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        accent: "bg-gradient-to-r from-accent to-accent/90 text-accent-foreground dark:hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        brand: "bg-primary text-primary-foreground hover:bg-primary/90 dark:hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        "brand-outline": "border-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98]",
      },
      size: {
        default: "h-8 px-3 py-1.5 text-sm",
        sm: "h-7 rounded-md px-2 text-xs",
        lg: "h-9 rounded-md px-6 text-sm",
        icon: "h-8 w-8",
        xs: "h-6 rounded px-2 text-xs",
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
