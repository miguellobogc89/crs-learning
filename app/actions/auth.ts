// app/actions/auth.ts
"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import {
  registerCredentialsUser,
  requestPasswordResetForEmail,
  resetPasswordWithToken,
} from "@/lib/auth/account.service";
import { normalizeEmail, verifyPassword } from "@/lib/auth/password";
import {
  sendResetPasswordEmail,
  sendVerifyEmail,
} from "@/lib/email/email.service";
import { prisma } from "@/lib/prisma";

export type AuthActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const genericLoginError = "Email o contrasena incorrectos.";

export async function loginWithGoogle() {
  await signIn("google", {
    redirectTo: "/knowledge",
  });
}

export async function logout() {
  await signOut({
    redirectTo: "/",
  });
}

export async function loginWithCredentials(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return {
      status: "error",
      message: genericLoginError,
    };
  }

  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.users.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: {
      password_hash: true,
      email_verified_at: true,
    },
  });

  if (
    user?.password_hash &&
    !user.email_verified_at &&
    (await verifyPassword(password, user.password_hash))
  ) {
    return {
      status: "error",
      message:
        "Necesitas verificar tu email antes de iniciar sesion.",
    };
  }

  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message: genericLoginError,
      };
    }

    throw error;
  }

  redirect("/dashboard");
}

export async function registerWithCredentials(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return {
      status: "error",
      message: "Revisa los datos del formulario.",
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "Las contrasenas no coinciden.",
    };
  }

  const result = await registerCredentialsUser({
    name,
    email,
    password,
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  await sendVerifyEmail({
    to: result.user.email,
    name: result.user.name,
    token: result.verificationToken,
  });

  return {
    status: "success",
    message: "Revisa tu correo para verificar tu cuenta.",
  };
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email");

  if (typeof email === "string") {
    const result = await requestPasswordResetForEmail(email);

    if (result) {
      await sendResetPasswordEmail({
        to: result.user.email,
        name: result.user.name,
        token: result.token,
      });
    }
  }

  return {
    status: "success",
    message:
      "Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contrasena.",
  };
}

export async function resetPassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof token !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return {
      status: "error",
      message: "Revisa los datos del formulario.",
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "Las contrasenas no coinciden.",
    };
  }

  const result = await resetPasswordWithToken({
    token,
    password,
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return {
    status: "success",
    message:
      "Tu contrasena se ha actualizado correctamente. Ya puedes iniciar sesion.",
  };
}
