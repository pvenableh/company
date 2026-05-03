/**
 * Meta `signed_request` parser.
 *
 * Used for deauthorize and data-deletion callbacks. Meta posts a single form
 * field `signed_request` whose value is `<base64url-sig>.<base64url-payload>`.
 * The signature is HMAC-SHA256 of the raw payload string, keyed by the App
 * Secret. Reject any payload whose signature doesn't match.
 *
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow#parsingsr
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface MetaSignedPayload {
  user_id: string
  algorithm: string
  issued_at?: number
  [key: string]: unknown
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64')
}

export function parseSignedRequest(signedRequest: string, appSecret: string): MetaSignedPayload {
  if (!signedRequest || !signedRequest.includes('.')) {
    throw new Error('Malformed signed_request')
  }

  const [encodedSig, encodedPayload] = signedRequest.split('.', 2)
  const expectedSig = createHmac('sha256', appSecret).update(encodedPayload).digest()
  const providedSig = base64UrlDecode(encodedSig)

  if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
    throw new Error('Invalid signed_request signature')
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as MetaSignedPayload

  if (payload.algorithm !== 'HMAC-SHA256') {
    throw new Error(`Unsupported algorithm: ${payload.algorithm}`)
  }

  return payload
}
