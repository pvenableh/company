<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Inbox | Earnest' });

const { selectedOrg } = useOrganization();
const route = useRoute();
const router = useRouter();

type SourceFilter = 'all' | 'social' | 'comment' | 'notification';
const VALID_FILTERS: SourceFilter[] = ['all', 'social', 'comment', 'notification'];
const initialFilter: SourceFilter = (() => {
	const v = route.query.filter;
	return typeof v === 'string' && VALID_FILTERS.includes(v as SourceFilter) ? (v as SourceFilter) : 'all';
})();
const filter = ref<SourceFilter>(initialFilter);
const showUnreadOnly = ref(route.query.unread === '1');

watch([filter, showUnreadOnly], ([f, u]) => {
	const next = { ...route.query };
	if (f === 'all') delete next.filter; else next.filter = f;
	if (!u) delete next.unread; else next.unread = '1';
	router.replace({ query: next });
});

type InboxItem = {
	id: string;
	source: 'social' | 'comment' | 'notification' | 'message';
	type: string;
	title: string;
	preview: string | null;
	actor: { name: string | null; avatar: string | null };
	createdAt: string;
	read: boolean;
	link: string;
	context?: { label: string; icon: string } | null;
};

const items = ref<InboxItem[]>([]);
const counts = ref<{ total: number; unread: number; bySource: Record<string, number> }>({ total: 0, unread: 0, bySource: {} });
const loading = ref(true);

async function fetchInbox() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		const res = await $fetch('/api/inbox', {
			params: { organizationId: selectedOrg.value, limit: 100 },
		}) as { items: InboxItem[]; counts: typeof counts.value };
		items.value = res.items || [];
		counts.value = res.counts || { total: 0, unread: 0, bySource: {} };
	} catch (err) {
		console.error('[inbox] failed:', err);
	} finally {
		loading.value = false;
	}
}

const filtered = computed(() => {
	let pool = items.value;
	if (filter.value !== 'all') pool = pool.filter((i) => i.source === filter.value);
	if (showUnreadOnly.value) pool = pool.filter((i) => !i.read);
	return pool;
});

const segments: Array<{ key: SourceFilter; label: string; icon: string }> = [
	{ key: 'all', label: 'All', icon: 'lucide:inbox' },
	{ key: 'social', label: 'Social', icon: 'lucide:at-sign' },
	{ key: 'comment', label: 'Comments', icon: 'lucide:message-square' },
	{ key: 'notification', label: 'Mentions', icon: 'lucide:bell' },
];

function sourceCount(key: SourceFilter): number {
	if (key === 'all') return counts.value.total;
	return counts.value.bySource?.[key] || 0;
}

function timeAgo(iso: string): string {
	try {
		return formatDistanceToNow(new Date(iso), { addSuffix: true });
	} catch {
		return '';
	}
}

function sourceColor(source: string): string {
	if (source === 'social') return 'bg-violet-500/15 text-violet-500';
	if (source === 'comment') return 'bg-success/15 text-success';
	if (source === 'notification') return 'bg-warning/15 text-warning';
	return 'bg-muted text-muted-foreground';
}

function sourceIcon(item: InboxItem): string {
	if (item.context?.icon) return item.context.icon;
	if (item.source === 'social') return 'lucide:at-sign';
	if (item.source === 'comment') return 'lucide:message-square';
	if (item.source === 'notification') return 'lucide:bell';
	return 'lucide:circle';
}

onMounted(() => {
	fetchInbox();
});

watch(selectedOrg, () => {
	fetchInbox();
});
</script>

<template>
	<div class="apps-page">
		<AppHeader title="Inbox" subtitle="Everything that wants your attention">
			<template #actions>
				<Button variant="outline" size="sm" :disabled="loading" @click="fetchInbox">
					<Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" :class="loading ? 'animate-spin' : ''" />
					Refresh
				</Button>
			</template>
		</AppHeader>

		<LayoutPageContainer>
			<!-- Segmented filter -->
			<div class="flex flex-wrap gap-2 items-center mb-4">
				<div class="inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5">
					<button
						v-for="seg in segments"
						:key="seg.key"
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
						:class="filter === seg.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'"
						@click="filter = seg.key"
					>
						<Icon :name="seg.icon" class="w-3.5 h-3.5" />
						{{ seg.label }}
						<span class="opacity-70">{{ sourceCount(seg.key) }}</span>
					</button>
				</div>

				<label class="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-2">
					<input v-model="showUnreadOnly" type="checkbox" class="rounded border-border" />
					Unread only
					<span v-if="counts.unread > 0" class="text-warning font-medium">({{ counts.unread }})</span>
				</label>
			</div>

			<!-- Loading -->
			<div v-if="loading && !items.length" class="flex flex-col items-center justify-center py-24 gap-3">
				<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
				<p class="text-sm text-muted-foreground">Loading inbox…</p>
			</div>

			<!-- Empty -->
			<div v-else-if="!filtered.length" class="flex flex-col items-center justify-center py-24 gap-4">
				<Icon name="lucide:inbox" class="w-12 h-12 text-muted-foreground/40" />
				<div class="text-center">
					<p class="text-sm font-medium text-muted-foreground">Inbox zero</p>
					<p class="text-xs text-muted-foreground/70 mt-1">
						{{ filter === 'all' ? 'Nothing new across your channels.' : 'No items in this category right now.' }}
					</p>
				</div>
			</div>

			<!-- Items -->
			<div v-else class="ios-card overflow-hidden divide-y divide-border/30">
				<NuxtLink
					v-for="item in filtered"
					:key="item.id"
					:to="item.link"
					class="flex items-start gap-3 p-4 hover:bg-muted/20 transition-colors group"
					:class="{ 'bg-blue-500/5': !item.read }"
				>
					<div
						class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
						:class="sourceColor(item.source)"
					>
						<Icon :name="sourceIcon(item)" class="w-4 h-4" />
					</div>

					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-0.5">
							<p class="text-sm font-medium truncate">
								<span v-if="item.actor.name">{{ item.actor.name }} · </span>{{ item.title }}
							</p>
							<span
								v-if="!item.read"
								class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
								aria-label="Unread"
							></span>
						</div>
						<p v-if="item.preview" class="text-xs text-muted-foreground line-clamp-2">{{ item.preview }}</p>
						<div class="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
							<span v-if="item.context" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 capitalize">
								<Icon :name="item.context.icon" class="w-3 h-3" />
								{{ item.context.label }}
							</span>
							<span>·</span>
							<span>{{ timeAgo(item.createdAt) }}</span>
						</div>
					</div>

					<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-1" />
				</NuxtLink>
			</div>
		</LayoutPageContainer>
	</div>
</template>

<style scoped>
.apps-page {
	@apply flex flex-col min-h-full;
}
</style>
