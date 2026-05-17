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

function onLoaded(c: Client) {
	client.value = c;
}
</script>

<template>
	<AppSlideOverShell :title="client?.name || 'Client'" @close="$emit('close')">
		<template v-if="client" #actions>
			<NuxtLink
				:to="`/apps/clients/${client.id}`"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				:title="`Open full page for ${client.name}`"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<AppsClientsClientWorkspace :client-id="id" @loaded="onLoaded" />
	</AppSlideOverShell>
</template>
