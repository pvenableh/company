<!--
  SocialComposePanel — slim slide-over composer.

  Quick-post surface for the apps shell. Captures caption + media URLs +
  account selection + schedule and POSTs to /api/social/posts. Power
  features (drag-reorder media, per-platform options, AI Wizard,
  previews, CTA) stay at /social/compose — the "Full Composer ↗"
  action chip is the escape hatch.

  Opening via slide-over:
    useAppSlideOver('social-compose').open('new')

  The id is unused for now (treated as "new draft") but the registry
  contract requires one — pass 'new' or any sentinel.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';
import { format, addHours, roundToNearestMinutes } from 'date-fns';
import type { SocialAccountPublic, SocialPostTarget, SocialPlatform } from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const toast = useToast();

const { data: accountsData } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[]);

const caption = ref('');
const mediaUrls = ref<string[]>([]);
const mediaTypes = ref<('image' | 'video')[]>([]);
const selectedAccounts = ref<string[]>([]);
const scheduledAt = ref(
	format(roundToNearestMinutes(addHours(new Date(), 1), { nearestTo: 15 }), "yyyy-MM-dd'T'HH:mm"),
);
const isDraft = ref(false);
const isSubmitting = ref(false);
const mediaInput = ref('');

const accountGroups = computed(() => {
	const groups: { label: string; accounts: SocialAccountPublic[] }[] = [];
	const house = accounts.value.filter((a) => !a.client);
	if (house.length) groups.push({ label: 'House', accounts: house });
	const byClient = new Map<string, { name: string; accounts: SocialAccountPublic[] }>();
	for (const a of accounts.value) {
		if (!a.client) continue;
		if (!byClient.has(a.client)) byClient.set(a.client, { name: a.client_name || 'Unnamed', accounts: [] });
		byClient.get(a.client)!.accounts.push(a);
	}
	for (const [, { name, accounts: list }] of byClient) {
		groups.push({ label: name, accounts: list });
	}
	return groups;
});

const selectedAccountDetails = computed(() =>
	accounts.value.filter((a) => selectedAccounts.value.includes(a.id)),
);
const inferredClient = computed(() => selectedAccountDetails.value[0]?.client ?? null);

const derivedPostType = computed(() => {
	if (mediaUrls.value.length === 0) return 'text';
	if (mediaUrls.value.length > 1) return 'carousel';
	if (mediaTypes.value[0] === 'video') return 'reel';
	return 'image';
});

const canSubmit = computed(() => {
	const hasCaption = caption.value.trim().length > 0;
	const hasMedia = mediaUrls.value.length > 0;
	const hasAccounts = selectedAccounts.value.length > 0;
	return hasCaption && (hasMedia || derivedPostType.value === 'text') && hasAccounts;
});

const minDateTime = computed(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));

function addMedia() {
	const url = mediaInput.value.trim();
	if (!url) return;
	const isVideo = /\.(mp4|mov|webm|avi)$/i.test(url) || url.includes('video');
	mediaUrls.value.push(url);
	mediaTypes.value.push(isVideo ? 'video' : 'image');
	mediaInput.value = '';
}

function removeMedia(index: number) {
	mediaUrls.value.splice(index, 1);
	mediaTypes.value.splice(index, 1);
}

function toggleAccount(id: string) {
	const i = selectedAccounts.value.indexOf(id);
	if (i === -1) selectedAccounts.value.push(id);
	else selectedAccounts.value.splice(i, 1);
}

async function submit() {
	if (!canSubmit.value || isSubmitting.value) return;
	isSubmitting.value = true;
	try {
		const platforms: SocialPostTarget[] = selectedAccountDetails.value.map((a) => ({
			platform: a.platform,
			account_id: a.id,
			account_name: a.account_name,
		}));
		await $fetch('/api/social/posts', {
			method: 'POST',
			body: {
				caption: caption.value,
				media_urls: mediaUrls.value,
				media_types: mediaTypes.value,
				platforms,
				post_type: derivedPostType.value,
				scheduled_at: new Date(scheduledAt.value).toISOString(),
				status: isDraft.value ? 'draft' : 'scheduled',
				client: inferredClient.value,
			},
		});
		toast.add({
			title: isDraft.value ? 'Draft saved' : 'Post scheduled',
			color: 'green',
		});
		emit('close');
	} catch (e: any) {
		toast.add({
			title: 'Failed to save post',
			description: e?.data?.message || e?.message,
			color: 'red',
		});
	} finally {
		isSubmitting.value = false;
	}
}

