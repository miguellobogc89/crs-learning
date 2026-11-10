import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { validateCommittee, committeeInput, COMMITTEE_SCHEMA } = load("lib/trading/committee/prompt.ts");
const { evaluateProposal } = load("lib/trading/committee/outcome.ts");
const { positionSize } = load("lib/trading/risk.ts");

const cost = { commissionPct: 0.1, commissionMin: 3, slippageBps: 0 };
const asset = (symbol, extra = {}) => ({
  symbol,
  name: symbol,
  market: "bolsa",
  price: 10,
  change1d: 0,
  change20d: 0,
  trend: "up",
  rsi: 55,
  distSma200: 5,
  atrPct: 2,
  lotStep: 1,
  signals: [{ id: `S:${symbol}:double_bottom`, pattern: "Doble suelo", status: "confirmada", direction: "long", entry: 10, stop: 9.4, target: 11.5, score: 70, vetoed: false, history: null }],
  news: [{ id: "N:abcd1234", when: "hoy", summary: "Resultados mejores de lo esperado", sentiment: 2, impact: 3, category: "resultados" }],
  position: null,
  ...extra,
});
const ctx = (assets, account = {}) => ({
  date: "2026-11-10",
  regimes: { bolsa: "alcista", crypto: "lateral" },
  account: { equity: 10_000, cash: 10_000, riskPct: 1, maxPositionPct: 25, maxOpen: 2, openCount: 0, allowShort: false, cost, ...account },
  marketNews: [],
  assets,
});

test("comité: una compra bien formada pasa y sale con su tamaño", () => {
  const c = ctx([asset("AAA.MC")]);
  const v = validateCommittee(
    { market_view: "Bien", proposals: [{ symbol: "aaa.mc", action: "comprar", conviction: 4, horizon_days: 15, stop: 9.5, target: 11.2, rationale: "x", evidence: ["N:abcd1234", "S:AAA.MC:double_bottom", "INVENTADA"], risks: "y" }], watchlist: [] },
    c,
  );
  const p = v.proposals[0];
  assert.equal(p.status, "propuesta");
  assert.deepEqual(p.evidence, ["N:abcd1234", "S:AAA.MC:double_bottom"], "las pruebas inventadas se quitan");
  assert.equal(p.sizing.quantity, 200, "100 € de riesgo / 0,5 € por acción");
  assert.ok(committeeInput(c).includes("T:AAA.MC"));
  assert.equal(COMMITTEE_SCHEMA.required.length, 3);
});

test("comité: reglas duras", () => {
  const pos = { position: { direction: "long", quantity: 5, entry: 9, stop: 8.5, target: 12, unrealizedPct: 11 } };
  const c = ctx([asset("A"), asset("B"), asset("C"), asset("D", pos), asset("E", pos)]);
  const prop = (symbol, extra) => ({ symbol, action: "comprar", conviction: 4, horizon_days: 10, stop: 9.5, target: 11.5, rationale: "r", evidence: [`T:${symbol}`], risks: "", ...extra });
  const v = validateCommittee(
    {
      market_view: "",
      proposals: [
        prop("A", { evidence: [] }), // sin pruebas
        prop("B", { stop: 7 }), // stop a más del 15 %
        prop("C", { target: 10.3 }), // beneficio/riesgo < 1,5
        prop("E"), // ya tiene posición
        prop("A", { conviction: 2 }), // repetida: se ignora
        { symbol: "D", action: "vender", conviction: 3, horizon_days: 1, stop: null, target: null, rationale: "noticias", evidence: ["P:D"], risks: "" },
        { symbol: "B", action: "vender", conviction: 3, horizon_days: 1, stop: null, target: null, rationale: "?", evidence: ["T:B"], risks: "" },
        { symbol: "ZZZ", action: "comprar", conviction: 5, horizon_days: 1, stop: 1, target: 2, rationale: "", evidence: [], risks: "" },
      ],
      watchlist: [{ symbol: "C", reason: "atento" }, { symbol: "NOPE", reason: "x" }],
    },
    c,
  );
  const by = (s, a) => v.proposals.find((p) => p.symbol === s && p.action === a);
  assert.match(by("A", "comprar").rejection, /prueba/);
  assert.match(by("B", "comprar").rejection, /lejos/);
  assert.match(by("C", "comprar").rejection, /Beneficio/);
  assert.match(by("E", "comprar").rejection, /Ya hay una posición/);
  assert.equal(by("D", "vender").status, "propuesta");
  assert.equal(v.proposals.filter((p) => p.symbol === "B").length, 1, "un activo, una propuesta");
  assert.ok(!v.proposals.some((p) => p.symbol === "ZZZ"));
  assert.deepEqual(v.watchlist.map((w) => w.symbol), ["C"]);
});

