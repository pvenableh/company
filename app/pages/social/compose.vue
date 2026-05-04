<script setup lang="ts">
/**
 * Social Media Post Composer
 * /social/compose
 *
 * Features:
 * - Filter accounts by client
 * - Select multiple accounts across clients
 * - Per-platform options
 */

import { format, addHours, roundToNearestMinutes } from 'date-fns';
import type { SocialAccountPublic, SocialPostTarget, PostType, SocialPlatform } from '~~/shared/social';

const showAIWizard = ref(false);
const showPostNowConfirm = ref(false);

function handleAICreated(posts: { platform: SocialPlatform; caption: string }[]) {
	showAIWizard.value = false;
	if (posts.length > 0 && posts[0]) {
		caption.value = posts[0].caption;
	}
	toast.add({
		title: 'AI content generated',
		description: `Created ${posts.length} draft post${posts.length !== 1 ? 's' : ''}`,
		icon: 'i-lucide-check-circle',
		color: 'green',
	});
}

definePageMeta({
	layout: 'default',
	middleware: ['auth'],
});
useHead({ title: 'Compose Post | Earnest' });

// Platform icon mapping
const platformIcons: Record<SocialPlatform, string> = {
	instagram: 'i-lucide-instagram',
	tiktok: 'i-lucide-music',
	linkedin: 'i-lucide-linkedin',
	facebook: 'i-lucide-facebook',
	threads: 'i-lucide-at-sign',
};

const { data: accountsData } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[]);

// Form state
const caption = ref('');
const mediaUrls = ref<string[]>([]);
const mediaTypes = ref<('image' | 'video')[]>([]);
const selectedAccounts = ref<string[]>([]);
const postType = ref<PostType>('image');
const scheduledAt = ref(
	format(roundToNearestMinutes(addHours(new Date(), 1), { nearestTo: 15 }), "yyyy-MM-dd'T'HH:mm"),
);
const isDraft = ref(false);

// Optional CTA link — appended to caption at publish time. Persists on the
// draft so it survives wizard generation, manual edits, and previews.
const ctaUrl = ref('');
const ctaLabel = ref('');

// LinkedIn-specific options
const linkedInVisibility = ref<'PUBLIC' | 'CONNECTIONS'>('PUBLIC');

// UI state
const isSubmitting = ref(false);
const mediaInput = ref('');
const showFilePicker = ref(false);
const toast = useToast();

// All connected accounts grouped by client (House first, then per-client).
const accountGroups = computed(() => {
	const groups: { label: string; clientId: string | null; accounts: SocialAccountPublic[] }[] = [];
	const houseAccounts = accounts.value.filter((a) => !a.client);
	if (houseAccounts.length) groups.push({ label: 'House (agency-owned)', clientId: null, accounts: houseAccounts });

	const byClient = new Map<string, { name: string; accounts: SocialAccountPublic[] }>();
	for (const a of accounts.value) {
		if (!a.client) continue;
		if (!byClient.has(a.client)) byClient.set(a.client, { name: a.client_name || 'Unnamed Client', accounts: [] });
		byClient.get(a.client)!.accounts.push(a);
	}
	for (const [id, { name, accounts: list }] of byClient) {
		groups.push({ label: name, clientId: id, accounts: list });
	}
	return groups;
});

const selectedAccountDetails = computed(() => {
	return accounts.value.filter((a) => selectedAccounts.value.includes(a.id));
});

// Infer the post's tagged client from the first selected account so the
// social_posts.client FK is still populated for analytics & filtering.
const inferredClient = computed(() => selectedAccountDetails.value[0]?.client ?? null);

// Platform selection detection
function hasPlatformSelected(platform: SocialPlatform) {
	return selectedAccountDetails.value.some((a) => a.platform === platform);
}

const instagramSelected = computed(() => hasPlatformSelected('instagram'));
const tiktokSelected = computed(() => hasPlatformSelected('tiktok'));
const linkedinSelected = computed(() => hasPlatformSelected('linkedin'));
const threadsSelected = computed(() => hasPlatformSelected('threads'));

const selectedPlatforms = computed(() => {
	const set = new Set<SocialPlatform>();
	for (const a of selectedAccountDetails.value) set.add(a.platform);
	return [...set];
});

