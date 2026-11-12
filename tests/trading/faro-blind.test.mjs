import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { compareIdea, luckShare, snapshotAt, styleOfKind } = load("lib/trading/faro/blind.ts");
const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 1);
// Velas horarias con volumen suficiente; `f(i)` da el precio de la hora i.
const bars = (n, f) =>
  Array.from({ length: n }, (_, i) => {
    const o = f(i);
    const c = f(i + 1);
    return { t: t0 + i * H, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, qv: 5000 };
  });

test("FARO a ciegas: la idea que sube gana al azar y se mide con los mismos % de stop y objetivo", () => {
  const at = t0 + 80 * H + 10 * 60_000;
  const universe = [
    { pair: "AAAEUR", base: "AAA", bars: bars(120, (i) => (i < 81 ? 10 : 10 * 1.01 ** (i - 81))) }, // sube tras la idea
    { pair: "BBBEUR", base: "BBB", bars: bars(120, (i) => (i < 81 ? 20 : 20 * 0.99 ** (i - 81))) }, // baja
    { pair: "CCCEUR", base: "CCC", bars: bars(120, () => 5) }, // plana
  ];
  const idea = { pair: "AAAEUR", kind: "impulso", price: 10, invalidation: 9.5, target: 11, createdAt: at, validUntil: at + 24 * H };
  const c = compareIdea(idea, universe);
  assert.ok(c);
  assert.ok(c.faro > 9, `FARO ${c.faro}`); // toca el +10 % (menos costes)
  assert.equal(c.random.length, 3);
  assert.ok(c.faro > c.randomAvg);
  // BBB toca el stop del -5 %; la plana caduca en 0 menos costes.
  assert.ok(c.random.some((r) => r < -4));
  assert.ok(c.random.some((r) => Math.abs(r + 0.35) < 0.01));
});

test("FARO a ciegas: sin velas antes de la idea no hay foto, y el reparto de tipos es el del tablón", () => {
  assert.equal(snapshotAt("XEUR", "X", bars(10, () => 1), t0 + 5 * H), null);
  assert.equal(styleOfKind("rebote"), "rebotes");
  assert.equal(styleOfKind("noticia"), "rupturas");
  assert.equal(styleOfKind("impulso"), "impulso");
});

test("FARO a ciegas: el sorteo dice cuántas veces el azar iguala a FARO", () => {
  const good = Array.from({ length: 30 }, () => ({ faro: 5, randomAvg: 0, random: [-2, 0, 2], mechanical: null, mechanicalPair: null }));
  assert.equal(luckShare(good, 500), 0);
  const plain = Array.from({ length: 30 }, () => ({ faro: 0, randomAvg: 0, random: [-2, 0, 2], mechanical: null, mechanicalPair: null }));
  const s = luckShare(plain, 2000);
  assert.ok(s > 0.4 && s < 0.7, String(s));
});
