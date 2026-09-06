import { cn } from "@/lib/utils";
import type { WebsiteSection } from "@/lib/websiteSections";

export function WebsiteSectionSelect({
  sections,
  value,
  onChange,
  className,
  emptyLabel = "Select section",
}: {
  sections: WebsiteSection[];
  value: string;
  onChange: (sectionId: string) => void;
  className?: string;
  emptyLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
    </select>
  );
}
