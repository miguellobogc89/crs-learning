import { createSign } from "node:crypto";

const API = "https://api.enablebanking.com";
export const PERSONAL_BANKS = ["santander", "bbva", "revolut"] as const;
export type PersonalBank = (typeof PERSONAL_BANKS)[number];

export const BANK_LABELS: Record<PersonalBank, string> = {
  santander: "Santander",
  bbva: "BBVA",
  revolut: "Revolut",
};

export function isPersonalBank(value: string | null): value is PersonalBank {
  return PERSONAL_BANKS.some((bank) => bank === value);
}

function apiJwt() {
  const applicationId = process.env.ENABLE_BANKING_APPLICATION_ID;
  const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!applicationId || !privateKey) {
    throw new Error("Faltan las credenciales de Enable Banking en el servidor");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "RS256", kid: applicationId })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "enablebanking.com", aud: "api.enablebanking.com", iat: issuedAt, exp: issuedAt + 3600,
  })).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(content).sign(privateKey, "base64url");
  return `${content}.${signature}`;
}

export function isBankingConfigured() {
  return Boolean(process.env.ENABLE_BANKING_APPLICATION_ID && process.env.ENABLE_BANKING_PRIVATE_KEY && process.env.ENABLE_BANKING_REDIRECT_URL && process.env.CONNECTORS_ENCRYPTION_KEY);
}

export async function bankingRequest<T>(path: string, init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}): Promise<T> {
  // Only paths supplied by this server module; never accept arbitrary external URLs.
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Ruta bancaria no válida");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiJwt()}`,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    // Provider responses can contain account details; do not expose or log their body.
    throw new Error(`Enable Banking rechazó la consulta (${res.status})`);
  }
  return res.json() as Promise<T>;
}

type Aspsp = { name: string; country: string };

export async function resolveAspsp(bank: PersonalBank): Promise<Aspsp> {
  const list = await bankingRequest<{ aspsps: Aspsp[] }>("/aspsps?country=ES&psu_type=personal");
  const aliases: Record<PersonalBank, string[]> = {
    santander: ["Banco Santander", "Santander"],
    bbva: ["BBVA", "Banco Bilbao Vizcaya Argentaria"],
    revolut: ["Revolut"],
  };
  const exact = aliases[bank].map((alias) => alias.toLowerCase());
  const match = list.aspsps.find((item) => item.country === "ES" && exact.includes(item.name.toLowerCase()))
    ?? list.aspsps.find((item) => item.country === "ES" && item.name.toLowerCase().includes(bank));
  if (!match) throw new Error(`No se encontró ${BANK_LABELS[bank]} en Enable Banking`);
  return { name: match.name, country: match.country };
}

export type BankSession = {
  session_id: string;
  accounts: string[];
  aspsp: Aspsp;
  access: { valid_until: string };
};

export type BankAccountDetails = {
  uid: string;
  name?: string;
  currency?: string;
  account_id?: { iban?: string };
};

export type BankBalance = {
  balance_type?: string;
  balance_amount: { amount: string; currency: string };
};

export type BankTransaction = {
  transaction_id?: string;
  entry_reference?: string;
  booking_date?: string;
  value_date?: string;
  credit_debit_indicator?: "DBIT" | "CRDT";
  transaction_amount: { amount: string; currency: string };
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
  note?: string;
};
