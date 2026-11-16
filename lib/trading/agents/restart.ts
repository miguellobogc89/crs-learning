// lib/trading/agents/restart.ts
// Reinicio de un agente cuando cambian sus reglas de dinero (p. ej. todos a 1.000 €): su cuenta, sus
// decisiones y su estado pasan a una clave de archivo («cohete-persigue~2026-11-16») y el agente empieza
// de cero con su capital nuevo. Nada se borra: el historial sigue en la base de datos.
import "server-only";
import type { trading_accounts } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureAccount, madridDay, type AccountDefaults } from "../accounts";
import { AGENTS_WORKSPACE } from "./roster";

const WS = AGENTS_WORKSPACE;

/** Clave con la que se archiva lo anterior de un agente. */
export const archiveKey = (key: string, day = madridDay()) => `${key}~${day}`;

export async function ensureFresh(key: string, defaults: AccountDefaults & { name: string; capital: number }): Promise<trading_accounts> {
  const account = await ensureAccount(WS, key, defaults);
  if (Math.abs(account.initial_capital - defaults.capital) < 0.01) return account;
  let tag = archiveKey(key);
  if (await prisma.trading_accounts.findUnique({ where: { workspace_id_agent: { workspace_id: WS, agent: tag } }, select: { id: true } })) tag = `${tag}-${Date.now()}`;
  await prisma.$transaction([
    prisma.trading_accounts.update({ where: { id: account.id }, data: { agent: tag, name: `${defaults.name} (hasta ${madridDay()})`, meeting_lease_until: null, updated_at: new Date() } }),
    prisma.trading_kamikaze_rounds.updateMany({ where: { agent: key }, data: { agent: tag } }),
    prisma.trading_proposals.updateMany({ where: { workspace_id: WS, agent: key }, data: { agent: tag } }),
    prisma.trading_committee_runs.updateMany({ where: { workspace_id: WS, agent: key }, data: { agent: tag } }),
  ]);
  console.info(`[trading] ${key}: reinicio con ${defaults.capital} € (lo anterior queda como ${tag})`);
  return ensureAccount(WS, key, defaults);
}
