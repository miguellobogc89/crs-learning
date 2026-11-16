import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const C = load("lib/trading/carta.ts");
const V = [
  { id: "revolutx", name: "Revolut X", fees: { maker: 0, taker: 0.09 } },
  { id: "okx", name: "OKX", fees: { maker: 0.08, taker: 0.1 } },
  { id: "coinbase", name: "Coinbase", fees: { maker: 0.4, taker: 0.6 } },
];

test("carta: el exchange más barato según el tipo de orden; el ruido solo donde esperar es gratis", () => {
  const imp = C.bestVenue("impulso", V);
  assert.equal(imp.venue.id, "revolutx");
  assert.ok(Math.abs(imp.roundTripPct - 0.09) < 1e-9, "a mercado: compra taker y venta maker");
  assert.equal(C.bestVenue("retroceso", V).roundTripPct, 0, "limitada: maker en las dos");
  assert.equal(C.bestVenue("ruido", V.slice(1)), null, "sin un exchange a 0 % no hay ruido");
  assert.equal(C.minTargetPct(0.5), 2.5, "objetivo de al menos 5 veces la comisión");
});

test("carta: el plazo de una idea es el tiempo de entrar más el máximo de su tipo", () => {
  assert.equal(C.ideaValidHours("impulso", 12), 3);
  assert.equal(C.ideaValidHours("ruido", 8), 2 + 8);
  assert.equal(C.ideaValidHours("tendencia", 720), 720);
});

test("carta: tras reforzar, si salta el stop no se pierde más que al principio", () => {
  const o = { q1: 10, entry: 100, stop: 95, q2: 10, price: 103 };
  const s = C.refuerzoStop(o);
  const loss = o.q1 * (o.entry - s) + o.q2 * (o.price - s);
  assert.ok(Math.abs(loss - 50) < 1e-6, `pierde ${loss}`);
  assert.ok(s < o.price && s > o.stop);
  assert.ok(C.refuerzoStop({ ...o, price: 100.5 }) >= o.stop, "el stop nunca baja del primero");
});

test("carta: escáner de ruido — rango estrecho, sin tendencia y en su parte baja", () => {
  const flat = Array.from({ length: 24 }, (_, i) => ({ h: 102, l: 98, c: i % 2 ? 100.5 : 99.5 }));
  const r = C.noiseIdea(flat, 98.5);
  assert.ok(r && r.entry <= 98.5 && r.target > r.entry && r.invalidation < 98);
  assert.equal(C.noiseIdea(flat, 101.5), null, "en la parte alta, no");
  const trend = Array.from({ length: 24 }, (_, i) => ({ h: 98 + i * 0.2 + 0.5, l: 98 + i * 0.2 - 0.5, c: 98 + i * 0.2 }));
  assert.equal(C.noiseIdea(trend, 98), null, "con tendencia, no es ruido");
});
