/**
 * Whitelabel helpers for client-facing document rendering (proposals,
 * contracts, invoices). The "Powered by Earnest." footer is on by default;
 * paid-tier orgs can hide it via `organizations.whitelabel`.
 */

export type OrgPlan = 'free' | 'solo' | 'studio' | 'agency' | 'enterprise' | string | null | undefined;

const WHITELABEL_PLANS: ReadonlySet<string> = new Set(['studio', 'agency', 'enterprise']);

export function planSupportsWhitelabel(plan: OrgPlan): boolean {
  return !!plan && WHITELABEL_PLANS.has(String(plan).toLowerCase());
}

export function shouldHideEarnestFooter(opts: {
  whitelabel?: boolean | null;
  plan?: OrgPlan;
}): boolean {
  return !!opts.whitelabel && planSupportsWhitelabel(opts.plan);
}
