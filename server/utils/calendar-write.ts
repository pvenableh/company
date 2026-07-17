// server/utils/calendar-write.ts
//
// External-calendar WRITE-OUT. The mirror of freebusy.ts: where freebusy READS
// busy back from every connected calendar, this PUSHES a new booking out to
// every calendar the host flagged as a write target.
//
// Multi-calendar (Phase 3e): a host can connect several Google/Outlook accounts
// (rows in `calendar_connections`). pushBookingToCalendars() creates the event on
// EVERY connection with is_write_target=true (was: primary calendar only, via the
// legacy scheduler_settings.google_/outlook_ fields + create-event endpoints).
//
// For hosts not yet migrated to calendar_connections it falls back to the legacy
// inline google_/outlook_ fields on scheduler_settings, so behaviour is unchanged
// for un-migrated hosts.
//
// Guarantees:
//   - FAIL-OPEN, per connection. A disconnected/erroring target is logged and
//     skipped; the booking itself already exists in Directus. Never throws.
//   - Refreshed access tokens are persisted back to their source row (same
//     contract as freebusy.ts).
//   - Returns the created external event ids so the caller can record them.

import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

export interface BookingWritePayload {
	hostUserId: string;
	title: string;
	description?: string | null;
	startTime: string; // ISO
	endTime: string;   // ISO
	timezone?: string | null;
	attendeeEmail?: string | null;
}

export interface WriteResult {
	connectionId: string | number;
	provider: 'google' | 'outlook';
	eventId: string;
	source: 'calendar_connections' | 'scheduler_settings';
}

/** Normalized write target, regardless of source table. Mirrors freebusy's ConnectionLike. */
interface WriteTarget {
	provider: 'google' | 'outlook';
	refresh_token: string;
	access_token?: string | null;
	token_expiry?: string | null;
	calendar_id?: string | null;
	persist: { collection: 'calendar_connections' | 'scheduler_settings'; id: string | number; provider: 'google' | 'outlook' };
}

function adminClient() {
	const config = useRuntimeConfig();
	return createDirectus(config.public.directusUrl).with(rest()).with(staticToken(config.directusServerToken as string));
}

/**
 * Push a booking event to every write-target calendar for a host. Best-effort:
 * returns whatever succeeded; individual failures are logged, not thrown.
 */
export async function pushBookingToCalendars(payload: BookingWritePayload): Promise<WriteResult[]> {
	const config = useRuntimeConfig();
	const client = adminClient();
	const targets = await loadWriteTargets(client, payload.hostUserId);
	if (targets.length === 0) return [];

	const results: WriteResult[] = [];
	await Promise.all(
		targets.map(async (t) => {
			try {
				const eventId = t.provider === 'google'
					? await createGoogleEvent(client, config, t, payload)
					: await createOutlookEvent(client, config, t, payload);
				if (eventId) {
					results.push({ connectionId: t.persist.id, provider: t.provider, eventId, source: t.persist.collection });
				}
			} catch (e: any) {
				console.warn(`[calendar-write] ${t.provider} push failed for host ${payload.hostUserId} (fail-open):`, e?.message);
			}
		}),
	);
	return results;
}

// ── Target loading (calendar_connections → fallback to scheduler_settings) ──

async function loadWriteTargets(client: any, hostUserId: string): Promise<WriteTarget[]> {
	const targets: WriteTarget[] = [];
	let hasConnections = false;

	// 1. Multi-calendar rows flagged as write targets.
	try {
		const rows = (await client.request(
			(readItems as any)('calendar_connections', {
				fields: ['id', 'user', 'provider', 'refresh_token', 'access_token', 'token_expiry', 'calendar_id', 'is_write_target', 'enabled'],
				filter: { user: { _eq: hostUserId }, is_write_target: { _eq: true }, enabled: { _eq: true } },
				limit: -1,
			}),
		)) as any[];
		for (const r of rows) {
			if (!r.refresh_token) continue;
			hasConnections = true;
			targets.push({
				provider: r.provider,
				refresh_token: r.refresh_token,
				access_token: r.access_token,
				token_expiry: r.token_expiry,
				calendar_id: r.calendar_id,
				persist: { collection: 'calendar_connections', id: r.id, provider: r.provider },
			});
		}
	} catch {
		// Collection may not exist yet — fall through to legacy inline fields.
	}

	if (hasConnections) return targets;

	// 2. Legacy fallback for hosts with no calendar_connections rows.
	try {
		const settings = (await client.request(
			(readItems as any)('scheduler_settings', {
				fields: ['id', 'user_id', 'google_calendar_enabled', 'google_refresh_token', 'google_calendar_id', 'google_access_token', 'google_token_expiry', 'outlook_calendar_enabled', 'outlook_refresh_token', 'outlook_access_token', 'outlook_token_expiry'],
				filter: { user_id: { _eq: hostUserId } },
				limit: 1,
			}),
		)) as any[];
		const s = settings[0];
		if (s) {
			if (s.google_calendar_enabled && s.google_refresh_token) {
				targets.push({
					provider: 'google',
					refresh_token: s.google_refresh_token,
					access_token: s.google_access_token,
					token_expiry: s.google_token_expiry,
					calendar_id: s.google_calendar_id || 'primary',
					persist: { collection: 'scheduler_settings', id: s.id, provider: 'google' },
				});
			}
			if (s.outlook_calendar_enabled && s.outlook_refresh_token) {
				targets.push({
					provider: 'outlook',
					refresh_token: s.outlook_refresh_token,
					access_token: s.outlook_access_token,
					token_expiry: s.outlook_token_expiry,
					calendar_id: 'primary',
					persist: { collection: 'scheduler_settings', id: s.id, provider: 'outlook' },
				});
			}
		}
	} catch (e: any) {
		console.warn('[calendar-write] legacy settings load failed (fail-open):', e?.message);
	}

	return targets;
}

