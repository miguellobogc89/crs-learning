// lib/tenders/walker.ts
// Recorre el feed paginado de PLACSP (de lo más nuevo a lo más viejo) sin perder páginas
// aunque cada ejecución tenga un tiempo limitado. Sin base de datos: el estado entra y sale.
import type { ParsedFeedPage } from "./placsp";

export type WalkState = {
  /** Fecha de la actualización más reciente que ya tenemos leída. */
  headSeenAt: Date | null;
  /** Si una lectura de cabecera se cortó: desde dónde seguir y hasta qué fecha bajar. */
  gapUrl: string | null;
  gapUntil: Date | null;
  /** Carga inicial hacia atrás. */
  backfillUrl: string | null;
  backfillDone: boolean;
};

export type WalkDeps = {
  feedUrl: string;
  fetchPage: (url: string) => Promise<ParsedFeedPage>;
  applyPage: (page: ParsedFeedPage) => Promise<void>;
  /** Devuelve true mientras quede tiempo para pedir otra página. */
  hasTime: () => boolean;
  /** Hasta qué fecha bajar en la carga inicial. */
  backfillUntil: Date;
  /** No volver a leer la cabecera (se leyó hace poco y hay trabajo pendiente más atrás). */
  skipHead?: boolean;
};

export type WalkResult = {
  state: WalkState;
  pages: number;
  tenders: number;
  /** Fecha más antigua alcanzada en esta ejecución por la carga inicial. */
  reached: Date | null;
  /** Si una petición falla, se devuelve lo avanzado hasta ese momento y el motivo. */
  error: string | null;
};

function newest(page: ParsedFeedPage): Date | null {
  return page.tenders.reduce<Date | null>(
    (max, t) => (t.updatedAt && (!max || t.updatedAt > max) ? t.updatedAt : max),
    null,
  );
}
function reached(page: ParsedFeedPage, until: Date | null) {
  return !!until && !!page.oldestUpdate && page.oldestUpdate.getTime() <= until.getTime();
}

export async function walkFeed(initial: WalkState, deps: WalkDeps): Promise<WalkResult> {
  const state: WalkState = { ...initial };
  let pages = 0;
  let tenders = 0;
  let reachedAt: Date | null = null;
  const read = async (url: string) => {
    const page = await deps.fetchPage(url);
    await deps.applyPage(page);
    pages += 1;
    tenders += page.tenders.length;
    return page;
  };

  let error: string | null = null;
  try {
    // 1. Terminar primero un hueco pendiente de una lectura de cabecera cortada.
    while (state.gapUrl && deps.hasTime()) {
      const page = await read(state.gapUrl);
      if (reached(page, state.gapUntil) || !page.nextUrl) {
        state.gapUrl = null;
        state.gapUntil = null;
      } else state.gapUrl = page.nextUrl;
    }

    // 2. Novedades desde la cabecera del feed (solo si no queda hueco pendiente).
    if (!state.gapUrl && (!deps.skipHead || !state.headSeenAt) && deps.hasTime()) {
      const previous = state.headSeenAt;
      const first = await read(deps.feedUrl);
      state.headSeenAt = newest(first) ?? previous;
      if (!previous) {
        // Primera vez: la cabecera es la primera página y el resto lo hace la carga inicial.
        state.backfillUrl = first.nextUrl;
        state.backfillDone = !first.nextUrl;
      } else {
        let page = first;
        while (!reached(page, previous) && page.nextUrl) {
          if (!deps.hasTime()) {
            state.gapUrl = page.nextUrl;
            state.gapUntil = previous;
            break;
          }
          page = await read(page.nextUrl);
        }
      }
    }

    // 3. Carga inicial hacia atrás con el tiempo que sobre.
    while (!state.backfillDone && state.backfillUrl && deps.hasTime()) {
      const page = await read(state.backfillUrl);
      if (page.oldestUpdate) reachedAt = page.oldestUpdate;
      const tooOld =
        !!page.oldestUpdate && page.oldestUpdate.getTime() < deps.backfillUntil.getTime();
      if (tooOld || !page.nextUrl) {
        state.backfillDone = true;
        state.backfillUrl = null;
      } else state.backfillUrl = page.nextUrl;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return { state, pages, tenders, reached: reachedAt, error };
}