const subtitle = computed(() => {
	const n = selectedAccounts.value.length;
	if (!n) return null;
	const platforms = new Set(selectedAccountDetails.value.map((a) => a.platform));
	return `${n} account${n === 1 ? '' : 's'} · ${[...platforms].join(', ')}`;
});
</script>

<template>
	<AppSlideOverShell title="New social post" :subtitle="subtitle" @close="emit('close')">
		<template #actions>
			<NuxtLink
				to="/social/compose"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				title="Full composer with AI wizard, per-platform options, previews"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Composer
			</NuxtLink>
		</template>

		<div class="space-y-5">
			<!-- Caption -->
			<div class="space-y-1.5">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Caption</label>
				<textarea
					v-model="caption"
					rows="5"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
					placeholder="What's the post?"
				/>
				<p class="text-[10px] text-muted-foreground text-right">{{ caption.length }} chars</p>
			</div>

			<!-- Media -->
			<div class="space-y-1.5">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Media URLs</label>
				<div class="flex items-center gap-2">
					<input
						v-model="mediaInput"
						type="url"
						placeholder="https://…"
						class="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
						@keydown.enter.prevent="addMedia"
					/>
					<button
						type="button"
						class="text-xs h-7 px-3 rounded-full border border-border hover:bg-muted/60 transition-colors"
						:disabled="!mediaInput.trim()"
						@click="addMedia"
					>
						Add
					</button>
				</div>
				<ul v-if="mediaUrls.length" class="space-y-1.5">
					<li
						v-for="(url, i) in mediaUrls"
						:key="`${url}-${i}`"
						class="flex items-center gap-2 text-xs"
					>
						<Icon :name="mediaTypes[i] === 'video' ? 'lucide:video' : 'lucide:image'" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<span class="truncate flex-1">{{ url }}</span>
						<button
							type="button"
							class="text-muted-foreground hover:text-destructive"
							@click="removeMedia(i)"
							aria-label="Remove media"
						>
							<Icon name="lucide:x" class="w-3.5 h-3.5" />
						</button>
					</li>
				</ul>
				<p class="text-[10px] text-muted-foreground">
					Post type: <span class="font-medium text-foreground">{{ derivedPostType }}</span>
				</p>
			</div>

			<!-- Accounts -->
			<div class="space-y-2 pt-3 border-t border-border/30">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Post to</label>
				<div v-if="!accounts.length" class="text-xs text-muted-foreground">
					No connected accounts. <NuxtLink to="/social/settings" class="underline">Connect one</NuxtLink>.
				</div>
				<div v-for="group in accountGroups" :key="group.label" class="space-y-1.5">
					<p class="text-[10px] font-semibold text-muted-foreground">{{ group.label }}</p>
					<div class="flex flex-wrap gap-1.5">
						<button
							v-for="a in group.accounts"
							:key="a.id"
							type="button"
							class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border transition-colors"
							:class="selectedAccounts.includes(a.id)
								? 'border-primary/40 bg-primary/10 text-primary font-medium'
								: 'border-border text-muted-foreground hover:bg-muted/60'"
							@click="toggleAccount(a.id)"
						>
							<Icon :name="getSocialPlatformIcon(a.platform)" class="w-3 h-3" />
							{{ a.account_name }}
						</button>
					</div>
				</div>
			</div>

			<!-- Schedule -->
			<div class="space-y-2 pt-3 border-t border-border/30">
				<div class="flex items-center justify-between">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ isDraft ? 'Save as draft' : 'Schedule for' }}</label>
					<button
						type="button"
						class="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
						@click="isDraft = !isDraft"
					>
						{{ isDraft ? 'Schedule instead' : 'Save as draft' }}
					</button>
				</div>
				<input
					v-if="!isDraft"
					v-model="scheduledAt"
					type="datetime-local"
					:min="minDateTime"
					class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
				/>
			</div>
		</div>

		<template #footer>
			<div class="flex items-center justify-between gap-3">
				<span class="text-xs text-muted-foreground">
					<span v-if="!canSubmit && (caption || mediaUrls.length || selectedAccounts.length)">
						Add caption + accounts to send
					</span>
				</span>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="text-xs h-7 px-3 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
						@click="emit('close')"
					>
						Cancel
					</button>
					<button
						type="button"
						class="text-xs h-7 px-3 rounded-full font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="!canSubmit || isSubmitting"
						@click="submit"
					>
						<Icon v-if="isSubmitting" name="lucide:loader-2" class="w-3 h-3 mr-1 inline animate-spin" />
						{{ isDraft ? 'Save Draft' : 'Schedule' }}
					</button>
				</div>
			</div>
		</template>
	</AppSlideOverShell>
</template>
