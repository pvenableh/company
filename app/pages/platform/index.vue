<script setup lang="ts">
/**
 * /platform — the Earnest creator's cross-org console.
 *
 * Every organization with a feedback summary; click through to any org's full
 * feedback hub (/feedback?org=<id>). Gated server-side to platform admins
 * (global Directus Administrator) — which grants no access they don't already
 * have via admin.earnest.guru, so it's a safe convenience surface.
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Platform | Earnest' });

const { data: orgs, pending, error } = await useFetch<Array<any>>('/api/platform/orgs');

const denied = computed(() => (error.value as any)?.statusCode === 403);
const active = computed(() => (orgs.value || []).filter((o) => !o.archived));
const archived = computed(() => (orgs.value || []).filter((o) => o.archived));
</script>

<template>
	<LayoutPageContainer>
		<AppHeader title="Platform" />
		<p class="text-sm text-muted-foreground mb-6 -mt-1">
			Every organization on Earnest, at a glance. Open any one to see its full client feedback.
		</p>

		<div v-if="pending" class="flex items-center justify-center py-20">
			<Icon name="lucide:loader-2" class="w-7 h-7 text-muted-foreground animate-spin" />
		</div>

		<div v-else-if="denied" class="ios-card p-8 text-center">
			<Icon name="lucide:lock" class="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
			<p class="text-sm text-muted-foreground">This area is for Earnest platform administrators.</p>
		</div>

		<template v-else>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<NuxtLink
					v-for="o in active"
					:key="o.id"
					:to="`/feedback?org=${o.id}`"
					class="ios-card p-5 hover:bg-muted/30 transition-colors group"
				>
					<div class="flex items-center justify-between mb-3">
						<span class="font-semibold truncate">{{ o.name }}</span>
						<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
					</div>
					<div class="flex items-center gap-5">
						<div>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Agency</p>
							<p class="text-lg font-semibold tabular-nums leading-none">
								{{ o.agency.count ? o.agency.avg.toFixed(1) : '—' }}
								<span class="text-[11px] text-muted-foreground font-normal">/5</span>
							</p>
							<p class="text-[10px] text-muted-foreground">{{ o.agency.count }} rating{{ o.agency.count === 1 ? '' : 's' }}</p>
						</div>
						<div>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Delivery CSAT</p>
							<p class="text-lg font-semibold tabular-nums leading-none">
								{{ o.csat.count ? o.csat.avg.toFixed(1) : '—' }}
								<span class="text-[11px] text-muted-foreground font-normal">/5</span>
							</p>
							<p class="text-[10px] text-muted-foreground">{{ o.csat.count }} rating{{ o.csat.count === 1 ? '' : 's' }}</p>
						</div>
					</div>
				</NuxtLink>
			</div>

			<div v-if="archived.length" class="mt-8">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Archived</h3>
				<div class="flex flex-wrap gap-2">
					<NuxtLink
						v-for="o in archived"
						:key="o.id"
						:to="`/feedback?org=${o.id}`"
						class="text-xs px-3 py-1.5 rounded-full bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
					>
						{{ o.name }}
					</NuxtLink>
				</div>
			</div>
		</template>
	</LayoutPageContainer>
</template>
