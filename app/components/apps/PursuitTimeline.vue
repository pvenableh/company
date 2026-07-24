<script setup lang="ts">
/*
  PursuitTimeline (Approach A) — one chronological feed of the whole courtship:
  touchpoints AND proposals merged, so you see the entire pursuit for a lead
  (or client) at a glance. Proposals that went quiet earn a derived "Cold" badge.

  Reuse: pass pre-loaded touchpoint `activities` (lead workspace already has them)
  OR a leadId/clientId to self-fetch. Always fetches the matching proposals.
*/
import { proposalPursuitState } from '~~/shared/proposals';

const props = defineProps<{
	leadId?: string | number | null;
	clientId?: string | null;
	/** Pre-loaded touchpoint events (activity shape), to avoid a double fetch. */
	activities?: any[] | null;
}>();

const { listForScope } = useTouchpoints();
const proposalItems = useDirectusItems('proposals');

const ownTouches = ref<any[]>([]);
const proposals = ref<any[]>([]);
const loading = ref(true);

async function fetchTouches() {
	if (props.activities) { ownTouches.value = []; return; } // parent supplies them
	const scope = props.leadId != null ? { leadId: props.leadId } : { clientId: props.clientId };
	const rows = await listForScope(scope as any).catch(() => []);
	// Normalize to the same activity shape the parent passes.
	ownTouches.value = (rows as any[]).map((tp) => ({
		id: tp.id, activity_type: tp.type, subject: tp.summary, description: tp.note,
		outcome: tp.outcome, activity_date: tp.occurred_at || tp.date_created,
	}));
}
async function fetchProposals() {
	const filter: any = props.leadId != null ? { lead: { _eq: props.leadId } } : (props.clientId ? { client: { _eq: props.clientId } } : null);
	if (!filter) { proposals.value = []; return; }
	proposals.value = (await proposalItems.list({
		fields: ['id', 'title', 'total_value', 'proposal_status', 'date_sent', 'valid_until', 'date_created', 'outcome_reason'],
		filter, sort: ['-date_created'], limit: -1,
	}).catch(() => [])) as any[];
}
async function refresh() {
	loading.value = true;
	try { await Promise.all([fetchTouches(), fetchProposals()]); } finally { loading.value = false; }
}
onMounted(refresh);
watch(() => [props.leadId, props.clientId], refresh);
defineExpose({ refresh });

const touchIcon: Record<string, string> = {
	call: 'lucide:phone', email: 'lucide:mail', text: 'lucide:message-square', meeting: 'lucide:users',
	note: 'lucide:sticky-note', follow_up: 'lucide:corner-up-right', proposal: 'lucide:file-text', other: 'lucide:dot',
};
const outcomeTone: Record<string, string> = {
	positive: 'text-success', negative: 'text-destructive', no_response: 'text-warning', neutral: 'text-muted-foreground',
};
const stateColor: Record<string, string> = {
	won: 'bg-success', lost: 'bg-destructive', cold: 'bg-warning', sent: 'bg-primary', viewed: 'bg-violet-500', draft: 'bg-muted-foreground/50',
};
const stateText: Record<string, string> = {
	won: 'text-success', lost: 'text-destructive', cold: 'text-warning', sent: 'text-primary', viewed: 'text-violet-500 dark:text-violet-400', draft: 'text-muted-foreground',
};

// Merge touches + proposals into one descending feed.
const feed = computed(() => {
	const touches = (props.activities || ownTouches.value).map((a) => ({
		kind: 'touch' as const,
		at: a.activity_date ? new Date(a.activity_date).getTime() : 0,
		id: `t-${a.id}`,
		type: a.activity_type || 'note',
		title: a.subject || '(no subject)',
		note: a.description || '',
		outcome: a.outcome || null,
	}));
	const props_ = proposals.value.map((p) => {
		const { state, isCold, daysOut } = proposalPursuitState(p);
		return {
			kind: 'proposal' as const,
			at: p.date_sent ? new Date(p.date_sent).getTime() : (p.date_created ? new Date(p.date_created).getTime() : 0),
			id: `p-${p.id}`,
			pid: p.id,
			title: p.title || 'Proposal',
			value: Number(p.total_value) || 0,
			state, isCold, daysOut,
		};
	});
	return [...touches, ...props_].sort((a, b) => b.at - a.at);
});

const proposalSlide = useAppSlideOver('proposal');
const fmtDate = (ms: number) => ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const fmtMoney = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
</script>

<template>
	<div>
		<div v-if="loading" class="py-8 text-center text-xs text-muted-foreground">Loading pursuit…</div>
		<div v-else-if="!feed.length" class="py-8 text-center text-xs text-muted-foreground">No pursuit activity yet.</div>

		<ol v-else class="relative pl-6">
			<span class="absolute left-[7px] top-1 bottom-1 w-px bg-border" aria-hidden="true" />
			<li v-for="ev in feed" :key="ev.id" class="relative pb-4 last:pb-0">
				<!-- Proposal event -->
				<template v-if="ev.kind === 'proposal'">
					<span class="absolute -left-[22px] top-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-background" :class="stateColor[ev.state]">
						<Icon name="lucide:file-text" class="w-2.5 h-2.5 text-white" />
					</span>
					<button type="button" class="w-full text-left rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2" @click="proposalSlide.open(String(ev.pid))">
						<div class="flex items-center justify-between gap-2">
							<span class="text-[13px] font-medium truncate">{{ ev.title }}</span>
							<span class="text-[12px] font-semibold tabular-nums shrink-0">{{ fmtMoney(ev.value) }}</span>
						</div>
						<div class="flex items-center gap-2 mt-0.5">
							<span class="text-[10px] uppercase tracking-wide font-semibold" :class="stateText[ev.state]">{{ ev.state }}</span>
							<span v-if="ev.isCold" class="text-[10px] text-warning">· {{ ev.daysOut }}d silent</span>
							<span class="text-[11px] text-muted-foreground ml-auto">{{ fmtDate(ev.at) }}</span>
						</div>
					</button>
				</template>
				<!-- Touchpoint event -->
				<template v-else>
					<span class="absolute -left-[21px] top-1 w-3.5 h-3.5 rounded-full bg-muted ring-2 ring-background flex items-center justify-center">
						<Icon :name="touchIcon[ev.type] || 'lucide:dot'" class="w-2 h-2 text-muted-foreground" />
					</span>
					<div class="pt-0.5">
						<div class="flex items-center gap-2">
							<span class="text-[13px] font-medium">{{ ev.title }}</span>
							<span v-if="ev.outcome" class="text-[10px] uppercase tracking-wide font-semibold" :class="outcomeTone[ev.outcome] || 'text-muted-foreground'">{{ String(ev.outcome).replace('_', ' ') }}</span>
							<span class="text-[11px] text-muted-foreground ml-auto">{{ fmtDate(ev.at) }}</span>
						</div>
						<p v-if="ev.note" class="text-[11.5px] text-muted-foreground line-clamp-2">{{ ev.note }}</p>
					</div>
				</template>
			</li>
		</ol>
	</div>
</template>
