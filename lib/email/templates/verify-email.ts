import {
  actionButton,
  baseEmailLayout,
  escapeHtml,
  type EmailTemplate,
} from "@/lib/email/templates/shared";

export function verifyEmailTemplate(data: {
  name?: string | null;
  verifyUrl: string;
}): EmailTemplate {
  const greeting = data.name ? `Hola ${escapeHtml(data.name)},` : "Hola,";

  return {
    subject: "Verifica tu email en CRS LAB",
    html: baseEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">Verifica tu email</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">Gracias por crear tu cuenta en CRS LAB. Confirma tu email para activar el acceso con contrasena.</p>
      ${actionButton(data.verifyUrl, "Verificar email")}
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Este enlace caduca en 24 horas.</p>
    `),
    text: [
      greeting,
      "Gracias por crear tu cuenta en CRS LAB.",
      "Confirma tu email para activar el acceso con contrasena:",
      data.verifyUrl,
      "Este enlace caduca en 24 horas.",
    ].join("\n\n"),
  };
}
