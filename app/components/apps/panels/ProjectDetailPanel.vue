<!--
  ProjectDetailPanel — slide-over body for a project.

  Wraps the shared `<AppsWorkProjectWorkspace>` inside `AppSlideOverShell`
  so the panel renders the same 8-tab surface as
  `/apps/work/projects/[id]`. Mirror of `ClientDetailPanel` after the
  slide-over v2.1 parity work.

  Lives at depth 1 in the universal slide-over stack. Pushing a client
  on top stacks a `ClientDetailPanel`; the workspace's client link uses
  `useAppSlideOver('client')` so this happens automatically when the
  stack is already open.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const project = ref<any | null>(null);

function onLoaded(p: any) {
	project.value = p;
}
</script>

<template>
	<AppSlideOverShell :title="project?.title || 'Project'" @close="$emit('close')">
		<template v-if="project" #actions>
			<NuxtLink
				:to="`/apps/work/projects/${project.id}`"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				:title="`Open full page for ${project.title}`"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<AppsWorkProjectWorkspace :project-id="id" compact @loaded="onLoaded" />
	</AppSlideOverShell>
</template>
