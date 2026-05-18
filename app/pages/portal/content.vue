<script setup lang="ts">
/**
 * /portal/content — Phase 5 of the retainer/social plan.
 *
 * Surfaces Studio social posts that need the client's review. Listing is
 * scoped by `requirePortalContext` server-side, so this page just receives
 * whatever the active scope can see.
 *
 * Token-based approve / request-changes: each post in `in_review` carries
 * an opaque `approval_token` stamped server-side. We post the token along
 * with the action; the server validates it independently of the user
 * session so the same actions also work from an email link.
 */
import type { SocialPost, ApprovalState } from '~~/shared/social';
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Content Review | Client Portal' });

type StateFilter = 'in_review' | 'approved' | 'requested_changes' | 'all';

const STATE_FILTERS: Array<{ key: StateFilter; label: string; icon: string }> = [
	{ key: 'in_review', label: 'Needs Review', icon: 'lucide:eye' },
	{ key: 'approved', label: 'Approved', icon: 'lucide:check-circle' },
	{ key: 'requested_changes', label: 'Changes Requested', icon: 'lucide:rotate-ccw' },
	{ key: 'all', label: 'All', icon: 'lucide:list' },
];

const state = ref<StateFilter>('in_review');
const posts = ref<SocialPost[]>([]);
const loading = ref(false);

const selectedPost = ref<SocialPost | null>(null);
const actionBusy = ref(false);
const noteInput = ref('');

const toast = useToast();

async function fetchPosts() {
	loading.value = true;
	try {
		const r = await $fetch<{ data: SocialPost[] }>('/api/portal/content', {
			query: { state: state.value },
		});
		posts.value = r?.data ?? [];
	} catch (err) {
		console.error('Portal content fetch failed:', err);
		posts.value = [];
	} finally {
		loading.value = false;
	}
}

watch(state, fetchPosts);
onMounted(fetchPosts);

function openDetail(post: SocialPost) {
	selectedPost.value = post;
	noteInput.value = '';
}

function stateTone(s: ApprovalState | undefined): string {
	switch (s) {
		case 'approved':
		case 'published':
			return 'bg-success/12 text-success border-success/30';
		case 'in_review':
			return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30';
		case 'requested_changes':
		case 'rejected':
			return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30';
		default:
			return 'bg-muted/60 text-muted-foreground border-border';
	}
}

