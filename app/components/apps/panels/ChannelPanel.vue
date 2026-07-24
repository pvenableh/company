<!--
  ChannelPanel — slide-over body for a channel conversation.

  Two modes, both inside the shared slide-over stack:
    • view (default) — fetches the channel by id, then renders the
      self-contained `<ChannelsChannelThread>` (live messages + composer).
    • create (`mode="create"`) — `id` is the PARENT project id; renders the
      new-channel form that used to be an inline block on the project
      workspace. Names are slugs (lowercase, hyphenated); the new channel
      inherits the project's org + client. On success it bumps a project-scoped
      refresh signal so the workspace's channel list refetches, then pops.
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: any }>();
defineEmits<{ (e: 'close'): void }>();

const isCreate = computed(() => props.mode === 'create');

const channelItems = useDirectusItems('channels');
const projectItems = useDirectusItems('projects');
const { isOrgAdminOrAbove } = useOrgRole();
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

const channel = ref<any | null>(null);
const loading = ref(true);

async function load() {
	loading.value = true;
	try {
		channel.value = await channelItems.get(String(props.id), {
			fields: ['id', 'name', 'organization', 'ticket.title'],
		});
		if (channel.value?.id) {
			setEntity('channel', String(channel.value.id), cleanName(channel.value.name));
		}
	} catch {
		channel.value = null;
	} finally {
		loading.value = false;
	}
}

const cleanName = (name?: string | null) => (name ? String(name).replace(/^#+/, '') : '');
const displayName = computed(() => cleanName(channel.value?.name));
const title = computed(() => (isCreate.value ? 'New Channel' : displayName.value ? `#${displayName.value}` : 'Channel'));
const subtitle = computed(() => (isCreate.value ? null : channel.value?.ticket?.title || null));

/* ---- create mode ---- */
const { pop } = useAppSlideOverStack();
// `id` is the parent project id in create mode.
const channelsRefresh = useState<number>(`project-channels-refresh:${props.id}`, () => 0);
const newName = ref('');
const creating = ref(false);
const channelSlug = (s: string) =>
	String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nameValid = computed(() => channelSlug(newName.value).length >= 3);

async function createChannel() {
	if (!nameValid.value || creating.value) return;
	creating.value = true;
	try {
		// New channels inherit the project's org + client so they land tagged
		// to this project. Fetch them from the parent project record.
		const project = await projectItems.get(String(props.id), {
			fields: ['id', 'organization', 'client'],
		});
		await $fetch('/api/channels', {
			method: 'POST',
			body: {
				name: channelSlug(newName.value),
				organization: (project as any)?.organization || undefined,
				project: props.id,
				client: (project as any)?.client || undefined,
			},
		});
		toast.success('Channel created');
		channelsRefresh.value++;
		pop();
	} catch (err: any) {
		toast.error(err?.data?.message || err?.message || 'Failed to create channel');
	} finally {
		creating.value = false;
	}
}

onMounted(() => { if (!isCreate.value) load(); });
watch(() => props.id, () => { if (!isCreate.value) load(); });
onBeforeUnmount(() => {
	if (!isCreate.value && entityId.value === String(channel.value?.id)) resetEntityContext();
});
</script>

<template>
	<AppSlideOverShell
		:title="title"
		:subtitle="subtitle"
		:flip-from="flipFrom"
		@close="$emit('close')"
	>
		<template v-if="!isCreate" #actions>
			<NuxtLink
				v-if="channel?.name"
				:to="`/channels/${cleanName(channel.name)}`"
				class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
				title="Open the channel as a full page"
			>
				<Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
				Open Channel
			</NuxtLink>
		</template>

		<!-- Create mode — the new-channel form (formerly inline on the workspace). -->
		<form v-if="isCreate" class="max-w-md" @submit.prevent="createChannel">
			<label class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Channel name</label>
			<div class="flex items-center gap-2">
				<div class="flex-1 flex items-center gap-1.5 h-9 rounded-full border border-border/50 bg-muted/30 px-3 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
					<span class="text-muted-foreground/50 text-sm">#</span>
					<input
						v-model="newName"
						type="text"
						placeholder="e.g. design-feedback"
						:disabled="creating"
						autofocus
						class="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
					>
				</div>
				<Button size="sm" type="submit" class="h-9 shrink-0" :disabled="!nameValid || creating">
					{{ creating ? 'Creating…' : 'Create' }}
				</Button>
			</div>
			<p class="text-[10px] text-muted-foreground mt-1.5">
				Lowercase letters, numbers, and hyphens. Tagged to this project automatically.
			</p>
		</form>

		<template v-else>
			<div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">Loading channel…</div>
			<div v-else-if="!channel" class="py-16 text-center text-sm text-muted-foreground">Channel not found.</div>
			<ChannelsChannelThread
				v-else
				:key="channel.id"
				:channel-id="String(channel.id)"
				:channel-name="channel.name"
				:organization-id="channel.organization || null"
				:can-moderate="isOrgAdminOrAbove"
				pane-class="max-h-[calc(100vh-13rem)] min-h-[20rem]"
			/>
		</template>
	</AppSlideOverShell>
</template>
