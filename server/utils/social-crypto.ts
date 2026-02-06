/**
 * Social Token Encryption Utility
 *
 * Encrypts/decrypts OAuth tokens at rest using AES-256-GCM.
 * The encryption key is sourced from the SOCIAL_ENCRYPTION_KEY environment variable.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH)
}

function getEncryptionKey(): string {
  const config = useRuntimeConfig()
  const key = config.social?.encryptionKey || process.env.SOCIAL_ENCRYPTION_KEY
  if (!key || key.length < 32) {
    throw new Error('SOCIAL_ENCRYPTION_KEY must be set and at least 32 characters')
  }
  return key
}

/**
 * Encrypt a plaintext string.
 * Returns base64: salt (16) + iv (16) + tag (16) + ciphertext
 */
export function encryptSocialToken(plaintext: string): string {
  const password = getEncryptionKey()
  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64')
}

/**
 * Decrypt a base64 encrypted string.
 */
export function decryptSocialToken(encryptedBase64: string): string {
  const password = getEncryptionKey()
  const buffer = Buffer.from(encryptedBase64, 'base64')

  const salt = buffer.subarray(0, SALT_LENGTH)
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const ciphertext = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  const key = deriveKey(password, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Safe decrypt — returns null on failure.
 */
export function safeDecryptSocialToken(encryptedBase64: string): string | null {
  try {
    return decryptSocialToken(encryptedBase64)
  } catch {
    console.error('[social-crypto] Failed to decrypt token')
    return null
  }
}
