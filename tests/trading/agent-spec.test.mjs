// Ficha estándar de los agentes y agente de referencia (DCA).
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { kamikazeSpec, chipSpec, dcaSpec } = load("lib/trading/agents/spec.ts");
const { KAMIKAZES, kamikazeByKey } = load("lib/trading/kamikaze/roster.ts");
const { CHIP_AGENTS } = load("lib/trading/chip/roster.ts");
const { DCA_AGENTS, dcaDue, weekOf } = load("lib/trading/dca/roster.ts");
const { chooseIdea } = load("lib/trading/faro/logic.ts");

test("ficha: todos los agentes en activo tienen las mismas cinco líneas y ninguno decide con IA", () => {
  const specs = [...KAMIKAZES.map(kamikazeSpec), ...CHIP_AGENTS.map(chipSpec), ...DCA_AGENTS.map(dcaSpec)];
  assert.deepEqual(specs.map((s) => s.style), ["Impulso", "Rupturas", "Selectivo", "Fase", "DCA"]);
  assert.deepEqual(specs.map((s) => s.family), ["faro", "faro", "faro", "propio", "referencia"]);
  for (const s of specs) for (const k of ["source", "takes", "size", "exit"]) assert.ok(s[k].length > 10, `${s.style}: ${k}`);
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

test("DCA: una compra por semana; la primera semana enseguida, después desde el lunes", () => {
  const monday = Date.parse("2026-11-16T10:00:00Z");
  const sunday = Date.parse("2026-11-22T10:00:00Z");
  assert.equal(weekOf(monday), "2026-11-16");
  assert.equal(weekOf(sunday), "2026-11-16");
  const base = { weekday: 1, cash: 1000, amount: 50 };
  assert.equal(dcaDue({ ...base, now: Date.parse("2026-11-18T10:00:00Z"), boughtWeeks: new Set(), firstWeek: null }), "2026-11-16", "empieza un miércoles: compra ya");
  assert.equal(dcaDue({ ...base, now: sunday, boughtWeeks: new Set(["2026-11-16"]), firstWeek: "2026-11-16" }), null, "ya compró esa semana");
  assert.equal(dcaDue({ ...base, now: Date.parse("2026-11-23T08:00:00Z"), boughtWeeks: new Set(["2026-11-16"]), firstWeek: "2026-11-16" }), "2026-11-23");
  assert.equal(dcaDue({ ...base, cash: 20, now: Date.parse("2026-11-23T08:00:00Z"), boughtWeeks: new Set(["2026-11-16"]), firstWeek: "2026-11-16" }), null, "sin dinero para una compra");
});
