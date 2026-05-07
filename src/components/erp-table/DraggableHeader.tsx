import React, { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Header, flexRender } from "@tanstack/react-table";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface DraggableHeaderProps<T> {
  header: Header<T, unknown>;
  isSticky?: boolean;
  density: "compact" | "comfortable";
}

export function DraggableHeader<T>({ header, isSticky, density }: DraggableHeaderProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: header.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: header.getSize(),
    minWidth: header.column.columnDef.minSize ?? 60,
    position: isSticky ? "sticky" : "relative",
    left: isSticky ? 0 : undefined,
    zIndex: isSticky ? 15 : isDragging ? 10 : 1,
  };

  const onResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      header.getResizeHandler()(e);
    },
    [header]
  );

  return (
    <th
      ref={setNodeRef}
      data-column-id={header.column.id}
      style={{
        ...style,
        ...(((header.column.columnDef as any).meta as any)?.stickyRight
          ? { position: 'sticky', right: 0, zIndex: 21, background: '#000000' }
          : {}),
      }}
      className={cn(
        "erp-table-header text-left text-white font-bold text-[13px] uppercase tracking-wider select-none group bg-black",
        density === "compact" ? "px-3 py-2" : "px-5 py-4",
        isSticky && "erp-table-sticky-col-header"
      )}
    >
      <div className="flex items-center gap-1">
        <button
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-white/70" />
        </button>
        <span className="truncate" title={typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : ''}>
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </span>
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={onResize}
        onTouchStart={header.getResizeHandler()}
        className={cn(
          "erp-col-resize-handle",
          header.column.getIsResizing() && "resizing"
        )}
      />
    </th>
  );
}
