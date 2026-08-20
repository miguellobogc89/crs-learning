export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function baseEmailLayout(content: string) {
  return `
    <div style="margin:0;padding:32px 0;background:#f6f8fb;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
              <tr>
                <td>
                  <p style="margin:0 0 24px;font-size:15px;font-weight:700;color:#1DA1F2;">CRS LAB</p>
                  ${content}
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
    <p style="margin:24px 0;">
      <a href="${escapeHtml(href)}" style="display:inline-block;border-radius:8px;background:#1DA1F2;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">
        ${escapeHtml(label)}
      </a>
    </p>
  `;
}
