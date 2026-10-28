"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Column } from "@/lib/analytics/compute";
import { DEFAULT_VIEW, type TableView } from "@/lib/analytics/table-view";
import { saveTableViewAction } from "@/app/(app)/analytics/actions";

/**
 * The view of the open table, shared by the settings button (in the page header) and the table itself. Each change
 * is applied at once and saved for this person shortly after, so next time the table opens the same way.
 */
type Ctx = { tableKey: string; columns: Column[]; view: TableView; update: (patch: Partial<TableView>) => void; reset: () => void; saving: boolean; error: string | null };
const TableViewContext = createContext<Ctx | null>(null);

export function TableViewProvider({ tableKey, columns, initial, children }: { tableKey: string; columns: Column[]; initial: TableView; children: ReactNode }) {
  const [view, setView] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Another table opened in the same layout: start from its own saved view.
  useEffect(() => { setView(initial); }, [tableKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next: TableView) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const r = await saveTableViewAction({ tableKey, view: next }).catch(() => ({ ok: false as const, error: "No se pudo guardar la vista." }));
      setSaving(false); setError(r.ok ? null : r.error);
    }, 400);
  }, [tableKey]);
  const update = useCallback((patch: Partial<TableView>) => setView(v => { const next = { ...v, ...patch }; persist(next); return next; }), [persist]);
  const reset = useCallback(() => { setView(DEFAULT_VIEW); persist(DEFAULT_VIEW); }, [persist]);

  return <TableViewContext.Provider value={{ tableKey, columns, view, update, reset, saving, error }}>{children}</TableViewContext.Provider>;
}

/** The shared view, or a local one when the table is used outside a provider (it is then not remembered). */
export function useTableView(columns: Column[]): Ctx {
  const shared = useContext(TableViewContext);
  const [view, setView] = useState(DEFAULT_VIEW);
  if (shared) return shared;
  return { tableKey: "", columns, view, saving: false, error: null,
    update: patch => setView(v => ({ ...v, ...patch })), reset: () => setView(DEFAULT_VIEW) };
}
export const useSharedTableView = () => useContext(TableViewContext);
