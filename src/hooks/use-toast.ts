import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

import { ENTRY_SCREEN_TOAST_MS } from "@/utils/entryScreenToast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = ENTRY_SCREEN_TOAST_MS;

export type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  /** When true, render destructive toast as bottom-right toast (skip modal). */
  inline?: boolean;
  /** @deprecated Destructive toasts are window dialogs unless `inline`. Kept for old callers. */
  persistent?: boolean;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (
  toastId: string,
  variant?: string,
  inline?: boolean,
  persistent?: boolean,
) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  // Window-style error dialogs stay until the user clicks OK.
  if (variant === "destructive" && !inline) return;

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      const isStickyErrorDialog = (t: ToasterToast) =>
        t.variant === "destructive" && !t.inline;

      // Sticky error dialogs skip auto-timeout. User OK still has to REMOVE them —
      // otherwise they stay in memory (open: false) and a later retry/navigation
      // can surface a new dialog on an unrelated screen.
      if (toastId) {
        const t = state.toasts.find((x) => x.id === toastId);
        if (t && isStickyErrorDialog(t)) {
          return {
            ...state,
            toasts: state.toasts.filter((x) => x.id !== toastId),
          };
        }
        addToRemoveQueue(
          toastId,
          (t as ToasterToast | undefined)?.variant,
          (t as ToasterToast | undefined)?.inline,
          (t as ToasterToast | undefined)?.persistent,
        );
      } else {
        const stickyIds = new Set(
          state.toasts.filter(isStickyErrorDialog).map((t) => t.id),
        );
        state.toasts.forEach((toastItem) => {
          if (stickyIds.has(toastItem.id)) return;
          addToRemoveQueue(
            toastItem.id,
            toastItem.variant,
            toastItem.inline,
            toastItem.persistent,
          );
        });
        return {
          ...state,
          toasts: state.toasts
            .filter((t) => !stickyIds.has(t.id))
            .map((t) => ({ ...t, open: false })),
        };
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, "id">;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  if (!(props.variant === "destructive" && !props.inline)) {
    window.setTimeout(() => dismiss(), TOAST_REMOVE_DELAY);
  }

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: dismissToast,
  };
}

export function showError(message: string, title?: string) {
  return toast({
    variant: "destructive",
    title: title || "Error",
    description: message,
  });
}

export function showWarning(message: string, title?: string) {
  return toast({
    variant: "destructive",
    title: title || "Warning",
    description: message,
  });
}

function dismissToast(toastId?: string) {
  dispatch({ type: "DISMISS_TOAST", toastId });
}

export { useToast, toast, dismissToast };
