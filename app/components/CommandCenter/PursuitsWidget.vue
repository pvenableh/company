<!--
  PursuitsWidget — a glanceable window into the sales pipeline for the home page,
  sitting just under Quick Actions. Shows the newest leads, proposals, and pitch
  pages as three tight lists; if the org has none yet, it falls back to a single
  CTA that points at People > Pursuits to start one. Deliberately un-busy: a few
  rows each, a deep link out, nothing more. The real boards live under Pursuits.
-->
<script setup lang="ts">
interface PursuitRow {
	id: string | number;
	label: string;
	sub?: string | null;
	stage?: string | null;
	status?: string | null;
	value?: number | null;
	views?: number;
	date?: string | null;
	to: string;
}

const { selectedOrg } = useOrganization();

const leads = ref<PursuitRow[]>([]);
const proposals = ref<PursuitRow[]>([]);
const pitches = ref<PursuitRow[]>([]);
const loading = ref(true);
const loaded = ref(false);

async function load() {
	if (!selectedOrg.value) { loading.value = false; loaded.value = true; return; }
	loading.value = true;
	try {
		const res = await $fetch<{ leads: PursuitRow[]; proposals: PursuitRow[]; pitches: PursuitRow[] }>(
			'/api/home/pursuits',
			{ query: { organization: selectedOrg.value } },
		);
		leads.value = res?.leads || [];
		proposals.value = res?.proposals || [];
		pitches.value = res?.pitches || [];
	} catch {
		// A transient failure just leaves the widget empty → CTA fallback.
		leads.value = []; proposals.value = []; pitches.value = [];
	} finally {
		loading.value = false;
		loaded.value = true;
	}
}

watch(selectedOrg, load, { immediate: true });

const isEmpty = computed(
	() => loaded.value && !leads.value.length && !proposals.value.length && !pitches.value.length,
);

const num = (n?: number | null) =>
	n == null ? '' : `$${Math.round(Number(n) || 0).toLocaleString()}`;

// Humanise a snake_case stage/status into a short Title label.
const pretty = (s?: string | null) =>
	(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

type Tone = 'success' | 'warning' | 'destructive' | 'muted';
const toneClass: Record<Tone, string> = {
	success: 'bg-success/15 text-success',
	warning: 'bg-warning/15 text-warning',
	destructive: 'bg-destructive/15 text-destructive',
	muted: 'bg-muted/50 text-muted-foreground',
};
function statusTone(s?: string | null): Tone {
	const v = (s || '').toLowerCase();
	if (['won', 'accepted', 'active', 'published'].includes(v)) return 'success';
	if (['lost', 'rejected', 'expired', 'revoked'].includes(v)) return 'destructive';
	if (['proposal_sent', 'sent', 'negotiation', 'draft'].includes(v)) return 'warning';
	return 'muted';
}

const sections = computed(() => [
	{ key: 'leads', label: 'Leads', to: '/apps/clients?view=pursuits&lens=opportunities', rows: leads.value, kind: 'stage' as const },
	{ key: 'proposals', label: 'Proposals', to: '/apps/clients?view=pursuits&lens=proposals', rows: proposals.value, kind: 'status' as const },
	{ key: 'pitches', label: 'Pitches', to: '/apps/clients?view=pursuits&lens=pitches', rows: pitches.value, kind: 'status' as const },
].filter((s) => s.rows.length));
</script>

<template>
	<div class="ios-card p-4 space-y-3">
		<!-- Header -->
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Pursuits</h3>
			<UiViewLink to="/apps/clients?view=pursuits" size="sm">Open board</UiViewLink>
		</div>

		<!-- Loading -->
		<div v-if="loading && !loaded" class="space-y-2">
			<div v-for="i in 3" :key="i" class="h-8 rounded-lg bg-muted/40 animate-pulse" />
		</div>

		<!-- Empty → CTA -->
		<div v-else-if="isEmpty" class="rounded-xl border border-dashed border-border/60 px-4 py-5 text-center space-y-2">
			<p class="text-sm font-medium text-foreground">No pursuits yet</p>
			<p class="text-xs text-muted-foreground leading-relaxed">
				Leads, proposals, and pitch pages you're chasing show up here.
			</p>
			<NuxtLink
				to="/apps/clients?view=pursuits"
				class="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
			>
				<Icon name="lucide:plus" class="w-3.5 h-3.5" />
				Start a pursuit
			</NuxtLink>
		</div>

		<!-- Populated: up to three tight sections -->
		<div v-else class="space-y-3">
			<div v-for="section in sections" :key="section.key" class="space-y-1.5">
				<div class="flex items-center justify-between">
					<NuxtLink
						:to="section.to"
						class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
					>
						{{ section.label }}
					</NuxtLink>
				</div>
				<NuxtLink
					v-for="row in section.rows"
					:key="`${section.key}-${row.id}`"
					:to="row.to"
					class="flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/40 transition-colors group"
				>
					<div class="min-w-0 flex-1">
						<p class="text-[13px] font-medium leading-snug truncate text-foreground">{{ row.label }}</p>
						<p v-if="row.sub" class="text-[11px] text-muted-foreground truncate">{{ row.sub }}</p>
					</div>
					<span
						v-if="section.kind === 'stage' ? row.stage : row.status"
						class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
						:class="toneClass[statusTone(section.kind === 'stage' ? row.stage : row.status)]"
					>
						{{ pretty(section.kind === 'stage' ? row.stage : row.status) }}
					</span>
					<span v-if="row.value != null && row.value > 0" class="shrink-0 text-[12px] font-semibold tabular-nums text-foreground">
						{{ num(row.value) }}
					</span>
				</NuxtLink>
			</div>
		</div>
	</div>
</template>
