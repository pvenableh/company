// server/utils/freebusy.ts
//
// External-calendar free/busy READ-BACK. The half of calendar sync that was
// missing: the app pushed bookings out to Google/Outlook but never read the
// host's real calendars back, so it could double-book against events created
// directly there.
//
// Multi-calendar (Phase 3): a host can connect several Google/Outlook accounts,
// each a row in `calendar_connections`. getBusyForHosts() merges busy across
// every connection with blocks_availability=true. For hosts not yet migrated to
// calendar_connections, it falls back to the legacy inline google_/outlook_
// fields on scheduler_settings.
//
// Guarantees:
//   - FAIL-OPEN. A disconnected/erroring provider degrades that calendar's busy
//     to [] (internal Directus data stays authoritative). Never throws.
//   - CACHED per host (merged) in calendar_freebusy_cache, short TTL. Cache
//     access is best-effort — missing collection just means a live fetch.
//   - Refreshed access tokens are persisted back to their source row.

import { createDirectus, rest, staticToken, readItems, updateItem, createItem, deleteItems } from '@directus/sdk';

export interface BusyInterval {
	start: Date;
	end: Date;
}

const CACHE_TTL_MS = 3 * 60 * 1000;

/** Normalized calendar we can fetch busy for, regardless of source table. */
interface ConnectionLike {
	provider: 'google' | 'outlook';
	refresh_token: string;
	access_token?: string | null;
	token_expiry?: string | null;
	calendar_id?: string | null;
	account_email?: string | null;
	/** Where to persist a refreshed access token. */
	persist: { collection: 'calendar_connections' | 'scheduler_settings'; id: string | number; provider: 'google' | 'outlook' };
}

function adminClient() {
	const config = useRuntimeConfig();
	return createDirectus(config.public.directusUrl).with(rest()).with(staticToken(config.directusServerToken as string));
}

export async function getBusyForHosts(
	hostIds: string[],
	rangeStart: Date,
	rangeEnd: Date,
): Promise<Record<string, BusyInterval[]>> {
	const out: Record<string, BusyInterval[]> = {};
	for (const id of hostIds) out[id] = [];
	if (hostIds.length === 0) return out;

	const config = useRuntimeConfig();
	const client = adminClient();

	const connectionsByHost = await loadConnections(client, hostIds);

	await Promise.all(
		hostIds.map(async (hostId) => {
			const conns = connectionsByHost[hostId] || [];
			if (conns.length === 0) return;

			// Merged cache per host.
			const cached = await readCache(client, hostId, rangeStart, rangeEnd);
			if (cached) {
				out[hostId] = cached;
				return;
			}

			const intervals: BusyInterval[] = [];
			for (const conn of conns) {
				try {
					intervals.push(
						...(conn.provider === 'google'
							? await fetchGoogleBusy(client, config, conn, rangeStart, rangeEnd)
							: await fetchOutlookBusy(client, config, conn, rangeStart, rangeEnd)),
					);
				} catch (e: any) {
					console.warn(`[freebusy] ${conn.provider} fetch failed for host ${hostId} (fail-open):`, e?.message);
				}
			}
			out[hostId] = intervals;
			await writeCache(client, hostId, rangeStart, rangeEnd, intervals);
		}),
	);

	return out;
}

// ── Connection loading (calendar_connections → fallback to scheduler_settings) ──

