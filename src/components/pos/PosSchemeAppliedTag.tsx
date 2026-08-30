import { cn } from "@/lib/utils";

export const POS_SCHEME_APPLIED_TAG_LABEL = "Scheme applied";

type PosSchemeAppliedTagProps = {
  applied?: boolean;
  className?: string;
};

/** Screen-only cart badge. Do not use on print / thermal / invoice templates. */
export function PosSchemeAppliedTag({ applied, className }: PosSchemeAppliedTagProps) {
  if (!applied) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded border border-amber-400 bg-amber-100 px-1 py-0.5 text-[9px] font-bold leading-none text-amber-900",
        className,
      )}
      title="Discount scheme applied to this line"
      aria-label={POS_SCHEME_APPLIED_TAG_LABEL}
    >
      {POS_SCHEME_APPLIED_TAG_LABEL}
    </span>
  );
}
