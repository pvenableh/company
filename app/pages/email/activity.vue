<script setup lang="ts">
/**
 * Email Activity — SendGrid event log for the active org.
 *
 * Reads `email_events` (writes come from /api/webhooks/sendgrid-events).
 * Shows aggregate stats (sent / delivered / opens / clicks / bounces) +
 * per-campaign roll-up + raw event timeline.
 *
 * The page is org-scoped via the `organization` denorm on email_events
 * (set by the webhook from SendGrid custom args). Client selector is
 * intentionally NOT respected — email campaigns target lists, not single
 * clients.
 */
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Email Activity | Earnest' });

const { selectedOrg } = useOrganization();
const emailItems = useDirectusItems('emails');

const events = ref<any[]>([]);
const campaigns = ref<any[]>([]);
const loading = ref(true);
const range = ref<7 | 30 | 90>(30);

const RANGES = [
	{ value: 7, label: 'Last 7 days' },
	{ value: 30, label: 'Last 30 days' },
	{ value: 90, label: 'Last 90 days' },
];

// Scope filter: campaign events carry an email_id (marketing newsletters);
// transactional events (contract/AI/invoice/notification) have email_id null.
type Scope = 'all' | 'campaign' | 'transactional';
const scope = ref<Scope>('all');
const SCOPES: { value: Scope; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'campaign', label: 'Campaigns' },
	{ value: 'transactional', label: 'Transactional' },
];
const scopedEvents = computed(() => {
	if (scope.value === 'campaign') return events.value.filter((e) => e.email_id);
	if (scope.value === 'transactional') return events.value.filter((e) => !e.email_id);
	return events.value;
});

async function load() {
	if (!selectedOrg.value) {
		events.value = [];
		campaigns.value = [];
		loading.value = false;
		return;
	}
	loading.value = true;
	const since = new Date(Date.now() - range.value * 86400000).toISOString();

	// Fetch delivery events and campaign roll-up INDEPENDENTLY — a permission
	// gap on the marketing `emails` collection must not blank the delivery
	// monitor (and vice-versa). Each settles on its own.
	const [evsRes, campsRes] = await Promise.allSettled([
		// email_events has no authenticated row-level read perm — route through
		// the org-scoped server endpoint (admin token + requireOrgMembership).
		$fetch<{ events: any[] }>('/api/email/events', {
			query: { org: selectedOrg.value, days: range.value },
		}).then((r) => r.events || []),
		emailItems.list({
			fields: ['id', 'name', 'subject', 'sent_at', 'total_recipients', 'total_sent', 'total_failed'],
			filter: {
				_and: [
					{ organization: { _eq: selectedOrg.value } },
					{ sent_at: { _gte: since } },
				],
			},
			sort: ['-sent_at'],
			limit: 50,
		}),
	]);

	if (evsRes.status === 'fulfilled') events.value = (evsRes.value as any[]) || [];
	else { console.error('[email/activity] events load failed:', evsRes.reason); events.value = []; }
	if (campsRes.status === 'fulfilled') campaigns.value = (campsRes.value as any[]) || [];
	else { console.warn('[email/activity] campaigns load failed (non-fatal):', campsRes.reason); campaigns.value = []; }

	loading.value = false;
}

watch([selectedOrg, range], load, { immediate: true });

// ── Aggregate stats over the window ──
const stats = computed(() => {
	const counts: Record<string, number> = {};
	const uniqueOpens = new Set<string>();
	const uniqueClicks = new Set<string>();
	for (const e of scopedEvents.value) {
		const k = e.event || 'unknown';
		counts[k] = (counts[k] || 0) + 1;
		if (k === 'open' && e.recipient) uniqueOpens.add(e.recipient);
		if (k === 'click' && e.recipient) uniqueClicks.add(e.recipient);
	}
	const delivered = counts.delivered || 0;
	const opens = counts.open || 0;
	const clicks = counts.click || 0;
	const bounces = (counts.bounce || 0) + (counts.dropped || 0);
	const openRate = delivered ? Math.round((uniqueOpens.size / delivered) * 100) : 0;
	const clickRate = delivered ? Math.round((uniqueClicks.size / delivered) * 100) : 0;
	return {
		delivered, opens, clicks, bounces,
		uniqueOpens: uniqueOpens.size,
		uniqueClicks: uniqueClicks.size,
		openRate, clickRate,
		totalEvents: scopedEvents.value.length,
	};
});

