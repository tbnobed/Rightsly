import sgMail from "@sendgrid/mail";
import { logger } from "./logger";
import { appBaseUrl } from "./sso";

/**
 * SendGrid email support.
 *
 * Configuration via environment variables (works on Replit and Ubuntu):
 *   - SENDGRID_API_KEY
 *   - SENDGRID_FROM_EMAIL
 *
 * All helpers are safe to call unconditionally: they no-op with a warning when
 * SendGrid is not configured, and they never throw to callers (errors are logged).
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

let apiKeyConfigured = false;

export function emailEnabled(): boolean {
  return Boolean(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL);
}

function ensureConfigured(): boolean {
  if (!emailEnabled()) return false;
  if (!apiKeyConfigured) {
    sgMail.setApiKey(SENDGRID_API_KEY as string);
    apiKeyConfigured = true;
  }
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wraps inner HTML in a simple branded template (TBN Rights Management,
 * slate/amber palette).
 */
function brandedHtml(innerHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background-color:#0f172a;padding:20px 32px;">
                <span style="color:#f8fafc;font-size:18px;font-weight:bold;">TBN Rights Management</span>
                <span style="display:inline-block;width:8px;"></span>
                <span style="color:#f59e0b;font-size:18px;font-weight:bold;">•</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:14px;line-height:1.6;color:#334155;">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:16px 32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;">
                This is an automated message from TBN Rights Management.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function amberButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background-color:#f59e0b;color:#0f172a;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:6px;">${escapeHtml(
    label,
  )}</a>`;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const { to, subject, html, text } = params;
  if (!ensureConfigured()) {
    logger.warn(
      { to, subject },
      "SendGrid is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipping email",
    );
    return;
  }
  try {
    await sgMail.send({
      to,
      from: SENDGRID_FROM_EMAIL as string,
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email via SendGrid");
  }
}

export async function sendWelcomeEmail(user: {
  email: string;
  name: string;
}): Promise<void> {
  const loginUrl = `${appBaseUrl()}/login`;
  const inner = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Welcome, ${escapeHtml(
      user.name,
    )}!</h1>
    <p style="margin:0 0 16px;">Your account for <strong>TBN Rights Management</strong> has been created via single sign-on.</p>
    <p style="margin:0 0 24px;">You can sign in any time using your organization's SSO login.</p>
    <p style="margin:0 0 24px;">${amberButton(loginUrl, "Open TBN Rights Management")}</p>
  `;
  await sendEmail({
    to: user.email,
    subject: "Welcome to TBN Rights Management",
    html: brandedHtml(inner),
  });
}

export async function sendNotificationEmail(
  user: { email: string; name?: string },
  notification: { title: string; message?: string | null; link?: string | null },
): Promise<void> {
  const link = notification.link ? `${appBaseUrl()}${notification.link}` : null;
  const inner = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#0f172a;">${escapeHtml(
      notification.title,
    )}</h1>
    ${
      notification.message
        ? `<p style="margin:0 0 24px;">${escapeHtml(notification.message)}</p>`
        : ""
    }
    ${link ? `<p style="margin:0 0 24px;">${amberButton(link, "View details")}</p>` : ""}
  `;
  await sendEmail({
    to: user.email,
    subject: notification.title,
    html: brandedHtml(inner),
  });
}
