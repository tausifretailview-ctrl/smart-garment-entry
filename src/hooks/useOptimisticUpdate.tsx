import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface OptimisticOptions<T> {
  /** Query key(s) to update optimistically */
  queryKey: string[];
  /** Function to apply the optimistic update to cached data */
  updateFn: (oldData: T | undefined, newValue: any) => T;
  /** Async function that performs the actual mutation */
  mutationFn: () => Promise<any>;
  /** Called on success */
  onSuccess?: (result: any) => void;
  /** Called on error (before rollback) */
  onError?: (error: Error) => void;
  /** Toast message on success */
  successMessage?: string;
  /** Toast message on error */
  errorMessage?: string;
}

/**
 * Hook for optimistic UI updates
 * Updates the UI immediately and rolls back if the mutation fails
 */
export function useOptimisticUpdate<T = any>() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(async <D = any>(
    options: OptimisticOptions<T>,
    optimisticValue?: D
  ): Promise<{ success: boolean; data?: any; error?: Error }> => {
    const {
      queryKey,
      updateFn,
      mutationFn,
      onSuccess,
      onError,
      successMessage,
      errorMessage,
    } = options;

    // Store previous value for rollback
    const previousData = queryClient.getQueryData<T>(queryKey);

    // Apply optimistic update immediately
    if (optimisticValue !== undefined) {
      queryClient.setQueryData<T>(queryKey, (old) => updateFn(old, optimisticValue));
    }

    setIsPending(true);

    try {
      const result = await mutationFn();
      
      // Invalidate to ensure fresh data
      await queryClient.invalidateQueries({ queryKey });

      if (successMessage) {
        toast({
          title: "Success",
          description: successMessage,
        });
      }

      onSuccess?.(result);
      setIsPending(false);
      return { success: true, data: result };
    } catch (error) {
      // Rollback to previous data
      queryClient.setQueryData(queryKey, previousData);

      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      if (errorMessage) {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }

      onError?.(errorObj);
      setIsPending(false);
      return { success: false, error: errorObj };
    }
  }, [queryClient, toast]);

  return { execute, isPending };
}

/**
 * Simple flash animation helper for optimistic updates
 * Adds a temporary class to element that triggers animation
 */
export function flashElement(element: HTMLElement | null, type: 'success' | 'error' = 'success') {
  if (!element) return;
  
  const className = type === 'success' ? 'flash-success' : 'flash-error';
  element.classList.add(className);
  
  setTimeout(() => {
    element.classList.remove(className);
  }, 400);
}
