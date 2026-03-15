<template>
	<div class="ios-card rounded-2xl border border-border bg-card p-4">
		<div class="flex items-center gap-3">
			<!-- Duration badge -->
			<div class="shrink-0">
				<span class="inline-flex items-center rounded-lg bg-primary/10 text-primary px-2.5 py-1.5 text-sm font-semibold font-mono tabular-nums">
					{{ formattedDuration }}
				</span>
			</div>

			<!-- Center: description + pills -->
			<div class="flex-1 min-w-0 space-y-1">
				<p v-if="entry.description" class="text-sm font-medium text-foreground truncate">
					{{ entry.description }}
				</p>
				<p v-else class="text-sm text-muted-foreground italic truncate">
					No description
				</p>

				<div class="flex flex-wrap items-center gap-1">
					<Badge v-if="clientName" variant="secondary" class="text-[11px] px-1.5 py-0">
						{{ clientName }}
					</Badge>
					<Badge v-if="projectName" variant="outline" class="text-[11px] px-1.5 py-0">
						{{ projectName }}
					</Badge>
					<span
						v-if="entry.billable"
						class="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
					>
						<Icon name="lucide:dollar-sign" class="w-3 h-3" />
					</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-0.5 shrink-0">
				<Button variant="ghost" size="icon-sm" @click="emit('edit', entry)">
					<Icon name="lucide:pencil" class="w-3.5 h-3.5 text-muted-foreground" />
				</Button>
				<Button variant="ghost" size="icon-sm" @click="emit('delete', entry)">
					<Icon name="lucide:trash-2" class="w-3.5 h-3.5 text-muted-foreground" />
				</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';

const props = defineProps<{
	entry: TimeEntry;
}>();

const emit = defineEmits<{
	edit: [entry: TimeEntry];
	delete: [entry: TimeEntry];
}>();

const { formatDuration } = useTimeTracker();

const formattedDuration = computed(() => {
	return formatDuration(props.entry.duration_minutes || 0);
});

const clientName = computed(() => {
	const client = props.entry.client;
	if (!client) return null;
	if (typeof client === 'object' && 'name' in client) return client.name;
	return null;
});

const projectName = computed(() => {
	const project = props.entry.project;
	if (!project) return null;
	if (typeof project === 'object' && 'title' in project) return project.title;
	return null;
});
</script>
