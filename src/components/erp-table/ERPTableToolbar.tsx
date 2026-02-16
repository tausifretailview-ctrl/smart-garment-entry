import React from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Columns3, AlignJustify, LayoutGrid, RotateCcw } from "lucide-react";
import { ERPTableDensity } from "./useERPTablePersistence";

interface ERPTableToolbarProps<T> {
  table: Table<T>;
  density: ERPTableDensity;
  onToggleDensity: () => void;
  onResetSettings: () => void;
}

export function ERPTableToolbar<T>({
  table,
  density,
  onToggleDensity,
  onResetSettings,
}: ERPTableToolbarProps<T>) {
  const allColumns = table.getAllLeafColumns().filter((c) => c.id !== "actions");

  return (
    <div className="flex items-center gap-2 mb-2 flex-nowrap">
      {/* Density toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleDensity}
        className="h-8 gap-1.5 text-xs"
        title={density === "compact" ? "Switch to comfortable" : "Switch to compact"}
      >
        {density === "compact" ? (
          <LayoutGrid className="h-3.5 w-3.5" />
        ) : (
          <AlignJustify className="h-3.5 w-3.5" />
        )}
        {density === "compact" ? "Comfortable" : "Compact"}
      </Button>

      {/* Column visibility */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3 max-h-80 overflow-y-auto">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Toggle Columns
            </p>
            {allColumns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary"
              >
                <Checkbox
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(!!v)}
                />
                <span className="truncate">
                  {typeof column.columnDef.header === "string"
                    ? column.columnDef.header
                    : column.id}
                </span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Reset */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onResetSettings}
        className="h-8 gap-1.5 text-xs text-muted-foreground"
        title="Reset column settings"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </Button>
    </div>
  );
}
