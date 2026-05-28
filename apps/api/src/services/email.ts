// apps/api/src/services/email.ts
// Email service using Resend SDK.
// Sends the QR entry pass to registrants.

import { Resend } from 'resend';
import { getEnv } from '../lib/env.js';

// Lazy init — Resend client is created on first email send so CF Workers
// env bindings are available at request time.
let resend: Resend | null = null;

function getResend(): Resend | null {
  if (resend) return resend;
  const apiKey = getEnv('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — emails will not be sent');
    return null;
  }
  resend = new Resend(apiKey);
  return resend;
}

// From address — must be a verified domain in Resend.
// Use onboarding@resend.dev for testing without a custom domain.
const getFromAddress = () => getEnv('EMAIL_FROM') || 'Entriq <onboarding@resend.dev>';

interface SendQREmailParams {
  to: string;
  participantName: string;
  eventName: string;
  eventDate: string | null;
  eventLocation: string | null;
  uniqueCode: string;
  qrUrl: string;
}

export async function sendQREmail(params: SendQREmailParams): Promise<void> {
  const {
    to,
    participantName,
    eventName,
    eventDate,
    eventLocation,
    uniqueCode,
    qrUrl,
  } = params;

  if (!resend) resend = getResend();
  if (!resend) {
    console.warn('[email] Skipping email send — RESEND_API_KEY not configured');
    return;
  }

  const dateStr = eventDate
    ? new Date(eventDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date TBD';

  const html = buildEmailHTML({
    participantName: escapeHtml(participantName),
    eventName: escapeHtml(eventName),
    dateStr: escapeHtml(dateStr),
    eventLocation: eventLocation ? escapeHtml(eventLocation) : null,
    uniqueCode: escapeHtml(uniqueCode),
    qrUrl, // URL — not displayed as text, safe in src attribute
  });

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: `Your QR Entry Pass — ${eventName}`,
    html,
  });

  if (error) {
    // Log error and reject — the caller (.catch in registrations route) will handle it.
    // The email_sent flag stays false so it can be retried.
    console.error('[email] Failed to send QR email:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }
}

/** Escape user-supplied strings before inserting into HTML to prevent XSS in email clients. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function buildEmailHTML(params: {
  participantName: string;
  eventName: string;
  dateStr: string;
  eventLocation: string | null;
  uniqueCode: string;
  qrUrl: string;
}): string {
  const { participantName, eventName, dateStr, eventLocation, uniqueCode, qrUrl } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your QR Entry Pass — ${eventName}</title>
</head>
<body style="margin:0;padding:0;background:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;">
              <span style="font-size:22px;font-weight:700;color:#FAFAFA;letter-spacing:-0.5px;">
                ◈ Entriq
              </span>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#18181B;border:1px solid #27272A;border-radius:16px;padding:40px;">

              <!-- Greeting -->
              <p style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#FAFAFA;">
                You're in, ${participantName}!
              </p>
              <p style="margin:0 0 32px 0;font-size:15px;color:#A1A1AA;line-height:1.6;">
                Your registration for <strong style="color:#FAFAFA;">${eventName}</strong> is confirmed.
                Show the QR code below at the entry gate.
              </p>

              <!-- Event details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#27272A;border-radius:12px;padding:20px;">
                    <p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Event</p>
                    <p style="margin:0 0 14px 0;font-size:16px;font-weight:600;color:#FAFAFA;">${eventName}</p>
                    <p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Date</p>
                    <p style="margin:0 0 14px 0;font-size:14px;color:#A1A1AA;">${dateStr}</p>
                    ${
                      eventLocation
                        ? `<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Location</p>
                    <p style="margin:0;font-size:14px;color:#A1A1AA;">${eventLocation}</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>

              <!-- QR Code -->
              <p style="margin:0 0 16px 0;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Your Entry QR Code</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center" style="background:#FFFFFF;border-radius:16px;padding:24px;">
                    <img src="${qrUrl}" alt="QR Entry Pass" width="220" height="220"
                      style="display:block;border:0;" />
                  </td>
                </tr>
              </table>

              <!-- Registration ID -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#09090B;border:1px solid #27272A;border-radius:10px;padding:14px 20px;">
                    <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:0.8px;">Registration ID</p>
                    <p style="margin:0;font-family:'Courier New',monospace;font-size:14px;color:#8B5CF6;font-weight:600;">${uniqueCode}</p>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <p style="margin:0;font-size:13px;color:#71717A;line-height:1.7;border-top:1px solid #27272A;padding-top:24px;">
                📱 <strong style="color:#A1A1AA;">Instructions:</strong> Show this QR code at the entry gate.
                The gate staff will scan it and approve your entry.
                Please arrive a few minutes early.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#3F3F46;">
                Powered by <strong style="color:#71717A;">Entriq</strong> · QR-based event entry verification
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
