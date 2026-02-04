import { useState, useRef, useEffect } from "react";
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
  Menu
} from "lucide-react";
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
              if (e.key === 'Enter') {
                e.preventDefault();
                onBarcodeSubmit();
              }
            }}
            className="pl-10 h-10 text-base"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
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
                <CommandGroup>
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
