<script setup lang="ts">
/**
 * PortalCommentThread
 * Lightweight comment + reply panel for the client portal.
 * Uses the existing `comments` collection (polymorphic collection + item).
 * Reactions live in the real `reactions` collection via <ReactionsBar>. Any
 * legacy single-emoji comments prefixed with `::reaction::` (from the old
 * fake-reaction scheme) are still filtered out of the thread for backward
 * compat with historical data.
 */

const props = defineProps<{
	collection: string
	itemId: string
	label?: string
}>();

const { user } = useDirectusAuth();
const { getComments, createComment, canDeleteComment, deleteComment } = useComments();
const config = useRuntimeConfig();

const comments = ref<any[]>([]);
const loading = ref(false);
const submitting = ref(false);
const text = ref('');
const replyTo = ref<any | null>(null);
const replyText = ref('');
const submittingReply = ref(false);
const error = ref('');

const visibleComments = computed(() =>
	comments.value.filter(c => !c.comment?.startsWith('::reaction::'))
);

async function load() {
	loading.value = true;
	try {
		comments.value = await getComments(props.collection, props.itemId, {
			includeReplies: true,
			parentId: null,
		});
	} catch (e) {
		console.error('Failed to load comments:', e);
	} finally {
		loading.value = false;
	}
}

async function submit() {
	if (!text.value.trim()) return;
	submitting.value = true;
	error.value = '';
	try {
		await createComment({
			collection: props.collection,
			item: props.itemId,
			comment: text.value.trim(),
		});
		text.value = '';
		await load();
	} catch (e: any) {
		error.value = e?.message || 'Failed to post comment.';
	} finally {
		submitting.value = false;
	}
}

async function submitReply() {
	if (!replyText.value.trim() || !replyTo.value) return;
	submittingReply.value = true;
	try {
		await createComment({
			collection: props.collection,
			item: props.itemId,
			comment: replyText.value.trim(),
			parent_id: replyTo.value.id,
		});
		replyText.value = '';
		replyTo.value = null;
		await load();
	} catch (e) {
		console.error('Failed to post reply:', e);
	} finally {
		submittingReply.value = false;
	}
}

async function remove(comment: any) {
	try {
		await deleteComment(comment.id);
		await load();
	} catch (e) {
		console.error('Failed to delete comment:', e);
	}
}

function avatarUrl(u: any) {
	if (!u?.avatar) return null;
	return `${config.public.assetsUrl}${u.avatar}?key=avatar`;
}

function initials(u: any) {
	return ((u?.first_name?.[0] ?? '') + (u?.last_name?.[0] ?? '')).toUpperCase() || '?';
}

function timeAgo(d: string) {
	const diff = Date.now() - new Date(d).getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const days = Math.floor(h / 24);
	return `${days}d ago`;
}

onMounted(load);
watch(() => props.itemId, load);
</script>

<template>
	<div class="space-y-4">
		<p v-if="label" class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
			{{ label }}
		</p>

		<!-- Loading -->
		<div v-if="loading" class="flex justify-center py-6">
			<Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin" />
		</div>

		<!-- Comment Thread -->
		<div v-else class="space-y-3">
			<div
				v-for="comment in visibleComments"
				:key="comment.id"
				class="space-y-2"
			>
				<!-- Top-level comment -->
				<div class="flex gap-3 group">
					<div class="w-7 h-7 rounded-full bg-muted border border-border/40 overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-medium text-muted-foreground">
						<img v-if="avatarUrl(comment.user)" :src="avatarUrl(comment.user)" :alt="comment.user?.first_name" class="w-full h-full object-cover" />
						<span v-else>{{ initials(comment.user) }}</span>
					</div>

					<div class="flex-1 min-w-0">
						<div class="flex items-baseline gap-2">
							<span class="text-xs font-medium">{{ userName(comment.user) }}</span>
							<span class="text-[10px] text-muted-foreground">{{ timeAgo(comment.date_created) }}</span>
						</div>
						<div class="mt-0.5 text-sm leading-relaxed" v-html="comment.comment" />

						<div class="flex items-center gap-3 mt-1.5">
							<button
								class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
								@click="replyTo = replyTo?.id === comment.id ? null : comment"
							>
								Reply
							</button>
							<button
								v-if="canDeleteComment(comment)"
								class="text-[10px] text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
								@click="remove(comment)"
							>
								Delete
							</button>
						</div>
					</div>
				</div>

				<!-- Replies -->
				<div v-if="comment.replies?.length" class="ml-10 space-y-2 border-l-2 border-border/30 pl-3">
					<div
						v-for="reply in comment.replies.filter((r: any) => !r.comment?.startsWith('::reaction::'))"
						:key="reply.id"
						class="flex gap-2 group"
					>
						<div class="w-5 h-5 rounded-full bg-muted border border-border/40 overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-medium text-muted-foreground">
							<img v-if="avatarUrl(reply.user)" :src="avatarUrl(reply.user)" class="w-full h-full object-cover" />
							<span v-else>{{ initials(reply.user) }}</span>
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-baseline gap-2">
								<span class="text-xs font-medium">{{ userName(reply.user) }}</span>
								<span class="text-[10px] text-muted-foreground">{{ timeAgo(reply.date_created) }}</span>
							</div>
							<div class="mt-0.5 text-sm leading-relaxed" v-html="reply.comment" />
						</div>
					</div>
				</div>

				<!-- Inline reply form -->
				<div v-if="replyTo?.id === comment.id" class="ml-10 flex gap-2">
					<div class="w-5 h-5 rounded-full bg-primary/20 shrink-0 flex items-center justify-center text-[9px] font-medium text-primary">
						{{ initials(user) }}
					</div>
					<div class="flex-1 flex gap-2">
						<textarea
							v-model="replyText"
							rows="1"
							placeholder="Write a reply…"
							class="flex-1 rounded-xl glass-field px-3 py-1.5 text-xs focus:outline-none resize-none"
							@keydown.enter.exact.prevent="submitReply"
						/>
						<button
							class="text-xs px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50"
							:disabled="!replyText.trim() || submittingReply"
							@click="submitReply"
						>
							{{ submittingReply ? '…' : 'Reply' }}
						</button>
					</div>
				</div>
			</div>

			<!-- Empty -->
			<p v-if="!visibleComments.length && !loading" class="text-xs text-muted-foreground text-center py-4">
				No comments yet. Be the first to leave a note.
			</p>
		</div>

		<!-- New comment input -->
		<div v-if="user" class="flex gap-3 pt-2 border-t border-border/30">
			<div class="w-7 h-7 rounded-full bg-primary/20 shrink-0 flex items-center justify-center text-[10px] font-medium text-primary">
				{{ initials(user) }}
			</div>
			<div class="flex-1 flex gap-2">
				<textarea
					v-model="text"
					rows="1"
					placeholder="Leave a comment…"
					class="flex-1 rounded-xl glass-field px-3 py-2 text-sm focus:outline-none resize-none"
					@keydown.enter.exact.prevent="submit"
				/>
				<button
					class="text-sm px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 shrink-0"
					:disabled="!text.trim() || submitting"
					@click="submit"
				>
					{{ submitting ? '…' : 'Post' }}
				</button>
			</div>
		</div>
		<p v-if="error" class="text-xs text-destructive">{{ error }}</p>
	</div>
</template>
