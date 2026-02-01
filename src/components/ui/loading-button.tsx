import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LoadingButtonProps extends ButtonProps {
  /** Show loading spinner and disable button */
  loading?: boolean;
  /** Text to show while loading (defaults to children) */
  loadingText?: React.ReactNode;
  /** Position of the spinner: 'left' | 'right' */
  spinnerPosition?: "left" | "right";
}

/**
 * Button with built-in loading state
 * Shows instant visual feedback on click with spinner
 * Automatically disables during loading to prevent double-clicks
 */
const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    { 
      children, 
      loading = false, 
      loadingText, 
      spinnerPosition = "left",
      disabled,
      className,
      onClick,
      ...props 
    }, 
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <Button
        ref={ref}
        className={cn(
          "relative transition-all duration-150",
          loading && "cursor-not-allowed",
          className
        )}
        disabled={isDisabled}
        onClick={onClick}
        {...props}
      >
        {loading && spinnerPosition === "left" && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        
        <span className={cn(loading && "opacity-90")}>
          {loading && loadingText ? loadingText : children}
        </span>
        
        {loading && spinnerPosition === "right" && (
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        )}
      </Button>
    );
  }
);

LoadingButton.displayName = "LoadingButton";

export { LoadingButton };