async function loadConnections(client: any, hostIds: string[]): Promise<Record<string, ConnectionLike[]>> {
	const byHost: Record<string, ConnectionLike[]> = {};
	for (const id of hostIds) byHost[id] = [];

	// 1. Multi-calendar rows.
	const hostsWithConnections = new Set<string>();
	try {
		const rows = (await client.request(
			(readItems as any)('calendar_connections', {
				fields: ['id', 'user', 'provider', 'refresh_token', 'access_token', 'token_expiry', 'calendar_id', 'account_email', 'blocks_availability', 'enabled'],
				filter: { user: { _in: hostIds }, blocks_availability: { _eq: true }, enabled: { _eq: true } },
				limit: -1,
			}),
		)) as any[];
		for (const r of rows) {
			const hostId = typeof r.user === 'object' ? r.user?.id : r.user;
			if (!hostId || !r.refresh_token) continue;
			hostsWithConnections.add(hostId);
			(byHost[hostId] ||= []).push({
				provider: r.provider,
				refresh_token: r.refresh_token,
				access_token: r.access_token,
				token_expiry: r.token_expiry,
				calendar_id: r.calendar_id,
				account_email: r.account_email,
				persist: { collection: 'calendar_connections', id: r.id, provider: r.provider },
			});
		}
	} catch {
		// Collection may not exist yet — fall through to legacy inline fields.
	}

	// 2. Legacy fallback for hosts with no calendar_connections rows.
	const legacyHosts = hostIds.filter((id) => !hostsWithConnections.has(id));
	if (legacyHosts.length > 0) {
		try {
			const settings = (await client.request(
				(readItems as any)('scheduler_settings', {
					fields: ['id', 'user_id', 'user_id.email', 'google_calendar_enabled', 'google_refresh_token', 'google_calendar_id', 'google_access_token', 'google_token_expiry', 'outlook_calendar_enabled', 'outlook_refresh_token', 'outlook_access_token', 'outlook_token_expiry'],
					filter: { user_id: { _in: legacyHosts } },
				}),
			)) as any[];
			for (const s of settings) {
				const hostId = typeof s.user_id === 'object' ? s.user_id?.id : s.user_id;
				if (!hostId) continue;
				const email = typeof s.user_id === 'object' ? s.user_id?.email : null;
				if (s.google_calendar_enabled && s.google_refresh_token) {
					(byHost[hostId] ||= []).push({
						provider: 'google',
						refresh_token: s.google_refresh_token,
						access_token: s.google_access_token,
						token_expiry: s.google_token_expiry,
						calendar_id: s.google_calendar_id,
						account_email: email,
						persist: { collection: 'scheduler_settings', id: s.id, provider: 'google' },
					});
				}
				if (s.outlook_calendar_enabled && s.outlook_refresh_token) {
					(byHost[hostId] ||= []).push({
						provider: 'outlook',
						refresh_token: s.outlook_refresh_token,
						access_token: s.outlook_access_token,
						token_expiry: s.outlook_token_expiry,
						calendar_id: 'primary',
						account_email: email,
						persist: { collection: 'scheduler_settings', id: s.id, provider: 'outlook' },
					});
				}
			}
		} catch (e: any) {
			console.warn('[freebusy] legacy settings load failed (fail-open):', e?.message);
		}
	}

	return byHost;
}

async function persistAccessToken(client: any, conn: ConnectionLike, accessToken: string, expiryIso: string) {
	try {
		if (conn.persist.collection === 'calendar_connections') {
			await client.request((updateItem as any)('calendar_connections', conn.persist.id, { access_token: accessToken, token_expiry: expiryIso }));
		} else {
			await client.request((updateItem as any)('scheduler_settings', conn.persist.id, {
				[`${conn.persist.provider}_access_token`]: accessToken,
				[`${conn.persist.provider}_token_expiry`]: expiryIso,
			}));
		}
	} catch {
		/* non-fatal */
	}
}

// ── Merged per-host cache ────────────────────────────────────────────────────────

async function readCache(client: any, hostId: string, rangeStart: Date, rangeEnd: Date): Promise<BusyInterval[] | null> {
	try {
		const rows = (await client.request(
			(readItems as any)('calendar_freebusy_cache', {
				fields: ['busy', 'fetched_at'],
				filter: {
					host_user: { _eq: hostId },
					provider: { _eq: '__merged__' },
					window_start: { _lte: rangeStart.toISOString() },
					window_end: { _gte: rangeEnd.toISOString() },
				},
				sort: ['-fetched_at'],
				limit: 1,
			}),
		)) as any[];
		const row = rows[0];
		if (!row || !row.fetched_at) return null;
		if (Date.now() - new Date(row.fetched_at).getTime() > CACHE_TTL_MS) return null;
		return (Array.isArray(row.busy) ? row.busy : []).map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) }));
	} catch {
		return null;
	}
}

