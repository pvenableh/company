// server/utils/weather.ts
//
// Coarse, keyless weather TEXTURE for the greeting — a light human touch, never
// a widget and never a mood. Location comes from Vercel's edge geo headers
// (city-level, no permission prompt, no API key, not stored, never in a URL);
// conditions come from Open-Meteo (free, keyless). Cached per-city hourly.
//
// Returns null whenever anything is missing (no edge geo in local dev, a slow
// upstream, a bad response) — the greeting then simply carries no weather. So
// this lights up in production and degrades to exactly today's behaviour
// everywhere else.

import type { H3Event } from 'h3';

export interface WeatherContext {
	/** Plain word: 'clear' | 'rainy' | 'cloudy' | … — texture, not a feeling. */
	condition: string;
	tempC: number | null;
	city: string;
}

const cache = new Map<string, { data: WeatherContext | null; expiresAt: number }>();
const TTL_MS = 60 * 60 * 1000; // one call per city per hour is plenty

// Open-Meteo WMO weather codes → plain words.
function describe(code: number): string {
	if (code === 0) return 'clear';
	if (code <= 3) return 'partly cloudy';
	if (code === 45 || code === 48) return 'foggy';
	if (code >= 51 && code <= 67) return 'rainy';
	if (code >= 71 && code <= 77) return 'snowy';
	if (code >= 80 && code <= 82) return 'rainy';
	if (code >= 85 && code <= 86) return 'snowy';
	if (code >= 95) return 'stormy';
	return 'cloudy';
}

export async function getWeatherContext(event: H3Event): Promise<WeatherContext | null> {
	try {
		const lat = getRequestHeader(event, 'x-vercel-ip-latitude');
		const lon = getRequestHeader(event, 'x-vercel-ip-longitude');
		if (!lat || !lon) return null; // no coarse geo here → no weather (local/dev)
		const city = (() => {
			try { return decodeURIComponent(getRequestHeader(event, 'x-vercel-ip-city') || ''); }
			catch { return ''; }
		})();

		const key = `${Number(lat).toFixed(1)},${Number(lon).toFixed(1)}`;
		const hit = cache.get(key);
		if (hit && hit.expiresAt > Date.now()) return hit.data;

		const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code`;
		const res: any = await $fetch(url, { timeout: 2500 }).catch(() => null);
		const cur = res?.current;
		const data: WeatherContext | null = (cur && typeof cur.weather_code === 'number')
			? { condition: describe(cur.weather_code), tempC: Number.isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null, city }
			: null;
		cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
		return data;
	} catch {
		return null;
	}
}
