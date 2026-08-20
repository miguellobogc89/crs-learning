import { Resend } from "resend";

import { passwordChangedTemplate } from "@/lib/email/templates/password-changed";
import { resetPasswordTemplate } from "@/lib/email/templates/reset-password";
import type { EmailTemplate } from "@/lib/email/templates/shared";
import { verifyEmailTemplate } from "@/lib/email/templates/verify-email";
import { welcomeTemplate } from "@/lib/email/templates/welcome";

let resendClient: Resend | null = null;

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

async function sendEmail(data: {
  to: string;
  template: EmailTemplate;
}) {
  const from = process.env.EMAIL_FROM;

  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }

  await getResendClient().emails.send({
    from,
    to: data.to,
    subject: data.template.subject,
    html: data.template.html,
    text: data.template.text,
  });
}

export async function sendVerifyEmail(data: {
  to: string;
  name?: string | null;
  token: string;
}) {
  const verifyUrl = `${getAppUrl()}/verify-email?token=${encodeURIComponent(
    data.token,
  )}`;

  await sendEmail({
    to: data.to,
    template: verifyEmailTemplate({
      name: data.name,
      verifyUrl,
    }),
  });
}

export async function sendWelcomeEmail(data: {
  to: string;
  name?: string | null;
}) {
  await sendEmail({
    to: data.to,
    template: welcomeTemplate({
      name: data.name,
    }),
  });
}

export async function sendResetPasswordEmail(data: {
  to: string;
  name?: string | null;
  token: string;
}) {
  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(
    data.token,
  )}`;

  await sendEmail({
    to: data.to,
    template: resetPasswordTemplate({
      name: data.name,
      resetUrl,
    }),
  });
}

export async function sendPasswordChangedEmail(data: {
  to: string;
  name?: string | null;
}) {
  await sendEmail({
    to: data.to,
    template: passwordChangedTemplate({
      name: data.name,
    }),
  });
}
