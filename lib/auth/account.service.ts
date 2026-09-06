import { prisma } from "@/lib/prisma";
import {
  sendPasswordChangedEmail,
  sendWelcomeEmail,
} from "@/lib/email/email.service";
import { ensureWorkspaceBootstrap } from "@/lib/services/workspace.service";
import { ensureUserPrimaryOrganization } from "@/lib/services/organization.service";
import {
  AUTH_TOKEN_TYPES,
  RESET_PASSWORD_TOKEN_TTL_MS,
  VERIFY_EMAIL_TOKEN_TTL_MS,
  createAuthToken,
  findConsumableAuthToken,
  hashAuthToken,
  type ConsumeTokenResult,
} from "@/lib/auth/tokens";
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
} from "@/lib/auth/password";

export type VerifyEmailResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      reason: ConsumeTokenResult extends { ok: false; reason: infer R }
        ? R
        : never;
    };

export async function registerCredentialsUser(data: {
  name: string;
  email: string;
  password: string;
}) {
  const email = normalizeEmail(data.email);
  const passwordError = validatePassword(data.password);

  if (!data.name.trim()) {
    return {
      ok: false as const,
      message: "El nombre es obligatorio.",
    };
  }

  if (!email || !email.includes("@")) {
    return {
      ok: false as const,
      message: "Introduce un email valido.",
    };
  }

  if (passwordError) {
    return {
      ok: false as const,
      message: passwordError,
    };
  }

  const existingUser = await prisma.users.findUnique({
    where: {
      email,
    },
    select: {
      provider: true,
      password_hash: true,
    },
  });

  if (existingUser) {
    if (!existingUser.password_hash && existingUser.provider === "google") {
      return {
        ok: false as const,
        message:
          "Ya existe una cuenta con este correo. Inicia sesion con Google.",
      };
    }

    return {
      ok: false as const,
      message: "Ya existe una cuenta con este correo.",
    };
  }

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.users.create({
    data: {
      email,
      name: data.name.trim(),
      provider: "credentials",
      password_hash: passwordHash,
      email_verified_at: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  await ensureUserPrimaryOrganization(user.id);
  await ensureWorkspaceBootstrap(user.id);

  const verificationToken = await createAuthToken({
    userId: user.id,
    type: AUTH_TOKEN_TYPES.verifyEmail,
    ttlMs: VERIFY_EMAIL_TOKEN_TTL_MS,
  });

  return {
    ok: true as const,
    user,
    verificationToken: verificationToken.token,
  };
}

export async function verifyEmailToken(token: string | null | undefined) {
  const candidate = await findConsumableAuthToken(
    token,
    AUTH_TOKEN_TYPES.verifyEmail,
  );

  if (!candidate.ok) {
    return candidate;
  }

  const now = new Date();
  const tokenHash = hashAuthToken(token!);

  const result = await prisma.$transaction(async (tx) => {
    const consumed = await tx.auth_tokens.updateMany({
      where: {
        token_hash: tokenHash,
        type: AUTH_TOKEN_TYPES.verifyEmail,
        used_at: null,
        expires_at: {
          gt: now,
        },
      },
      data: {
        used_at: now,
      },
    });

    if (consumed.count !== 1) {
      return null;
    }

    return tx.users.update({
      where: {
        id: candidate.userId,
      },
      data: {
        email_verified_at: now,
        updated_at: now,
      },
      select: {
        email: true,
        name: true,
      },
    });
  });

  if (!result) {
    return {
      ok: false as const,
      reason: "invalid" as const,
    };
  }

  await sendWelcomeEmail({
    to: result.email,
    name: result.name,
  });

  return {
    ok: true as const,
    email: result.email,
  };
}

export async function requestPasswordResetForEmail(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.users.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
      name: true,
      password_hash: true,
      status: true,
    },
  });

  if (
    !user ||
    !user.password_hash ||
    user.status !== "active"
  ) {
    return;
  }

  const resetToken = await createAuthToken({
    userId: user.id,
    type: AUTH_TOKEN_TYPES.resetPassword,
    ttlMs: RESET_PASSWORD_TOKEN_TTL_MS,
  });

  return {
    user,
    token: resetToken.token,
  };
}

export async function resetPasswordWithToken(data: {
  token: string | null | undefined;
  password: string;
}) {
  const passwordError = validatePassword(data.password);

  if (passwordError) {
    return {
      ok: false as const,
      reason: "invalid_password" as const,
      message: passwordError,
    };
  }

  const candidate = await findConsumableAuthToken(
    data.token,
    AUTH_TOKEN_TYPES.resetPassword,
  );

  if (!candidate.ok) {
    return {
      ok: false as const,
      reason: candidate.reason,
      message: resetTokenMessage(candidate.reason),
    };
  }

  const now = new Date();
  const tokenHash = hashAuthToken(data.token!);
  const passwordHash = await hashPassword(data.password);

  const result = await prisma.$transaction(async (tx) => {
    const consumed = await tx.auth_tokens.updateMany({
      where: {
        token_hash: tokenHash,
        type: AUTH_TOKEN_TYPES.resetPassword,
        used_at: null,
        expires_at: {
          gt: now,
        },
      },
      data: {
        used_at: now,
      },
    });

    if (consumed.count !== 1) {
      return null;
    }

    const user = await tx.users.update({
      where: {
        id: candidate.userId,
      },
      data: {
        password_hash: passwordHash,
        updated_at: now,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    await tx.auth_tokens.updateMany({
      where: {
        user_id: candidate.userId,
        type: AUTH_TOKEN_TYPES.resetPassword,
        used_at: null,
      },
      data: {
        used_at: now,
      },
    });

    return user;
  });

  if (!result) {
    return {
      ok: false as const,
      reason: "invalid" as const,
      message: resetTokenMessage("invalid"),
    };
  }

  await sendPasswordChangedEmail({
    to: result.email,
    name: result.name,
  });

  return {
    ok: true as const,
  };
}

function resetTokenMessage(reason: string) {
  if (reason === "expired") {
    return "El enlace ha caducado. Solicita uno nuevo.";
  }

  return "El enlace no es valido o ya fue utilizado.";
}
