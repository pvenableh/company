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
import type { SocialAccountPublic, SocialPostTarget, PostType, SocialClient, SocialPlatform } from '~~/types/social';

const showAIWizard = ref(false);

function handleAICreated(posts: { platform: SocialPlatform; caption: string }[]) {
	showAIWizard.value = false;
	if (posts.length > 0) {
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

// Fetch data (lazy to avoid blocking page render on Directus errors)
const { data: accountsData } = useLazyFetch('/api/social/accounts');
const { data: clientsData, refresh: refreshClients } = useLazyFetch('/api/social/clients');

const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[]);
const clients = computed(() => ((clientsData.value as any)?.data || []) as (SocialClient & { account_count: number })[]);

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

// LinkedIn-specific options
const linkedInVisibility = ref<'PUBLIC' | 'CONNECTIONS'>('PUBLIC');

// Filter state
const selectedClientId = ref<string | null>(null);

// UI state
const isSubmitting = ref(false);
const mediaInput = ref('');
const toast = useToast();
const showNewClientModal = ref(false);
const newClientName = ref('');

// Group accounts by client for display
const accountsByClient = computed(() => {
	const grouped: Record<string, { client: SocialClient | null; accounts: SocialAccountPublic[] }> = {};

	// Unassigned accounts
	const unassigned = accounts.value.filter((a) => !a.client_id);
	if (unassigned.length > 0) {
		grouped['unassigned'] = { client: null, accounts: unassigned };
	}

	// Grouped by client
	for (const client of clients.value) {
		const clientAccounts = accounts.value.filter((a) => a.client_id === client.id);
		if (clientAccounts.length > 0) {
			grouped[client.id] = { client, accounts: clientAccounts };
		}
	}

	return grouped;
});

const selectedAccountDetails = computed(() => {
	return accounts.value.filter((a) => selectedAccounts.value.includes(a.id));
});

// Platform selection detection
function hasPlatformSelected(platform: SocialPlatform) {
	return selectedAccountDetails.value.some((a) => a.platform === platform);
}

const instagramSelected = computed(() => hasPlatformSelected('instagram'));
const tiktokSelected = computed(() => hasPlatformSelected('tiktok'));
const linkedinSelected = computed(() => hasPlatformSelected('linkedin'));
const threadsSelected = computed(() => hasPlatformSelected('threads'));

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

function selectAllInClient(clientId: string | null) {
	const clientAccounts = clientId
		? accounts.value.filter((a) => a.client_id === clientId)
		: accounts.value.filter((a) => !a.client_id);

	const allSelected = clientAccounts.every((a) => selectedAccounts.value.includes(a.id));

	if (allSelected) {
		for (const account of clientAccounts) {
			const index = selectedAccounts.value.indexOf(account.id);
			if (index !== -1) selectedAccounts.value.splice(index, 1);
		}
	} else {
		for (const account of clientAccounts) {
			if (!selectedAccounts.value.includes(account.id)) {
				selectedAccounts.value.push(account.id);
			}
		}
	}
}

async function createClient() {
	if (!newClientName.value.trim()) return;

	try {
		await $fetch('/api/social/clients', {
			method: 'POST',
			body: { name: newClientName.value.trim() },
		});

		toast.add({
			title: 'Client created',
			icon: 'i-lucide-check-circle',
			color: 'green',
		});

		await refreshClients();
		showNewClientModal.value = false;
		newClientName.value = '';
	} catch (error: any) {
		toast.add({
			title: 'Error',
			description: error.data?.message || 'Failed to create client',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	}
}

async function submitPost() {
	if (!canSubmit.value) return;

	isSubmitting.value = true;

	try {
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

		await $fetch('/api/social/posts', {
			method: 'POST',
			body: {
				caption: caption.value,
				media_urls: mediaUrls.value,
				media_types: mediaTypes.value,
				platforms,
				post_type: postType.value,
				scheduled_at: new Date(scheduledAt.value).toISOString(),
				status: isDraft.value ? 'draft' : 'scheduled',
			},
		});

		toast.add({
			title: isDraft.value ? 'Draft saved' : 'Post scheduled',
			description: isDraft.value
				? 'Your post has been saved as a draft.'
				: `Scheduled for ${format(new Date(scheduledAt.value), 'MMM d, h:mm a')} to ${selectedAccounts.value.length} account(s)`,
			icon: 'i-lucide-check-circle',
			color: 'green',
		});

		caption.value = '';
		mediaUrls.value = [];
		mediaTypes.value = [];
		selectedAccounts.value = [];

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
</script>

<template>
	<div class="p-6 lg:p-8 max-w-6xl mx-auto">
		<!-- Header -->
		<div class="flex items-center gap-4 mb-8">
			<UButton to="/social/dashboard" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
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
						<UInput v-model="mediaInput" placeholder="Paste media URL..." class="flex-1" @keyup.enter="addMedia" />
						<UButton @click="addMedia" icon="i-lucide-plus" :disabled="!mediaInput.trim()">Add</UButton>
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

					<!-- Client Filter -->
					<div class="mb-4">
						<USelectMenu
							v-model="selectedClientId"
							:options="[
								{ label: 'All Accounts', value: null },
								...clients.map((c) => ({ label: c.name, value: c.id })),
							]"
							value-attribute="value"
							option-attribute="label"
							placeholder="Filter by client..."
							class="w-full"
						/>
					</div>

					<div v-if="accounts.length === 0" class="text-center py-4">
						<p class="text-sm text-gray-500 dark:text-gray-400 mb-3">No accounts connected</p>
						<UButton to="/social/settings" size="sm" variant="soft">Connect Account</UButton>
					</div>

					<!-- Grouped Account List -->
					<div v-else class="space-y-4 max-h-[400px] overflow-y-auto">
						<template v-for="(group, groupKey) in accountsByClient" :key="groupKey">
							<template
								v-if="
									!selectedClientId || selectedClientId === groupKey || (groupKey === 'unassigned' && !selectedClientId)
								"
							>
								<div class="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0">
									<!-- Client Header -->
									<div class="flex items-center justify-between mb-2">
										<div class="flex items-center gap-2">
											<div
												v-if="group.client?.brand_color"
												class="w-3 h-3 rounded-full"
												:style="{ backgroundColor: group.client.brand_color }"
											/>
											<span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
												{{ group.client?.name || 'Unassigned' }}
											</span>
										</div>
										<button
											@click="selectAllInClient(group.client?.id || null)"
											class="text-xs text-primary hover:text-primary/85"
										>
											Select all
										</button>
									</div>

									<!-- Account Items -->
									<div class="space-y-2">
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
							</template>
						</template>
					</div>

					<template #footer>
						<UButton variant="ghost" size="xs" icon="i-lucide-plus" @click="showNewClientModal = true">
							Add Client
						</UButton>
					</template>
				</UCard>

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
						:icon="isDraft ? 'i-lucide-save' : 'i-lucide-send'"
					>
						{{ isDraft ? 'Save Draft' : 'Schedule Post' }}
					</UButton>

					<p v-if="!isDraft && canSubmit" class="text-xs text-center text-gray-500 dark:text-gray-400">
						Posting to {{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }} at
						{{ format(new Date(scheduledAt), 'MMM d, h:mm a') }}
					</p>
				</div>
			</div>
		</div>

		<!-- AI Social Wizard -->
		<SocialAISocialWizard
			v-if="showAIWizard"
			@close="showAIWizard = false"
			@created="handleAICreated"
		/>

		<!-- New Client Modal -->
		<UModal v-model="showNewClientModal">
			<UCard>
				<template #header>
					<h3 class="font-semibold text-gray-900 dark:text-white">Add New Client</h3>
				</template>

				<UInput v-model="newClientName" placeholder="Client name..." @keyup.enter="createClient" />

				<template #footer>
					<div class="flex justify-end gap-3">
						<UButton variant="ghost" @click="showNewClientModal = false">Cancel</UButton>
						<UButton @click="createClient" :disabled="!newClientName.trim()">Create</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</div>
</template>
