<script setup lang="ts">
const { openReportModal } = useReportIssue();
const { getStatusBadgeClasses } = useStatusStyle();

defineProps<{ basePath?: string }>();

type Row = {
	id: string;
	title: string;
	status: string | null;
	priority: string | null;
	date_created: string;
	date_updated: string | null;
};

const tickets = ref<Row[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
	loading.value = true;
	error.value = null;
	try {
		tickets.value = (await $fetch<Row[]>('/api/support/tickets')) ?? [];
	} catch (err: any) {
		error.value = err?.data?.message || err?.message || 'Could not load your reports.';
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

function parseTitle(raw: string): { type: keyof typeof TYPE_LABELS | null; title: string } {
	const m = raw?.match(/^\[(Bug|Feature|Question|Feedback)\]\s*(.*)$/);
	if (m) return { type: m[1] as keyof typeof TYPE_LABELS, title: m[2] || raw };
	return { type: null, title: raw };
}

function relativeTime(iso?: string | null): string {
	if (!iso) return '—';
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '—';
	const diff = Date.now() - then;
	const sec = Math.round(diff / 1000);
	if (sec < 60) return 'just now';
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.round(hr / 24);
	if (day < 30) return `${day}d ago`;
	const mo = Math.round(day / 30);
	if (mo < 12) return `${mo}mo ago`;
	return `${Math.round(mo / 12)}y ago`;
}

defineExpose({ reload: load, openReportModal });
</script>

<template>
	<div>
		<div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">Loading…</div>

		<div v-else-if="error" class="py-12 text-center">
			<p class="text-sm text-destructive">{{ error }}</p>
			<button
				type="button"
				class="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/40"
				@click="load"
			>
				Try again
			</button>
		</div>

		<div
			v-else-if="tickets.length === 0"
			class="border border-dashed border-border/60 rounded-2xl py-16 px-6 text-center"
		>
			<Icon name="lucide:inbox" class="w-8 h-8 mx-auto text-muted-foreground/60" />
			<p class="mt-3 text-sm font-medium">No reports yet.</p>
			<p class="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
				Bumped into something? Hit the Help icon in the top right to send us a bug or idea.
			</p>
		</div>

		<div v-else class="rounded-xl border border-border/60 bg-card overflow-hidden">
			<ul class="divide-y divide-border/40">
				<li v-for="row in tickets" :key="row.id">
					<NuxtLink
						:to="`${basePath || '/support'}/${row.id}`"
						class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
					>
						<template v-if="parseTitle(row.title).type">
							<span
								class="inline-flex items-center gap-1 rounded-full bg-muted/60 text-muted-foreground px-2 py-0.5 text-[10px] font-medium shrink-0"
							>
								<Icon
									:name="TYPE_LABELS[parseTitle(row.title).type as string].icon"
									class="w-3 h-3"
								/>
								{{ TYPE_LABELS[parseTitle(row.title).type as string].label }}
							</span>
						</template>

						<p class="text-sm font-medium flex-1 min-w-0 truncate">
							{{ parseTitle(row.title).title }}
						</p>

						<span
							v-if="row.priority"
							class="w-1.5 h-1.5 rounded-full shrink-0"
							:style="{
								backgroundColor:
									row.priority === 'high'
										? 'hsl(var(--destructive))'
										: row.priority === 'medium'
											? 'hsl(var(--warning))'
											: 'hsl(var(--muted-foreground))',
							}"
							:title="`Priority: ${row.priority}`"
						/>

						<span
							class="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 shrink-0"
							:class="getStatusBadgeClasses(row.status)"
						>
							{{ row.status || 'Pending' }}
						</span>

						<span class="text-[11px] text-muted-foreground shrink-0 w-20 text-right">
							{{ relativeTime(row.date_updated || row.date_created) }}
						</span>

						<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/60 shrink-0" />
					</NuxtLink>
				</li>
			</ul>
		</div>
	</div>
</template>
