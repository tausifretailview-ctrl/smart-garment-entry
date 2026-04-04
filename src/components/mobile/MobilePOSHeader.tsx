import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Scan, 
  User, 
  UserPlus, 
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
  Menu,
  Camera
} from "lucide-react";
import { CameraScanner } from "@/components/tablet/CameraScanner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MobilePOSHeaderProps {
  invoiceNumber: string;
  isOnline: boolean;
  isSyncing: boolean;
  pendingActions: number;
  customerName: string;
  customerPhone: string;
  onCustomerSelect: (customer: any) => void;
  onAddCustomer: () => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onBarcodeSubmit: () => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  customers: any[];
  customerSearchInput: string;
  onCustomerSearchChange: (value: string) => void;
  openCustomerSearch: boolean;
  setOpenCustomerSearch: (open: boolean) => void;
  onMenuClick?: () => void;
  selectedProductType: string;
  onProductTypeChange: (type: string) => void;
  hasMoreCustomers?: boolean;
  filteredProducts?: any[];
  onProductSelect?: (product: any, variant: any) => void;
  openProductSearch?: boolean;
}

export const MobilePOSHeader = ({
  invoiceNumber,
  isOnline,
  isSyncing,
  pendingActions,
  customerName,
  onCustomerSelect,
  onAddCustomer,
  searchInput,
  onSearchInputChange,
  onBarcodeSubmit,
  barcodeInputRef,
  customers,
  customerSearchInput,
  onCustomerSearchChange,
  openCustomerSearch,
  setOpenCustomerSearch,
  onMenuClick,
  selectedProductType,
  onProductTypeChange,
  hasMoreCustomers,
  filteredProducts = [],
  onProductSelect,
  openProductSearch = false,
}: MobilePOSHeaderProps) => {
  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4 text-amber-500" />;
    if (isSyncing) return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    return <Wifi className="h-4 w-4 text-green-500" />;
  };

  const getStatusText = () => {
    if (!isOnline) return pendingActions > 0 ? `${pendingActions} pending` : 'Offline';
    if (isSyncing) return 'Syncing...';
    return 'Online';
  };

  return (
    <div className="bg-card border-b p-3 space-y-3">
      {/* Top Row: Menu, Status, Invoice */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onMenuClick && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMenuClick}>
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-1.5">
            {getStatusIcon()}
            <span className="text-xs text-muted-foreground">{getStatusText()}</span>
          </div>
        </div>
        <Badge variant="outline" className="text-xs font-mono">
          {invoiceNumber || 'New Bill'}
        </Badge>
      </div>

      {/* Barcode Search with Product Type Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={barcodeInputRef}
            placeholder="Scan barcode or search..."
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Go' || e.keyCode === 13) {
                e.preventDefault();
                onBarcodeSubmit();
              }
            }}
            className="pl-10 pr-10 h-10 text-base no-uppercase"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="text"
            enterKeyHint="search"
            spellCheck={false}
            style={{ fontSize: '16px' }}
          />
        </div>
        <Select value={selectedProductType} onValueChange={onProductTypeChange}>
          <SelectTrigger className="h-10 w-[90px] text-xs bg-card">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-[100]">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="goods">Goods</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="combo">Combo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile Product Search Results Dropdown */}
      {openProductSearch && searchInput.length >= 2 && filteredProducts.length > 0 && (
        <div className="bg-popover border border-border rounded-xl shadow-lg max-h-64 overflow-auto">
          {filteredProducts.slice(0, 20).map((item: any, index: number) => {
            const product = item.product;
            const variant = item.variant;
            const displayParts = [product.product_name];
            if (product.brand) displayParts.push(product.brand);
            if (variant.color && variant.color !== '-') displayParts.push(variant.color);
            return (
              <button
                key={`${product.id}-${variant.id}-${index}`}
                type="button"
                onClick={() => onProductSelect?.(product, variant)}
                className="w-full text-left px-3.5 py-2.5 border-b border-border/30 last:border-0 active:bg-accent/70 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{displayParts.join(' · ')}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Size: {variant.size}{variant.barcode ? ` · ${variant.barcode}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">₹{variant.sale_price}</p>
                    <p className={`text-[11px] font-medium ${(variant.stock_qty || 0) > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      Qty: {variant.stock_qty || 0}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Customer Row */}
      <div className="flex items-center gap-2">
        <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 justify-between h-10 text-left font-normal"
            >
              <div className="flex items-center gap-2 truncate">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {customerName || 'Walk-in Customer'}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search customer..."
                value={customerSearchInput}
                onValueChange={onCustomerSearchChange}
              />
              <CommandList className="max-h-60">
                <CommandEmpty>No customer found.</CommandEmpty>
                <CommandGroup heading={hasMoreCustomers ? `Showing ${customers?.length || 0} - refine search` : undefined}>
                  {/* Walk-in option */}
                  <CommandItem
                    onSelect={() => {
                      onCustomerSelect(null);
                      setOpenCustomerSearch(false);
                    }}
                  >
                    <span className="text-muted-foreground">Walk-in Customer</span>
                  </CommandItem>
                  {customers?.slice(0, 20).map((customer: any) => (
                    <CommandItem
                      key={customer.id}
                      onSelect={() => {
                        onCustomerSelect(customer);
                        setOpenCustomerSearch(false);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{customer.customer_name}</span>
                        {customer.phone && (
                          <span className="text-xs text-muted-foreground">{customer.phone}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={onAddCustomer}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
