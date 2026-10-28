import {
  actionButton,
  baseEmailLayout,
  BRAND,
  escapeHtml,
  featureList,
  getAppUrl,
  type EmailTemplate,
} from "@/lib/email/templates/shared";

const FEATURES = [
  { title: "Sube tus documentos", text: "Facturas, nóminas, recibos… Crussader los lee y guarda sus datos ordenados en tablas." },
  { title: "Conecta Google Drive", text: "Elige una carpeta y lo que añadas ahí se importa sin tener que subirlo a mano." },
  { title: "Mira tus números", text: "Gastos, ingresos y proveedores en la Analítica, con cada dato enlazado a su documento." },
];

export function welcomeTemplate(data: {
  name?: string | null;
  email?: string | null;
  logoUrl?: string;
}): EmailTemplate {
  const firstName = data.name?.trim().split(/\s+/)[0] ?? "";
  const title = firstName ? `Te damos la bienvenida, ${escapeHtml(firstName)}` : "Te damos la bienvenida";
  const appUrl = getAppUrl();

  return {
    subject: `Bienvenido a ${BRAND.name}`,
    html: baseEmailLayout(`
      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;color:${BRAND.ink};">${title}</h1>
      <p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.muted};">Tu cuenta de ${BRAND.name} ya está lista. Convierte tus documentos en datos con los que tomar decisiones, sin teclear nada.</p>
      ${actionButton(`${appUrl}/knowledge`, `Entrar en ${BRAND.name}`)}
      <div style="height:1px;background:${BRAND.line};line-height:1px;font-size:0;margin:4px 0 20px;">&nbsp;</div>
      <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.muted};">Para empezar</p>
      ${featureList(FEATURES)}
    `, {
      preheader: "Tu cuenta ya está lista: sube tus primeros documentos y mira tus números.",
      reason: data.email ? `Recibes este correo porque se ha creado una cuenta de ${BRAND.name} con ${data.email}.` : `Recibes este correo porque se ha creado una cuenta de ${BRAND.name}.`,
      logoUrl: data.logoUrl,
    }),
    text: [
      firstName ? `Hola ${firstName},` : "Hola,",
      `Tu cuenta de ${BRAND.name} ya está lista. Convierte tus documentos en datos con los que tomar decisiones, sin teclear nada.`,
      `Entrar en ${BRAND.name}: ${appUrl}/knowledge`,
      "Para empezar:",
      ...FEATURES.map((f, i) => `${i + 1}. ${f.title}: ${f.text}`),
      `— El equipo de ${BRAND.name} · ${BRAND.site}`,
    ].join("\n\n"),
  };
}
