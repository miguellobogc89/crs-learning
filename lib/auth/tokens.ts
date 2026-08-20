import crypto from "crypto";

import { prisma } from "@/lib/prisma";

export const AUTH_TOKEN_TYPES = {
  verifyEmail: "verify_email",
  resetPassword: "reset_password",
} as const;

export type AuthTokenType =
  (typeof AUTH_TOKEN_TYPES)[keyof typeof AUTH_TOKEN_TYPES];

export const VERIFY_EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PASSWORD_TOKEN_TTL_MS = 30 * 60 * 1000;

export function generateAuthToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAuthToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createAuthToken(data: {
  userId: string;
  type: AuthTokenType;
  ttlMs: number;
}) {
  const now = new Date();
  const token = generateAuthToken();
  const tokenHash = hashAuthToken(token);
  const expiresAt = new Date(now.getTime() + data.ttlMs);

  await prisma.$transaction([
    prisma.auth_tokens.updateMany({
      where: {
        user_id: data.userId,
        type: data.type,
        used_at: null,
      },
      data: {
        used_at: now,
      },
    }),
    prisma.auth_tokens.create({
      data: {
        user_id: data.userId,
        token_hash: tokenHash,
        type: data.type,
        expires_at: expiresAt,
      },
    }),
  ]);

  return {
    token,
    expiresAt,
  };
}

export type ConsumeTokenResult =
  | {
      ok: true;
      userId: string;
      email: string;
      name: string | null;
    }
  | {
      ok: false;
      reason: "missing" | "invalid" | "expired" | "used";
    };

export async function findConsumableAuthToken(
  token: string | null | undefined,
  type: AuthTokenType,
): Promise<ConsumeTokenResult> {
  if (!token) {
    return {
      ok: false,
      reason: "missing",
    };
  }

  const tokenHash = hashAuthToken(token);
  const authToken = await prisma.auth_tokens.findUnique({
    where: {
      token_hash: tokenHash,
    },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!authToken || authToken.type !== type) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  if (authToken.used_at) {
    return {
      ok: false,
      reason: "used",
    };
  }

  if (authToken.expires_at.getTime() <= Date.now()) {
    return {
      ok: false,
      reason: "expired",
    };
  }

  return {
    ok: true,
    userId: authToken.users.id,
    email: authToken.users.email,
    name: authToken.users.name,
  };
}
