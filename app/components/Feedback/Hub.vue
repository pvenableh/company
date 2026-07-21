<script setup lang="ts">
/**
 * FeedbackHub — renders one org's aggregated client feedback (auto-imports as
 * <FeedbackHub>). Fetches /api/org/feedback?org=<id>. Reused by the per-org
 * staff page and the platform cross-org drill-in.
 */
const props = defineProps<{ org: string | null | undefined }>();

const { data, pending, error, refresh } = await useFetch('/api/org/feedback', {
	query: computed(() => ({ org: props.org })),
	immediate: !!props.org,
	watch: [() => props.org],
});

function fmtDate(d: string | null): string {
	if (!d) return '';
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const sections = computed(() => {
	const d = data.value as any;
	if (!d) return [];
	return [
		{ key: 'agency', label: 'Agency rating', icon: 'lucide:heart-handshake', hint: 'Private client → your team', ...d.agency },
		{ key: 'projects', label: 'Project satisfaction', icon: 'lucide:folder-check', hint: 'On completed projects', ...d.projects },
		{ key: 'tickets', label: 'Ticket satisfaction', icon: 'lucide:ticket-check', hint: 'On resolved tickets', ...d.tickets },
	];
});

// Combined recent stream across all three sources, newest first — the hub
// doubles as the staff "feedback inbox".
const stream = computed(() => {
	const d = data.value as any;
	if (!d) return [];
	const tag = (arr: any[], kind: string, icon: string) => (arr || []).map((r) => ({ ...r, kind, icon }));
	return [
		...tag(d.agency?.recent, 'Agency', 'lucide:heart-handshake'),
		...tag(d.projects?.recent, 'Project', 'lucide:folder-check'),
		...tag(d.tickets?.recent, 'Ticket', 'lucide:ticket-check'),
	].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
});
const recent = computed(() => stream.value.filter((r) => r.comment).slice(0, 30));
// "New this month" across all sources — the inbox recency signal.
const newThisMonth = computed(() => {
	const cutoff = Date.now() - 30 * 86400000;
	return stream.value.filter((r) => r.date && new Date(r.date).getTime() >= cutoff).length;
});
</script>

<template>
	<div>
		<div v-if="pending" class="flex items-center justify-center py-16">
			<Icon name="lucide:loader-2" class="w-7 h-7 text-muted-foreground animate-spin" />
		</div>
		<div v-else-if="error" class="ios-card p-6 text-center text-sm text-muted-foreground">
			{{ (error as any)?.data?.message || 'Could not load feedback.' }}
		</div>
		<template v-else>
			<!-- Score cards -->
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
				<div v-for="s in sections" :key="s.key" class="ios-card p-5">
					<div class="flex items-center gap-2 mb-2">
						<Icon :name="s.icon" class="w-3.5 h-3.5 text-muted-foreground" />
						<span class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{{ s.label }}</span>
					</div>
					<div class="flex items-end gap-2">
						<span class="text-2xl font-semibold leading-none tabular-nums">{{ s.count ? s.avg.toFixed(1) : '—' }}</span>
						<div class="flex items-center gap-0.5 mb-0.5">
							<Icon
								v-for="n in 5"
								:key="n"
								name="lucide:star"
								class="w-3.5 h-3.5"
								:class="n <= Math.round(s.avg) && s.count ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/25'"
							/>
						</div>
					</div>
					<p class="text-xs text-muted-foreground mt-1">
						{{ s.count ? `${s.count} rating${s.count === 1 ? '' : 's'}` : 'No ratings yet' }} · {{ s.hint }}
					</p>
				</div>
			</div>

			<!-- Recent comments -->
			<div class="ios-card p-5">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-4 flex items-center gap-2">
					<Icon name="lucide:message-square-quote" class="w-3.5 h-3.5" />
					Recent feedback
					<span
						v-if="newThisMonth"
						class="ml-1 normal-case tracking-normal text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary"
					>
						{{ newThisMonth }} new this month
					</span>
				</h3>
				<div v-if="recent.length" class="space-y-4">
					<div v-for="(r, i) in recent" :key="`${r.kind}-${r.id}-${i}`" class="flex items-start gap-3">
						<div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
							<Icon :name="r.icon" class="w-4 h-4 text-muted-foreground" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap mb-0.5">
								<div class="flex items-center gap-0.5">
									<Icon
										v-for="n in 5"
										:key="n"
										name="lucide:star"
										class="w-3 h-3"
										:class="n <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/25'"
									/>
								</div>
								<span class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ r.kind }}</span>
								<span v-if="r.clientName" class="text-xs text-muted-foreground">· {{ r.clientName }}</span>
								<span class="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{{ fmtDate(r.date) }}</span>
							</div>
							<p class="text-sm text-foreground/90">{{ r.comment }}</p>
							<p v-if="r.title" class="text-xs text-muted-foreground truncate">re: {{ r.title }}</p>
						</div>
					</div>
				</div>
				<p v-else class="text-sm text-muted-foreground text-center py-8">
					No written feedback yet. Ratings appear here as clients rate work and your team.
				</p>
			</div>
		</template>
	</div>
</template>
