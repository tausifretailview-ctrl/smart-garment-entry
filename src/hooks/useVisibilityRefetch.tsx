import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook to pause query polling when the browser tab is hidden
 * Returns a refetchInterval value that is false (disabled) when tab is hidden
 * 
 * @param baseInterval - The base polling interval in milliseconds
 * @returns The interval to use (false when tab is hidden, baseInterval when visible)
 */
export const useVisibilityRefetch = (baseInterval: number | false): number | false => {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Return false to disable polling when hidden, otherwise return the base interval
  if (baseInterval === false) return false;
  return isVisible ? baseInterval : false;
};

/**
 * Hook to track page visibility and trigger refetch when tab becomes visible
 * Use this for queries that should refetch immediately when user returns to tab
 * 
 * @param queryKeys - Array of query keys to invalidate when tab becomes visible
 */
export const useVisibilityInvalidate = (queryKeys: string[][]) => {
  const queryClient = useQueryClient();
  const [wasHidden, setWasHidden] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setWasHidden(true);
      } else if (wasHidden) {
        // Tab became visible after being hidden - invalidate queries
        queryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
        setWasHidden(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient, queryKeys, wasHidden]);

  return { isVisible: !document.hidden };
};

/**
 * Simple hook to track if the page is currently visible
 */
export const usePageVisibility = () => {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return isVisible;
};
