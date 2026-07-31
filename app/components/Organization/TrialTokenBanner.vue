<script setup lang="ts">
// Proactive nudge shown when a NO-CARD trial org is ~80%+ through its bounded AI
// token grant. Adding a card unlocks the plan's full monthly allotment (which
// bumps the limit, so this banner then self-hides). Dismissible for the session.
const { usageSummary } = useAITokens();
const { currentOrg } = useOrganization();

const dismissed = ref(false);
const DISMISS_KEY = 'trial-token-banner-dismissed';

const onTrial = computed(() => (currentOrg.value as any)?.subscription_status === 'trialing');

const pct = computed(() => {
  const s = usageSummary.value;
  if (!s?.orgLimit) return 0;
  return Math.min(100, Math.round((s.orgTokensUsed / s.orgLimit) * 100));
});

const show = computed(() =>
  !dismissed.value &&
  onTrial.value &&
  (usageSummary.value?.orgLimit ?? 0) > 0 &&
  pct.value >= 80,
);

const planLabel = computed(() => {
  const p = (currentOrg.value as any)?.plan;
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'plan';
});

const atLimit = computed(() => pct.value >= 100);

onMounted(() => {
  try { if (sessionStorage.getItem(DISMISS_KEY) === '1') dismissed.value = true; } catch { /* private mode */ }
});

function dismiss() {
  dismissed.value = true;
  try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="ttb">
      <div class="ttb__icon">
        <Icon name="lucide:sparkles" class="w-4 h-4" />
      </div>
      <div class="ttb__body">
        <p class="ttb__title">
          {{ atLimit
            ? "You've used all the AI included in your free trial."
            : `You've used ${pct}% of your trial's AI tokens.` }}
        </p>
        <p class="ttb__sub">
          Add a card to unlock your {{ planLabel }} plan's full monthly allotment — no charge during your trial.
        </p>
      </div>
      <div class="ttb__actions">
        <NuxtLink to="/organization/upgrade" class="ttb__cta">Add a card</NuxtLink>
        <button type="button" class="ttb__dismiss" aria-label="Dismiss" @click="dismiss">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ttb {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 1rem;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid hsl(var(--primary) / 0.35);
  background: hsl(var(--primary) / 0.08);
}
.ttb__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  flex-shrink: 0;
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}
.ttb__body { flex: 1; min-width: 0; }
.ttb__title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  line-height: 1.3;
}
.ttb__sub {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  line-height: 1.3;
  margin-top: 2px;
}
.ttb__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.ttb__cta {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  transition: opacity 200ms ease;
}
.ttb__cta:hover { opacity: 0.9; }
.ttb__dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  color: hsl(var(--muted-foreground));
  transition: background-color 200ms ease, color 200ms ease;
}
.ttb__dismiss:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}

.fade-enter-active, .fade-leave-active { transition: opacity 240ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
