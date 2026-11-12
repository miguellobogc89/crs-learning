import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { preview, manualStep } = load("lib/trading/manual/logic.ts");

test("mis operaciones: con 100 € se ve lo que pierdes y lo que ganas (con comisiones)", () => {
  const p = preview(100, 1, 0.9, 1.2);
  assert.ok(p.loss < -10 && p.loss > -10.6, String(p.loss));
  assert.ok(p.gain > 19.4 && p.gain < 20, String(p.gain));
});

test("mis operaciones: stop vende; objetivo vende o, con «seguir si sube», sube el stop y lo sigue", () => {
  const base = { entry: 100, stop: 90, target: 120, trail: false, trailing: false };
  assert.deepEqual(manualStep(base, 95), null);
  assert.ok("sell" in manualStep(base, 89));
  assert.ok("sell" in manualStep(base, 121));
  const t = { ...base, trail: true };
  const a = manualStep(t, 120);
  assert.equal(a.trailing, true);
  assert.ok(Math.abs(a.stop - 110) < 0.01, String(a.stop)); // mitad de camino
  const b = manualStep({ ...t, stop: a.stop, trailing: true }, 130);
  assert.ok(b.stop > a.stop);
  assert.equal(manualStep({ ...t, stop: b.stop, trailing: true }, 125), null, "nunca baja");
  assert.ok("sell" in manualStep({ ...t, stop: b.stop, trailing: true }, b.stop - 0.01));
});
