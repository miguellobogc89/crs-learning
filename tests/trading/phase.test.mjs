import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { marketPhase } = load("lib/trading/chip/phase.ts");
const DAY = 86_400_000;
const t0 = Date.UTC(2020, 0, 1);
const series = (f, n) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * DAY, c: f(i) }));

test("fase del mercado: subida larga = ataque; caída = defensa, con días y precio para volver", () => {
  const up = series((i) => 100 * 1.002 ** i, 400);
  const a = marketPhase(up);
  assert.equal(a.mode, "ataque");
  assert.ok(a.days > 150);
  assert.ok(a.flipPct < 0, "en ataque, el cambio está por debajo");

  const down = series((i) => (i < 380 ? 100 * 1.002 ** i : 100 * 1.002 ** 380 * 0.98 ** (i - 380)), 400);
  const d = marketPhase(down, null);
  assert.equal(d.mode, "defensa");
  assert.ok(d.days >= 1 && d.days <= 20);
  assert.ok(d.flipPct > 0, "en defensa, tiene que subir");
  assert.equal(d.checks.length, 3);
  assert.equal(d.checks.some((c) => c.ok), false);
});

test("fase del mercado: cuánto suele durar y cuánto suele quedar, con las fases anteriores", () => {
  // Ciclos: 60 días subiendo, 30 bajando, repetido; la primera parte sin medias no cuenta.
  const f = (i) => {
    let p = 100;
    for (let k = 1; k <= i; k++) p *= k % 90 < 60 ? 1.01 : 0.985;
    return p;
  };
  const c = series(f, 900 + 65); // termina 5 días después de empezar una caída
  const ph = marketPhase(c);
  assert.equal(ph.mode, "defensa");
  assert.ok(ph.samples >= 3, String(ph.samples));
  assert.ok(ph.typicalDays > ph.days, `${ph.typicalDays} vs ${ph.days}`);
  assert.ok(ph.remainingDays > 0);
});

test("fase del mercado: sin historial suficiente no dice nada", () => {
  assert.equal(marketPhase(series(() => 100, 100)), null);
});
