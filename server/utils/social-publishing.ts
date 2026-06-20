import type { H3Event } from 'h3'

/**
 * Social publishing kill-switch (server side). Mirrors the
 * `public.socialPublishingEnabled` runtime-config flag.
 *
 * While false the external publish endpoints hard-refuse and the
 * scheduled-publish cron no-ops — Studio content creation and the manual
 * River/calendar planner stay fully live. Flip the flag (or
 * NUXT_PUBLIC_SOCIAL_PUBLISHING_ENABLED=true) once the Meta/LinkedIn app
 * credentials are approved to restore live posting.
 */
export function isSocialPublishingEnabled(event?: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return !!(config.public as any)?.socialPublishingEnabled
}