async function writeCache(client: any, hostId: string, rangeStart: Date, rangeEnd: Date, busy: BusyInterval[]): Promise<void> {
	try {
		await client.request((deleteItems as any)('calendar_freebusy_cache', {
			filter: { host_user: { _eq: hostId }, provider: { _eq: '__merged__' } },
		})).catch(() => {});
		await client.request((createItem as any)('calendar_freebusy_cache', {
			host_user: hostId,
			provider: '__merged__',
			window_start: rangeStart.toISOString(),
			window_end: rangeEnd.toISOString(),
			busy: busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
			fetched_at: new Date().toISOString(),
			stale: false,
		}));
	} catch {
		/* collection missing / no perms — skip */
	}
}

// ── Google (freebusy.query) ──────────────────────────────────────────────────────

async function fetchGoogleBusy(client: any, config: any, conn: ConnectionLike, rangeStart: Date, rangeEnd: Date): Promise<BusyInterval[]> {
	const { google } = await import('googleapis');
	const oauth2Client = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, `${config.public.siteUrl}/api/calendar/google/callback`);

	const creds: any = { refresh_token: conn.refresh_token };
	if (conn.access_token && conn.token_expiry && new Date(conn.token_expiry).getTime() > Date.now() + 60000) {
		creds.access_token = conn.access_token;
		creds.expiry_date = new Date(conn.token_expiry).getTime();
	}
	oauth2Client.setCredentials(creds);
	oauth2Client.on('tokens', (tokens) => {
		if (!tokens.access_token) return;
		void persistAccessToken(client, conn, tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : computeTokenExpiry(undefined, 1 / 24));
	});

	const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
	const calId = conn.calendar_id || 'primary';
	const { data } = await calendar.freebusy.query({
		requestBody: { timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString(), items: [{ id: calId }] },
	});
	return (data.calendars?.[calId]?.busy || [])
		.filter((b) => b.start && b.end)
		.map((b) => ({ start: new Date(b.start as string), end: new Date(b.end as string) }));
}

// ── Outlook / Microsoft Graph (getSchedule) ──────────────────────────────────────

async function fetchOutlookBusy(client: any, config: any, conn: ConnectionLike, rangeStart: Date, rangeEnd: Date): Promise<BusyInterval[]> {
	if (!conn.account_email) return [];

	const tokenResponse = (await $fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.azureClientId,
			client_secret: config.azureClientSecret,
			refresh_token: conn.refresh_token,
			grant_type: 'refresh_token',
			scope: 'openid profile offline_access Calendars.Read',
		}).toString(),
	})) as any;

	const accessToken = tokenResponse.access_token;
	if (!accessToken) return [];
	void persistAccessToken(client, conn, accessToken, computeTokenExpiry(tokenResponse.expires_in));

	const res = (await $fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: {
			schedules: [conn.account_email],
			startTime: { dateTime: rangeStart.toISOString(), timeZone: 'UTC' },
			endTime: { dateTime: rangeEnd.toISOString(), timeZone: 'UTC' },
			availabilityViewInterval: 15,
		},
	})) as any;

	const items = res?.value?.[0]?.scheduleItems || [];
	return items
		.filter((it: any) => it.status && it.status !== 'free' && it.start?.dateTime && it.end?.dateTime)
		.map((it: any) => ({
			start: new Date(it.start.dateTime.endsWith('Z') ? it.start.dateTime : it.start.dateTime + 'Z'),
			end: new Date(it.end.dateTime.endsWith('Z') ? it.end.dateTime : it.end.dateTime + 'Z'),
		}));
}