const aiSuggesting = ref(false);
function askEarnestForSuggestions() {
	// Re-use the existing AI Wizard, pre-seeded with current draft as the topic
	// so Earnest can rewrite/strengthen the post.
	showAIWizard.value = true;
}

const captionLength = computed(() => caption.value.length);
const captionWarning = computed(() => {
	if (instagramSelected.value && captionLength.value > 2200) {
		return 'Instagram captions max 2,200 characters';
	}
	if (linkedinSelected.value && captionLength.value > 3000) {
		return 'LinkedIn posts max 3,000 characters';
	}
	if (tiktokSelected.value && captionLength.value > 4000) {
		return 'TikTok captions max 4,000 characters';
	}
	return null;
});

const captionLimit = computed(() => {
	if (instagramSelected.value) return '2,200';
	if (linkedinSelected.value) return '3,000';
	return '4,000';
});

const postTypeOptions = [
	{ value: 'text', label: 'Text', icon: 'i-lucide-type' },
	{ value: 'image', label: 'Image', icon: 'i-lucide-image' },
	{ value: 'video', label: 'Video', icon: 'i-lucide-video' },
	{ value: 'carousel', label: 'Carousel', icon: 'i-lucide-images' },
	{ value: 'reel', label: 'Reel', icon: 'i-lucide-clapperboard' },
	{ value: 'story', label: 'Story', icon: 'i-lucide-clock' },
	{ value: 'article', label: 'Article', icon: 'i-lucide-newspaper' },
];

const canSubmit = computed(() => {
	const hasCaption = caption.value.trim().length > 0;
	const hasMedia = mediaUrls.value.length > 0;
	const hasAccounts = selectedAccounts.value.length > 0;
	const noWarning = !captionWarning.value;

	// Text and article posts don't require media
	const isTextType = postType.value === 'text' || postType.value === 'article';

	return hasCaption && (hasMedia || isTextType) && hasAccounts && noWarning;
});

const minDateTime = computed(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));

// Methods
function addMedia() {
	if (!mediaInput.value.trim()) return;
	const url = mediaInput.value.trim();
	const isVideo = /\.(mp4|mov|webm|avi)$/i.test(url) || url.includes('video');
	mediaUrls.value.push(url);
	mediaTypes.value.push(isVideo ? 'video' : 'image');
	mediaInput.value = '';
}

function removeMedia(index: number) {
	mediaUrls.value.splice(index, 1);
	mediaTypes.value.splice(index, 1);
}

function toggleAccount(accountId: string) {
	const index = selectedAccounts.value.indexOf(accountId);
	if (index === -1) {
		selectedAccounts.value.push(accountId);
	} else {
		selectedAccounts.value.splice(index, 1);
	}
}

function selectAllAccounts() {
	const allSelected = accounts.value.every((a) => selectedAccounts.value.includes(a.id));
	if (allSelected) {
		selectedAccounts.value = [];
	} else {
		selectedAccounts.value = accounts.value.map((a) => a.id);
	}
}

function buildPostBody(status: 'draft' | 'scheduled') {
	const platforms: SocialPostTarget[] = selectedAccountDetails.value.map((account) => ({
		platform: account.platform,
		account_id: account.id,
		account_name: account.account_name,
		options:
			account.platform === 'tiktok'
				? {
						privacy_level: 'PUBLIC_TO_EVERYONE',
						disable_duet: false,
						disable_stitch: false,
						disable_comment: false,
						post_mode: 'MEDIA_UPLOAD',
					}
				: account.platform === 'linkedin'
					? {
							visibility: linkedInVisibility.value,
						}
					: undefined,
	}));

	return {
		caption: caption.value,
		media_urls: mediaUrls.value,
		media_types: mediaTypes.value,
		platforms,
		post_type: postType.value,
		scheduled_at: new Date(scheduledAt.value).toISOString(),
		status,
		client: inferredClient.value,
		cta_url: ctaUrl.value.trim() || null,
		cta_label: ctaUrl.value.trim() ? (ctaLabel.value.trim() || null) : null,
	};
}

