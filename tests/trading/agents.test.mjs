import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { validateCommittee } = load("lib/trading/committee/prompt.ts");
const { AGENTS, agentByKey, agentInstructions } = load("lib/trading/agents/roster.ts");

const cost = { commissionPct: 0, commissionMin: 0, slippageBps: 0 };
const asset = (symbol, market = "bolsa") => ({
  symbol, name: symbol, market, price: 10, change1d: 0, change20d: 0, trend: "up", rsi: 55, distSma200: 5, atrPct: 2, lotStep: 1,
  strength: null, signals: [], news: [], position: null,
});
const ctx = (rules, regimes = { bolsa: "alcista", crypto: "alcista" }) => ({
  date: "2026-11-10",
  regimes,
  account: { equity: 5000, cash: 5000, riskPct: 1, maxPositionPct: 30, maxOpen: 8, openCount: 0, allowShort: false, cost },
  marketNews: [],
  assets: ["A", "B", "C", "D"].map((s) => asset(s)).concat([asset("BTC-EUR", "crypto")]),
  rules,
});
const buy = (symbol, extra = {}) => ({ symbol, action: "comprar", conviction: 4, horizon_days: 10, stop: 9.5, target: 11, rationale: "r", evidence: [`T:${symbol}`], risks: "", ...extra });

test("agentes: tres perfiles distintos con 5.000 €", () => {
  assert.deepEqual(AGENTS.map((a) => a.profile), ["precavido", "equilibrado", "arriesgado"]);
  assert.ok(AGENTS.every((a) => a.capital === 5000));
  const risks = AGENTS.map((a) => a.settings.risk_per_trade_pct);
  assert.ok(risks[0] < risks[1] && risks[1] < risks[2]);
  assert.match(agentInstructions(agentByKey("argo")), /Como mucho 1 compra nueva/);
});

test("agentes: el precavido compra como mucho una, con convicción 4 y beneficio/riesgo 2", () => {
  const v = validateCommittee({ market_view: "", watchlist: [], proposals: [buy("A"), buy("B", { target: 10.8 }), buy("C", { conviction: 3 }), buy("D")] }, ctx(agentByKey("argo").rules));
  const by = (s) => v.proposals.find((p) => p.symbol === s);
  assert.equal(by("A").status, "propuesta");
  assert.match(by("B").rejection, /Beneficio/, "1,6 a 1 no le basta");
  assert.equal(by("C").action, "vigilar", "convicción 3 se queda en vigilancia");
  assert.match(by("D").rejection, /máximo de su perfil/);
});

test("agentes: mercado bajista — el precavido no compra, el arriesgado solo con convicción 5", () => {
  const bear = { bolsa: "bajista", crypto: "alcista" };
  const argo = validateCommittee({ market_view: "", watchlist: [], proposals: [buy("A", { conviction: 5 }), buy("BTC-EUR", { stop: 9.5, target: 11 })] }, ctx(agentByKey("argo").rules, bear));
  assert.match(argo.proposals[0].rejection, /bajista/);
  assert.equal(argo.proposals[1].status, "propuesta", "crypto sigue alcista");
  const vert = validateCommittee({ market_view: "", watchlist: [], proposals: [buy("A", { conviction: 5 }), buy("B")] }, ctx(agentByKey("vertigo").rules, bear));
  assert.equal(vert.proposals[0].status, "propuesta");
  assert.match(vert.proposals[1].rejection, /bajista/);
});

test("agentes: sin reglas de agente, el comité normal no cambia", () => {
  const v = validateCommittee({ market_view: "", watchlist: [], proposals: [buy("A"), buy("B"), buy("C")] }, ctx(null, { bolsa: "bajista", crypto: "lateral" }));
  assert.ok(v.proposals.every((p) => p.status === "propuesta"));
});
