import {
  actionButton,
  baseEmailLayout,
  escapeHtml,
  type EmailTemplate,
} from "@/lib/email/templates/shared";

export function resetPasswordTemplate(data: {
  name?: string | null;
  resetUrl: string;
}): EmailTemplate {
  const greeting = data.name ? `Hola ${escapeHtml(data.name)},` : "Hola,";

  return {
    subject: "Restablece tu contrasena en CRS LAB",
    html: baseEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">Restablece tu contrasena</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">Hemos recibido una solicitud para cambiar la contrasena de tu cuenta.</p>
      ${actionButton(data.resetUrl, "Cambiar contrasena")}
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">Este enlace caduca en 30 minutos.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Si no lo solicitaste, puedes ignorar este email.</p>
    `),
    text: [
      greeting,
      "Hemos recibido una solicitud para cambiar la contrasena de tu cuenta.",
      "Usa este enlace:",
      data.resetUrl,
      "Este enlace caduca en 30 minutos.",
      "Si no lo solicitaste, puedes ignorar este email.",
    ].join("\n\n"),
  };
}
