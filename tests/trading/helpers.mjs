// Carga los módulos TypeScript de lib/trading resolviendo sus imports relativos.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();

export function load(path) {
  const full = resolve(path.endsWith(".ts") ? path : `${path}.ts`);
  if (cache.has(full)) return cache.get(full).exports;
  const m = { exports: {} };
  cache.set(full, m);
  const code = ts.transpileModule(readFileSync(full, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const req = (spec) => {
    if (spec.startsWith(".")) {
      const target = resolve(dirname(full), spec);
      if (existsSync(`${target}.ts`)) return load(`${target}.ts`);
      if (existsSync(`${target}/index.ts`)) return load(`${target}/index.ts`);
    }
    return nodeRequire(spec);
  };
  new Function("require", "module", "exports", code)(req, m, m.exports);
  return m.exports;
}

/** Generador pseudoaleatorio reproducible. */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Serie de velas que pasa por los puntos (sesión, precio) dados, con ruido pequeño.
 * `noise` es la amplitud relativa del ruido intradía.
 */
export function series(points, { noise = 0.004, seed = 7, volume = () => 1_000_000 } = {}) {
  const r = rng(seed);
  const out = [];
  const day = 86_400_000;
  const t0 = Date.UTC(2024, 0, 1);
  let prev = points[0][1];
  for (let k = 0; k < points.length - 1; k++) {
    const [i0, p0] = points[k];
    const [i1, p1] = points[k + 1];
    for (let i = i0; i < i1; i++) {
      const base = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
      const c = base * (1 + (r() - 0.5) * noise);
      const o = prev;
      const h = Math.max(o, c) * (1 + r() * noise);
      const l = Math.min(o, c) * (1 - r() * noise);
      out.push({ t: t0 + i * day, o, h, l, c, v: volume(i) });
      prev = c;
    }
  }
  return out;
}
