import test from "node:test";
import assert from "node:assert/strict";
import { load, series } from "./helpers.mjs";

const { analyze, backtestSeries, statsByPattern } = load("lib/trading/backtest.ts");
const { zigzag } = load("lib/trading/pivots.ts");
const { sma, rsi, atr } = load("lib/trading/indicators.ts");

const find = (dets, pattern) => dets.filter((d) => d.pattern === pattern);

test("indicadores básicos", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const up = Array.from({ length: 30 }, (_, i) => 10 + i);
  assert.equal(rsi(up, 14)[29], 100);
  const c = series([[0, 100], [40, 100]], { noise: 0 });
  assert.ok(atr(c, 14)[39] < 0.01);
});

test("zigzag: alterna máximos y mínimos y no mira el futuro", () => {
  const c = series([[0, 100], [20, 130], [40, 105], [60, 140], [80, 110]]);
  const p = zigzag(c);
  assert.ok(p.length >= 3);
  for (let k = 1; k < p.length; k++) assert.notEqual(p[k].kind, p[k - 1].kind);
  for (const x of p) assert.ok(x.confirmedAt > x.i);
  // Analizar solo el principio da los mismos pivotes confirmados hasta ese punto.
  const early = zigzag(c.slice(0, 50));
  for (const x of early) assert.ok(p.some((y) => y.i === x.i && y.kind === x.kind));
});

test("hombro-cabeza-hombro bajista: se detecta y confirma al perder la clavicular", () => {
  const c = series([
    [0, 70], [30, 100], [42, 90], [58, 112], [72, 90], [86, 101], [105, 78], [130, 70],
  ]);
  const { detections } = analyze(c);
  const h = find(detections, "hch");
  assert.equal(h.length, 1, "una sola figura");
  const d = h[0];
  assert.equal(d.direction, "short");
  assert.equal(d.status, "confirmed");
  assert.ok(d.entry < 91 && d.entry > 84, `entrada cerca de la clavicular: ${d.entry}`);
  assert.ok(d.stop > 100, `stop por encima del hombro derecho: ${d.stop}`);
  assert.ok(Math.abs(d.target - (90 - 22)) < 4, `objetivo = clavicular − altura: ${d.target}`);
  assert.ok(d.rr > 1);
});

test("hombro-cabeza-hombro invertido alcista", () => {
  const c = series([
    [0, 130], [30, 100], [42, 110], [58, 88], [72, 110], [86, 99], [105, 122], [130, 130],
  ]);
  const d = find(analyze(c).detections, "hch_inv")[0];
  assert.ok(d, "detectado");
  assert.equal(d.direction, "long");
  assert.equal(d.status, "confirmed");
  assert.ok(d.target > d.entry && d.stop < d.entry);
});

test("doble suelo con objetivo igual a la altura", () => {
  const c = series([[0, 140], [30, 100], [50, 120], [70, 100.5], [95, 135], [110, 140]]);
  const d = find(analyze(c).detections, "double_bottom")[0];
  assert.ok(d, "detectado");
  assert.equal(d.status, "confirmed");
  assert.ok(Math.abs(d.target - 140) < 4, `objetivo ~ 140: ${d.target}`);
});

test("bandera alcista", () => {
  const c = series([[0, 100], [15, 102], [27, 125], [37, 118], [47, 135], [60, 140]], { noise: 0.003 });
  const d = find(analyze(c).detections, "flag_bull")[0];
  assert.ok(d, "detectada");
  assert.equal(d.status, "confirmed");
  assert.ok(d.stop < 120 && d.stop > 115);
});

test("triángulo ascendente: resistencia plana y mínimos crecientes", () => {
  const c = series([
    [0, 80], [20, 120], [35, 100], [50, 120], [62, 108], [74, 120], [82, 113], [95, 135], [110, 140],
  ]);
  const t = find(analyze(c).detections, "triangle_asc");
  assert.ok(t.length >= 1, "detectado");
  assert.ok(t.some((d) => d.status === "confirmed" && d.direction === "long"));
});

test("figura anulada si toca la invalidación antes de romper", () => {
  const c = series([
    [0, 70], [30, 100], [42, 90], [58, 112], [72, 90], [86, 101], [96, 95], [110, 108], [125, 120],
  ]);
  const h = find(analyze(c).detections, "hch");
  for (const d of h) assert.notEqual(d.status, "confirmed");
});

test("backtest: entra en la apertura siguiente y gana en una figura que funciona", () => {
  const c = series([
    [0, 70], [30, 100], [42, 90], [58, 112], [72, 90], [86, 101], [105, 60], [140, 55],
  ]);
  const trades = backtestSeries(c);
  const t = trades.find((x) => x.pattern === "hch");
  assert.ok(t, "hay operación");
  assert.equal(t.reason, "target");
  assert.ok(t.r > 1, `R positivo: ${t.r}`);
  const stats = statsByPattern(trades);
  assert.equal(stats.hch.trades, 1);
  assert.equal(stats.hch.winRate, 1);
});

test("serie aleatoria: el motor no falla y las R son coherentes", async () => {
  const { rng } = await import("./helpers.mjs");
  const r = rng(42);
  const pts = [[0, 50]];
  let p = 50;
  for (let i = 1; i <= 120; i++) {
    p = Math.max(5, p * (1 + (r() - 0.5) * 0.18));
    pts.push([i * 10, p]);
  }
  const c = series(pts, { noise: 0.01, seed: 3 });
  const trades = backtestSeries(c);
  for (const t of trades) {
    assert.ok(Number.isFinite(t.r));
    assert.ok(t.exitIndex >= t.entryIndex);
    if (t.reason === "stop") assert.ok(t.r < 0.2, `un stop no gana mucho: ${t.r}`);
  }
});