async function submitPost() {
	if (!canSubmit.value) return;
	isSubmitting.value = true;

	try {
		await $fetch('/api/social/posts', {
			method: 'POST',
			body: buildPostBody(isDraft.value ? 'draft' : 'scheduled'),
		});

		toast.add({
			title: isDraft.value ? 'Draft saved' : 'Post scheduled',
			description: isDraft.value
				? 'Your post has been saved as a draft.'
				: `Scheduled for ${format(new Date(scheduledAt.value), 'MMM d, h:mm a')} to ${selectedAccounts.value.length} account(s)`,
			icon: 'i-lucide-check-circle',
			color: 'green',
		});

		await navigateTo('/social/calendar');
	} catch (error: any) {
		toast.add({
			title: 'Error',
			description: error.data?.message || 'Failed to create post',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	} finally {
		isSubmitting.value = false;
	}
}

async function postNow() {
	if (!canSubmit.value) return;
	isSubmitting.value = true;
	showPostNowConfirm.value = false;

	try {
		// Save as scheduled at "now" then immediately publish.
		const created: any = await $fetch('/api/social/posts', {
			method: 'POST',
			body: { ...buildPostBody('scheduled'), scheduled_at: new Date().toISOString() },
		});

		const postId = created?.data?.id;
		if (postId) {
			await $fetch(`/api/social/posts/${postId}/publish-now`, { method: 'POST' });
		}

		toast.add({
			title: 'Posting…',
			description: `Publishing to ${selectedAccounts.value.length} account(s) — refresh in a moment to see results.`,
			icon: 'i-lucide-send',
			color: 'green',
		});

		await navigateTo('/social/calendar');
	} catch (error: any) {
		toast.add({
			title: 'Error',
			description: error.data?.message || 'Failed to publish post',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	} finally {
		isSubmitting.value = false;
	}
}

function onPickFiles(picked: { url: string; type: 'image' | 'video' }[]) {
	for (const f of picked) {
		mediaUrls.value.push(f.url);
		mediaTypes.value.push(f.type);
	}
	showFilePicker.value = false;
}
</script>

<template>
	<LayoutPageContainer>
		<!-- Header -->
		<div class="flex items-center gap-4 mb-8">
			<UButton to="/social" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
			<div class="flex-1">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Create Post</h1>
				<p class="text-gray-500 dark:text-gray-400 mt-0.5">Schedule content across multiple accounts</p>
			</div>
			<UButton
				variant="soft"
				color="violet"
				icon="i-lucide-sparkles"
				@click="showAIWizard = true"
			>
				AI Generate
			</UButton>
		</div>

		<div class="grid lg:grid-cols-5 gap-8">
			<!-- Main Form -->
			<div class="lg:col-span-3 space-y-6">
				<!-- Caption -->
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold text-gray-900 dark:text-white">Caption</h2>
							<span class="text-xs font-mono" :class="captionWarning ? 'text-red-500' : 'text-gray-400'">
								{{ captionLength }} / {{ captionLimit }}
							</span>
						</div>
					</template>

					<UTextarea v-model="caption" placeholder="Write your caption here..." :rows="6" autoresize class="w-full" />
					<p v-if="captionWarning" class="text-sm text-red-500 mt-2">{{ captionWarning }}</p>
				</UCard>

				<!-- Media -->
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold text-gray-900 dark:text-white">Media</h2>
							<span v-if="postType === 'text' || postType === 'article'" class="text-xs text-gray-400">Optional for {{ postType }} posts</span>
						</div>
					</template>

					<div v-if="mediaUrls.length > 0" class="grid grid-cols-3 gap-3 mb-4">
						<div
							v-for="(url, index) in mediaUrls"
							:key="index"
							class="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group"
						>
							<img
								v-if="mediaTypes[index] === 'image'"
								:src="url"
								:alt="`Media ${index + 1}`"
								class="w-full h-full object-cover"
							/>
							<div v-else class="w-full h-full flex items-center justify-center">
								<UIcon name="i-lucide-video" class="w-8 h-8 text-gray-400" />
							</div>
							<button
								@click="removeMedia(index)"
								class="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
							>
								<UIcon name="i-lucide-x" class="w-4 h-4" />
							</button>
						</div>
					</div>

					<div class="flex gap-2">
						<UButton variant="soft" icon="i-lucide-folder-open" @click="showFilePicker = true">
							Choose from Files
						</UButton>
						<UInput v-model="mediaInput" placeholder="…or paste a media URL" class="flex-1" @keyup.enter="addMedia" />
						<UButton variant="ghost" @click="addMedia" icon="i-lucide-plus" :disabled="!mediaInput.trim()" />
					</div>
				</UCard>

				<!-- Link / Call to Action -->
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold text-gray-900 dark:text-white">Add a Link</h2>
							<span class="text-xs text-gray-400">Optional</span>
						</div>
					</template>
					<div class="space-y-3">
						<UInput v-model="ctaUrl" type="url" placeholder="https://example.com/landing-page" />
						<UInput v-model="ctaLabel" placeholder='Short label (e.g. "Visit Website")' />
						<p class="text-xs text-muted-foreground">
							The URL is appended to the caption when the post publishes. LinkedIn, Facebook and Threads
							will fetch OG tags and render a link card automatically. Instagram and TikTok don't make
							caption links clickable — the URL is included for reference only.
						</p>
					</div>
				</UCard>

				<!-- Post Type -->
				<UCard>
					<template #header>
						<h2 class="font-semibold text-gray-900 dark:text-white">Post Type</h2>
					</template>

					<div class="flex flex-wrap gap-2">
						<UButton
							v-for="option in postTypeOptions"
							:key="option.value"
							:variant="postType === option.value ? 'solid' : 'soft'"
							:color="postType === option.value ? 'primary' : 'gray'"
							:icon="option.icon"
							size="sm"
							@click="postType = option.value as PostType"
						>
							{{ option.label }}
						</UButton>
					</div>
				</UCard>

				<!-- LinkedIn Options -->
				<UCard v-if="linkedinSelected">
					<template #header>
						<div class="flex items-center gap-2">
							<UIcon name="i-lucide-linkedin" class="w-4 h-4 text-[#0A66C2]" />
							<h2 class="font-semibold text-gray-900 dark:text-white">LinkedIn Options</h2>
						</div>
					</template>

					<div class="space-y-4">
						<div>
							<label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Visibility</label>
							<div class="flex gap-2">
								<UButton
									:variant="linkedInVisibility === 'PUBLIC' ? 'solid' : 'soft'"
									:color="linkedInVisibility === 'PUBLIC' ? 'primary' : 'gray'"
									size="sm"
									icon="i-lucide-globe"
									@click="linkedInVisibility = 'PUBLIC'"
								>
									Public
								</UButton>
								<UButton
									:variant="linkedInVisibility === 'CONNECTIONS' ? 'solid' : 'soft'"
									:color="linkedInVisibility === 'CONNECTIONS' ? 'primary' : 'gray'"
									size="sm"
									icon="i-lucide-users"
									@click="linkedInVisibility = 'CONNECTIONS'"
								>
									Connections Only
								</UButton>
							</div>
						</div>
					</div>
				</UCard>
			</div>

			<!-- Sidebar -->
			<div class="lg:col-span-2 space-y-6">
				<!-- Account Selection -->
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold text-gray-900 dark:text-white">Post To</h2>
							<UBadge v-if="selectedAccounts.length > 0" color="primary" variant="subtle">
								{{ selectedAccounts.length }} selected
							</UBadge>
						</div>
					</template>

					<div v-if="accounts.length === 0" class="text-center py-4">
						<p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
							No accounts connected yet.
						</p>
						<UButton to="/social/settings" size="sm" variant="soft">Connect Account</UButton>
					</div>

					<div v-else>
						<div class="flex items-center justify-end mb-2">
							<button
								@click="selectAllAccounts"
								class="text-xs text-primary hover:text-primary/85"
							>
								{{ accounts.every((a) => selectedAccounts.includes(a.id)) ? 'Deselect all' : 'Select all' }}
							</button>
						</div>
						<div class="space-y-3 max-h-[400px] overflow-y-auto">
							<div v-for="group in accountGroups" :key="group.clientId ?? 'house'">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
									{{ group.label }}
								</p>
								<div class="space-y-1">
									<label
										v-for="account in group.accounts"
										:key="account.id"
										class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
										:class="
											selectedAccounts.includes(account.id)
												? 'bg-primary/10'
												: 'hover:bg-gray-50 dark:hover:bg-gray-800'
										"
									>
										<UCheckbox
											:model-value="selectedAccounts.includes(account.id)"
											@update:model-value="toggleAccount(account.id)"
										/>
										<UAvatar :src="account.profile_picture_url || undefined" :alt="account.account_name" size="xs" />
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
												{{ account.account_name }}
											</p>
											<p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
												<UIcon
													:name="platformIcons[account.platform] || 'i-lucide-globe'"
													class="w-3 h-3"
												/>
												@{{ account.account_handle }}
											</p>
										</div>
									</label>
								</div>
							</div>
						</div>
					</div>
				</UCard>

				<!-- Earnest Recommendations -->
				<SocialPostRecommendations
					:caption="caption"
					:media-count="mediaUrls.length"
					:media-types="mediaTypes"
					:post-type="postType"
					:platforms="selectedPlatforms"
					:cta-url="ctaUrl"
					:cta-label="ctaLabel"
					:scheduled-at="scheduledAt"
					:ai-loading="aiSuggesting"
					@ai-recommend="askEarnestForSuggestions"
				/>

				<!-- Schedule -->
				<UCard>
					<template #header>
						<h2 class="font-semibold text-gray-900 dark:text-white">Schedule</h2>
					</template>

					<div class="space-y-4">
						<UInput v-model="scheduledAt" type="datetime-local" :min="minDateTime" />
						<UCheckbox v-model="isDraft" label="Save as draft" />
					</div>
				</UCard>

				<!-- Submit -->
				<div class="space-y-3">
					<UButton
						@click="submitPost"
						:loading="isSubmitting"
						:disabled="!canSubmit"
						block
						size="lg"
						:icon="isDraft ? 'i-lucide-save' : 'i-lucide-calendar-clock'"
					>
						{{ isDraft ? 'Save Draft' : 'Schedule Post' }}
					</UButton>

					<UButton
						v-if="!isDraft"
						@click="showPostNowConfirm = true"
						:disabled="!canSubmit || isSubmitting"
						block
						size="lg"
						color="green"
						variant="soft"
						icon="i-lucide-send"
					>
						Post Now
					</UButton>

					<p v-if="!isDraft && canSubmit" class="text-xs text-center text-gray-500 dark:text-gray-400">
						Posting to {{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }} at
						{{ format(new Date(scheduledAt), 'MMM d, h:mm a') }}
					</p>
				</div>
			</div>
		</div>

		<!-- Platform Previews -->
		<div v-if="selectedAccountDetails.length > 0" class="mt-10">
			<h2 class="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Preview</h2>
			<SocialPostPreview
				:caption="caption"
				:media-urls="mediaUrls"
				:media-types="mediaTypes"
				:cta-url="ctaUrl"
				:cta-label="ctaLabel"
				:accounts="selectedAccountDetails"
			/>
		</div>

		<!-- AI Social Wizard -->
		<SocialAISocialWizard
			v-if="showAIWizard"
			@close="showAIWizard = false"
			@created="handleAICreated"
		/>

		<!-- File Picker -->
		<SocialMediaFilePicker
			v-if="showFilePicker"
			@close="showFilePicker = false"
			@picked="onPickFiles"
		/>

		<!-- Post Now confirm -->
		<UModal v-model="showPostNowConfirm" class="sm:max-w-md">
			<UCard>
				<template #header>
					<div class="flex items-center gap-2">
						<UIcon name="i-lucide-send" class="w-5 h-5 text-green-600" />
						<h3 class="font-semibold">Post immediately?</h3>
					</div>
				</template>

				<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
					This will publish to <strong>{{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }}</strong> right now.
					You can't unpublish from inside Earnest — you'll need to delete from each platform directly if you change your mind.
				</p>
				<div v-if="selectedAccountDetails.length > 0" class="flex flex-wrap gap-1.5">
					<span
						v-for="a in selectedAccountDetails"
						:key="a.id"
						class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
					>
						<UIcon :name="platformIcons[a.platform]" class="w-3 h-3" />
						{{ a.account_name }}
					</span>
				</div>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton variant="ghost" @click="showPostNowConfirm = false">Cancel</UButton>
						<UButton color="green" icon="i-lucide-send" :loading="isSubmitting" @click="postNow">
							Yes, Post Now
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</LayoutPageContainer>
</template>
