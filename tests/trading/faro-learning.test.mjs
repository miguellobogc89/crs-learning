// Base para que FARO aprenda: versión, RSI y lo que pasó con cada candidato.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const F = load("lib/trading/faro/logic.ts");
const H = 3_600_000;

test("faro: versión con formato de fecha", () => {
  assert.match(F.FARO_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
});

test("faro: RSI — 100 si solo sube, 0 si solo baja, ~50 si va y viene, null con pocas velas", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(F.rsi(up), 100);
  assert.equal(F.rsi(up.slice().reverse()), 0);
  const zig = Array.from({ length: 40 }, (_, i) => (i % 2 ? 101 : 100));
  assert.ok(Math.abs(F.rsi(zig) - 50) < 5);
  assert.equal(F.rsi([1, 2, 3]), null);
});

test("faro: resultado de un candidato a 6 y 24 h, sin contar la vela que estaba en curso", () => {
  const bar = (t, h, l, c) => ({ t, o: c, h, l, c, qv: 1 });
  const t0 = 10 * H + 30 * 60_000;
  const bars = [bar(10 * H, 150, 50, 100), ...Array.from({ length: 30 }, (_, i) => bar((11 + i) * H, i === 3 ? 110 : 102, i === 20 ? 90 : 99, 101))];
  const o = F.candidateOutcome(bars, t0, 100);
  assert.deepEqual(o.h6, { up: 10, down: -1, close: 1 }, "la vela de las 10:00 (150/50) no cuenta");
  assert.equal(o.h24.down, -10);
  assert.equal(F.candidateOutcome([], t0, 100).h6, null);
});
