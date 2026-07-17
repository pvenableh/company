<!--
	AccountSubscriptionPanel — slide-over wrapper around the Subscription &
	Billing surface. Singleton (no per-id route), so `id` is a sentinel
	(`'default'`). Replaces the `/account/subscription` punch-out from the
	Integrations floor's Plaid CTA.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();
</script>

<template>
	<AppSlideOverShell
		title="Subscription"
		subtitle="Plan, billing, and payment methods"
		@close="$emit('close')"
	>
		<template #actions>
			<NuxtLink
				to="/apps/organization?floor=billing"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				title="Open the subscription page in a full window"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<AppsAccountSubscriptionSurface compact />
	</AppSlideOverShell>
</template>
