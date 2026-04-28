<script setup>
import { Archive } from 'lucide-vue-next';

const { currentOrg, isCurrentOrgArchived } = useOrganization();

const RETENTION_DAYS = 90;

const restoreDeadline = computed(() => {
	const archivedAt = currentOrg.value?.archived_at;
	if (!archivedAt) return null;
	const d = new Date(archivedAt);
	d.setDate(d.getDate() + RETENTION_DAYS);
	try {
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	} catch {
		return d.toISOString().slice(0, 10);
	}
});

const daysRemaining = computed(() => {
	const archivedAt = currentOrg.value?.archived_at;
	if (!archivedAt) return null;
	const archived = new Date(archivedAt).getTime();
	const deadline = archived + RETENTION_DAYS * 24 * 60 * 60 * 1000;
	const remaining = Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
	return remaining;
});

const orgName = computed(() => currentOrg.value?.name || 'organization');
</script>

<template>
	<div
		v-if="isCurrentOrgArchived"
		class="sticky top-0 z-40 w-full bg-amber-50 border-b border-amber-200 dark:bg-amber-900/30 dark:border-amber-900/50"
		role="alert"
	>
		<div class="max-w-screen-2xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-900 dark:text-amber-200">
			<Archive class="size-4 flex-shrink-0" />
			<span class="font-medium">{{ orgName }} is archived.</span>
			<span class="text-amber-800/80 dark:text-amber-300/80">
				Read-only. Restore by
				<span class="font-medium">{{ restoreDeadline }}</span>
				<span v-if="daysRemaining != null"> ({{ daysRemaining }}d remaining)</span>
				or data is permanently deleted.
			</span>
			<NuxtLink
				to="/organization"
				class="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900/70 font-medium transition-colors"
			>
				Restore
			</NuxtLink>
		</div>
	</div>
</template>
