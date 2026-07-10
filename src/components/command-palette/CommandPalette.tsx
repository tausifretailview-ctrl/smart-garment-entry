import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  COMMAND_PALETTE_REGISTRY,
  filterRegistryItems,
  type CommandPaletteRegistryItem,
} from "@/lib/commandPaletteRegistry";
import {
  COMMAND_PALETTE_PRODUCT_EVENT,
  isCommandPaletteBillingPath,
  searchCommandPaletteAll,
  type CommandPaletteCustomerResult,
  type CommandPaletteInvoiceResult,
  type CommandPaletteProductResult,
} from "@/utils/commandPaletteSearch";
import type { LucideIcon } from "lucide-react";
import { FileText, Package, User } from "lucide-react";

const DEBOUNCE_MS = 200;

const GROUP_HEADING_CLASS =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[var(--erp-ink-3)]";
const ITEM_TITLE_CLASS = "text-[15px] font-medium leading-snug text-[var(--erp-ink)]";
const ITEM_SUBTITLE_CLASS = "mt-0.5 truncate text-[13px] leading-snug text-[var(--erp-ink-3)]";
const ITEM_META_CLASS = "font-mono text-sm font-semibold tabular-nums";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[#fde68a] px-0.5 text-inherit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ResultIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[7px] border border-[var(--erp-line)] bg-[var(--erp-panel-2)] [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:text-[var(--erp-ink-2)] group-data-[selected=true]:border-[var(--erp-accent)] group-data-[selected=true]:bg-white group-data-[selected=true]:[&_svg]:text-[var(--erp-accent)]">
      <Icon />
    </div>
  );
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const openCustomerAccount = useOpenCustomerAccount();
  const { hasMenuAccess, permissions, permissionsLoading } = useUserPermissions();
  const location = useLocation();

  const [query, setQuery] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [customers, setCustomers] = useState<CommandPaletteCustomerResult[]>([]);
  const [products, setProducts] = useState<CommandPaletteProductResult[]>([]);
  const [invoices, setInvoices] = useState<CommandPaletteInvoiceResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const canAccess = useCallback(
    (permission?: string) => {
      if (!permission) return true;
      if (permissionsLoading) return false;
      if (permissions === null) return true;
      return hasMenuAccess(permission);
    },
    [hasMenuAccess, permissions, permissionsLoading],
  );

  const allowedRegistry = useMemo(
    () => COMMAND_PALETTE_REGISTRY.filter((item) => canAccess(item.permission)),
    [canAccess],
  );

  const actionItems = useMemo(
    () => filterRegistryItems(allowedRegistry.filter((i) => i.group === "Actions"), query, 5),
    [allowedRegistry, query],
  );

  const navItems = useMemo(
    () => filterRegistryItems(allowedRegistry.filter((i) => i.group === "Go to"), query, 5),
    [allowedRegistry, query],
  );

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setCustomers([]);
    setProducts([]);
    setInvoices([]);
  }, [onOpenChange]);

  const runRegistryItem = useCallback(
    (item: CommandPaletteRegistryItem) => {
      if (item.path === "/accounts" && item.navState?.tab) {
        orgNavigate(`${item.path}?tab=${item.navState.tab}`);
      } else if (item.navState) {
        orgNavigate(item.path, { state: item.navState });
      } else {
        orgNavigate(item.path);
      }
      close();
    },
    [close, orgNavigate],
  );

  const runCustomer = useCallback(
    (customer: CommandPaletteCustomerResult) => {
      openCustomerAccount(customer.id, customer.customer_name);
      close();
    },
    [close, openCustomerAccount],
  );

  const runProduct = useCallback(
    (product: CommandPaletteProductResult) => {
      if (isCommandPaletteBillingPath(location.pathname)) {
        window.dispatchEvent(
          new CustomEvent(COMMAND_PALETTE_PRODUCT_EVENT, {
            detail: {
              variantId: product.id,
              productId: product.product_id,
              barcode: product.barcode,
              productName: product.product_name,
            },
          }),
        );
        close();
        return;
      }
      orgNavigate(`/product-entry?id=${product.product_id}`);
      close();
    },
    [close, location.pathname, orgNavigate],
  );

  const runInvoice = useCallback(
    (invoice: CommandPaletteInvoiceResult) => {
      if (invoice.sale_type === "pos") {
        orgNavigate(`/pos-sales?saleId=${invoice.id}`);
      } else {
        orgNavigate("/sales-invoice", { state: { editInvoiceId: invoice.id } });
      }
      close();
    },
    [close, orgNavigate],
  );

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const orgId = currentOrganization?.id;
    if (!orgId) return;

    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const term = query.trim();
    if (term.length < 2) {
      setCustomers([]);
      setProducts([]);
      setInvoices([]);
      setRemoteLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setRemoteLoading(true);

      searchCommandPaletteAll(orgId, term, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setCustomers(result.customers);
          setProducts(result.products);
          setInvoices(result.invoices);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.warn("[CommandPalette] search failed", err);
        })
        .finally(() => {
          if (!controller.signal.aborted) setRemoteLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [open, query, currentOrganization?.id]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) {
        close();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  const hasRegistryResults = actionItems.length > 0 || navItems.length > 0;
  const hasRemoteResults = customers.length > 0 || products.length > 0 || invoices.length > 0;
  const showEmpty =
    query.trim().length >= 2 && !remoteLoading && !hasRegistryResults && !hasRemoteResults;

  const paletteItemClass = cn(
    "group relative flex cursor-default select-none items-center gap-3.5 rounded-[5px] px-3 py-3 text-base outline-none",
    "text-[var(--erp-ink)] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
    "data-[selected=true]:bg-[var(--erp-accent-soft)] data-[selected=true]:text-[var(--erp-ink)]",
    "data-[selected=true]:before:absolute data-[selected=true]:before:left-0 data-[selected=true]:before:top-1.5 data-[selected=true]:before:bottom-1.5 data-[selected=true]:before:w-[3px] data-[selected=true]:before:rounded-sm data-[selected=true]:before:bg-[var(--erp-accent)]",
    "[&_*]:data-[selected=true]:text-inherit",
  );

  if (!open) return null;

  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
  const modLabel = isMac ? "⌘" : "Ctrl";

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[99] flex items-start justify-center bg-[rgba(16,36,63,0.35)] pt-[9vh] backdrop-blur-[2px]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <div
        className="flex max-h-[72vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-lg border border-[var(--erp-line)] bg-[var(--erp-panel)] shadow-[0_24px_64px_rgba(16,36,63,0.32),0_2px_8px_rgba(16,36,63,0.16)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="flex h-full flex-col bg-transparent">
          <div className="relative border-b border-[var(--erp-line)] [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:px-[18px] [&_[cmdk-input-wrapper]]:py-4 [&_[cmdk-input-wrapper]_svg]:h-[18px] [&_[cmdk-input-wrapper]_svg]:w-[18px]">
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Search customers, products, invoices, or run a command…"
              className="h-auto border-0 px-0 py-0 pr-16 text-lg text-[var(--erp-ink)] placeholder:text-[var(--erp-ink-3)] focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 shrink-0 rounded border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-2 py-0.5 text-xs text-[var(--erp-ink-3)]">
              ESC
            </span>
          </div>

          <CommandList className="max-h-[min(52vh,480px)] overflow-y-auto px-1.5 py-1.5">
            {showEmpty && <CommandEmpty className="py-8 text-sm text-[var(--erp-ink-3)]">No results found.</CommandEmpty>}

            {actionItems.length > 0 && (
              <CommandGroup heading="Actions" className={GROUP_HEADING_CLASS}>
                {actionItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => runRegistryItem(item)}
                    className={paletteItemClass}
                  >
                    <ResultIcon icon={item.icon} />
                    <div className="min-w-0 flex-1">
                      <div className={ITEM_TITLE_CLASS}>
                        <HighlightMatch text={item.label} query={query} />
                      </div>
                      {item.subtitle && <div className={ITEM_SUBTITLE_CLASS}>{item.subtitle}</div>}
                    </div>
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--erp-accent)] opacity-0 group-data-[selected=true]:opacity-100">
                      ↵ Open
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {customers.length > 0 && (
              <CommandGroup heading="Customers" className={GROUP_HEADING_CLASS}>
                {customers.map((customer) => (
                  <CommandItem
                    key={`cust-${customer.id}`}
                    value={`cust-${customer.id}`}
                    onSelect={() => runCustomer(customer)}
                    className={paletteItemClass}
                  >
                    <ResultIcon icon={User} />
                    <div className="min-w-0 flex-1">
                      <div className={ITEM_TITLE_CLASS}>
                        <HighlightMatch text={customer.customer_name} query={query} />
                      </div>
                      {customer.phone && (
                        <div className={ITEM_SUBTITLE_CLASS}>{formatPhone(customer.phone)}</div>
                      )}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          ITEM_META_CLASS,
                          customer.outstandingDr > 0 ? "text-[var(--erp-bad)]" : "text-[var(--erp-ink-3)]",
                        )}
                      >
                        {customer.outstandingDr > 0 ? `${formatInr(customer.outstandingDr)} Dr` : formatInr(0)}
                      </span>
                      {customer.outstandingDr > 0 && (
                        <span className="rounded-xl bg-[var(--erp-bad-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--erp-bad)]">
                          Due
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {products.length > 0 && (
              <CommandGroup heading="Products" className={GROUP_HEADING_CLASS}>
                {products.map((product) => {
                  const subParts = [
                    product.style ? `Style ${product.style}` : null,
                    product.color || null,
                    product.barcode ? `Barcode ${product.barcode}` : null,
                  ].filter(Boolean);
                  return (
                    <CommandItem
                      key={`prod-${product.id}`}
                      value={`prod-${product.id}`}
                      onSelect={() => runProduct(product)}
                      className={paletteItemClass}
                    >
                      <ResultIcon icon={Package} />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate", ITEM_TITLE_CLASS)}>
                          <HighlightMatch text={product.product_name} query={query} />
                          {product.brand ? ` — ${product.brand}` : ""}
                        </div>
                        {subParts.length > 0 && (
                          <div className={ITEM_SUBTITLE_CLASS}>{subParts.join(" · ")}</div>
                        )}
                      </div>
                      <span className={cn("ml-auto shrink-0 text-[var(--erp-ink-2)]", ITEM_META_CLASS)}>
                        {product.stock_qty} in stock
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {invoices.length > 0 && (
              <CommandGroup heading="Invoices" className={GROUP_HEADING_CLASS}>
                {invoices.map((invoice) => (
                  <CommandItem
                    key={`inv-${invoice.id}`}
                    value={`inv-${invoice.id}`}
                    onSelect={() => runInvoice(invoice)}
                    className={paletteItemClass}
                  >
                    <ResultIcon icon={FileText} />
                    <div className="min-w-0 flex-1">
                      <div className={ITEM_TITLE_CLASS}>
                        <HighlightMatch text={invoice.sale_number} query={query} />
                      </div>
                      {invoice.customer_name && (
                        <div className={ITEM_SUBTITLE_CLASS}>{invoice.customer_name}</div>
                      )}
                    </div>
                    <span className={cn("ml-auto shrink-0 text-[var(--erp-ink-2)]", ITEM_META_CLASS)}>
                      {formatInr(invoice.net_amount)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {navItems.length > 0 && (
              <CommandGroup heading="Go to" className={GROUP_HEADING_CLASS}>
                {navItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`nav-${item.id}`}
                    onSelect={() => runRegistryItem(item)}
                    className={paletteItemClass}
                  >
                    <ResultIcon icon={item.icon} />
                    <div className="min-w-0 flex-1">
                      <div className={ITEM_TITLE_CLASS}>
                        <HighlightMatch text={item.label} query={query} />
                      </div>
                      {item.subtitle && <div className={ITEM_SUBTITLE_CLASS}>{item.subtitle}</div>}
                    </div>
                    {item.shortcutHint && (
                      <span className="ml-auto shrink-0 rounded border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-2 py-0.5 text-xs font-semibold text-[var(--erp-ink-3)]">
                        {item.shortcutHint}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {remoteLoading && query.trim().length >= 2 && (
              <div className="px-3 py-4 text-center text-sm text-[var(--erp-ink-3)]">Searching…</div>
            )}

            {!query.trim() && !hasRegistryResults && (
              <div className="px-3 py-6 text-center text-sm text-[var(--erp-ink-3)]">
                Type to search customers, products, invoices, or commands
              </div>
            )}
          </CommandList>

          <div className="flex items-center gap-4 border-t border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-4 py-3 text-[13px] text-[var(--erp-ink-3)]">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-[var(--erp-line)] bg-white px-1.5 py-0.5 text-xs font-semibold text-[var(--erp-ink-2)]">
                ↑
              </kbd>
              <kbd className="rounded border border-[var(--erp-line)] bg-white px-1.5 py-0.5 text-xs font-semibold text-[var(--erp-ink-2)]">
                ↓
              </kbd>
              navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-[var(--erp-line)] bg-white px-1.5 py-0.5 text-xs font-semibold text-[var(--erp-ink-2)]">
                ↵
              </kbd>
              select
            </span>
            <span className="flex-1" />
            <span className="font-semibold text-[var(--erp-ink-3)]">
              Ezzy ERP · {modLabel}K
            </span>
          </div>
        </Command>
      </div>
    </div>,
    document.body,
  );
}
