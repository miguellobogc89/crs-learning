import {
  baseEmailLayout,
  escapeHtml,
  type EmailTemplate,
} from "@/lib/email/templates/shared";

export function welcomeTemplate(data: {
  name?: string | null;
}): EmailTemplate {
  const greeting = data.name ? `Hola ${escapeHtml(data.name)},` : "Hola,";

  return {
    subject: "Bienvenido a CRS LAB",
    html: baseEmailLayout(`
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">Bienvenido a CRS LAB</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">Tu cuenta ya esta lista. Puedes acceder a tu espacio y empezar a organizar el conocimiento de tu equipo.</p>
    `),
    text: [
      greeting,
      "Tu cuenta ya esta lista en CRS LAB.",
      "Puedes acceder a tu espacio y empezar a organizar el conocimiento de tu equipo.",
    ].join("\n\n"),
  };
}
