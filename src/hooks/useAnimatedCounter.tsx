import { useState, useEffect, useRef } from "react";

interface UseAnimatedCounterOptions {
  duration?: number;
  formatter?: (value: number) => string;
}

export function useAnimatedCounter(
  targetValue: number,
  options: UseAnimatedCounterOptions = {}
) {
  const { duration = 600, formatter } = options;
  const [displayValue, setDisplayValue] = useState(targetValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<"up" | "down" | "none">("none");
  const previousValue = useRef(targetValue);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const startValue = previousValue.current;
    const endValue = targetValue;
    
    // Determine direction
    if (endValue > startValue) {
      setDirection("up");
    } else if (endValue < startValue) {
      setDirection("down");
    } else {
      setDirection("none");
      return;
    }

    setIsAnimating(true);
    const startTime = performance.now();
    const difference = endValue - startValue;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation (ease-out-cubic)
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + difference * easeOutCubic;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
        previousValue.current = endValue;
        
        // Reset direction after a brief delay
        setTimeout(() => setDirection("none"), 1500);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration]);

  const formattedValue = formatter 
    ? formatter(Math.round(displayValue)) 
    : Math.round(displayValue).toString();

  return {
    displayValue: formattedValue,
    rawValue: displayValue,
    isAnimating,
    direction,
  };
}
