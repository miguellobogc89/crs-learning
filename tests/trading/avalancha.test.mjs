// AVALANCHA: cortos en caídas bruscas (regla pura que comparten el agente en vivo y el laboratorio).
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const A = load("lib/trading/kamikaze/avalancha.ts");

/** 25 velas de 1 h que van de `from` a `to` en línea recta, con mechas de ±0,3 %. */
const line = (from, to, n = 25) =>
  Array.from({ length: n }, (_, i) => {
    const c = from + ((to - from) * i) / (n - 1);
    return { h: c * 1.003, l: c * 0.997, c };
  });

test("avalancha: entra en una caída brusca de todo el mercado que sigue cayendo", () => {
  const bars = line(100, 92); // −8 % en 24 h, cada hora un mínimo nuevo
  const r = A.crashIdea(bars, -3);
  assert.ok(r);
  assert.equal(r.entry, 92);
  assert.ok(r.stop > r.entry && Math.abs(r.stop - r.entry - r.trail) < 1e-9);
  assert.ok(Math.abs(r.dropPct - 8) < 1e-9);
});

test("avalancha: no entra si Bitcoin no cae, si la caída es pequeña o exagerada, o si ya se frenó", () => {
  const bars = line(100, 92);
  assert.equal(A.crashIdea(bars, -1), null, "Bitcoin solo −1 %");
  assert.equal(A.crashIdea(bars, null), null, "sin dato de Bitcoin");
  assert.equal(A.crashIdea(line(100, 97), -3), null, "la moneda solo −3 %");
  assert.equal(A.crashIdea(line(100, 80), -3), null, "−20 %: demasiado tarde");
  // Cae un 8 % pero la última hora rebota por encima del mínimo del día: la caída se frenó.
  const stalled = line(100, 92);
  stalled[24] = { h: 93.5, l: 92.5, c: 93 };
  stalled[23] = { h: 92.3, l: 91, c: 91.5 };
  assert.equal(A.crashIdea(stalled, -3), null);
  assert.equal(A.crashIdea(bars.slice(1), -3), null, "faltan velas");
});
