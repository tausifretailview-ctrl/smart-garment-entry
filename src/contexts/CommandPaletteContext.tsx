import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  mountRequested: boolean;
  requestMount: () => void;
  previousFocusRef: React.MutableRefObject<HTMLElement | null>;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

/** True when a Radix dialog (z-100) is already open — palette stays below it. */
function hasOpenRadixDialog(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'),
  );
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [mountRequested, setMountRequested] = useState(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const requestMount = useCallback(() => {
    setMountRequested(true);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next && previousFocusRef.current) {
      const el = previousFocusRef.current;
      requestAnimationFrame(() => {
        if (el && document.contains(el) && typeof el.focus === "function") {
          el.focus();
        }
      });
    }
  }, []);

  const toggle = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      if (next) {
        previousFocusRef.current = document.activeElement as HTMLElement | null;
        setMountRequested(true);
      } else if (previousFocusRef.current) {
        const el = previousFocusRef.current;
        requestAnimationFrame(() => {
          if (el && document.contains(el) && typeof el.focus === "function") {
            el.focus();
          }
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      if (key !== "k") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;

      // Only skip when an editable explicitly owns Ctrl+K (none in codebase today).
      if (isEditableTarget(e.target) && (e.target as HTMLElement).dataset.commandPaletteHotkey === "ignore") {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (hasOpenRadixDialog() && !open) return;

      toggle();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, toggle]);

  return (
    <CommandPaletteContext.Provider
      value={{ open, setOpen, toggle, mountRequested, requestMount, previousFocusRef }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return ctx;
}
