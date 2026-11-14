// Pills de los agentes: qué operan y dónde se les puede copiar, sobre su universo.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { marketsOf, venuesFor, venueLabel } = load("lib/trading/agents/venues-logic.ts");

const venues = [
  { id: "bitvavo", name: "Bitvavo", market: "crypto", ready: true, has: new Set(["BTC", "ETH", "SOL", "PEPE"]) },
  { id: "coinbase", name: "Coinbase", market: "crypto", ready: true, has: new Set(["BTC", "ETH"]) },
  { id: "kraken", name: "Kraken", market: "crypto", ready: false, has: new Set(["BTC", "ETH", "SOL", "PEPE"]) },
  { id: "rara", name: "Rara", market: "crypto", ready: true, has: new Set(["XYZ"]) },
  { id: "trading212", name: "Trading 212", market: "bolsa", ready: false, has: null },
];

test("venues: solo crypto → pill Crypto; exchanges con todo, con parte y en gris si no están listos", () => {
  const u = { crypto: ["BTC", "ETH", "SOL", "PEPE"], bolsa: [] };
  assert.deepEqual(marketsOf(u), ["crypto"]);
  const fits = venuesFor(u, venues);
  assert.deepEqual(fits.map(venueLabel), ["Bitvavo", "Coinbase 2/4", "Kraken"], "listos primero; los que no tienen nada no salen");
  assert.equal(fits.find((f) => f.id === "coinbase").fit, "partial");
  assert.equal(fits.find((f) => f.id === "kraken").ready, false);
  assert.ok(!fits.some((f) => f.id === "trading212"), "un bróker de bolsa no sale para un agente solo de crypto");
});

test("venues: bolsa y crypto → las dos pills, con el bróker de bolsa aunque no se sepa su lista", () => {
  const u = { crypto: ["BTC"], bolsa: ["IBE.MC", "REP.MC"] };
  assert.deepEqual(marketsOf(u), ["crypto", "bolsa"]);
  const t212 = venuesFor(u, venues).find((f) => f.id === "trading212");
  assert.deepEqual([t212.covered, t212.total, t212.fit], [2, 2, "all"]);
  assert.deepEqual(marketsOf({ crypto: [], bolsa: [] }), []);
});
