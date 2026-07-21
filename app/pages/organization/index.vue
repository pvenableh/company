<script setup lang="ts">
// The classic /organization settings page has been RETIRED. Every capability
// moved into the modern Apps shell, so this route now redirects, preserving the
// user's intent from the old `?tab=` deep-links:
//
//   ?tab=billing        → Money > Deposits   (Stripe Connect — getting paid)
//   ?tab=ai-usage       → Organization > AI & Tokens
//   ?tab=members        → Organization > Members
//   ?tab=client-access  → Organization > Members  (Client Portal Access lives here)
//   ?tab=teams          → Organization > Teams
//   (overview / none)   → Organization > Overview
//
// Any remaining query params (Stripe OAuth return: connect_linked / connect_error
// / onboarding, token purchase flags, etc.) are forwarded to the destination so
// the return-leg watchers on the modern floors still fire.
definePageMeta({ middleware: ['auth'] });

const route = useRoute();

function buildQuery(base: Record<string, string>, rest: Record<string, unknown>): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(rest)) {
    if (v == null) continue;
    params.set(k, String(Array.isArray(v) ? v[0] : v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function resolveTarget(): string {
  const { tab, ...rest } = route.query as Record<string, unknown>;
  const tabKey = typeof tab === 'string' ? tab : undefined;

  // Stripe Connect (getting paid by clients) lived on the classic billing tab;
  // it now lives on Money > Deposits — NOT the SaaS-subscription billing floor.
  if (tabKey === 'billing') {
    return `/apps/money${buildQuery({ floor: 'deposits' }, rest)}`;
  }

  const floorByTab: Record<string, string> = {
    members: 'members',
    'client-access': 'members',
    teams: 'teams',
    'ai-usage': 'ai',
    overview: 'overview',
  };
  const floor = tabKey ? floorByTab[tabKey] : undefined;
  const base = floor && floor !== 'overview' ? { floor } : {};
  return `/apps/organization${buildQuery(base, rest)}`;
}

await navigateTo(resolveTarget(), { replace: true });
</script>

<template>
  <div />
</template>
