<!--
	SocialPostPanel — slide-over for viewing/lightly editing a single social
	post without bouncing off the apps layout.

	Scope: this is the quick-edit surface. Big composer work (re-arranging
	carousel media, platform-specific options) still lives at
	/social/posts/[id]/edit — we provide a deep-link button. Studio posts
	get an additional "Open in Studio" link to /apps/marketing?floor=studio.

	What you can do inline:
	  - Quick-edit caption + scheduled_at (status='scheduled' posts)
	  - Read status badges + platform chips
	  - View attached design / approval state
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';
import type { SocialPost, SocialPlatform } from '~~/shared/social';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const post = ref<SocialPost | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const draft = reactive({
	caption: '',
	scheduled_at: '',
});

const toast = useToast();

const SOCIAL_LOGOS: Record<SocialPlatform, string> = {
	instagram: 'logos:instagram-icon',
	facebook: 'logos:facebook',
	linkedin: 'logos:linkedin-icon',
	tiktok: 'logos:tiktok-icon',
	threads: 'lucide:at-sign',
};

function statusTone(s: string | undefined): string {
	switch (s) {
		case 'published': return 'bg-success/12 text-success border-success/30';
		case 'scheduled': return 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30';
		case 'failed': return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30';
		case 'publishing': return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30';
		default: return 'bg-muted/60 text-muted-foreground border-border';
	}
}

function approvalTone(s: string | undefined): string {
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

function fmtDateTime(iso: string | undefined | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		month: 'short', day: 'numeric', year: 'numeric',
		hour: 'numeric', minute: '2-digit',
	});
}

function toDateTimeLocalInput(iso: string | undefined | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isStudio = computed(() => !!post.value?.approval_state && post.value?.approval_state !== 'draft' && post.value?.approval_state !== 'published');
const isEditable = computed(() => post.value?.status === 'draft' || post.value?.status === 'scheduled');

async function load(id: string) {
	loading.value = true;
	error.value = null;
	post.value = null;
	try {
		const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${id}`);
		post.value = r?.data ?? null;
		if (post.value) {
			draft.caption = post.value.caption || '';
			draft.scheduled_at = toDateTimeLocalInput(post.value.scheduled_at);
		}
	} catch (err: any) {
		error.value = err?.data?.message || err?.message || 'Failed to load post';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, (id) => { if (id) load(id); }, { immediate: true });

async function save() {
	if (!post.value || saving.value) return;
	saving.value = true;
	try {
		const body: Record<string, unknown> = {};
		if (draft.caption !== post.value.caption) body.caption = draft.caption;
		const scheduledIso = draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null;
		if (scheduledIso && scheduledIso !== post.value.scheduled_at) body.scheduled_at = scheduledIso;
		if (Object.keys(body).length === 0) {
			toast.add({ title: 'Nothing to save', icon: 'i-lucide-info', color: 'gray' });
			saving.value = false;
			return;
		}
		const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${post.value.id}`, {
			method: 'PATCH',
			body,
		});
		post.value = r?.data ?? post.value;
		toast.add({ title: 'Post updated', icon: 'i-lucide-check-circle', color: 'green' });
	} catch (err: any) {
		toast.add({
			title: 'Could not save',
			description: err?.data?.message || err?.message || 'Unknown error',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<AppSlideOverShell :title="post?.caption?.slice(0, 60) || 'Social Post'" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading post…</p>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">{{ error }}</div>

		<div v-else-if="post" class="space-y-5">
			<!-- Status row -->
			<div class="flex flex-wrap items-center gap-1.5">
				<span
					class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
					:class="statusTone(post.status)"
				>
					{{ post.status }}
				</span>
				<span
					v-if="post.approval_state && post.approval_state !== 'draft'"
					class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
					:class="approvalTone(post.approval_state)"
				>
					{{ post.approval_state.replace(/_/g, ' ') }}
				</span>
			</div>

			<!-- Media -->
			<div
				v-if="post.design_image_url || (post.media_urls && post.media_urls.length)"
				class="rounded-lg overflow-hidden border border-border bg-muted/30"
			>
				<img
					:src="post.design_image_url || post.media_urls[0]"
					:alt="post.caption.slice(0, 80)"
					class="w-full h-auto max-h-72 object-contain"
				/>
			</div>

			<!-- Caption -->
			<div>
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Caption</label>
				<textarea
					v-if="isEditable"
					v-model="draft.caption"
					rows="4"
					class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
				/>
				<p v-else class="mt-1 text-sm text-foreground whitespace-pre-wrap">
					{{ post.caption || '(empty)' }}
				</p>
			</div>

			<!-- Scheduled at -->
			<div v-if="isEditable && post.status === 'scheduled'">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Scheduled for</label>
				<input
					v-model="draft.scheduled_at"
					type="datetime-local"
					class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
				/>
			</div>
			<div v-else>
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">
					{{ post.status === 'published' ? 'Published' : 'Scheduled' }}
				</label>
				<p class="mt-1 text-sm text-foreground">
					{{ fmtDateTime(post.published_at || post.scheduled_at) }}
				</p>
			</div>

			<!-- Platforms -->
			<div v-if="post.platforms && post.platforms.length">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Platforms</label>
				<div class="mt-1 flex flex-wrap gap-1.5">
					<span
						v-for="(t, i) in post.platforms"
						:key="`${post.id}-pl-${i}`"
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-muted/60 text-foreground"
					>
						<Icon :name="SOCIAL_LOGOS[t.platform as SocialPlatform] || 'lucide:share-2'" class="w-3 h-3" />
						{{ t.account_name || t.platform }}
					</span>
				</div>
			</div>

			<!-- Figma -->
			<div v-if="post.figma_frame_url">
				<a
					:href="post.figma_frame_url"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
				>
					<Icon name="lucide:figma" class="w-3.5 h-3.5" />
					Open Figma frame
					<Icon name="lucide:external-link" class="w-3 h-3" />
				</a>
			</div>

			<!-- Actions -->
			<div class="flex items-center justify-between pt-3 border-t border-border/30 gap-2 flex-wrap">
				<div class="flex items-center gap-2">
					<NuxtLink
						v-if="isStudio"
						to="/apps/marketing?floor=studio"
						class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
					>
						Open in Studio
						<Icon name="lucide:external-link" class="w-3 h-3" />
					</NuxtLink>
					<NuxtLink
						v-if="isEditable"
						:to="`/social/posts/${post.id}/edit`"
						class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						Full editor
						<Icon name="lucide:external-link" class="w-3 h-3" />
					</NuxtLink>
				</div>
				<button
					v-if="isEditable"
					type="button"
					:disabled="saving"
					class="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
					@click="save"
				>
					<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
					Save
				</button>
			</div>
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load post.
		</div>
	</AppSlideOverShell>
</template>