function stateLabel(s: ApprovalState | undefined): string {
	switch (s) {
		case 'in_review': return 'Needs Review';
		case 'requested_changes': return 'Changes Requested';
		default: return (s || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function formatMonth(iso: string | null | undefined): string {
	if (!iso) return '';
	const m = /^(\d{4})-(\d{2})/.exec(iso);
	if (!m) return iso;
	const name = MONTH_NAMES[Number(m[2]) - 1] ?? `Month ${m[2]}`;
	return `${name} ${m[1]}`;
}

async function approve() {
	const post = selectedPost.value;
	if (!post?.approval_token) {
		toast.add({ title: 'Missing approval token', icon: 'i-lucide-alert-circle', color: 'red' });
		return;
	}
	actionBusy.value = true;
	try {
		const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${post.id}/portal-approve`, {
			method: 'POST',
			body: { token: post.approval_token, note: noteInput.value || undefined },
		});
		toast.add({ title: 'Approved', icon: 'i-lucide-check-circle', color: 'green' });
		updateLocalPost(r.data);
		selectedPost.value = r.data;
	} catch (err: any) {
		console.error('Portal approve failed:', err);
		toast.add({
			title: 'Could not approve',
			description: err?.data?.message || err?.message || 'Unknown error',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	} finally {
		actionBusy.value = false;
	}
}

async function requestChanges() {
	const post = selectedPost.value;
	if (!post?.approval_token) {
		toast.add({ title: 'Missing approval token', icon: 'i-lucide-alert-circle', color: 'red' });
		return;
	}
	if (!noteInput.value.trim()) {
		toast.add({
			title: 'Add a note',
			description: 'Tell your team what to change before requesting revisions.',
			icon: 'i-lucide-alert-circle',
			color: 'yellow',
		});
		return;
	}
	actionBusy.value = true;
	try {
		const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${post.id}/portal-request-changes`, {
			method: 'POST',
			body: { token: post.approval_token, note: noteInput.value },
		});
		toast.add({ title: 'Changes requested', icon: 'i-lucide-rotate-ccw', color: 'green' });
		updateLocalPost(r.data);
		selectedPost.value = r.data;
	} catch (err: any) {
		console.error('Portal request-changes failed:', err);
		toast.add({
			title: 'Could not request changes',
			description: err?.data?.message || err?.message || 'Unknown error',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	} finally {
		actionBusy.value = false;
	}
}

function updateLocalPost(next: SocialPost) {
	const idx = posts.value.findIndex((p) => p.id === next.id);
	if (idx >= 0) {
		if (state.value !== 'all' && next.approval_state !== state.value) {
			posts.value.splice(idx, 1);
		} else {
			posts.value[idx] = next;
		}
	}
}
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Content Review" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-4 -mt-1">
				Approve drafts or send them back for revisions. Once approved, your team can schedule and publish.
			</p>

			<AppFloorStrip v-model="state" :items="STATE_FILTERS" aria-label="Filter content" />

			<div v-if="loading && !posts.length" class="flex flex-col items-center justify-center py-24 gap-3">
				<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
				<p class="text-sm text-muted-foreground">Loading content…</p>
			</div>

			<div v-else-if="!posts.length" class="flex flex-col items-center justify-center py-24 gap-4">
				<Icon name="lucide:check-check" class="w-12 h-12 text-muted-foreground/40" />
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">
						{{ state === 'in_review' ? 'Nothing waiting on you' : 'No content to show' }}
					</p>
					<p class="text-xs text-muted-foreground/70 mt-1">
						{{ state === 'in_review'
							? 'Your team will post here when something new needs your approval.'
							: 'Try a different filter to see other content.' }}
					</p>
				</div>
			</div>

			<div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				<button
					v-for="post in posts"
					:key="post.id"
					type="button"
					class="content-card group text-left"
					@click="openDetail(post)"
				>
					<div class="content-card__media">
						<img
							v-if="post.design_image_url"
							:src="post.design_image_url"
							:alt="post.caption.slice(0, 80)"
							loading="lazy"
						/>
						<img
							v-else-if="post.media_urls && post.media_urls.length"
							:src="post.media_urls[0]"
							:alt="post.caption.slice(0, 80)"
							loading="lazy"
						/>
						<div v-else class="content-card__placeholder">
							<Icon name="lucide:image" class="w-8 h-8 text-muted-foreground/40" />
						</div>
					</div>
					<div class="p-3 space-y-2">
						<span class="content-card__state border" :class="stateTone(post.approval_state)">
							{{ stateLabel(post.approval_state) }}
						</span>
						<p class="text-xs text-foreground line-clamp-3">
							{{ post.caption || 'Untitled draft' }}
						</p>
						<p v-if="post.target_month" class="text-[10px] text-muted-foreground">
							{{ formatMonth(post.target_month) }}
						</p>
					</div>
				</button>
			</div>
		</LayoutPageContainer>

		<UModal :model-value="!!selectedPost" :ui="{ width: 'sm:max-w-2xl' }" @update:model-value="(v) => { if (!v) { selectedPost = null; noteInput = '' } }">
			<div v-if="selectedPost" class="p-5 space-y-4">
				<div class="flex items-start gap-3">
					<div class="flex-1">
						<span class="content-card__state border" :class="stateTone(selectedPost.approval_state)">
							{{ stateLabel(selectedPost.approval_state) }}
						</span>
						<h2 class="text-base font-semibold text-foreground mt-2">Content for your review</h2>
						<p class="text-xs text-muted-foreground">{{ formatMonth(selectedPost.target_month) || 'No target month' }}</p>
					</div>
				</div>

				<div
					v-if="selectedPost.design_image_url || (selectedPost.media_urls && selectedPost.media_urls.length)"
					class="rounded-lg overflow-hidden border border-border bg-muted/30"
				>
					<img
						:src="selectedPost.design_image_url || selectedPost.media_urls[0]"
						:alt="selectedPost.caption.slice(0, 80)"
						class="w-full h-auto max-h-96 object-contain"
					/>
				</div>

				<div class="space-y-1">
					<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Caption</p>
					<p class="text-sm text-foreground whitespace-pre-wrap">{{ selectedPost.caption || '(empty)' }}</p>
				</div>

				<div v-if="selectedPost.figma_frame_url">
					<a
						:href="selectedPost.figma_frame_url"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
					>
						<Icon name="lucide:figma" class="w-3.5 h-3.5" />
						Open Figma frame
						<Icon name="lucide:external-link" class="w-3 h-3" />
					</a>
				</div>

				<div v-if="selectedPost.approved_at" class="rounded border border-success/30 bg-success/8 px-3 py-2 text-xs text-success">
					Approved {{ new Date(selectedPost.approved_at).toLocaleString() }}
				</div>

				<template v-if="selectedPost.approval_state === 'in_review'">
					<div class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wide text-muted-foreground">Note for your team (optional for approval, required to request changes)</label>
						<UTextarea v-model="noteInput" :rows="3" placeholder="Any feedback you'd like to share…" />
					</div>

					<div class="flex flex-wrap justify-end gap-2 pt-3 border-t border-border">
						<Button size="sm" variant="outline" :disabled="actionBusy" @click="requestChanges">
							<Icon name="lucide:rotate-ccw" class="w-4 h-4 mr-1" />
							Request Changes
						</Button>
						<Button size="sm" :disabled="actionBusy" @click="approve">
							<Icon name="lucide:check-circle" class="w-4 h-4 mr-1" />
							Approve
						</Button>
					</div>
				</template>

				<template v-else>
					<div class="flex flex-wrap justify-end gap-2 pt-3 border-t border-border">
						<Button size="sm" variant="ghost" @click="selectedPost = null">Close</Button>
					</div>
				</template>
			</div>
		</UModal>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.portal-page {
	@apply flex flex-col min-h-full;
}

.content-card {
	@apply flex flex-col bg-card border border-border rounded-lg overflow-hidden
		transition-all duration-200
		hover:border-foreground/20 hover:shadow-md focus-visible:outline-none
		focus-visible:ring-2 focus-visible:ring-primary;
}

.content-card__media {
	@apply relative aspect-square bg-muted/40 overflow-hidden;
}

.content-card__media img {
	@apply w-full h-full object-cover transition-transform duration-300;
}

.content-card:hover .content-card__media img {
	@apply scale-[1.02];
}

.content-card__placeholder {
	@apply absolute inset-0 flex items-center justify-center;
}

.content-card__state {
	@apply inline-flex items-center px-2 py-0.5 rounded-full
		text-[10px] font-semibold uppercase tracking-wide;
}
</style>
