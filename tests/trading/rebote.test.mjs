// Corto en el rebote de una caída (regla pura del laboratorio).
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const R = load("lib/trading/kamikaze/rebote.ts");

/** Velas de 1 h que siguen los precios dados (interpolando), con mechas de ±0,2 %. */
function path(points) {
  const out = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [n, a] = points[k];
    const b = points[k + 1][1];
    for (let i = 0; i < n; i++) {
      const c = a + ((b - a) * i) / n;
      out.push({ h: c * 1.002, l: c * 0.998, c });
    }
  }
  const z = points[points.length - 1][1];
  out.push({ h: z * 1.002, l: z * 0.998, c: z });
  return out;
}

// 20 días cayendo de 130 a 100, rebote hasta 107 en 12 h y empieza a girarse.
const base = () => path([[480, 130], [12, 100], [1, 107]]);

test("rebote: entra cuando el rebote de una caída se gira hacia abajo", () => {
  const bars = base();
  bars.push({ h: 106.8, l: 105, c: 105.2 }); // cierra por debajo del mínimo de la anterior
  const r = R.bounceShortIdea(bars);
  assert.ok(r, "debería entrar");
  assert.equal(r.entry, 105.2);
  assert.ok(r.stop > 107 && r.stop < 107.5, "stop justo encima del máximo del rebote");
  assert.ok(Math.abs(r.target - 100 * 0.998) < 0.01, "objetivo en el mínimo de antes");
  assert.ok(r.bouncePct > 5 && r.bouncePct < 10);
});

test("rebote: no entra si aún sube, si el rebote es pequeño o enorme, o si ya cayó a la mitad", () => {
  const up = base();
  up.push({ h: 107.6, l: 106.9, c: 107.4 });
  assert.equal(R.bounceShortIdea(up), null, "sigue subiendo");
  const small = path([[480, 130], [12, 100], [1, 103]]);
  small.push({ h: 102.9, l: 102, c: 102.1 });
  assert.equal(R.bounceShortIdea(small), null, "rebote del 3 %");
  const big = path([[480, 130], [12, 100], [1, 115]]);
  big.push({ h: 114.5, l: 112, c: 112.5 });
  assert.equal(R.bounceShortIdea(big), null, "rebote del 15 %");
  const late = base();
  late.push({ h: 104, l: 102.5, c: 102.6 });
  assert.equal(R.bounceShortIdea(late), null, "ya ha devuelto más de medio rebote");
  assert.equal(R.bounceShortIdea(base().slice(-300)), null, "faltan velas para la media");
});

test("rebote: no entra si el precio está por encima de su media de 20 días", () => {
  const bars = path([[480, 80], [12, 100], [1, 107]]);
  bars.push({ h: 106.8, l: 105, c: 105.2 });
  assert.equal(R.bounceShortIdea(bars), null);
});
