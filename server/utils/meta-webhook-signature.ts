/**
 * Verify Meta webhook payload signatures.
 *
 * Meta signs each webhook POST with X-Hub-Signature-256 = sha256=<hex>, where
 * <hex> is HMAC-SHA256(rawBody, appSecret). We must compute the same hash over
 * the *raw* request body (not the parsed object) and timing-safe-compare.
 *
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyMetaWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  if (!appSecret) return false

  const provided = Buffer.from(signatureHeader.slice('sha256='.length), 'hex')
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody
  const expected = createHmac('sha256', appSecret).update(body).digest()

  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
