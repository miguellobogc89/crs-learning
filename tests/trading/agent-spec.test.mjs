// Ficha estándar de los agentes y agente de referencia (DCA).
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { kamikazeSpec, chipSpec } = load("lib/trading/agents/spec.ts");
const { KAMIKAZES, kamikazeByKey } = load("lib/trading/kamikaze/roster.ts");
const { CHIP_AGENTS } = load("lib/trading/chip/roster.ts");
const { chooseIdea } = load("lib/trading/faro/logic.ts");

test("ficha: todos los agentes en activo tienen las mismas cuatro líneas, 1.000 € y ninguno decide con IA", () => {
  const specs = [...KAMIKAZES.map(kamikazeSpec), ...CHIP_AGENTS.map(chipSpec)];
  assert.deepEqual(specs.map((s) => s.style), ["Impulso", "Rupturas", "Selectivo", "Fase", "Fase"]);
  assert.match(chipSpec(CHIP_AGENTS[1]).ideas, /EE\. UU\./);
  for (const s of specs) for (const k of ["ideas", "when", "size", "exit"]) assert.ok(s[k].length > 10, `${s.style}: ${k}`);
  assert.ok([...KAMIKAZES, ...CHIP_AGENTS].every((a) => a.capital === 1000));
  assert.deepEqual(KAMIKAZES.map((k) => k.name), ["COHETE", "MECHA", "VÉRTIGO"]);
});

test("VÉRTIGO: sin número, sin IA y solo ideas de convicción 4 o más", () => {
  const v = kamikazeByKey("vertigo-faro");
  assert.equal(v.name, "VÉRTIGO");
  const idea = (id, kind, conviction) => ({ id, kind, conviction, pair: "AEUR", price: 1, invalidation: 0.9, target: 1.3, validUntil: 2e12, createdAt: 1 });
  const ideas = [idea("a", "impulso", 5), idea("b", "ruptura", 3)];
  const r = chooseIdea("selectivo", ideas, () => 1, 1e12, new Set(), { minConviction: 4 });
  assert.equal(r.pick.idea.id, "a");
  const none = chooseIdea("selectivo", [idea("b", "ruptura", 3)], () => 1, 1e12, new Set(), { minConviction: 4 });
  assert.match(none.reason, /convicción alta/);
});


const { btcReferences } = load("lib/trading/agents/references.ts");
test("referencias: Bitcoin guardado y Bitcoin cada día desde que empezaron los agentes", () => {
  const D = 86_400_000;
  const candles = [100, 50, 100].map((c, i) => ({ t: i * D, c }));
  const [hold, dca] = btcReferences(candles, 0);
  assert.equal(hold.returnPct, 0, "de 100 a 100");
  // Comprar 1 € a 100, 50 y 100 → 0,01 + 0,02 + 0,01 = 0,04 BTC × 100 = 4 € por 3 € invertidos → +33,3 %.
  assert.ok(Math.abs(dca.returnPct - 33.333) < 0.01);
  assert.equal(btcReferences(candles, 5 * D)[0].returnPct, null, "sin días desde el inicio, sin dato");
});

const { toEur, lotStepOf } = load("lib/trading/market-data.ts");
const { usSessionInProgress, marketOpenNow } = load("lib/trading/live-logic.ts");
test("EE. UU.: velas en euros con el cambio de cada día, fracciones y horario de Nueva York", () => {
  const D = 86_400_000;
  const usd = [{ t: 2 * D, o: 110, h: 120, l: 100, c: 110, v: 1 }, { t: 4 * D, o: 120, h: 120, l: 120, c: 120, v: 1 }];
  const fx = [{ t: 1 * D, c: 1.1 }, { t: 3 * D, c: 1.2 }];
  const eur = toEur(usd, fx);
  assert.ok(Math.abs(eur[0].c - 100) < 1e-9, "día 2 usa el cambio del día 1");
  assert.ok(Math.abs(eur[1].c - 100) < 1e-9, "día 4 usa el cambio del día 3");
  assert.equal(lotStepOf("US"), 0.0001);
  // 16:00 en Madrid = 10:00 en Nueva York (noviembre): sesión abierta y vela del día sin cerrar.
  const now = new Date("2026-11-16T15:00:00Z");
  assert.equal(marketOpenNow("us", now), true);
  assert.equal(usSessionInProgress(Date.parse("2026-11-16T00:00:00Z"), now), true);
  assert.equal(marketOpenNow("us", new Date("2026-11-15T15:00:00Z")), false, "domingo");
  assert.equal(usSessionInProgress(Date.parse("2026-11-16T00:00:00Z"), new Date("2026-11-16T22:00:00Z")), false, "a las 17:00 de NY ya cerró");
});

const { breakoutOn, contextAt } = load("lib/trading/lab/strategies.ts");
test("ATLAS: detector sobre QQQ; nunca compra las referencias", () => {
  const D = 86_400_000;
  const up = (n, k) => Array.from({ length: n }, (_, i) => ({ t: i * D, o: 100 + i * k, h: 100 + i * k, l: 100 + i * k, c: 100 + i * k, v: 1 }));
  const coins = [{ symbol: "QQQ", candles: up(260, 1) }, { symbol: "SPY", candles: up(260, 1) }, { symbol: "NVDA", candles: up(260, 2) }];
  const ctx = contextAt(coins, 259 * D, 1, () => false);
  const w = breakoutOn("QQQ", ["QQQ", "SPY"]).decide(ctx);
  assert.deepEqual(Object.keys(w), ["NVDA"]);
});