// ── Per-campaign roll-up ──
const campaignRows = computed(() => {
	const byCampaign = new Map<string | number, { id: any; name: string; subject: string | null; sent_at: string | null; total_recipients: number; total_sent: number; total_failed: number; opens: number; clicks: number; bounces: number; uniqueOpens: Set<string>; uniqueClicks: Set<string> }>();
	for (const c of campaigns.value) {
		byCampaign.set(c.id, {
			id: c.id,
			name: c.name || `Campaign #${c.id}`,
			subject: c.subject,
			sent_at: c.sent_at,
			total_recipients: c.total_recipients || 0,
			total_sent: c.total_sent || 0,
			total_failed: c.total_failed || 0,
			opens: 0, clicks: 0, bounces: 0,
			uniqueOpens: new Set(), uniqueClicks: new Set(),
		});
	}
	for (const ev of events.value) {
		const cid = ev.email_id?.id ?? ev.email_id;
		if (cid == null) continue;
		const row = byCampaign.get(cid);
		if (!row) continue;
		if (ev.event === 'open') {
			row.opens++;
			if (ev.recipient) row.uniqueOpens.add(ev.recipient);
		} else if (ev.event === 'click') {
			row.clicks++;
			if (ev.recipient) row.uniqueClicks.add(ev.recipient);
		} else if (ev.event === 'bounce' || ev.event === 'dropped') {
			row.bounces++;
		}
	}
	return Array.from(byCampaign.values()).sort((a, b) => {
		const ad = a.sent_at ? new Date(a.sent_at).getTime() : 0;
		const bd = b.sent_at ? new Date(b.sent_at).getTime() : 0;
		return bd - ad;
	});
});

// ── Transactional breakdown ──
// Non-campaign sends (email_id == null): contract signatures, AI emails, invites,
// notifications, meeting invites, etc. Grouped by the send's email_name /
// send_collection so each transactional TYPE is monitorable, not just aggregate.
const TXN_LABELS: Record<string, string> = {
	'contract-signature': 'Contract signatures',
	'ai-action': 'AI emails',
	invite: 'Team invites',
	welcome: 'Welcome emails',
	'meeting-invited': 'Meeting invites',
	'meeting-reminder': 'Meeting reminders',
	'video-invite': 'Video room invites',
	notification: 'Notifications',
	transactional: 'Transactional',
	invoices: 'Invoice notices',
};
function prettyTxnLabel(key: string): string {
	if (TXN_LABELS[key]) return TXN_LABELS[key]!;
	return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const transactionalRows = computed(() => {
	const groups = new Map<string, { key: string; label: string; delivered: number; bounced: number; opens: number; recipients: Set<string> }>();
	for (const ev of events.value) {
		if (ev.email_id) continue; // campaign event — shown in the Campaigns roll-up
		const raw = ev.raw || {};
		const key = raw.email_name || raw.send_collection || 'other';
		let g = groups.get(key);
		if (!g) { g = { key, label: prettyTxnLabel(key), delivered: 0, bounced: 0, opens: 0, recipients: new Set() }; groups.set(key, g); }
		if (ev.recipient) g.recipients.add(ev.recipient);
		if (ev.event === 'delivered') g.delivered++;
		else if (ev.event === 'bounce' || ev.event === 'dropped' || ev.event === 'spamreport') g.bounced++;
		else if (ev.event === 'open') g.opens++;
	}
	return Array.from(groups.values()).sort((a, b) => (b.delivered + b.bounced) - (a.delivered + a.bounced));
});

// ── Top clicked links ──
const topLinks = computed(() => {
	const counts = new Map<string, number>();
	for (const ev of scopedEvents.value) {
		if (ev.event !== 'click' || !ev.url) continue;
		counts.set(ev.url, (counts.get(ev.url) || 0) + 1);
	}
	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);
});

