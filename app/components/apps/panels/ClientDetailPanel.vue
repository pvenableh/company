<!--
  ClientDetailPanel — slide-over body for a client.

  Wraps the shared `<AppsClientsClientWorkspace>` inside `AppSlideOverShell`
  so the panel renders the same 8-tab surface as `/apps/clients/[id]`. The
  panel is now true parity with the full page — contacts, projects,
  tickets, tasks, invoices, partners, messages, activity feed all
  available, and each tab carries inline create affordances (UModal
  teleports out of the transformed container so + New X works).

  Lives at depth 1 in the universal slide-over stack. Pushing a contact
  on top stacks a `ContactPanel`; the workspace's row-click handler
  uses `useAppSlideOver('contact')` so this happens automatically.
-->
<script setup lang="ts">
import { Icon } from '#components';
import type { Client } from '~~/shared/directus';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const client = ref<Client | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(c: Client) {
	client.value = c;
	// Register client context so Earnest is aware of who you're viewing in
	// the slide-over (the full page does this; the panel previously didn't).
	setEntity('client', String(c.id), c.name || 'Client');
}

// Drop the entity context when the slide-over closes — but only if it's
// still pointing at us (a panel pushed on top may have taken over). Use
// resetEntityContext so closing the panel doesn't also close a deliberately
// opened Earnest panel.
onBeforeUnmount(() => {
	if (entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
	<AppSlideOverShell :title="client?.name || 'Client'" @close="$emit('close')">
		<template v-if="client" #actions>
			<NuxtLink
				:to="`/apps/clients/${client.id}`"
				class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
				:title="`Open full page for ${client.name}`"
			>
				<Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
				Open Client
			</NuxtLink>
		</template>

		<AppsClientsClientWorkspace :client-id="id" compact @loaded="onLoaded" />
	</AppSlideOverShell>
</template>
