<!-- pages/scheduler/settings.vue -->
<!--
  Scheduler Settings — thin page wrapper around <SchedulerSettingsPanel />.
  The full settings UI was extracted into the panel component so the same
  surface can render here as a standalone page AND inside an AppSlideOver
  launched from the scheduler hub gear button (the recommended flow).
  Direct visits to /scheduler/settings still work — useful for bookmarks
  and for OAuth callbacks that redirect here with ?google=connected etc.
-->
<script setup>
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Scheduler Settings | Earnest' });

const router = useRouter();
const route = useRoute();

const FLOOR_KEYS = ['general', 'event-types', 'availability', 'booking', 'calendar', 'notifications'];

// Deep-link via `?floor=<key>` — keeps backwards compatibility with the
// gear-link from SchedulerHub and the legacy in-app deep-links.
const initialFloor = (() => {
	const v = route.query.floor;
	return typeof v === 'string' && FLOOR_KEYS.includes(v) ? v : 'general';
})();

function handleFloorChange(next) {
	router.replace({ query: { ...route.query, floor: next === 'general' ? undefined : next } });
}
</script>

<template>
	<div class="apps-page">
		<AppHeader title="Scheduler Settings" back-label="Scheduler" :show-back="true" />

		<LayoutPageContainer>
			<SchedulerSettingsPanel
				:initial-floor="initialFloor"
				@update:floor="handleFloorChange"
			/>
		</LayoutPageContainer>
	</div>
</template>