// ── Recent bounces / failures ──
const recentBounces = computed(() => {
	return scopedEvents.value
		.filter((e) => e.event === 'bounce' || e.event === 'dropped' || e.event === 'spamreport')
		.slice(0, 20);
});

function fmtTime(iso: string | null | undefined) {
	if (!iso) return '—';
	try {
		const d = new Date(iso);
		const now = new Date();
		const sameDay = d.toDateString() === now.toDateString();
		if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	} catch { return iso; }
}

function eventColor(ev: string | null | undefined) {
	switch (ev) {
		case 'delivered':   return 'bg-success/15 text-success';
		case 'open':        return 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
		case 'click':       return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
		case 'bounce':      return 'bg-destructive/15 text-destructive';
		case 'dropped':     return 'bg-destructive/15 text-destructive';
		case 'spamreport':  return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
		case 'unsubscribe': return 'bg-muted text-muted-foreground';
		case 'deferred':    return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
		default:            return 'bg-muted text-muted-foreground';
	}
}
</script>

<template>
	<LayoutPageContainer>
		<LayoutPageHeader
			title="Email Activity"
			:subtitle="`Opens, clicks, bounces — last ${range} days`"
		>
			<template #actions>
				<div class="flex items-center gap-3 flex-wrap justify-end">
					<div class="flex items-center gap-1.5">
						<button
							v-for="s in SCOPES"
							:key="s.value"
							type="button"
							class="text-[11px] uppercase tracking-wider px-2.5 h-7 rounded-full border transition-colors"
							:class="s.value === scope
								? 'border-primary/40 bg-primary/10 text-primary font-semibold'
								: 'border-border text-muted-foreground hover:bg-muted/60'"
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
							:class="r.value === range
								? 'border-primary/40 bg-primary/10 text-primary font-semibold'
								: 'border-border text-muted-foreground hover:bg-muted/60'"
							@click="range = r.value as 7 | 30 | 90"
						>
							{{ r.label }}
						</button>
					</div>
				</div>
			</template>
		</LayoutPageHeader>

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

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-16">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty -->
		<div v-else-if="!stats.totalEvents && !campaigns.length" class="ios-card p-10 text-center">
			<Icon name="lucide:mail-x" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
			<p class="text-sm text-foreground font-medium">No email activity in this window</p>
			<p class="text-[11px] text-muted-foreground mt-1">
				Send a campaign and wait a few minutes for SendGrid to deliver events.
			</p>
			<p class="text-[11px] text-muted-foreground mt-3">
				If you've sent recently and see nothing, check that the SendGrid webhook is configured to POST
				<code class="text-[10px] bg-muted px-1.5 py-0.5 rounded">/api/webhooks/sendgrid-events</code>.
			</p>
		</div>

		<!-- Content -->
		<div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Left column: campaigns + transactional (spans 2 cols) -->
			<div class="lg:col-span-2 space-y-6">
			<!-- Campaign roll-up -->
			<div v-if="scope !== 'transactional'" class="ios-card p-5">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">Campaigns</h3>
					<UiViewLink to="/email" variant="muted" size="sm">All emails</UiViewLink>
				</div>
				<div v-if="!campaignRows.length" class="text-sm text-muted-foreground text-center py-8">
					No campaigns sent in this window.
				</div>
				<div v-else class="space-y-1.5">
					<div
						v-for="row in campaignRows"
						:key="row.id"
						class="flex items-start gap-3 py-2 border-b border-border/30 last:border-b-0"
					>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">{{ row.name }}</p>
							<p v-if="row.subject" class="text-[11px] text-muted-foreground truncate mt-0.5">{{ row.subject }}</p>
							<p class="text-[10px] text-muted-foreground mt-1">
								{{ row.total_sent }} sent
								<span v-if="row.total_failed"> · {{ row.total_failed }} failed</span>
								<span v-if="row.sent_at"> · {{ fmtTime(row.sent_at) }}</span>
							</p>
						</div>
						<div class="flex items-center gap-3 text-[11px] tabular-nums shrink-0">
							<span class="text-sky-600 dark:text-sky-400">
								{{ row.uniqueOpens.size }}<span class="text-muted-foreground/60">/{{ row.total_sent || '?' }}</span> opens
							</span>
							<span class="text-violet-600 dark:text-violet-400">
								{{ row.uniqueClicks.size }} clicks
							</span>
							<span v-if="row.bounces" class="text-destructive">
								{{ row.bounces }} bounces
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Transactional roll-up — contract/AI/invoice/notification sends -->
			<div v-if="scope !== 'campaign'" class="ios-card p-5">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">Transactional</h3>
					<span class="text-[10px] uppercase tracking-wider text-muted-foreground">delivery by type</span>
				</div>
				<div v-if="!transactionalRows.length" class="text-sm text-muted-foreground text-center py-8">
					No transactional email in this window.
				</div>
				<div v-else class="space-y-1.5">
					<div
						v-for="row in transactionalRows"
						:key="row.key"
						class="flex items-center gap-3 py-2 border-b border-border/30 last:border-b-0"
					>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">{{ row.label }}</p>
							<p class="text-[10px] text-muted-foreground mt-0.5">{{ row.recipients.size }} recipient{{ row.recipients.size === 1 ? '' : 's' }}</p>
						</div>
						<div class="flex items-center gap-3 text-[11px] tabular-nums shrink-0">
							<span class="text-success">{{ row.delivered }} delivered</span>
							<span v-if="row.opens" class="text-sky-600 dark:text-sky-400">{{ row.opens }} opens</span>
							<span v-if="row.bounced" class="text-destructive">{{ row.bounced }} failed</span>
						</div>
					</div>
				</div>
			</div>
			</div>

			<!-- Side column: top links + bounces -->
			<div class="space-y-6">
				<!-- Top clicked links -->
				<div class="ios-card p-5">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70 mb-4">Top Links</h3>
					<div v-if="!topLinks.length" class="text-xs text-muted-foreground py-2">No click events yet.</div>
					<ol v-else class="space-y-2">
						<li
							v-for="([url, count], i) in topLinks"
							:key="url"
							class="flex items-start gap-2 text-xs"
						>
							<span class="text-[10px] tabular-nums text-muted-foreground/70 w-4 shrink-0">{{ i + 1 }}.</span>
							<a :href="url" target="_blank" rel="noopener" class="flex-1 truncate hover:underline text-violet-600 dark:text-violet-400">
								{{ url }}
							</a>
							<span class="text-[10px] tabular-nums text-muted-foreground shrink-0">{{ count }}</span>
						</li>
					</ol>
				</div>

				<!-- Recent bounces -->
				<div class="ios-card p-5">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70 mb-4">Recent Bounces</h3>
					<div v-if="!recentBounces.length" class="text-xs text-muted-foreground py-2">No bounces in this window.</div>
					<ul v-else class="space-y-2">
						<li
							v-for="ev in recentBounces"
							:key="ev.id"
							class="text-xs"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="font-mono text-[11px] truncate">{{ ev.recipient }}</span>
								<span
									class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
									:class="eventColor(ev.event)"
								>
									{{ ev.event }}
								</span>
							</div>
							<p v-if="ev.reason" class="text-[10px] text-muted-foreground truncate mt-0.5">{{ ev.reason }}</p>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</LayoutPageContainer>
</template>
