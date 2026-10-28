/**
 * Shared look of every Crussader email: logo and name on top, a white card, and a footer. Email-safe HTML only
 * (tables and inline styles, no external CSS or web fonts), so it looks the same in Gmail, Outlook and Apple Mail.
 */
export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export const BRAND = {
  name: "Crussader",
  site: "crussader.com",
  blue: "#0A58FF",
  ink: "#0F172A",
  muted: "#64748B",
  line: "#E2E8F0",
  page: "#F4F6FA",
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Absolute URL of the app (links and the logo must be absolute in an email). */
export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type LayoutOptions = {
  /** Short line shown by the inbox next to the subject (hidden in the body). */
  preheader?: string;
  /** Why the person gets this email (footer). */
  reason?: string;
  /** Logo URL (defaults to the app's own). */
  logoUrl?: string;
};

export function baseEmailLayout(content: string, options: LayoutOptions = {}) {
  const appUrl = getAppUrl();
  const logo = options.logoUrl ?? `${appUrl}/email/logo-mark.png`;
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(options.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";
  return `
    <div style="margin:0;padding:0;background:${BRAND.page};">
      ${preheader}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.page};font-family:${FONT};color:${BRAND.ink};">
        <tr>
          <td align="center" style="padding:40px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
              <tr>
                <td style="padding:0 4px 24px;">
                  <a href="${appUrl}" style="text-decoration:none;color:${BRAND.ink};">
                    <img src="${escapeHtml(logo)}" width="36" height="36" alt="${BRAND.name}" style="display:inline-block;vertical-align:middle;border:0;border-radius:9px;" />
                    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${BRAND.ink};">${BRAND.name}</span>
                  </a>
                </td>
              </tr>
              <tr>
                <td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
                  <div style="height:4px;background:${BRAND.blue};line-height:4px;font-size:0;">&nbsp;</div>
                  <div style="padding:40px 40px 36px;">
                    ${content}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                  ${options.reason ? `<p style="margin:0 0 8px;">${escapeHtml(options.reason)}</p>` : ""}
                  <p style="margin:0;">© ${new Date().getFullYear()} ${BRAND.name} · <a href="${appUrl}" style="color:${BRAND.muted};text-decoration:underline;">${BRAND.site}</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export function actionButton(href: string, label: string) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">
      <tr>
        <td style="border-radius:10px;background:${BRAND.blue};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;border-radius:10px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
            ${escapeHtml(label)} &rarr;
          </a>
        </td>
      </tr>
    </table>
  `;
}

/** A short list of steps or features: a blue numbered badge, a title and a line of text each. */
export function featureList(items: { title: string; text: string }[]) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 0;">
      ${items.map((item, i) => `
        <tr>
          <td width="40" valign="top" style="padding:14px 0 0;">
            <div style="width:28px;height:28px;border-radius:8px;background:#EDF3FF;color:${BRAND.blue};font-size:13px;font-weight:700;line-height:28px;text-align:center;">${i + 1}</div>
          </td>
          <td valign="top" style="padding:14px 0 0;">
            <p style="margin:0;font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(item.title)}</p>
            <p style="margin:2px 0 0;font-size:14px;line-height:1.55;color:${BRAND.muted};">${escapeHtml(item.text)}</p>
          </td>
        </tr>`).join("")}
    </table>
  `;
}
