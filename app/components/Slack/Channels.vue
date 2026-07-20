<script setup>
/**
 * Project channels list — a compact, token-based roster of this project's
 * internal channels, shown on the project's Conversations tab. Links out to the
 * canonical comms hub (/apps/channels); creating routes through POST /api/channels
 * so audience/ACL are seeded consistently (project_channels_apps_home).
 */
import { Button } from '~/components/ui/button';
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const props = defineProps({
	project: {
		type: Object,
		default: () => null,
	},
});

const toast = useToast();

const {
	data: channels,
	isLoading,
	error,
	refresh,
} = useRealtimeSubscription(
	'channels',
	['id', 'name', 'audience', 'status', 'messages.id', 'messages.status'],
	{ _and: [{ project: { _eq: props.project?.id } }, { status: { _eq: 'published' } }] },
	'name',
);

const cleanName = (name) => (name ? String(name).replace(/^#+/, '') : '');
const channelHref = (name) => `/apps/channels/${encodeURIComponent(name)}`;
const publishedCount = (ch) => (ch.messages || []).filter((m) => m.status === 'published').length;

/* ------------------------------------------------------------ Inline create */
const showCreate = ref(false);
const newName = ref('');
const creating = ref(false);

// Channel names are slugs: lowercase, hyphenated, alphanumeric only.
const toSlug = (s) =>
	String(s || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
const isValid = computed(() => toSlug(newName.value).length >= 3);

const orgId = computed(() =>
	typeof props.project?.organization === 'object' ? props.project?.organization?.id : props.project?.organization,
);
const clientId = computed(() =>
	typeof props.project?.client === 'object' ? props.project?.client?.id : props.project?.client,
);

const createChannel = async () => {
	if (!isValid.value || creating.value) return;
	creating.value = true;
	try {
		await $fetch('/api/channels', {
			method: 'POST',
			body: {
				name: toSlug(newName.value),
				organization: orgId.value,
				project: props.project?.id,
				client: clientId.value || undefined,
			},
		});
		toast.add({ title: 'Channel created', color: 'green' });
		newName.value = '';
		showCreate.value = false;
		refresh();
	} catch (err) {
		console.error('Error creating channel:', err);
		toast.add({ title: err?.data?.message || 'Failed to create channel', color: 'red' });
	} finally {
		creating.value = false;
	}
};
</script>

<template>
	<div class="w-full space-y-4">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</span>
				<span v-if="channels?.length" class="text-[10px] text-muted-foreground/60">{{ channels.length }}</span>
			</div>
			<Button size="sm" variant="outline" class="h-7 gap-1 text-[10px]" @click="showCreate = !showCreate">
				<Icon :name="showCreate ? 'lucide:x' : 'lucide:plus'" class="w-3 h-3" />
				{{ showCreate ? 'Cancel' : 'New' }}
			</Button>
		</div>

		<!-- Error -->
		<div v-if="error" class="ios-card p-3 flex items-center gap-2 border-l-4 border-l-destructive">
			<div class="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
				<Icon name="lucide:alert-circle" class="w-3.5 h-3.5 text-destructive" />
			</div>
			<p class="flex-1 min-w-0 text-xs font-medium text-foreground">Failed to load channels</p>
			<button class="text-[10px] text-primary hover:underline shrink-0" @click="refresh">Retry</button>
		</div>

		<!-- Create channel (inline, compact) -->
		<div v-if="showCreate" class="ios-card p-3">
			<label class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Channel name</label>
			<div class="flex items-center gap-2">
				<input
					v-model="newName"
					type="text"
					placeholder="e.g. design-feedback"
					:disabled="creating"
					class="flex-1 h-9 rounded-full glass-field px-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none transition-all"
					@keydown.enter="createChannel"
				>
				<Button size="sm" class="h-9 shrink-0" :disabled="!isValid || creating" @click="createChannel">
					{{ creating ? 'Creating…' : 'Create' }}
				</Button>
			</div>
			<p v-if="newName && !isValid" class="text-[10px] text-destructive mt-1">At least 3 characters required.</p>
		</div>

		<!-- Loading -->
		<div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 gap-3">
			<div v-for="n in 2" :key="n" class="ios-card p-4 animate-pulse">
				<div class="flex items-center gap-3">
					<div class="w-9 h-9 rounded-full bg-muted/60" />
					<div class="space-y-1.5 flex-1">
						<div class="h-3 w-24 bg-muted/60 rounded" />
						<div class="h-2.5 w-16 bg-muted/40 rounded" />
					</div>
				</div>
			</div>
		</div>

		<!-- Channels grid -->
		<div v-else-if="channels?.length" class="grid grid-cols-1 md:grid-cols-2 gap-3">
			<NuxtLink
				v-for="item in channels"
				:key="item.id"
				:to="channelHref(item.name)"
				class="ios-card p-4 flex items-center justify-between ios-press"
			>
				<div class="flex items-center gap-3 min-w-0">
					<div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
						<Icon :name="item.audience === 'restricted' ? 'lucide:lock' : 'lucide:hash'" class="w-4 h-4 text-primary" />
					</div>
					<div class="min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{{ cleanName(item.name) }}</p>
						<p class="text-[10px] text-muted-foreground">{{ publishedCount(item) }} messages</p>
					</div>
				</div>
				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 shrink-0" />
			</NuxtLink>
		</div>

		<!-- Empty state -->
		<div v-else class="flex flex-col items-center justify-center py-16 text-center">
			<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
				<Icon name="lucide:message-circle" class="h-6 w-6 text-muted-foreground/60" />
			</div>
			<p class="text-sm text-muted-foreground">No channels for this project.</p>
			<button class="mt-3 text-xs text-primary hover:underline" @click="showCreate = true">
				Create the first channel
			</button>
		</div>
	</div>
</template>
