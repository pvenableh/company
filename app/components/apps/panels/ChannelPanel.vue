<!--
  ChannelPanel — slide-over body for a single channel conversation.

  Fetches the channel by id, then renders the self-contained
  `<ChannelsChannelThread>` (live messages + composer) inside
  `AppSlideOverShell`. This lets a channel open *inside* the slide-over stack
  (stacked on top of e.g. a project) instead of navigating the underlying page,
  which previously left the channel rendered behind the slide-over.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: any }>();
defineEmits<{ (e: 'close'): void }>();

const channelItems = useDirectusItems('channels');
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
const title = computed(() => (displayName.value ? `#${displayName.value}` : 'Channel'));
const subtitle = computed(() => channel.value?.ticket?.title || null);

onMounted(load);
watch(() => props.id, load);
onBeforeUnmount(() => {
	if (entityId.value === String(channel.value?.id)) resetEntityContext();
});
</script>

<template>
	<AppSlideOverShell
		:title="title"
		:subtitle="subtitle"
		:flip-from="flipFrom"
		@close="$emit('close')"
	>
		<template #actions>
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
	</AppSlideOverShell>
</template>
