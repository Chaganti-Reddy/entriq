// apps/api/src/services/sms.ts
// Fast2SMS integration for OTP delivery (India only, +91).
// Docs: https://docs.fast2sms.com

import { getEnv } from '../lib/env.js';

/** Send a 6-digit OTP via Fast2SMS DLT route (India only). */
export async function sendOtp(phone: string, otp: string): Promise<void> {
  const apiKey = getEnv('FAST2SMS_API_KEY');

  if (!apiKey) {
    // Dev mode — just log the OTP instead of sending
    console.warn(`[sms] FAST2SMS_API_KEY not set. OTP for ${phone}: ${otp}`);
    return;
  }

  // phone should be 10 digits (we strip +91 if present)
  const normalized = phone.replace(/^\+91/, '').replace(/\D/g, '');

  const payload = new URLSearchParams({
    authorization: apiKey,
    route:         'otp',
    variables_values: otp,
    flash:         '0',
    numbers:       normalized,
  });

  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: payload.toString(),
  });

  const json = await res.json() as { return: boolean; message?: string[] };

  if (!json.return) {
    const msg = json.message?.join(', ') ?? 'Unknown SMS error';
    console.error('[sms] Fast2SMS error:', msg);
    // Surface a user-friendly error so callers can return 503
    const isLowBalance = msg.toLowerCase().includes('balance') || msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('wallet');
    const displayMsg   = isLowBalance
      ? 'SMS service temporarily unavailable. Please try again later or contact support.'
      : `SMS delivery failed: ${msg}`;
    const err = new Error(displayMsg) as Error & { smsError: true; isLowBalance: boolean };
    err.smsError    = true;
    err.isLowBalance = isLowBalance;
    throw err;
  }
}

/** Generate a cryptographically random 6-digit OTP string. */
export function generateOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 900000 + 100000); // always 6 digits: 100000–999999
}
