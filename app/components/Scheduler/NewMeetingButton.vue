<!-- components/Scheduler/NewMeetingButton.vue -->
<!-- Thin wrapper: "+ New Meeting" opens the stacked meeting create panel
     (`work-meeting`) via useMeetingPanel — no self-hosted modal. Hosts that
     render a meeting list refresh via useMeetingPanel().onChanged (or the
     mounted SchedulerHub, which refreshes itself). -->
<script setup>
// `created` kept for binding back-compat; the actual refresh now flows through
// useMeetingPanel().onChanged on the host, so this button just opens the panel.
defineEmits(['created']);
const { openCreate } = useMeetingPanel();
</script>

<template>
	<button
		@click="openCreate({ defaultVideo: true })"
		class="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors ios-press"
	>
		<EIcon name="i-heroicons-plus" class="w-4 h-4" />
		New Meeting
	</button>
</template>