async function persistAccessToken(client: any, t: WriteTarget, accessToken: string, expiryIso: string) {
	try {
		if (t.persist.collection === 'calendar_connections') {
			await client.request((updateItem as any)('calendar_connections', t.persist.id, { access_token: accessToken, token_expiry: expiryIso }));
		} else {
			await client.request((updateItem as any)('scheduler_settings', t.persist.id, {
				[`${t.persist.provider}_access_token`]: accessToken,
				[`${t.persist.provider}_token_expiry`]: expiryIso,
			}));
		}
	} catch {
		/* non-fatal */
	}
}

// ── Google (events.insert) ───────────────────────────────────────────────────

async function createGoogleEvent(client: any, config: any, t: WriteTarget, payload: BookingWritePayload): Promise<string | null> {
	const { google } = await import('googleapis');
	const oauth2Client = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, `${config.public.siteUrl}/api/calendar/google/callback`);

	const creds: any = { refresh_token: t.refresh_token };
	if (t.access_token && t.token_expiry && new Date(t.token_expiry).getTime() > Date.now() + 60000) {
		creds.access_token = t.access_token;
		creds.expiry_date = new Date(t.token_expiry).getTime();
	}
	oauth2Client.setCredentials(creds);
	oauth2Client.on('tokens', (tokens) => {
		if (!tokens.access_token) return;
		void persistAccessToken(client, t, tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : computeTokenExpiry(undefined, 1 / 24));
	});

	const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
	const tz = payload.timezone || 'America/New_York';
	const requestBody: any = {
		summary: payload.title,
		description: payload.description || undefined,
		start: { dateTime: new Date(payload.startTime).toISOString(), timeZone: tz },
		end: { dateTime: new Date(payload.endTime).toISOString(), timeZone: tz },
		reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 15 }] },
	};
	if (payload.attendeeEmail) {
		requestBody.attendees = [{ email: payload.attendeeEmail }];
	}

	const { data } = await calendar.events.insert({
		calendarId: t.calendar_id || 'primary',
		requestBody,
		sendUpdates: payload.attendeeEmail ? 'all' : 'none',
	});
	return data.id || null;
}

// ── Outlook / Microsoft Graph (POST events) ──────────────────────────────────

async function createOutlookEvent(client: any, config: any, t: WriteTarget, payload: BookingWritePayload): Promise<string | null> {
	const tokenResponse = (await $fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.azureClientId,
			client_secret: config.azureClientSecret,
			refresh_token: t.refresh_token,
			grant_type: 'refresh_token',
			scope: 'openid profile offline_access Calendars.ReadWrite',
		}).toString(),
	})) as any;

	const accessToken = tokenResponse.access_token;
	if (!accessToken) return null;
	void persistAccessToken(client, t, accessToken, computeTokenExpiry(tokenResponse.expires_in));

	const tz = payload.timezone || 'America/New_York';
	const eventData: any = {
		subject: payload.title,
		body: { contentType: 'text', content: payload.description || '' },
		start: { dateTime: new Date(payload.startTime).toISOString(), timeZone: tz },
		end: { dateTime: new Date(payload.endTime).toISOString(), timeZone: tz },
		isReminderOn: true,
		reminderMinutesBeforeStart: 15,
	};
	if (payload.attendeeEmail) {
		eventData.attendees = [{ emailAddress: { address: payload.attendeeEmail }, type: 'required' }];
	}

	// Named calendar → /me/calendars/{id}/events; primary → /me/calendar/events.
	const calId = t.calendar_id && t.calendar_id !== 'primary' ? t.calendar_id : null;
	const url = calId
		? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calId)}/events`
		: 'https://graph.microsoft.com/v1.0/me/calendar/events';

	const response = (await $fetch(url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: eventData,
	})) as any;
	return response?.id || null;
}
