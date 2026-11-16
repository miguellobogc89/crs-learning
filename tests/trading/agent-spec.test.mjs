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
  assert.deepEqual(specs.map((s) => s.style), ["Impulso", "Rupturas", "Selectivo", "Fase"]);
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
