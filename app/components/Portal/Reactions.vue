<script setup lang="ts">
/**
 * PortalReactions
 * Emoji reaction bar for portal items.
 * Reactions are stored as comments with body `::reaction::👍` so no schema
 * changes are needed. Counts are aggregated and the current user's reaction
 * is highlighted.
 */

const REACTIONS = ['👍', '❤️', '✅', '❓', '🔄'] as const;

const props = defineProps<{
	collection: string
	itemId: string
}>();

const { user } = useDirectusAuth();
const { getComments, createComment, deleteComment } = useComments();

const reactionComments = ref<any[]>([]);
const loading = ref(false);
const pending = ref<string | null>(null);

async function load() {
	loading.value = true;
	try {
		// Fetch all comments for this item; filter to reactions client-side
		const all = await getComments(props.collection, props.itemId, { limit: 500 });
		reactionComments.value = all.filter(c => c.comment?.startsWith('::reaction::'));
	} catch (e) {
		console.error('Failed to load reactions:', e);
	} finally {
		loading.value = false;
	}
}

// Group reaction counts and find current user's reaction
const counts = computed(() => {
	const map: Record<string, { count: number; commentId: number | null }> = {};
	for (const emoji of REACTIONS) {
		map[emoji] = { count: 0, commentId: null };
	}
	for (const c of reactionComments.value) {
		const emoji = c.comment.replace('::reaction::', '').trim();
		if (!map[emoji]) continue;
		map[emoji].count++;
		const authorId = typeof c.user === 'string' ? c.user : c.user?.id;
		if (authorId === user.value?.id) {
			map[emoji].commentId = c.id;
		}
	}
	return map;
});

function myReactionFor(emoji: string) {
	return counts.value[emoji]?.commentId ?? null;
}

async function toggle(emoji: string) {
	if (pending.value) return;
	pending.value = emoji;

	try {
		const existing = myReactionFor(emoji);
		if (existing) {
			await deleteComment(existing);
		} else {
			// Remove any prior reaction from this user first
			for (const e of REACTIONS) {
				const id = myReactionFor(e);
				if (id && e !== emoji) {
					await deleteComment(id);
				}
			}
			await createComment({
				collection: props.collection,
				item: props.itemId,
				comment: `::reaction::${emoji}`,
			});
		}
		await load();
	} finally {
		pending.value = null;
	}
}

onMounted(load);
watch(() => props.itemId, load);
</script>

<template>
	<div class="flex items-center gap-1.5 flex-wrap">
		<button
			v-for="emoji in REACTIONS"
			:key="emoji"
			class="flex items-center gap-1 px-2 py-1 rounded-full text-sm border transition-all"
			:class="myReactionFor(emoji)
				? 'bg-primary/10 border-primary/30 text-primary'
				: 'bg-muted/40 border-border/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground'"
			:disabled="pending === emoji"
			@click="toggle(emoji)"
		>
			<span>{{ emoji }}</span>
			<span v-if="counts[emoji]?.count > 0" class="text-[11px] font-medium">
				{{ counts[emoji].count }}
			</span>
		</button>
		<div v-if="loading" class="w-4 h-4 flex items-center justify-center">
			<Icon name="lucide:loader-2" class="w-3 h-3 text-muted-foreground animate-spin" />
		</div>
	</div>
</template>
