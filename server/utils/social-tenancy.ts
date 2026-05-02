/**
 * Resolve the active organization for a social request and verify the caller
 * is an active member. Mirrors the marketing-perms pattern.
 *
 * Order of resolution:
 *  1. ?organization=<UUID> query param (explicit)
 *  2. selectedOrganization cookie (set by app/composables/useOrganization.js)
 *  3. body.organization (for POST/PATCH)
 *
 * Throws 401 if not authenticated, 400 if no org resolvable, 403 if not a member.
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms'

export async function requireSocialOrg(event: any, fallbackOrgId?: string | null): Promise<{ userId: string; organizationId: string }> {
  const session = await requireUserSession(event)
  const userId = (session as any).user?.id as string | undefined
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const query = getQuery(event)
  const cookieOrg = getCookie(event, 'selectedOrganization')
  const orgId = (query.organization as string | undefined) || cookieOrg || fallbackOrgId || null

  if (!orgId) {
    throw createError({ statusCode: 400, message: 'No active organization. Set selectedOrganization cookie or pass ?organization.' })
  }

  await requireOrgMembership(event, orgId)
  return { userId, organizationId: orgId }
}

/**
 * State token for OAuth flows: encodes orgId + a CSRF nonce, base64url.
 * On callback, the caller verifies the user is still a member of the
 * decoded org before any side effects.
 */
export function encodeOAuthState(orgId: string): string {
  const nonce = Math.random().toString(36).slice(2, 12)
  return Buffer.from(`${orgId}:${nonce}`, 'utf8').toString('base64url')
}

export function decodeOAuthState(state: string | undefined): { organizationId: string } {
  if (!state) throw createError({ statusCode: 400, message: 'Missing OAuth state' })
  let decoded: string
  try {
    decoded = Buffer.from(state, 'base64url').toString('utf8')
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid OAuth state' })
  }
  const [organizationId] = decoded.split(':')
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    throw createError({ statusCode: 400, message: 'Invalid OAuth state payload' })
  }
  return { organizationId }
}
