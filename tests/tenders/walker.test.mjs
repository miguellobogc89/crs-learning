import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path) {
  const m = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(require, m, m.exports);
  return m.exports;
}
const { walkFeed } = load("lib/tenders/walker.ts");

// Feed de 6 páginas: p0 es la cabecera (lo más nuevo); cada página es un día más vieja.
const day = (n) => new Date(Date.UTC(2026, 10, 10 - n, 12));
function feed(count = 6) {
  const pages = {};
  for (let i = 0; i < count; i++) {
    const url = i === 0 ? "head" : `p${i}`;
    pages[url] = {
      tenders: [{ externalId: `t${i}`, updatedAt: day(i) }],
      deletedIds: [],
      nextUrl: i + 1 < count ? `p${i + 1}` : null,
      oldestUpdate: day(i),
    };
  }
  return pages;
}
function deps(pages, { budget = Infinity, backfillUntil = day(100) } = {}) {
  const visited = [];
  let left = budget;
  return {
    visited,
    deps: {
      feedUrl: "head",
      fetchPage: async (url) => {
        visited.push(url);
        left -= 1;
        return pages[url];
      },
      applyPage: async () => {},
      hasTime: () => left > 0,
      backfillUntil,
    },
  };
}
const empty = { headSeenAt: null, gapUrl: null, gapUntil: null, backfillUrl: null, backfillDone: false };

test("primera ejecución: lee la cabecera y hace la carga inicial hacia atrás", async () => {
  const { visited, deps: d } = deps(feed());
  const r = await walkFeed(empty, d);
  assert.deepEqual(visited, ["head", "p1", "p2", "p3", "p4", "p5"]);
  assert.equal(r.state.headSeenAt.getTime(), day(0).getTime());
  assert.equal(r.state.backfillDone, true);
});

test("la carga inicial se para en la fecha límite", async () => {
  const { visited, deps: d } = deps(feed(), { backfillUntil: day(2) });
  const r = await walkFeed(empty, d);
  assert.deepEqual(visited, ["head", "p1", "p2", "p3"]);
  assert.equal(r.state.backfillDone, true);
});

test("la carga inicial continúa en la siguiente ejecución si se acaba el tiempo", async () => {
  const pages = feed();
  const first = deps(pages, { budget: 3 });
  const r1 = await walkFeed(empty, first.deps);
  assert.deepEqual(first.visited, ["head", "p1", "p2"]);
  assert.equal(r1.state.backfillUrl, "p3");
  const second = deps(pages);
  const r2 = await walkFeed(r1.state, second.deps);
  // Vuelve a mirar la cabecera (sin novedades) y sigue la carga donde la dejó.
  assert.deepEqual(second.visited, ["head", "p3", "p4", "p5"]);
  assert.equal(r2.state.backfillDone, true);
});

test("las novedades se leen hasta llegar a lo ya visto", async () => {
  const pages = feed();
  const state = { ...empty, headSeenAt: day(2), backfillDone: true };
  const { visited, deps: d } = deps(pages);
  const r = await walkFeed(state, d);
  assert.deepEqual(visited, ["head", "p1", "p2"]);
  assert.equal(r.state.headSeenAt.getTime(), day(0).getTime());
  assert.equal(r.state.gapUrl, null);
});

test("si las novedades se cortan, queda un hueco que se termina después", async () => {
  const pages = feed();
  const state = { ...empty, headSeenAt: day(4), backfillDone: true };
  const first = deps(pages, { budget: 2 });
  const r1 = await walkFeed(state, first.deps);
  assert.deepEqual(first.visited, ["head", "p1"]);
  assert.equal(r1.state.gapUrl, "p2");
  assert.equal(r1.state.gapUntil.getTime(), day(4).getTime());
  assert.equal(r1.state.headSeenAt.getTime(), day(0).getTime());
  const second = deps(pages);
  const r2 = await walkFeed(r1.state, second.deps);
  assert.deepEqual(second.visited, ["p2", "p3", "p4", "head"]);
  assert.equal(r2.state.gapUrl, null);
});

test("con skipHead la carga inicial no gasta tiempo en releer la cabecera", async () => {
  const pages = feed();
  const state = { ...empty, headSeenAt: day(0), backfillUrl: "p2" };
  const { visited, deps: d } = deps(pages, { budget: 2 });
  const r = await walkFeed(state, { ...d, skipHead: true });
  assert.deepEqual(visited, ["p2", "p3"]);
  assert.equal(r.state.backfillUrl, "p4");
  assert.equal(r.reached.getTime(), day(3).getTime());
});

test("si una petición falla se conserva lo avanzado", async () => {
  const pages = feed();
  const state = { ...empty, headSeenAt: day(0), backfillUrl: "p1" };
  const { deps: d } = deps(pages);
  const failing = {
    ...d,
    skipHead: true,
    fetchPage: async (url) => {
      if (url === "p3") throw new Error("PLACSP respondió 503");
      return pages[url];
    },
  };
  const r = await walkFeed(state, failing);
  assert.equal(r.error, "PLACSP respondió 503");
  assert.equal(r.state.backfillUrl, "p3");
  assert.equal(r.pages, 2);
});
