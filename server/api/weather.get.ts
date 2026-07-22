// server/api/weather.get.ts
//
// Client-callable current-conditions for the header weather widget.
//   GET /api/weather                → uses Vercel edge geo (prod only)
//   GET /api/weather?lat=..&lon=..  → uses the supplied coordinates
//
// Returns { condition, tempC, city, code } or null (widget hides on null).
// Coarse and cached per ~0.1° hourly (see weatherFromLatLon). No key, no storage.
export default defineEventHandler(async (event) => {
	// Widget is behind app auth; require a session so this isn't an open proxy.
	await requireUserSession(event);

	const { lat, lon, city } = getQuery(event) as { lat?: string; lon?: string; city?: string };

	if (lat && lon) {
		return await weatherFromLatLon(lat, lon, city ? String(city) : '');
	}

	// No client coordinates → fall back to edge geo (production).
	return await getWeatherContext(event);
});
