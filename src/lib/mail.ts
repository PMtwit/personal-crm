import "server-only";

import nodemailer from "nodemailer";

// The sender and the subject are fixed: they are the same for everyone
const SENDER = { name: "Личная CRM", address: "noreply@mail.crm.pmcrm.site" };
const SUBJECT = "Вход в Личную CRM";

const EXPIRES_TEXT = "Ссылка работает 15 минут";
const IGNORE_TEXT =
  "Если вы не запрашивали вход - просто проигнорируйте письмо";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Mail programs do not understand CSS variables, so the colors are written
// out in the letter. They are the values of the design tokens in globals.css:
// this is the one place outside the tokens
const COLORS = {
  background: "#ffffff",
  foreground: "#1d2023",
  mutedForeground: "#525c66",
  primary: "#ff0032",
  primaryForeground: "#ffffff",
};

function html(link: string): string {
  const href = escapeHtml(link);
  return `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px;background:${COLORS.background};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${COLORS.foreground};">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:600;">Личная CRM</p>
      <a href="${href}" style="display:inline-block;padding:14px 28px;border-radius:16px;background:${COLORS.primary};color:${COLORS.primaryForeground};font-size:16px;font-weight:600;text-decoration:none;">Войти</a>
      <p style="margin:24px 0 8px;font-size:15px;">${EXPIRES_TEXT}.</p>
      <p style="margin:0;font-size:14px;color:${COLORS.mutedForeground};">${IGNORE_TEXT}</p>
    </div>
  </body>
</html>`;
}

function text(link: string): string {
  return `Войти в Личную CRM: ${link}

${EXPIRES_TEXT}.

${IGNORE_TEXT}`;
}

// Sends the login letter. Where it goes is decided by SMTP_URL, not by the
// code: Mailpit on a computer and in tests, Resend on the server.
// Neither the address nor the link is written to the logs
export async function sendSignInEmail(
  email: string,
  link: string,
): Promise<void> {
  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) {
    throw new Error("SMTP_URL is not set");
  }
  const transport = nodemailer.createTransport(smtpUrl);
  try {
    await transport.sendMail({
      from: SENDER,
      to: email,
      subject: SUBJECT,
      text: text(link),
      html: html(link),
    });
  } finally {
    transport.close();
  }
}
