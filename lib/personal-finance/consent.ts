import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "@/lib/connectors/crypto";
import { type PersonalBank, isPersonalBank } from "@/lib/personal-finance/enable-banking";

export const BANK_STATE_COOKIE = "crs_finance_bank_state";
export const BANK_CALLBACK_PATH = "/api/finance/banks/callback";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type BankConsentState = {
  nonce: string;
  bank: PersonalBank;
  userId: string;
  issuedAt: number;
};

export function issueConsentState(userId: string, bank: PersonalBank) {
  const state: BankConsentState = { nonce: randomUUID(), bank, userId, issuedAt: Date.now() };
  return { nonce: state.nonce, cookie: encrypt(JSON.stringify(state)) };
}

export function verifyConsentState(cookie: string | undefined, nonce: string | null, userId: string): BankConsentState | null {
  if (!cookie || !nonce) return null;
  try {
    const state = JSON.parse(decrypt(cookie)) as BankConsentState;
    if (state.nonce !== nonce || state.userId !== userId || !isPersonalBank(state.bank)) return null;
    if (!Number.isFinite(state.issuedAt) || Date.now() - state.issuedAt > STATE_MAX_AGE_MS || state.issuedAt > Date.now()) return null;
    return state;
  } catch { return null; }
}

export function bankingRedirectUrl() {
  const value = process.env.ENABLE_BANKING_REDIRECT_URL;
  if (!value) throw new Error("Falta ENABLE_BANKING_REDIRECT_URL");
  const url = new URL(value);
  if (url.pathname !== BANK_CALLBACK_PATH || url.search || url.hash) throw new Error("La URL de retorno bancaria no es válida");
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost" && url.protocol === "http:")) {
    throw new Error("La URL de retorno bancaria debe utilizar HTTPS");
  }
  return url.toString();
}
