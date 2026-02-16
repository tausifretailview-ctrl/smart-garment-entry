import { useState, useCallback, useEffect } from "react";

export type ERPTableDensity = "compact" | "comfortable";

export interface ERPTableSettings {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
  density: ERPTableDensity;
}

const STORAGE_PREFIX = "erp-table-";

function loadSettings(tableId: string): Partial<ERPTableSettings> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveSettings(tableId: string, settings: ERPTableSettings) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useERPTablePersistence(
  tableId: string,
  defaults: {
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
    density?: ERPTableDensity;
  }
) {
  const [settings, setSettings] = useState<ERPTableSettings>(() => {
    const saved = loadSettings(tableId);
    return {
      columnOrder: saved.columnOrder?.length ? saved.columnOrder : defaults.columnOrder,
      columnVisibility: saved.columnVisibility ?? defaults.columnVisibility,
      columnSizing: saved.columnSizing ?? {},
      density: saved.density ?? defaults.density ?? "comfortable",
    };
  });

  useEffect(() => {
    saveSettings(tableId, settings);
  }, [tableId, settings]);

  const updateColumnOrder = useCallback((order: string[]) => {
    setSettings((s) => ({ ...s, columnOrder: order }));
  }, []);

  const updateColumnVisibility = useCallback((vis: Record<string, boolean>) => {
    setSettings((s) => ({ ...s, columnVisibility: vis }));
  }, []);

  const updateColumnSizing = useCallback((sizing: Record<string, number>) => {
    setSettings((s) => ({ ...s, columnSizing: sizing }));
  }, []);

  const toggleDensity = useCallback(() => {
    setSettings((s) => ({
      ...s,
      density: s.density === "compact" ? "comfortable" : "compact",
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({
      columnOrder: defaults.columnOrder,
      columnVisibility: defaults.columnVisibility,
      columnSizing: {},
      density: defaults.density ?? "comfortable",
    });
  }, [defaults]);

  return {
    ...settings,
    updateColumnOrder,
    updateColumnVisibility,
    updateColumnSizing,
    toggleDensity,
    resetSettings,
  };
}
