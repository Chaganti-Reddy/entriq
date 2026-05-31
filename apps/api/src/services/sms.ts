// apps/api/src/services/sms.ts
// 2Factor.in integration for OTP delivery (India only, +91).
// Docs: https://2factor.in/API/

import { getEnv } from '../lib/env.js';

/** Send a 6-digit OTP via 2Factor.in (India only). */
export async function sendOtp(phone: string, otp: string): Promise<void> {
  const apiKey = getEnv('TWOFACTOR_API_KEY');

  if (!apiKey) {
    console.warn(`[sms] TWOFACTOR_API_KEY not set. OTP for ${phone}: ${otp}`);
    return;
  }

  const normalized = phone.replace(/^\+91/, '').replace(/\D/g, '');
  const url = `https://2factor.in/API/V1/${apiKey}/SMS/${normalized}/${otp}`;

  const res  = await fetch(url);
  const json = await res.json() as { Status: string; Details: string };

  if (json.Status !== 'Success') {
    console.error('[sms] 2Factor error:', json.Details);
    const isLowBalance = json.Details?.toLowerCase().includes('balance') || json.Details?.toLowerCase().includes('credit');
    const displayMsg = isLowBalance
      ? 'SMS service temporarily unavailable. Please try again later or contact support.'
      : `SMS delivery failed: ${json.Details}`;
    const err = new Error(displayMsg) as Error & { smsError: true; isLowBalance: boolean };
    err.smsError     = true;
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
