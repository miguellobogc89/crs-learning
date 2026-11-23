// Panorama del mercado: cálculos de Bitcoin, zonas y frases del resumen.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { btcPulse, rsiZone, fearGreedZone, fundingZone, dollarZone, volumeZone, pulseReads, pulseSnapshot } = load("lib/trading/pulse/logic.ts");
const DAY = 86_400_000;
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ t: i * DAY, c: f(i), v: 10 }));

test("pulse: Bitcoin subiendo de forma constante → por encima de su media de 200, RSI alto, cambios positivos", () => {
  const b = btcPulse(series(250, (i) => 100 + i), { price: 351, open24h: 349, volume24hEur: 3490 * 2 });
  assert.ok(b.vsMa200Pct > 0);
  assert.ok(b.rsi14 > 70);
  assert.ok(b.ch7d > 0 && b.ch30d > 0);
  assert.equal(b.ch24h, 0.57);
  assert.ok(b.volRatio > 1.5, "el doble de volumen que la media");
  assert.ok(b.history.length <= 180 && b.history.at(-1).c === 351);
});

test("pulse: con menos de 200 días no hay media de 200 (ni lectura de tendencia)", () => {
  const b = btcPulse(series(60, () => 100), { price: 100, open24h: null, volume24hEur: null });
  assert.equal(b.ma200, null);
  assert.equal(b.vsMa200Pct, null);
  assert.equal(b.volRatio, null);
  assert.ok(!pulseReads({ btc: b, fearGreed: null, funding: null, dollar: null, btc24hLimit: -2 }).some((r) => r.key === "trend"));
});

test("pulse: zonas con sus cortes", () => {
  assert.equal(rsiZone(25).label, "Sobrevendido");
  assert.equal(rsiZone(50).label, "Normal");
  assert.equal(rsiZone(75).label, "Sobrecomprado");
  assert.deepEqual([10, 30, 50, 60, 90].map((v) => fearGreedZone(v).label), ["Miedo extremo", "Miedo", "Neutral", "Codicia", "Codicia extrema"]);
  assert.equal(fundingZone(0.01).label, "Normal");
  assert.equal(fundingZone(0.05).label, "Muy alcistas");
  assert.equal(fundingZone(-0.01).label, "Bajistas");
  assert.equal(dollarZone(3).label, "Dólar fuerte");
  assert.equal(volumeZone(0.5).label, "Poca actividad");
});

test("pulse: el resumen avisa de la pausa de FARO-2 primero y nunca dice «compra»", () => {
  const btc = { price: 90, ch24h: -3.2, ch7d: -8, ch30d: -15, rsi14: 24, ma200: 100, vsMa200Pct: -10, volRatio: 1, volume24hEur: 1, history: [], rsiHistory: [] };
  const reads = pulseReads({ btc, fearGreed: { value: 15, label: "", yesterday: null, weekAgo: null, monthAgo: null, history: [] }, funding: { ratePct: -0.01, source: "x", history: [] }, dollar: { value: 105, ch30d: 2.5, history: [] }, btc24hLimit: -2 });
  assert.deepEqual(reads.map((r) => r.key), ["faro2", "trend", "fg", "rsi", "funding", "dollar"]);
  assert.ok(reads[0].text.includes("−3,2") || reads[0].text.includes("-3,2"));
  assert.ok(reads.every((r) => !/\bcompra\b|\bvende\b/i.test(r.text)));
});

test("pulse: la foto diaria guarda solo valores, sin series", () => {
  const s = pulseSnapshot({ btc: null, fearGreed: { value: 40, label: "", yesterday: null, weekAgo: null, monthAgo: null, history: [{ t: 1, v: 2 }] }, global: null, funding: null, dollar: null });
  assert.equal(s.fearGreed, 40);
  assert.ok(!JSON.stringify(s).includes("history"));
});
