import crypto from "node:crypto";

import * as bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidPassword(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export async function invalidateUserTokens(
  userId: string,
  type: "verify_email" | "reset_password",
) {
  await prisma.auth_tokens.deleteMany({
    where: {
      user_id: userId,
      type,
      used_at: null,
    },
  });
}

export async function createAuthToken(
  userId: string,
  type: "verify_email" | "reset_password",
  ttlMs: number,
) {
  const token = generateSecureToken(32);
  const hash = hashToken(token);

  await prisma.$transaction(async (tx) => {
    await tx.auth_tokens.deleteMany({
      where: {
        user_id: userId,
        type,
        used_at: null,
      },
    });

    await tx.auth_tokens.create({
      data: {
        user_id: userId,
        token_hash: hash,
        type,
        expires_at: new Date(Date.now() + ttlMs),
      },
    });
  });

  return token;
}

export async function findValidAuthToken(
  token: string,
  type: "verify_email" | "reset_password",
) {
  const hash = hashToken(token);

  return prisma.auth_tokens.findFirst({
    where: {
      token_hash: hash,
      type,
      used_at: null,
      expires_at: {
        gt: new Date(),
      },
    },
    include: {
      users: true,
    },
  });
}
