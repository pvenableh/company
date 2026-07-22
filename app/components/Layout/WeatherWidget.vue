<!--
  Small local-weather widget for the app header, next to the org avatar.

  Opt-in per org via `organizations.weather_enabled` (Organization → Overview).
  Data comes from /api/weather, which uses Vercel edge geo (no permission prompt,
  city-level) — so it lights up in production and simply renders nothing in local
  dev / anywhere edge geo is absent. Icons are the Weather Icons (`wi`) pack.
-->
<script setup lang="ts">
const { weatherEnabled } = useWeatherEnabled();

const weather = ref<null | { condition: string; tempC: number | null; tempF: number | null; city: string; code?: number | null }>(null);
const loaded = ref(false);

// Plain condition word (from server describeWeatherCode) → wi icon name.
const ICONS: Record<string, string> = {
	clear: 'wi:day-sunny',
	'partly cloudy': 'wi:day-cloudy',
	cloudy: 'wi:cloudy',
	foggy: 'wi:fog',
	rainy: 'wi:rain',
	snowy: 'wi:snow',
	stormy: 'wi:thunderstorm',
};
const icon = computed(() => ICONS[weather.value?.condition || ''] || 'wi:day-cloudy');
const tempF = computed(() => weather.value?.tempF ?? null);
const label = computed(() => {
	if (!weather.value) return '';
	const parts = [weather.value.condition];
	if (weather.value.city) parts.push(weather.value.city);
	return parts.join(' · ');
});

async function load() {
	if (!weatherEnabled.value || loaded.value) return;
	loaded.value = true;
	try {
		// Prod uses edge geo (no params). Dev has no edge geo, so pass a sample
		// coordinate purely so the widget is visible while developing.
		weather.value = await $fetch('/api/weather', {
			query: import.meta.dev ? { lat: 40.7128, lon: -74.006, city: 'New York' } : undefined,
		});
	} catch {
		weather.value = null;
	}
}

onMounted(load);
// Enabling the toggle mid-session should light the widget without a reload.
watch(weatherEnabled, (on) => { if (on) load(); });
</script>

<template>
	<span
		v-if="weatherEnabled && weather"
		class="wx"
		:title="label"
		:aria-label="label"
	>
		<Icon :name="icon" class="wx__icon" />
		<span v-if="tempF != null" class="wx__temp">{{ tempF }}°F</span>
	</span>
</template>

<style scoped>
.wx {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 28px;
	padding: 0 8px;
	border-radius: 999px;
	font-size: 12px;
	color: hsl(var(--muted-foreground));
	white-space: nowrap;
}
.wx__icon { width: 18px; height: 18px; }
.wx__temp { font-variant-numeric: tabular-nums; font-weight: 500; }
</style>
