<!--
	FeatureTogglesCard — per-org feature flags (Goals / Weather / Teams).

	Lives on the Organization → Settings floor so these are discoverable as
	feature flags, instead of being buried at the bottom of the Overview
	profile editor (which required entering edit mode to see). Each toggle
	writes immediately via the organizations collection, then refreshes the
	global org state so consumers (useGoalsEnabled / useWeatherEnabled /
	useTeamsEnabled) pick up the change without a reload.
-->
<script setup lang="ts">
const { currentOrg, selectedOrg, fetchOrganizationDetails } = useOrganization();
const organizationItems = useDirectusItems('organizations');

defineProps<{ canManage?: boolean }>();

type FeatureField = 'goals_enabled' | 'weather_enabled' | 'teams_enabled';

const saving = ref<FeatureField | null>(null);
const goalsEnabled = ref(true);
const weatherEnabled = ref(false);
const teamsEnabled = ref(true);

watch(
	currentOrg,
	(o: any) => {
		if (!o) return;
		// Match the opt-out / opt-in normalization used across the app.
		goalsEnabled.value = o.goals_enabled !== false;
		weatherEnabled.value = o.weather_enabled === true;
		teamsEnabled.value = o.teams_enabled !== false;
	},
	{ immediate: true },
);

async function persist(field: FeatureField, value: boolean) {
	if (!selectedOrg.value) return;
	saving.value = field;
	try {
		await organizationItems.update(selectedOrg.value, { [field]: value });
		await fetchOrganizationDetails();
	} catch {
		// Revert the optimistic toggle if the write fails.
		if (field === 'goals_enabled') goalsEnabled.value = !value;
		else if (field === 'weather_enabled') weatherEnabled.value = !value;
		else teamsEnabled.value = !value;
	} finally {
		saving.value = null;
	}
}
</script>

<template>
	<div class="ios-card p-5">
		<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
			Features
		</h3>
		<p class="text-xs text-muted-foreground mb-4">
			Turn org-wide features on or off. Changes apply to everyone in this organization.
		</p>

		<div class="space-y-4">
			<!-- Goals -->
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">Goals</p>
					<p class="text-xs text-muted-foreground">
						{{ goalsEnabled ? 'Goals enabled for everyone in this org' : 'Goals hidden across this org' }}
					</p>
				</div>
				<EToggle
					:model-value="goalsEnabled"
					:disabled="!canManage || saving === 'goals_enabled'"
					@update:model-value="(v: boolean) => { goalsEnabled = v; persist('goals_enabled', v); }"
				/>
			</div>

			<!-- Weather widget -->
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">Weather widget</p>
					<p class="text-xs text-muted-foreground">
						{{ weatherEnabled ? 'Local weather shows in the app header' : 'Weather widget hidden' }}
					</p>
				</div>
				<EToggle
					:model-value="weatherEnabled"
					:disabled="!canManage || saving === 'weather_enabled'"
					@update:model-value="(v: boolean) => { weatherEnabled = v; persist('weather_enabled', v); }"
				/>
			</div>

			<!-- Teams -->
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-sm font-medium">Teams</p>
					<p class="text-xs text-muted-foreground">
						{{ teamsEnabled ? 'Teams shown across this org (selectors, forms, Teams floor)' : 'Teams hidden — good for solo / small orgs' }}
					</p>
				</div>
				<EToggle
					:model-value="teamsEnabled"
					:disabled="!canManage || saving === 'teams_enabled'"
					@update:model-value="(v: boolean) => { teamsEnabled = v; persist('teams_enabled', v); }"
				/>
			</div>
		</div>
	</div>
</template>
