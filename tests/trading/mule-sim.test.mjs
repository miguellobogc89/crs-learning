// Simulación de «la mula»: objetivo/stop por vela, asegurar y dejar correr, y regla diaria.
import test from "node:test";
import assert from "node:assert/strict";
import { madridDayEnd, muleDays, runTrade } from "../../scripts/trading/mule-sim.mjs";

const bar = (t, o, h, l, c) => [t, o, h, l, c];

test("mula: objetivo, stop, conservador si una vela toca ambos, hueco y fin del día", () => {
  assert.deepEqual(runTrade([bar(1, 100, 100.5, 99.8, 100.2), bar(2, 100.2, 101.2, 100, 101)], 100, 1, 1).why, "objetivo");
  assert.equal(runTrade([bar(1, 100, 100.5, 98.9, 99)], 100, 1, 1).pct.toFixed(2), "-1.00");
  assert.equal(runTrade([bar(1, 100, 101.5, 98.5, 100)], 100, 1, 1).why, "stop", "ambos en la misma vela → stop");
  const gap = runTrade([bar(1, 100, 100, 99.5, 99.8), bar(2, 97, 97.5, 96.8, 97)], 100, 1, 1);
  assert.equal(gap.pct.toFixed(1), "-3.0", "hueco: sale a la apertura, peor que el stop");
  assert.equal(runTrade([bar(1, 100, 100.4, 99.6, 100.3)], 100, 1, 1).why, "fin del día");
});

test("mula: «asegura» sube el stop al +1 % y deja correr", () => {
  const run = runTrade([bar(1, 100, 101.1, 99.9, 101), bar(2, 101, 103, 101.2, 102.8), bar(3, 102.8, 103, 102, 102.5)], 100, 1, 1, "asegura");
  assert.equal(run.why, "asegurado");
  assert.equal(run.pct.toFixed(1), "2.5");
  const back = runTrade([bar(1, 100, 101.2, 99.9, 101), bar(2, 101, 101.1, 100.5, 100.6)], 100, 1, 1, "asegura");
  assert.equal(back.pct.toFixed(1), "1.0", "si vuelve, sale en +1 %");
});

test("mula: por día para al llegar a +1 % y no solapa operaciones", () => {
  const t = (day, at, net, exitAt) => ({ day, at, net, exitAt });
  const days = muleDays([t("d1", 1, -1, 5), t("d1", 3, 3, 6), t("d1", 6, 2.2, 8), t("d1", 9, 5, 10), t("d2", 1, -2.5, 2), t("d2", 3, 4, 4)], 1, 2);
  assert.equal(days[0].trades, 2, "salta la que se solapa y para tras superar +1 %");
  assert.ok(Math.abs(days[0].pct - ((0.99 * 1.022 - 1) * 100)) < 1e-9);
  assert.equal(days[1].trades, 1, "para al −2 %");
  assert.equal(madridDayEnd(Date.parse("2026-11-11T22:30:00Z")).day, "2026-11-11");
  assert.equal(madridDayEnd(Date.parse("2026-11-11T22:30:00Z")).end, Date.parse("2026-11-11T23:00:00Z"));
});
