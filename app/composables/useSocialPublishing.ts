/**
 * Social publishing kill-switch (client side). Reads the
 * `public.socialPublishingEnabled` runtime-config flag.
 *
 * While false the UI hides external publishing, scheduled auto-publish,
 * social analytics, and social inbox/messaging. Studio content creation and
 * the manual River/calendar planner (an Earnest-only planning concept) stay
 * visible. Flip the flag — see nuxt.config.ts — to restore everything once
 * the Meta/LinkedIn app credentials are approved.
 */
export function useSocialPublishing() {
  const config = useRuntimeConfig();
  const socialPublishingEnabled = computed(() => !!(config.public as any).socialPublishingEnabled);
  return { socialPublishingEnabled };
}
