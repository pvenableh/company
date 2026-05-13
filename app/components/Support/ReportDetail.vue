<script setup lang="ts">
const props = defineProps<{ id: string; backPath?: string }>();

const { getStatusBadgeClasses } = useStatusStyle();

type Ticket = {
	id: string;
	title: string;
	description: string | null;
	status: string | null;
	priority: string | null;
	date_created: string;
	date_updated: string | null;
	public_updates: Array<{
		id: string | number;
		body: string;
		date_created: string;
		author: { name: string };
	}>;
};

const ticket = ref<Ticket | null>(null);
const loading = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
	loading.value = true;
	errorMsg.value = null;
	try {
		ticket.value = await $fetch<Ticket>(`/api/support/tickets/${props.id}`);
	} catch (err: any) {
		errorMsg.value = err?.data?.message || err?.message || 'Could not load this report.';
	} finally {
		loading.value = false;
	}
}

await load();

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
	Bug: { label: 'Bug', icon: 'lucide:bug' },
	Feature: { label: 'Feature', icon: 'lucide:sparkles' },
	Question: { label: 'Question', icon: 'lucide:circle-help' },
	Feedback: { label: 'Feedback', icon: 'lucide:message-circle' },
};

const parsed = computed(() => {
	const raw = ticket.value?.title ?? '';
	const m = raw.match(/^\[(Bug|Feature|Question|Feedback)\]\s*(.*)$/);
	if (m) return { type: m[1] as keyof typeof TYPE_LABELS, title: m[2] || raw };
	return { type: null as null | keyof typeof TYPE_LABELS, title: raw };
});

const userMessage = computed(() => {
	const desc = ticket.value?.description ?? '';
	const idx = desc.indexOf('── Reporter context ──');
	const body = (idx === -1 ? desc : desc.slice(0, idx)).trim();
	return body;
});

function fmtDate(iso?: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso?: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}
</script>

<template>
	<div>
		<NuxtLink
			:to="backPath || '/support'"
			class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-3"
		>
			<Icon name="lucide:chevron-left" class="w-3 h-3" />
			My reports
		</NuxtLink>

		<div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">Loading…</div>

		<div v-else-if="errorMsg" class="py-12 text-center">
			<p class="text-sm text-destructive">{{ errorMsg }}</p>
		</div>

		<div v-else-if="ticket" class="space-y-6">
			<header class="space-y-3">
				<div class="flex items-center gap-2 flex-wrap">
					<span
						v-if="parsed.type"
						class="inline-flex items-center gap-1 rounded-full bg-muted/60 text-muted-foreground px-2 py-0.5 text-[10px] font-medium"
					>
						<Icon :name="TYPE_LABELS[parsed.type].icon" class="w-3 h-3" />
						{{ TYPE_LABELS[parsed.type].label }}
					</span>
					<span
						class="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5"
						:class="getStatusBadgeClasses(ticket.status)"
					>
						{{ ticket.status || 'Pending' }}
					</span>
					<span
						v-if="ticket.priority"
						class="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
					>
						{{ ticket.priority }} priority
					</span>
				</div>
				<h1 class="text-2xl font-semibold leading-tight">{{ parsed.title }}</h1>
				<p class="text-xs text-muted-foreground">
					Submitted {{ fmtDate(ticket.date_created) }}
					<template v-if="ticket.date_updated && ticket.date_updated !== ticket.date_created">
						· Updated {{ fmtDate(ticket.date_updated) }}
					</template>
				</p>
			</header>

			<section v-if="userMessage" class="rounded-xl border border-border/60 bg-card p-5">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
					Your report
				</p>
				<p class="text-sm whitespace-pre-wrap leading-relaxed">{{ userMessage }}</p>
			</section>

			<section>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
					Updates from Earnest
				</p>
				<div
					v-if="ticket.public_updates.length === 0"
					class="rounded-xl border border-dashed border-border/60 py-8 px-5 text-center"
				>
					<Icon name="lucide:message-circle" class="w-5 h-5 mx-auto text-muted-foreground/60" />
					<p class="mt-2 text-xs text-muted-foreground">
						No updates yet. We'll post here when we have news.
					</p>
				</div>
				<ol v-else class="space-y-3">
					<li
						v-for="update in ticket.public_updates"
						:key="update.id"
						class="rounded-xl border border-border/60 bg-card p-4"
					>
						<div class="flex items-center justify-between gap-2 mb-1.5">
							<p class="text-xs font-medium">{{ update.author.name }}</p>
							<p class="text-[10px] text-muted-foreground">{{ fmtDateTime(update.date_created) }}</p>
						</div>
						<p class="text-sm whitespace-pre-wrap leading-relaxed">{{ update.body }}</p>
					</li>
				</ol>
			</section>
		</div>
	</div>
</template>
