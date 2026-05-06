<script setup lang="ts">
const { user } = useDirectusAuth();
const router = useRouter();

interface DigestRow {
	id: string;
	digest_date: string;
	summary: string | null;
	read_at: string | null;
	date_created: string;
	project: { id: string; title?: string; client?: { name?: string } | string | null } | string;
}

const items = useDirectusItems('project_digests');
const digests = ref<DigestRow[]>([]);
const loading = ref(true);
const selected = ref<DigestRow | null>(null);

const refresh = async () => {
	if (!user.value?.id) { loading.value = false; return; }
	try {
		const result = await items.list({
			fields: [
				'id', 'digest_date', 'summary', 'read_at', 'date_created',
				'project.id', 'project.title',
				'project.client.name',
			],
			filter: { recipient: { _eq: user.value.id } },
			sort: ['-date_created'],
			limit: 6,
		}) as DigestRow[];
		digests.value = Array.isArray(result) ? result : [];
	} catch (err) {
		console.warn('[ProjectDigestsWidget] fetch failed', err);
	}
	loading.value = false;
};

await refresh();

const renderMarkdown = (text: string) => {
	if (!text) return '';
	let html = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/^### (.+)$/gm, '<h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-3 mb-1">$1</h4>');
	html = html.replace(/^## (.+)$/gm, '<h3 class="text-sm font-bold text-foreground mt-3 mb-2">$1</h3>');
	html = html.replace(/^# (.+)$/gm, '<h2 class="text-base font-bold text-foreground mt-3 mb-2">$1</h2>');
	html = html.replace(/^- (.+)$/gm, '<li class="ml-5 list-disc text-sm leading-relaxed my-0.5">$1</li>');
	html = html.replace(/\n\n/g, '</p><p class="text-sm leading-relaxed my-2">');
	html = html.replace(/\n/g, '<br>');
	return `<p class="text-sm leading-relaxed my-2">${html}</p>`;
};

const formatRelative = (iso: string) => {
	if (!iso) return '';
	const ms = Date.now() - new Date(iso).getTime();
	const hours = Math.floor(ms / (1000 * 60 * 60));
	if (hours < 1) return 'Just now';
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(iso).toLocaleDateString();
};

const projectTitle = (d: DigestRow) =>
	(typeof d.project === 'object' ? d.project.title : null) || 'Untitled project';

const clientName = (d: DigestRow) => {
	if (typeof d.project !== 'object') return null;
	const c = d.project.client;
	return typeof c === 'object' ? c?.name : null;
};

const openDigest = async (d: DigestRow) => {
	selected.value = d;
	if (!d.read_at) {
		try {
			await items.update(d.id, { read_at: new Date().toISOString() });
			d.read_at = new Date().toISOString();
		} catch { /* best effort */ }
	}
};
</script>

<template>
	<div class="ios-card p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-newspaper" class="w-5 h-5 text-violet-500" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Today's Briefs</h3>
			</div>
			<button
				v-if="digests.length"
				@click="refresh"
				class="text-xs text-muted-foreground hover:text-foreground"
				title="Refresh"
			>
				<UIcon name="i-heroicons-arrow-path" class="w-3 h-3" />
			</button>
		</div>

		<!-- Loading -->
		<div v-if="loading && !digests.length" class="space-y-2">
			<div v-for="i in 3" :key="i" class="h-12 bg-muted/30 rounded-lg animate-pulse" />
		</div>

		<!-- Empty -->
		<div v-else-if="!digests.length" class="text-center py-6">
			<UIcon name="i-heroicons-newspaper" class="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
			<p class="text-xs text-muted-foreground">No briefs yet</p>
			<p class="text-[10px] text-muted-foreground/70 mt-1">
				Daily summaries arrive each morning for projects you manage.
			</p>
		</div>

		<!-- List -->
		<div v-else class="space-y-1">
			<button
				v-for="d in digests"
				:key="d.id"
				@click="openDigest(d)"
				class="w-full text-left p-2.5 rounded-lg hover:bg-muted/40 transition-colors flex items-start gap-3 group"
				:class="!d.read_at ? 'bg-violet-500/5 hover:bg-violet-500/10' : ''"
			>
				<div
					class="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
					:class="!d.read_at ? 'bg-violet-500' : 'bg-transparent'"
				/>
				<div class="flex-1 min-w-0">
					<p class="text-xs font-medium text-foreground truncate">
						{{ projectTitle(d) }}
					</p>
					<p class="text-[10px] text-muted-foreground truncate">
						<span v-if="clientName(d)">{{ clientName(d) }} · </span>
						{{ formatRelative(d.date_created) }}
					</p>
				</div>
				<UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
			</button>
		</div>

		<!-- Detail modal -->
		<UModal v-model="selected" :ui="{ width: 'sm:max-w-2xl' }">
			<template v-if="selected" #default>
				<div class="p-6">
					<div class="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-border">
						<div class="min-w-0">
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
								{{ formatRelative(selected.date_created) }}
							</p>
							<h2 class="text-lg font-bold text-foreground truncate">{{ projectTitle(selected) }}</h2>
							<p v-if="clientName(selected)" class="text-xs text-muted-foreground mt-0.5">{{ clientName(selected) }}</p>
						</div>
						<button
							v-if="typeof selected.project === 'object' && selected.project?.id"
							@click="router.push(`/projects/${selected.project.id}`); selected = null"
							class="text-xs text-primary hover:underline whitespace-nowrap"
						>
							Open project &rarr;
						</button>
					</div>
					<div
						v-if="selected.summary"
						v-html="renderMarkdown(selected.summary)"
						class="prose prose-sm max-w-none"
					/>
					<p v-else class="text-sm text-muted-foreground italic">
						No summary captured.
					</p>
				</div>
			</template>
		</UModal>
	</div>
</template>
