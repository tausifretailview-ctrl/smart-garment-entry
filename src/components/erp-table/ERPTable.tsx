import React, { useMemo, useCallback, Fragment } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  ColumnOrderState,
  VisibilityState,
  ColumnSizingState,
} from "@tanstack/react-table";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";
import { DraggableHeader } from "./DraggableHeader";
import { ERPTableToolbar } from "./ERPTableToolbar";
import { useERPTablePersistence, ERPTableDensity } from "./useERPTablePersistence";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface ERPTableProps<T> {
  tableId: string;
  columns: ColumnDef<T, any>[];
  data: T[];
  stickyFirstColumn?: boolean;
  footerRow?: React.ReactNode;
  defaultColumnVisibility?: Record<string, boolean>;
  defaultDensity?: ERPTableDensity;
  onRowClick?: (row: T) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  showToolbar?: boolean;
  className?: string;
  /** Renders expandable content below a row */
  renderSubRow?: (row: T) => React.ReactNode;
  /** Externally controlled expanded state */
  expandedRows?: Set<string>;
  /** Callback when expand toggled */
  onToggleExpand?: (id: string) => void;
  /** Extract unique ID from row data */
  getRowId?: (row: T) => string;
  /** Optional className for each row based on row data */
  getRowClassName?: (row: T) => string;
  /** Render prop that receives toolbar element for custom placement */
  renderToolbar?: (toolbar: React.ReactNode) => React.ReactNode;
}

export function ERPTable<T>({
  tableId,
  columns,
  data,
  stickyFirstColumn = true,
  footerRow,
  defaultColumnVisibility,
  defaultDensity = "compact",
  onRowClick,
  onRowContextMenu,
  isLoading = false,
  emptyMessage = "No data found",
  showToolbar = true,
  className,
  renderSubRow,
  expandedRows,
  onToggleExpand,
  getRowId,
  getRowClassName,
  renderToolbar,
}: ERPTableProps<T>) {
  const defaultColIds = useMemo(() => columns.map((c) => (c as any).accessorKey ?? (c as any).id ?? ""), [columns]);

  const persistence = useERPTablePersistence(tableId, {
    columnOrder: defaultColIds,
    columnVisibility: defaultColumnVisibility ?? {},
    density: defaultDensity,
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      columnOrder: persistence.columnOrder as ColumnOrderState,
      columnVisibility: persistence.columnVisibility as VisibilityState,
      columnSizing: persistence.columnSizing as ColumnSizingState,
    },
    onColumnOrderChange: (updater) => {
      const newOrder = typeof updater === "function" ? updater(persistence.columnOrder) : updater;
      persistence.updateColumnOrder(newOrder);
    },
    onColumnVisibilityChange: (updater) => {
      const newVis = typeof updater === "function" ? updater(persistence.columnVisibility) : updater;
      persistence.updateColumnVisibility(newVis as Record<string, boolean>);
    },
    onColumnSizingChange: (updater) => {
      const newSizing = typeof updater === "function" ? updater(persistence.columnSizing) : updater;
      persistence.updateColumnSizing(newSizing as Record<string, number>);
    },
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldOrder = persistence.columnOrder;
        const oldIndex = oldOrder.indexOf(active.id as string);
        const newIndex = oldOrder.indexOf(over.id as string);
        if (oldIndex !== -1 && newIndex !== -1) {
          persistence.updateColumnOrder(arrayMove(oldOrder, oldIndex, newIndex));
        }
      }
    },
    [persistence]
  );

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const headerIds = useMemo(
    () => headerGroups[0]?.headers.map((h) => h.id) ?? [],
    [headerGroups]
  );

  const visibleColumnCount = headerIds.length;
  const rowHeight = persistence.density === "compact" ? "h-10" : "h-14";
  const hasSubRows = !!renderSubRow;

  const toolbarElement = (
    <ERPTableToolbar
      table={table}
      density={persistence.density}
      onToggleDensity={persistence.toggleDensity}
      onResetSettings={persistence.resetSettings}
    />
  );

  return (
    <div className={cn("space-y-0", className)}>
      {renderToolbar ? renderToolbar(toolbarElement) : showToolbar && <div className="mb-2">{toolbarElement}</div>}

      <div className="border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            
          >
            <table className="w-full erp-desktop-table erp-resizable-table" style={{ tableLayout: "auto", width: "max-content", minWidth: "100%" }}>
              <thead className="sticky top-0 z-20 bg-black text-white">
                {headerGroups.map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    <SortableContext
                      items={headerIds}
                      strategy={horizontalListSortingStrategy}
                    >
                      {headerGroup.headers.map((header, idx) => (
                        <DraggableHeader
                          key={header.id}
                          header={header}
                          isSticky={stickyFirstColumn && idx === 0}
                          density={persistence.density}
                        />
                      ))}
                    </SortableContext>
                  </tr>
                ))}
              </thead>

              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skel-${i}`} className={rowHeight}>
                      {headerIds.map((id) => (
                        <td key={id} className="px-5 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                       colSpan={visibleColumnCount}
                       className="text-center py-12 text-muted-foreground text-[16px]"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const rowId = getRowId ? getRowId(row.original) : row.id;
                    const isExpanded = hasSubRows && expandedRows?.has(rowId);

                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={cn(
                            rowHeight,
                            "border-b border-muted/80 hover:bg-primary/5 transition-colors",
                            onRowClick && "cursor-pointer",
                            hasSubRows && "cursor-pointer",
                            getRowClassName?.(row.original)
                          )}
                          onClick={() => {
                            if (hasSubRows && onToggleExpand) {
                              onToggleExpand(rowId);
                            }
                            onRowClick?.(row.original);
                          }}
                          onContextMenu={(e) => onRowContextMenu?.(e, row.original)}
                        >
                          {row.getVisibleCells().map((cell, idx) => (
                            <td
                              key={cell.id}
                              data-column-id={cell.column.id}
                              style={{
                                width: cell.column.getSize(),
                                minWidth: cell.column.columnDef.minSize ?? 60,
                                ...(((cell.column.columnDef as any).meta as any)?.stickyRight
                                  ? { position: 'sticky', right: 0, zIndex: 5 }
                                  : {}),
                              }}
                               className={cn(
                                 "text-[16px] border-b border-muted/80",
                                persistence.density === "compact" ? "px-3 py-1.5" : "px-5 py-4",
                                stickyFirstColumn && idx === 0 && "erp-table-sticky-col bg-card",
                                ((cell.column.columnDef as any).meta as any)?.stickyRight && "bg-card shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]"
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                        {isExpanded && renderSubRow && (
                          <tr>
                            <td colSpan={visibleColumnCount} className="bg-muted/20 p-0">
                              {renderSubRow(row.original)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>

              {footerRow && (
                <tfoot className="sticky bottom-0 z-10 bg-card border-t-2 border-border font-semibold">
                  {footerRow}
                </tfoot>
              )}
            </table>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
