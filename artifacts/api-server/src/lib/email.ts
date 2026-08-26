import sgMail from "@sendgrid/mail";
import { ReplitConnectors } from "@replit/connectors-sdk";
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
 * Wraps inner HTML in the Rightsly branded template
 * (ink #14201C, covenant green #1D9E75, brass #C9A24B, parchment #F4F1E9).
 */
function brandedHtml(innerHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F4F1E9;font-family:Arial,Helvetica,sans-serif;color:#14201C;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F1E9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e0d4;">
            <tr>
              <td style="background-color:#14201C;padding:20px 32px;">
                <span style="display:inline-block;width:3px;height:18px;background-color:#C9A24B;vertical-align:middle;"></span>
                <span style="display:inline-block;width:10px;"></span>
                <span style="color:#F4F1E9;font-size:18px;font-weight:500;vertical-align:middle;">Rightsly</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:14px;line-height:1.6;color:#3c463f;">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:#faf8f2;padding:16px 32px;font-size:12px;color:#5F6B64;border-top:1px solid #e4e0d4;">
                Automated message from Rightsly. Every contract in its right place.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function brandButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background-color:#1D9E75;color:#F4F1E9;text-decoration:none;font-weight:500;padding:10px 20px;border-radius:8px;">${escapeHtml(
    label,
  )}</a>`;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const { to, subject, html, text } = params;
  const plainText = text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (SENDGRID_FROM_EMAIL && !SENDGRID_API_KEY) {
    try {
      const connectors = new ReplitConnectors();
      const response = await connectors.proxy("sendgrid", "/v3/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: SENDGRID_FROM_EMAIL },
          subject,
          content: [
            { type: "text/plain", value: plainText },
            { type: "text/html", value: html },
          ],
        }),
      });
      if (!response.ok) throw new Error(`SendGrid returned ${response.status}`);
      return true;
    } catch (err) {
      if (!SENDGRID_API_KEY) {
        logger.error({ err, to, subject }, "Failed to send email via SendGrid connector");
        return false;
      }
      logger.warn({ err, to, subject }, "SendGrid connector failed; trying API key fallback");
    }
  }
  if (!ensureConfigured()) {
    logger.warn(
      { to, subject },
      "SendGrid is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipping email",
    );
    return false;
  }
  try {
    await sgMail.send({
      to,
      from: SENDGRID_FROM_EMAIL as string,
      subject,
      html,
      text: plainText,
    });
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email via SendGrid");
    return false;
  }
}

export async function sendInvitationEmail(user: { email: string; name: string }, token: string): Promise<boolean> {
  const inviteUrl = `${appBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  const inner = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">You're invited to Rightsly</h1>
    <p style="margin:0 0 16px;">Hello ${escapeHtml(user.name)}, an administrator has invited you to Rightsly.</p>
    <p style="margin:0 0 24px;">Use the secure link below to choose your password. This invitation expires in 72 hours and can only be used once.</p>
    <p style="margin:0 0 24px;">${brandButton(inviteUrl, "Choose password")}</p>
  `;
  return sendEmail({ to: user.email, subject: "You're invited to Rightsly", html: brandedHtml(inner) });
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
    <p style="margin:0 0 16px;">Your account for <strong>Rightsly</strong> has been created via single sign-on.</p>
    <p style="margin:0 0 24px;">You can sign in any time using your organization's SSO login.</p>
    <p style="margin:0 0 24px;">${brandButton(loginUrl, "Open Rightsly")}</p>
  `;
  await sendEmail({
    to: user.email,
    subject: "Welcome to Rightsly",
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
    ${link ? `<p style="margin:0 0 24px;">${brandButton(link, "View details")}</p>` : ""}
  `;
  await sendEmail({
    to: user.email,
    subject: notification.title,
    html: brandedHtml(inner),
  });
}

export async function sendNotificationDigestEmail(
  user: { email: string; name?: string },
  notifications: Array<{ title: string; message?: string | null; link?: string | null }>,
): Promise<void> {
  if (notifications.length === 0) return;
  if (notifications.length === 1) {
    await sendNotificationEmail(user, notifications[0]);
    return;
  }

  const items = notifications.map((notification) => {
    const link = notification.link ? `${appBaseUrl()}${notification.link}` : null;
    return `
      <li style="margin:0 0 16px;">
        <strong>${escapeHtml(notification.title)}</strong>
        ${notification.message ? `<br><span>${escapeHtml(notification.message)}</span>` : ""}
        ${link ? `<br><a href="${escapeHtml(link)}">View details</a>` : ""}
      </li>
    `;
  }).join("");
  const inner = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#0f172a;">You have ${notifications.length} new Rightsly notifications</h1>
    <ul style="margin:0 0 24px;padding-left:20px;">${items}</ul>
    <p style="margin:0 0 24px;">${brandButton(appBaseUrl(), "Open Rightsly")}</p>
  `;
  await sendEmail({
    to: user.email,
    subject: `Rightsly: ${notifications.length} new notifications`,
    html: brandedHtml(inner),
  });
}
