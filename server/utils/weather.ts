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
	/** Same reading in Fahrenheit — what the UI + greeting actually display. */
	tempF: number | null;
	city: string;
	/** Raw Open-Meteo WMO code — lets a UI pick a precise icon. */
	code?: number | null;
}

const cache = new Map<string, { data: WeatherContext | null; expiresAt: number }>();
const TTL_MS = 60 * 60 * 1000; // one call per city per hour is plenty

// Open-Meteo WMO weather codes → plain words. Exported so the greeting texture
// and the header weather widget share one mapping.
export function describeWeatherCode(code: number): string {
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

// Fetch current conditions for a coordinate (cached per ~0.1° per hour). Shared
// by the edge-geo greeting texture and the client-callable /api/weather endpoint.
export async function weatherFromLatLon(lat: number | string, lon: number | string, city = ''): Promise<WeatherContext | null> {
	const nLat = Number(lat);
	const nLon = Number(lon);
	if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return null;

	const key = `${nLat.toFixed(1)},${nLon.toFixed(1)}`;
	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return hit.data;

	const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(nLat)}&longitude=${encodeURIComponent(nLon)}&current=temperature_2m,weather_code`;
	const res: any = await $fetch(url, { timeout: 2500 }).catch(() => null);
	const cur = res?.current;
	const tempC = cur && Number.isFinite(cur.temperature_2m) ? cur.temperature_2m : null;
	const data: WeatherContext | null = (cur && typeof cur.weather_code === 'number')
		? {
			condition: describeWeatherCode(cur.weather_code),
			tempC: tempC != null ? Math.round(tempC) : null,
			tempF: tempC != null ? Math.round(tempC * 9 / 5 + 32) : null,
			city,
			code: cur.weather_code,
		}
		: null;
	cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
	return data;
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
		return await weatherFromLatLon(lat, lon, city);
	} catch {
		return null;
	}
}
