/**
 * Whitelabel helpers — the SINGLE SOURCE OF TRUTH for whether a given org's
 * client-facing surfaces should hide Earnest branding.
 *
 * White-label is a commercial entitlement, not a free toggle. Per the pricing
 * model (see the onboarding wizard's `white_label` add-on and
 * `useOrgRole`/`server/utils/stripe.ts`):
 *
 *   Earnest branding is hidden  ⟺  organizations.whitelabel === true
 *                                   AND the org is ENTITLED to white-label
 *
 * where "entitled" means: plan is `enterprise` (implicitly includes every
 * add-on) OR the org holds the `white_label` add-on (`active_addons.white_label`).
 *
 * EVERY surface that removes Earnest branding — documents (invoices, contracts,
 * proposals), the client portal shell, transactional emails, the invite-accept
 * page, and the public booking page — MUST gate on `isEarnestBrandingHidden()`
 * so they all agree. Do not read `org.whitelabel` raw; the raw flag is only a
 * user preference and is meaningless without the entitlement.
 */

export type OrgPlan = 'free' | 'solo' | 'studio' | 'agency' | 'enterprise' | string | null | undefined;

/** The add-on id that unlocks white-label (agency plan buys it; enterprise gets it free). */
export const WHITELABEL_ADDON_ID = 'white_label';

/** Minimal org shape the branding gate needs. */
export interface WhitelabelOrgInput {
  whitelabel?: boolean | null;
  plan?: OrgPlan;
  active_addons?: Record<string, unknown> | null;
}

/**
 * True if the org is ENTITLED to remove Earnest branding — regardless of
 * whether they've toggled it on. Enterprise implicitly includes every add-on;
 * everyone else needs the `white_label` add-on active.
 */
export function orgEntitledToWhitelabel(org: WhitelabelOrgInput | null | undefined): boolean {
  if (!org) return false;
  if (String(org.plan ?? '').toLowerCase() === 'enterprise') return true;
  const addons = org.active_addons;
  return !!(addons && typeof addons === 'object' && (addons as Record<string, unknown>)[WHITELABEL_ADDON_ID]);
}

/**
 * The one gate. True when Earnest branding should be hidden on this org's
 * client-facing surfaces: the org has toggled white-label ON *and* is entitled.
 */
export function isEarnestBrandingHidden(org: WhitelabelOrgInput | null | undefined): boolean {
  return !!org?.whitelabel && orgEntitledToWhitelabel(org);
}

/**
 * @deprecated Back-compat alias for document call sites. Prefer
 * `isEarnestBrandingHidden(org)`. Now accepts `active_addons` so the entitlement
 * is evaluated correctly; call sites should include it in their org selects.
 */
export function shouldHideEarnestFooter(opts: WhitelabelOrgInput): boolean {
  return isEarnestBrandingHidden(opts);
}
