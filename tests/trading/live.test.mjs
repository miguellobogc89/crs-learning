// Precio en directo: qué vela es la de hoy, cuándo manda sobre el cierre y cuándo se ejecuta una pendiente.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { todayBar, preferLive, canFillLive } = load("lib/trading/live-logic.ts");

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const bar = (day, o = 10) => ({ t: D(day), o, h: o * 1.02, l: o * 0.98, c: o * 1.01, v: 0 });
const candles = [bar("2026-11-10"), bar("2026-11-11", 11)];

test("directo: la bolsa no tiene vela de hoy hasta las 9:05 de Madrid", () => {
  // 11-nov-2026 (miércoles). Madrid = UTC+1 en noviembre.
  assert.equal(todayBar(candles, false, new Date("2026-11-11T07:30:00Z")), null, "8:30 en Madrid");
  assert.equal(todayBar(candles, false, new Date("2026-11-11T08:04:00Z")), null, "9:04");
  assert.equal(todayBar(candles, false, new Date("2026-11-11T08:06:00Z")).o, 11, "9:06");
  assert.equal(todayBar(candles, false, new Date("2026-11-11T16:00:00Z")).o, 11, "17:00, sesión aún sin vela de cierre");
  assert.equal(todayBar([bar("2026-11-10")], false, new Date("2026-11-11T10:00:00Z")), null, "el proveedor aún no tiene la de hoy");
});

test("directo: fines de semana no hay sesión de bolsa; crypto sí, por día UTC", () => {
  const sat = [bar("2026-11-14")];
  assert.equal(todayBar(sat, false, new Date("2026-11-14T10:00:00Z")), null);
  assert.equal(todayBar(sat, true, new Date("2026-11-14T00:30:00Z")).t, D("2026-11-14"));
  // 23:30 en Madrid del día 13 ya es el 13 en UTC: la vela UTC del 14 aún no existe.
  assert.equal(todayBar(sat, true, new Date("2026-11-13T22:30:00Z")), null);
});

test("directo: el precio en directo solo manda si es de un día posterior al último cierre", () => {
  assert.equal(preferLive(D("2026-11-10"), D("2026-11-11")), true);
  assert.equal(preferLive(D("2026-11-11"), D("2026-11-11")), false, "por la tarde ya hay cierre: manda el cierre");
  assert.equal(preferLive(null, D("2026-11-11")), true);
  assert.equal(preferLive(D("2026-11-10"), null), false);
});

test("directo: una pendiente de ayer se ejecuta con la apertura de hoy; una de hoy, mañana", () => {
  assert.equal(canFillLive(D("2026-11-10"), D("2026-11-11"), null), true, "decidida ayer a las 19:15");
  assert.equal(canFillLive(D("2026-11-11"), D("2026-11-11"), null), false, "creada hoy: espera a la próxima apertura");
  assert.equal(canFillLive(D("2026-11-10"), D("2026-11-11"), D("2026-11-11")), false, "si ya hay vela de cierre, la ejecuta el proceso diario");
  assert.equal(canFillLive(D("2026-11-10"), null, null), false);
});

const { marketOpenNow, meetingIntervalMinutes, meetingDue } = load("lib/trading/live-logic.ts");

test("agentes: con la bolsa abierta (9:30-17:30, laborables) compran al momento; crypto siempre", () => {
  assert.equal(marketOpenNow("bolsa", new Date("2026-11-11T08:20:00Z")), false, "9:20 en Madrid: aún sin apertura del proveedor");
  assert.equal(marketOpenNow("bolsa", new Date("2026-11-11T08:31:00Z")), true, "9:31");
  assert.equal(marketOpenNow("bolsa", new Date("2026-11-11T16:31:00Z")), false, "17:31");
  assert.equal(marketOpenNow("bolsa", new Date("2026-11-14T10:00:00Z")), false, "sábado");
  assert.equal(marketOpenNow("crypto", new Date("2026-11-14T03:00:00Z")), true);
});

test("agentes: cada hora con la bolsa abierta, cada 4 h fuera, configurable", () => {
  const open = new Date("2026-11-11T10:00:00Z");
  const night = new Date("2026-11-11T22:00:00Z");
  assert.equal(meetingIntervalMinutes(open, {}), 60);
  assert.equal(meetingIntervalMinutes(night, {}), 240);
  assert.equal(meetingIntervalMinutes(open, { TRADING_AGENT_MEETING_MINUTES: "30" }), 30);
  assert.equal(meetingIntervalMinutes(night, { TRADING_AGENT_MEETING_MINUTES_OFF: "0" }), 0);
  const now = Date.parse("2026-11-11T10:00:00Z");
  assert.equal(meetingDue(null, 60, now), true);
  assert.equal(meetingDue(now - 59 * 60_000, 60, now), false);
  assert.equal(meetingDue(now - 61 * 60_000, 60, now), true);
  assert.equal(meetingDue(null, 0, now), false, "0 = desactivado");
});
