import {
  baseEmailLayout,
  escapeHtml,
  type EmailTemplate,
} from "@/lib/email/templates/shared";

export function passwordChangedTemplate(data: {
  name?: string | null;
}): EmailTemplate {
  const greeting = data.name ? `Hola ${escapeHtml(data.name)},` : "Hola,";

  return {
    subject: "Tu contrasena ha cambiado",
    html: baseEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">Contrasena actualizada</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4b5563;">Confirmamos que la contrasena de tu cuenta de CRS LAB se ha cambiado correctamente.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Si no realizaste este cambio, actua de inmediato para proteger tu cuenta.</p>
    `),
    text: [
      greeting,
      "Confirmamos que la contrasena de tu cuenta de CRS LAB se ha cambiado correctamente.",
      "Si no realizaste este cambio, actua de inmediato para proteger tu cuenta.",
    ].join("\n\n"),
  };
}
