"use client";
// components/finance/api.ts
// Lecturas y escrituras de CRS Finance con el mismo búfer que Trading: lo último leído se pinta al instante
// (memoria + sessionStorage, que se borra al cerrar la pestaña) mientras llega lo nuevo.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const memory = new Map<string, unknown>();
const storeKey = (path: string) => `crs-finance:${path}`;
const MAX_STORED = 1_500_000;

export function peek<T>(path: string): T | null {
  if (memory.has(path)) return memory.get(path) as T;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storeKey(path));
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    memory.set(path, value);
    return value;
  } catch {
    return null;
  }
}

function remember(path: string, value: unknown) {
  memory.set(path, value);
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= MAX_STORED) window.sessionStorage.setItem(storeKey(path), raw);
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
}

export async function fapi<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/finance/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "No se pudo completar la operación");
  if (body === undefined) remember(path, data);
  return data as T;
}

export const REFRESH_EVENT = "finance:refresh";
export function refreshFinance() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Recarga cuando cualquier parte de la app avisa de cambios (sincronización, correcciones…). */
export function useFinanceRefresh(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(REFRESH_EVENT, h);
    return () => window.removeEventListener(REFRESH_EVENT, h);
  }, []);
}

/** Lee una ruta: arranca con lo último conocido y se actualiza al recibir cambios. */
export function useFinance<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useLayoutEffect(() => {
    if (!path) return;
    const cached = peek<T>(path);
    setData(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- al cambiar de ruta
  }, [path]);
  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    fapi<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(() => load(), [load]);
  useFinanceRefresh(load);
  return { data, error, loading, reload: load, setData };
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "No se pudo completar la operación");

/** Fecha corta: «17 nov». */
export const shortDay = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)).replace(".", "") : "—";

/** Fecha con año: «17 nov 2026». */
export const longDay = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)).replace(".", "") : "—";
