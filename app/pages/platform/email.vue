<script setup lang="ts">
/**
 * /platform/email — the Earnest creator's CROSS-ORG email activity console.
 *
 * Every org's SendGrid delivery events (transactional + campaign) in one place,
 * filterable by org / window / kind, with a per-org roll-up. Gated server-side
 * to platform admins via /api/platform/email-events (403 → denied state). The
 * per-org /email/activity page is the org-scoped sibling.
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Platform Email | Earnest' });

const range = ref<7 | 30 | 90>(30);
const scope = ref<'all' | 'campaign' | 'transactional'>('all');
const orgFilter = ref<string>(''); // '' = all orgs

const RANGES = [
	{ value: 7, label: 'Last 7 days' },
	{ value: 30, label: 'Last 30 days' },
	{ value: 90, label: 'Last 90 days' },
] as const;
const SCOPES = [
	{ value: 'all', label: 'All' },
	{ value: 'campaign', label: 'Campaigns' },
	{ value: 'transactional', label: 'Transactional' },
] as const;

// Org roster (for the picker + id→name mapping). Non-fatal if it 403s.
const { data: orgsData } = await useFetch<Array<any>>('/api/platform/orgs', { default: () => [] });
const orgs = computed(() => orgsData.value || []);
const orgName = (id: string | null) => (id && orgs.value.find((o) => o.id === id)?.name) || '—';

// Cross-org events. Refetches on range/org change; scope is filtered client-side.
const { data: eventsData, pending, error } = await useFetch<{ events: any[] }>('/api/platform/email-events', {
	query: computed(() => ({ days: range.value, org: orgFilter.value || undefined })),
	default: () => ({ events: [] }),
});
const denied = computed(() => (error.value as any)?.statusCode === 403);
const allEvents = computed(() => eventsData.value?.events || []);
const events = computed(() => {
	if (scope.value === 'campaign') return allEvents.value.filter((e: any) => e.email_id);
	if (scope.value === 'transactional') return allEvents.value.filter((e: any) => !e.email_id);
	return allEvents.value;
});

// ── Aggregate KPIs over the current selection ──
const stats = computed(() => {
	const counts: Record<string, number> = {};
	const uniqueOpens = new Set<string>();
	const uniqueClicks = new Set<string>();
	for (const e of events.value) {
		const k = e.event || 'unknown';
		counts[k] = (counts[k] || 0) + 1;
		if (k === 'open' && e.recipient) uniqueOpens.add(e.recipient);
		if (k === 'click' && e.recipient) uniqueClicks.add(e.recipient);
	}
	const delivered = counts.delivered || 0;
	return {
		delivered,
		opens: counts.open || 0,
		clicks: counts.click || 0,
		bounces: (counts.bounce || 0) + (counts.dropped || 0),
		uniqueOpens: uniqueOpens.size,
		uniqueClicks: uniqueClicks.size,
		openRate: delivered ? Math.round((uniqueOpens.size / delivered) * 100) : 0,
		clickRate: delivered ? Math.round((uniqueClicks.size / delivered) * 100) : 0,
		total: events.value.length,
	};
});

// ── Per-org roll-up ──
const perOrg = computed(() => {
	const m = new Map<string, { org: string; name: string; delivered: number; opens: number; clicks: number; bounces: number; uniqueOpens: Set<string> }>();
	for (const e of events.value) {
		const org = e.organization || 'unknown';
		let g = m.get(org);
		if (!g) { g = { org, name: orgName(org), delivered: 0, opens: 0, clicks: 0, bounces: 0, uniqueOpens: new Set() }; m.set(org, g); }
		if (e.event === 'delivered') g.delivered++;
		else if (e.event === 'open') { g.opens++; if (e.recipient) g.uniqueOpens.add(e.recipient); }
		else if (e.event === 'click') g.clicks++;
		else if (e.event === 'bounce' || e.event === 'dropped' || e.event === 'spamreport') g.bounces++;
	}
	return Array.from(m.values())
		.map((g) => ({ ...g, openRate: g.delivered ? Math.round((g.uniqueOpens.size / g.delivered) * 100) : 0 }))
		.sort((a, b) => b.delivered - a.delivered);
});

// ── Recent bounces / failures across orgs ──
const recentBounces = computed(() =>
	events.value
		.filter((e: any) => e.event === 'bounce' || e.event === 'dropped' || e.event === 'spamreport')
		.slice(0, 25),
);

function fmtTime(iso: string | null | undefined) {
	if (!iso) return '—';
	try {
		const d = new Date(iso);
		const now = new Date();
		const sameDay = d.toDateString() === now.toDateString();
		if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	} catch { return iso as string; }
}
function eventColor(ev: string | null | undefined) {
	switch (ev) {
		case 'bounce': case 'dropped': return 'bg-destructive/15 text-destructive';
		case 'spamreport': return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
		default: return 'bg-muted text-muted-foreground';
	}
}
</script>

<template>
	<div class="apps-page flex flex-col h-full">
		<AppHeader title="Platform Email" />

		<LayoutPageContainer>
		<p class="text-sm text-muted-foreground mb-5">
			Delivery, opens, and bounces across every organization — transactional and campaign. The org-scoped view lives at
			<NuxtLink to="/email/activity" class="text-primary hover:underline">Email Activity</NuxtLink>.
		</p>

		<div v-if="denied" class="ios-card p-8 text-center">
			<Icon name="lucide:lock" class="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
			<p class="text-sm text-muted-foreground">This area is for Earnest platform administrators.</p>
		</div>

		<template v-else>
			<!-- Controls -->
			<div class="flex items-center gap-3 flex-wrap mb-6">
				<select
					v-model="orgFilter"
					class="h-8 px-3 rounded-full border border-border bg-background text-[12px] text-foreground"
					aria-label="Filter by organization"
				>
					<option value="">All organizations</option>
					<option v-for="o in orgs" :key="o.id" :value="o.id">{{ o.name }}</option>
				</select>
				<div class="flex items-center gap-1.5">
					<button
						v-for="s in SCOPES"
						:key="s.value"
						type="button"
						class="text-[11px] uppercase tracking-wider px-2.5 h-7 rounded-full border transition-colors"
						:class="s.value === scope ? 'border-primary/40 bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground hover:bg-muted/60'"
						@click="scope = s.value"
					>
						{{ s.label }}
					</button>
				</div>
				<div class="flex items-center gap-1.5">
					<button
						v-for="r in RANGES"
						:key="r.value"
						type="button"
						class="text-[11px] uppercase tracking-wider px-2.5 h-7 rounded-full border transition-colors"
						:class="r.value === range ? 'border-primary/40 bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground hover:bg-muted/60'"
						@click="range = r.value"
					>
						{{ r.label }}
					</button>
				</div>
			</div>

			<!-- KPI strip -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Delivered</p>
					<p class="text-2xl font-semibold tabular-nums mt-1">{{ stats.delivered }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Open Rate</p>
					<p class="text-2xl font-semibold tabular-nums mt-1">{{ stats.openRate }}%</p>
					<p class="text-[10px] text-muted-foreground mt-0.5">{{ stats.uniqueOpens }} unique · {{ stats.opens }} total</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Click Rate</p>
					<p class="text-2xl font-semibold tabular-nums mt-1">{{ stats.clickRate }}%</p>
					<p class="text-[10px] text-muted-foreground mt-0.5">{{ stats.uniqueClicks }} unique · {{ stats.clicks }} total</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Bounces</p>
					<p class="text-2xl font-semibold tabular-nums mt-1">{{ stats.bounces }}</p>
				</div>
			</div>

			<div v-if="pending" class="flex items-center justify-center py-16">
				<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			</div>

			<div v-else-if="!stats.total" class="ios-card p-10 text-center">
				<Icon name="lucide:mail-x" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
				<p class="text-sm text-foreground font-medium">No email activity in this window</p>
				<p class="text-[11px] text-muted-foreground mt-1">Try a wider window, a different org, or the All scope.</p>
			</div>

			<div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Per-org roll-up -->
				<div class="lg:col-span-2 ios-card p-5">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70 mb-4">By organization</h3>
					<div class="space-y-1">
						<div class="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/40">
							<span>Organization</span>
							<span class="text-right w-16">Delivered</span>
							<span class="text-right w-16">Open rate</span>
							<span class="text-right w-14">Clicks</span>
							<span class="text-right w-16">Bounces</span>
						</div>
						<div
							v-for="row in perOrg"
							:key="row.org"
							class="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-1 py-2 items-center border-b border-border/20 last:border-b-0"
						>
							<span class="text-sm font-medium truncate">{{ row.name }}</span>
							<span class="text-right w-16 text-sm tabular-nums text-success">{{ row.delivered }}</span>
							<span class="text-right w-16 text-sm tabular-nums">{{ row.openRate }}%</span>
							<span class="text-right w-14 text-sm tabular-nums text-violet-600 dark:text-violet-400">{{ row.clicks }}</span>
							<span class="text-right w-16 text-sm tabular-nums" :class="row.bounces ? 'text-destructive' : 'text-muted-foreground'">{{ row.bounces }}</span>
						</div>
					</div>
				</div>

				<!-- Recent bounces -->
				<div class="ios-card p-5">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70 mb-4">Recent Bounces</h3>
					<div v-if="!recentBounces.length" class="text-xs text-muted-foreground py-2">No bounces in this window.</div>
					<ul v-else class="space-y-2">
						<li v-for="ev in recentBounces" :key="ev.id" class="text-xs">
							<div class="flex items-center justify-between gap-2">
								<span class="font-mono text-[11px] truncate">{{ ev.recipient }}</span>
								<span class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" :class="eventColor(ev.event)">{{ ev.event }}</span>
							</div>
							<p class="text-[10px] text-muted-foreground truncate mt-0.5">
								<span>{{ orgName(ev.organization) }}</span>
								<span v-if="ev.reason"> · {{ ev.reason }}</span>
								<span> · {{ fmtTime(ev.timestamp) }}</span>
							</p>
						</li>
					</ul>
				</div>
			</div>
		</template>
		</LayoutPageContainer>
	</div>
</template>
