// FARO: validación de ideas, puntuación con velas y qué idea toma cada kamikaze.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const F = load("lib/trading/faro/logic.ts");
const H = 3_600_000;
const idea = (o = {}) => ({ pair: "SOLEUR", kind: "impulso", conviction: 4, invalidation: 90, target: 115, valid_hours: 6, rationale: "x", risks: "", ...o });
const cands = [{ pair: "SOLEUR", price: 100 }, { pair: "ADAEUR", price: 1 }];

test("faro: valida niveles, tipo, candidatos y duplicados", () => {
  const { ok, rejected } = F.checkIdeas(
    [idea(), idea({ pair: "XRPEUR" }), idea({ pair: "ADAEUR", invalidation: 0.995, target: 1.2 }), idea({ pair: "ADAEUR", kind: "magia", invalidation: 0.9 })],
    { candidates: cands, livePairs: [] },
  );
  assert.deepEqual(ok.map((i) => i.pair), ["SOLEUR"]);
  assert.equal(ok[0].price, 100);
  assert.equal(rejected.length, 3);
  const dup = F.checkIdeas([idea()], { candidates: cands, livePairs: ["SOLEUR"] });
  assert.equal(dup.ok.length, 0, "no repite un par que ya está vivo");
  assert.equal(F.checkIdeas([idea({ valid_hours: 99 })], { candidates: cands, livePairs: [] }).ok[0].validHours, 24);
});

const track = { price: 100, invalidation: 90, target: 115, createdAt: 0, validUntil: 6 * H, best: 0, worst: 0 };
const bar = (t, o, h, l, c) => ({ t, o, h, l, c, qv: 1 });

test("faro: acierto, fallo, mismo tramo y caducada, netos de costes", () => {
  const hit = F.scoreIdea(track, [bar(0, 100, 105, 98, 104), bar(H, 104, 116, 103, 115)], 2 * H, 115);
  assert.equal(hit.status, "acierto");
  assert.equal(hit.resultPct, 15 - F.IDEA_COST_PCT);
  assert.equal(F.scoreIdea(track, [bar(0, 100, 101, 89, 90)], H, 90).status, "fallo");
  assert.equal(F.scoreIdea(track, [bar(0, 100, 120, 85, 100)], H, 100).status, "fallo", "si toca los dos en la misma vela, cuenta como fallo");
  const gap = F.scoreIdea(track, [bar(0, 80, 82, 79, 81)], H, 81);
  assert.equal(gap.exitPrice, 80, "si abre por debajo, sale al precio de apertura");
  const exp = F.scoreIdea(track, [bar(0, 100, 104, 97, 103), bar(6 * H, 103, 130, 103, 120)], 7 * H, 120);
  assert.equal(exp.status, "caducada");
  assert.equal(exp.exitPrice, 103, "las velas tras la caducidad no cuentan");
  const live = F.scoreIdea(track, [bar(0, 100, 104, 97, 103)], H, 102);
  assert.equal(live.status, "viva");
  assert.equal(live.best, 4);
  assert.equal(live.worst, -3);
});

test("faro: cada kamikaze toma su tipo, sin perseguir el precio y con sus límites", () => {
  const now = H;
  const board = [
    { id: "a", pair: "SOLEUR", kind: "impulso", conviction: 3, price: 100, invalidation: 97, target: 104, validUntil: 5 * H, createdAt: 0 },
    { id: "b", pair: "ADAEUR", kind: "rebote", conviction: 5, price: 1, invalidation: 0.9, target: 1.3, validUntil: 5 * H, createdAt: 0 },
    { id: "c", pair: "XRPEUR", kind: "impulso", conviction: 5, price: 2, invalidation: 1.8, target: 2.5, validUntil: 5 * H, createdAt: 0 },
  ];
  const prices = { SOLEUR: 101, ADAEUR: 1, XRPEUR: 2.2 };
  const px = (p) => prices[p] ?? null;
  const p = F.pickIdea("impulso", board, px, now);
  assert.equal(p.idea.id, "a", "XRP ya se escapó más de un 3 %");
  assert.ok(Math.abs(p.stop - 101 * 0.95) < 1e-9, "stop al menos un 5 % por debajo");
  assert.ok(Math.abs(p.target - 101 * 1.1) < 1e-9, "apunta al menos a +10 %");
  assert.equal(F.pickIdea("rebotes", board, px, now).idea.id, "b");
  assert.equal(F.pickIdea("rupturas", board, px, now), null);
  assert.equal(F.pickIdea("impulso", board, px, now, new Set(["a"])), null, "una idea ya tomada no se repite");
  assert.equal(F.pickIdea("impulso", board, px, 6 * H), null, "caducada");
});
