// Análisis del rendimiento de FARO a partir de ideas ya resueltas.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { analyze, targetScan, weekOf } = load("lib/trading/faro/analysis.ts");
const { ideaFeatures } = load("lib/trading/faro/logic.ts");

const T0 = Date.UTC(2026, 10, 9, 10); // lunes 9/11/2026, 11:00 en Madrid
const H = 3_600_000;
let k = 0;
const idea = (o) => ({ id: `i${++k}`, createdAt: T0 + k * H, resolvedAt: T0 + k * H + H, kind: "impulso", conviction: 3, rewardPct: 6, riskPct: 3, bestPct: 0, worstPct: 0, features: null, ...o });

test("faro análisis: totales, curva de 100 € por idea, factor de beneficio y caída máxima", () => {
  const list = [
    idea({ status: "acierto", resultPct: 5.65, bestPct: 6 }),
    idea({ status: "fallo", resultPct: -3.35, bestPct: 1, worstPct: -3 }),
    idea({ status: "fallo", resultPct: -3.35, bestPct: 4, worstPct: -3 }),
    idea({ status: "caducada", resultPct: 0.65, bestPct: 2 }),
  ];
  const a = analyze(list);
  assert.equal(a.n, 4);
  assert.deepEqual(a.statusCounts, { acierto: 1, fallo: 2, caducada: 1 });
  assert.equal(a.total.hitRate, 25);
  assert.equal(a.total.avgPct, -0.1);
  assert.deepEqual(a.equity.map((p) => p.eur), [5.65, 2.3, -1.05, -0.4]);
  assert.equal(a.maxDrawdownEur, -6.7);
  assert.equal(a.profitFactor, round((5.65 + 0.65) / 6.7));
  assert.deepEqual(a.management, { fails: 2, nearMiss: 1, wentUp2: 1, straightDown: 0 }, "una de las fallidas llegó a +4 % (más de la mitad del camino a +6 %)");
});
const round = (x) => Math.round(x * 100) / 100;

test("faro análisis: objetivo fijo más corto — las que llegaron a subir k habrían acertado ahí", () => {
  const list = [
    idea({ status: "fallo", resultPct: -3.35, bestPct: 2.5, rewardPct: 8 }),
    idea({ status: "fallo", resultPct: -3.35, bestPct: 0.2, rewardPct: 8 }),
    idea({ status: "acierto", resultPct: 7.65, bestPct: 8, rewardPct: 8 }),
  ];
  const s = targetScan(list, [2, 10]);
  const two = s.levels[0];
  assert.equal(two.hitRate, 66.7, "con +2 %: la primera y la tercera");
  assert.equal(two.avgPct, round((2 - 0.35 - 3.35 + 2 - 0.35) / 3));
  const ten = s.levels[1];
  assert.equal(ten.avgPct, s.currentAvgPct, "con un objetivo más lejos que el suyo, cada idea queda como fue");
});

test("faro análisis: por tipo, convicción, semana, franja horaria y fase (solo las que tienen contexto)", () => {
  const list = [
    idea({ status: "acierto", resultPct: 4, kind: "ruptura", conviction: 5, features: { phase: "ataque" } }),
    idea({ status: "fallo", resultPct: -3, kind: "ruptura", conviction: 2, features: { phase: "defensa" } }),
    idea({ status: "fallo", resultPct: -3, kind: "rebote", conviction: 2 }),
  ];
  const a = analyze(list, { rollingWindow: 2 });
  assert.deepEqual(a.byKind.map((b) => [b.key, b.n, b.hits]), [["ruptura", 2, 1], ["rebote", 1, 0]]);
  assert.deepEqual(a.byConviction.map((b) => [b.key, b.n]), [["2", 2], ["5", 1]]);
  assert.deepEqual(a.byPhase.map((b) => [b.key, b.n]), [["ataque", 1], ["defensa", 1]]);
  assert.equal(a.withFeatures, 2);
  assert.equal(a.weekly.length, 1);
  assert.equal(a.weekly[0].week, "2026-11-09");
  assert.equal(a.rolling.length, 0, "ventanas de 5 como mínimo: con 3 ideas no hay media móvil");
  assert.equal(weekOf(Date.UTC(2026, 10, 15, 23)), "2026-11-09", "el domingo es de la semana del lunes anterior");
});

