import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useOrganizationSwitcher } from "@/hooks/useOrganizationSwitcher";

type CompactOrgSwitcherProps = {
  fyLabel: string;
};

/** Titlebar-sized org switcher — only mount when organizations.length > 1. */
export function CompactOrgSwitcher({ fyLabel }: CompactOrgSwitcherProps) {
  const {
    currentOrganization,
    organizations,
    open,
    setOpen,
    handleSwitchOrganization,
  } = useOrganizationSwitcher();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "erp-titlebar-meta erp-no-drag hidden md:inline-flex max-w-[280px] items-center gap-1 truncate",
            "rounded-md px-1.5 py-0.5 text-left transition-colors",
            "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
          )}
          aria-label="Switch organization"
          aria-expanded={open}
        >
          {currentOrganization?.name ? (
            <>
              <span className="truncate font-semibold text-white">{currentOrganization.name}</span>
              <span className="shrink-0 text-[var(--erp-chrome-ink-dim)]"> · {fyLabel}</span>
            </>
          ) : (
            <span className="text-[var(--erp-chrome-ink-dim)]">{fyLabel}</span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--erp-chrome-ink-dim)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,calc(100vw-2rem))] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search organization..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup>
              {organizations.map((org) => (
                <CommandItem
                  key={org.id}
                  value={`${org.name} ${org.slug}`}
                  onSelect={() => handleSwitchOrganization(org)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentOrganization?.id === org.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{org.name}</span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {org.subscription_tier} tier
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