test("comité: convicción baja pasa a vigilar y se respeta el máximo de posiciones", () => {
  const c = ctx([asset("A"), asset("B"), asset("C")], { maxOpen: 1 });
  const prop = (symbol, conviction) => ({ symbol, action: "comprar", conviction, horizon_days: 10, stop: 9.5, target: 11.5, rationale: "r", evidence: [`T:${symbol}`], risks: "" });
  const v = validateCommittee({ market_view: "", proposals: [prop("A", 2), prop("B", 5), prop("C", 4)], watchlist: [] }, c);
  assert.equal(v.proposals.find((p) => p.symbol === "A").action, "vigilar");
  assert.equal(v.proposals.find((p) => p.symbol === "B").status, "propuesta");
  assert.match(v.proposals.find((p) => p.symbol === "C").rejection, /máximo/);
});

test("tamaño fraccionario en crypto", () => {
  const s = positionSize({ equity: 10_000, cash: 10_000, riskPct: 1, maxPositionPct: 25, entry: 80_000, stop: 76_000, cost, step: 0.000001 });
  assert.equal(s.quantity, 0.025);
  assert.ok(Math.abs(s.riskAmount - 100) < 0.01);
  const whole = positionSize({ equity: 10_000, cash: 10_000, riskPct: 1, maxPositionPct: 25, entry: 80_000, stop: 76_000, cost });
  assert.equal(whole.quantity, 0, "en acciones enteras no llega");
});

test("resultado de una propuesta: entra a la apertura siguiente y sale en el objetivo", () => {
  const day = (d) => Date.UTC(2026, 10, d);
  const c = [
    { t: day(10), o: 10, h: 10.2, l: 9.8, c: 10, v: 1 },
    { t: day(11), o: 10.1, h: 10.4, l: 9.9, c: 10.3, v: 1 },
    { t: day(12), o: 10.3, h: 11.6, l: 10.2, c: 11.4, v: 1 },
    { t: day(13), o: 11.4, h: 11.5, l: 11, c: 11.1, v: 1 },
  ];
  const bench = c.map((x) => ({ ...x, o: 100, c: 101 }));
  const p = { action: "comprar", price: 10, stop: 9.5, target: 11.5, horizon_days: 10, created_at: new Date("2026-11-10T17:00:00Z") };
  const r = evaluateProposal(p, c, bench);
  assert.equal(r.state, "objetivo");
  assert.equal(r.entryPrice, 10.1);
  assert.ok(Math.abs(r.r - (11.5 - 10.1) / (10.1 - 9.5)) < 1e-9);
  assert.equal(r.benchmarkPct, 1);
  const stopHit = evaluateProposal({ ...p, target: 20 }, [c[0], c[1], { t: day(12), o: 9.6, h: 9.7, l: 9.2, c: 9.3, v: 1 }], bench);
  assert.equal(stopHit.state, "stop");
  assert.ok(stopHit.r < 0);
  assert.equal(evaluateProposal(p, [c[0]], bench).state, "pendiente");
});
