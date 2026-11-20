import React from "react";
import { useLocation } from "react-router-dom";
import { entryWindowId } from "@/lib/entryWindows";

/**
 * Remounts an entry page per window (Sale Bill 1 → Sale Bill 2): the page leaving keeps its
 * unsaved bill for its own window, the page arriving restores the bill of the window shown.
 */
export function EntryWindowKey({ path, children }: { path: string; children: React.ReactNode }) {
  const { search } = useLocation();
  return <React.Fragment key={entryWindowId(path, search)}>{children}</React.Fragment>;
}
