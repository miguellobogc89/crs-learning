// lib/trading/health.ts
// Qué está roto ahora mismo en Trading (17/11/2026). Puro: recibe lo que se sabe y devuelve los problemas
// abiertos; el servicio de avisos (notifications.ts) los convierte en notificaciones, sin repetirlas.

export type Problem = { key: string; level: "error" | "aviso"; title: string; body: string; href?: string };

export type HealthInput = {
  now: number;
  /** Último análisis de FARO terminado bien (cripto). */
  lastFaroAt: number | null;
  /** Última revisión de los agentes. */
  lastTickAt: number | null;
  /** Exchanges conectados que no responden. */
  brokers: { provider: string; name: string; error: string | null }[];
  ai: { calls: number; limit: number };
  /** Copias con dinero real que necesitan que hagas algo. */
  mirrorErrors: { id: string; agent: string; symbol: string; note: string | null }[];
};

/** FARO analiza cada 30 min: más de una hora sin hacerlo es que algo falla. */
export const FARO_STALE_MIN = 65;
/** La revisión es cada 5 min: más de 20 sin ella es que el cron no corre. */
export const TICK_STALE_MIN = 20;

const minutesAgo = (now: number, t: number) => Math.round((now - t) / 60_000);
const ago = (min: number) => (min < 120 ? `${min} minutos` : `${Math.round(min / 60)} horas`);

export function healthProblems(i: HealthInput): Problem[] {
  const out: Problem[] = [];
  if (i.lastTickAt === null || minutesAgo(i.now, i.lastTickAt) > TICK_STALE_MIN) {
    const m = i.lastTickAt === null ? null : minutesAgo(i.now, i.lastTickAt);
    out.push({
      key: "revision-parada",
      level: "error",
      title: "Los agentes no se están revisando",
      body: m === null ? "No hay constancia de ninguna revisión." : `La última revisión fue hace ${ago(m)}. Mientras tanto nadie vigila stops ni objetivos.`,
    });
  }
  if (i.lastFaroAt === null || minutesAgo(i.now, i.lastFaroAt) > FARO_STALE_MIN) {
    const m = i.lastFaroAt === null ? null : minutesAgo(i.now, i.lastFaroAt);
    out.push({
      key: "faro-parado",
      level: "error",
      title: "FARO no está analizando",
      body: m === null ? "No hay ningún análisis terminado." : `Su último análisis fue hace ${ago(m)}: no salen oportunidades nuevas.`,
      href: "/trading/oportunidades",
    });
  }
  for (const b of i.brokers.filter((x) => x.error)) {
    out.push({
      key: `exchange:${b.provider}`,
      level: "aviso",
      title: `${b.name} no responde`,
      body: b.error ?? "No se pudo leer la cuenta.",
      href: "/trading/integraciones",
    });
  }
  if (i.ai.calls >= i.ai.limit) {
    out.push({
      key: "ia-limite",
      level: "aviso",
      title: "Límite diario de IA alcanzado",
      body: `Se han hecho ${i.ai.calls} llamadas hoy (el tope es ${i.ai.limit}). FARO no propondrá ideas nuevas hasta mañana.`,
    });
  }
  for (const m of i.mirrorErrors) {
    out.push({
      key: `copia:${m.id}`,
      level: "error",
      title: `Copia de ${m.agent}: ${m.symbol.replace(/-EUR$/, "")} necesita que la revises`,
      body: m.note ?? "La orden en tu exchange no se pudo completar.",
      href: "/trading/cartera",
    });
  }
  return out;
}
