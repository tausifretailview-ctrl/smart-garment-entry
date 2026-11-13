/**
 * What Enter / Tab does in the Add Product colour box (ProductEntryDialog ColorSuggestInput).
 *
 * Typed text: Enter / Tab picks the highlighted suggestion (or adds the typed colour).
 * Empty box: Enter used to always mean "next field", so a colour picked from "Saved colours"
 * with the arrow keys was never added — the cashier had to click it with the mouse. Now, once
 * the arrow keys have moved through the open list, Enter / Tab picks the highlighted colour;
 * Enter on an untouched empty box still moves on.
 */
export type ColorSuggestItem = { value: string; isNew?: boolean };

export type ColorSuggestKeyAction =
  | { kind: "pick"; value: string }
  | { kind: "add-typed" }
  | { kind: "enter-empty" }
  | { kind: "close" };

export function colorSuggestEnterOrTab(args: {
  key: "Enter" | "Tab";
  value: string;
  open: boolean;
  /** Arrow keys used since the list opened or the text last changed. */
  navigated: boolean;
  items: ColorSuggestItem[];
  highlightIndex: number;
}): ColorSuggestKeyAction {
  const item = args.open ? args.items[args.highlightIndex] : undefined;
  if (args.value.trim()) {
    if (item && (args.highlightIndex > 0 || !item.isNew)) return { kind: "pick", value: item.value };
    return { kind: "add-typed" };
  }
  if (item && args.navigated && !item.isNew) return { kind: "pick", value: item.value };
  return args.key === "Enter" ? { kind: "enter-empty" } : { kind: "close" };
}