test("faro: contexto guardado con cada idea (riesgo, recorrido, hora de Madrid, fase)", () => {
  const m = { ch1h: 1.234, ch4h: 3, ch24h: 12.345, fromHigh3d: -2, fromLow3d: 30, volSurge: 2.5, volume24h: 123456.7 };
  const f = ideaFeatures(m, ["impulso"], { price: 100, invalidation: 95, target: 110, validHours: 6 }, { now: Date.UTC(2026, 10, 14, 15, 30), phase: { mode: "ataque", days: 12 }, btc24h: -1.234, news: 2 });
  assert.equal(f.riskPct, 5);
  assert.equal(f.rewardPct, 10);
  assert.equal(f.hour, 16, "15:30 UTC son las 16:30 en Madrid en noviembre");
  assert.equal(f.weekday, 6);
  assert.equal(f.ch1h, 1.23);
  assert.equal(f.volume24hEur, 123457);
  assert.equal(f.phase, "ataque");
  assert.equal(f.btc24h, -1.23);
});

test("FARO-2: descarta rebotes, subidas perseguidas, impulsos en máximos, Bitcoin cayendo, defensa y poco recorrido", () => {
  const { faro2Verdict } = load("lib/trading/faro/logic.ts");
  const base = { styles: [], ch1h: 0.5, ch4h: 1, ch24h: 5, fromHigh3d: -4, fromLow3d: 10, volSurge: 1.5, volume24hEur: 100000, riskPct: 3, rewardPct: 6, validHours: 6, hour: 10, weekday: 2, phase: "ataque", phaseDays: 5, btc24h: 0.5, news: 0 };
  assert.deepEqual(faro2Verdict("impulso", base), { pass: true, reasons: [] });
  assert.equal(faro2Verdict("impulso", null), null, "sin contexto no opina");
  const why = (kind, over) => faro2Verdict(kind, { ...base, ...over }).reasons;
  assert.match(why("rebote", {})[0], /rebotes/);
  assert.match(why("ruptura", { ch24h: 20 })[0], /\+20,0 % en 24 h/);
  assert.match(why("ruptura", { ch1h: 6 })[0], /última hora/);
  assert.match(why("impulso", { fromHigh3d: -0.3 })[0], /máximo/);
  assert.deepEqual(why("ruptura", { fromHigh3d: -0.3 }), [], "una ruptura en máximos es lo normal");
  assert.match(why("noticia", { btc24h: -3.5 })[0], /Bitcoin cae/);
  assert.match(why("noticia", { phase: "defensa" })[0], /defensa/);
  assert.match(why("noticia", { riskPct: 4, rewardPct: 5 })[0], /objetivo corto/);
  assert.equal(faro2Verdict("noticia", { ...base, btc24h: null, phase: null }).pass, true, "lo que no se sabe no descarta");
});

test("faro: métricas de un momento pasado a partir de las velas anteriores", () => {
  const { pastTicker } = load("lib/trading/faro/logic.ts");
  const bars = Array.from({ length: 30 }, (_, i) => ({ h: 11 + i, l: 9 + i, c: 10 + i, qv: 100 }));
  const t = pastTicker("SOLEUR", "SOL", 44, bars);
  assert.equal(t.ch24h, ((44 - 15) / 15) * 100, "cierre de hace 25 velas = 15");
  assert.equal(t.volume24h, 2400);
  assert.equal(t.high24h, 40);
  assert.equal(t.low24h, 15);
});

test("faro: ideas de control — misma cantidad, monedas al azar sin repetir y el mismo riesgo/recorrido", () => {
  const { controlIdeas } = load("lib/trading/faro/logic.ts");
  const cands = [{ pair: "AEUR", price: 10 }, { pair: "BEUR", price: 200 }, { pair: "CEUR", price: 1 }];
  const ideas = [
    { price: 50, invalidation: 47.5, target: 55, validHours: 6 },
    { price: 4, invalidation: 3.8, target: 4.6, validHours: 12 },
  ];
  const seq = [0.99, 0];
  const out = controlIdeas(cands, ideas, () => seq.shift());
  assert.deepEqual(out.map((o) => o.pair), ["CEUR", "AEUR"]);
  assert.ok(Math.abs(out[0].invalidation - 0.95) < 1e-9 && Math.abs(out[0].target - 1.1) < 1e-9, "−5 % / +10 % como la primera idea");
  assert.ok(Math.abs(out[1].invalidation - 9.5) < 1e-9 && Math.abs(out[1].target - 11.5) < 1e-9);
  assert.equal(out[1].validHours, 12);
  assert.equal(controlIdeas(cands.slice(0, 1), ideas).length, 1, "no más que candidatas");
});
