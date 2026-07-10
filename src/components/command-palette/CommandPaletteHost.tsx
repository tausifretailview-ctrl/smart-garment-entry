import { lazy, Suspense } from "react";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";

const CommandPalette = lazy(() =>
  import("@/components/command-palette/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);

/** Lazy-loads the palette chunk on first Ctrl+K / Cmd+K. */
export function CommandPaletteHost() {
  const { open, setOpen, mountRequested } = useCommandPalette();

  if (!mountRequested) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
