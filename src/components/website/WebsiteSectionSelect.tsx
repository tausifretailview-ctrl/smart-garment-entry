import { cn } from "@/lib/utils";
import type { WebsiteSection } from "@/lib/websiteSections";

/** Sentinel value — choosing this option calls onAddNew instead of changing section. */
export const WEBSITE_SECTION_ADD_VALUE = "__website_add_section__";

export function WebsiteSectionSelect({
  sections,
  value,
  onChange,
  onAddNew,
  addNewLabel = "+ Add section…",
  className,
  emptyLabel = "Select section",
}: {
  sections: WebsiteSection[];
  value: string;
  onChange: (sectionId: string) => void;
  /** Opens section management (e.g. Website → Sections tab). */
  onAddNew?: () => void;
  addNewLabel?: string;
  className?: string;
  emptyLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (next === WEBSITE_SECTION_ADD_VALUE) {
          onAddNew?.();
          return;
        }
        onChange(next);
      }}
      className={cn(
        "h-8 rounded-md border border-slate-200 bg-white px-2 text-sm min-w-[10rem]",
        className,
      )}
      aria-label="Store section"
    >
      {sections.length === 0 ? <option value="">{emptyLabel}</option> : null}
      {sections.map((section) => (
        <option key={section.id} value={section.id}>
          {section.label}
        </option>
      ))}
      {onAddNew ? (
        <option value={WEBSITE_SECTION_ADD_VALUE}>{addNewLabel}</option>
      ) : null}
    </select>
  );
}
