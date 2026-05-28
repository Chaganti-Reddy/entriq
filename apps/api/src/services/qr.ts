// apps/api/src/services/qr.ts
// QR code unique code generation.
// QR images are generated CLIENT-SIDE on demand from the unique code — no external service needed.

import { randomUUID } from 'crypto';

/**
 * Generates a cryptographically random unique registration code.
 * Format: ENT-{32 hex chars uppercase}
 * Collision probability: ~1 in 2^128
 */
export function generateUniqueCode(): string {
  return `ENT-${randomUUID().replace(/-/g, '').toUpperCase()}`;
}

/**
 * Returns the URL that the QR code should encode (the scan page URL).
 * The actual QR image is generated client-side from this string.
 */
export function getScanUrl(uniqueCode: string, appUrl: string): string {
  return `${appUrl}/scan/${uniqueCode}`;
}
