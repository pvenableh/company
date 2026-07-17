// server/utils/calendar-overlay.ts
//
// External-calendar OVERLAY read. Distinct from freebusy.ts, which reads only
// opaque busy INTERVALS (start/end) to block booking slots. This reads real
// EVENTS — title, time, source calendar — from every connection the host flagged
// `show_on_calendar`, so they can be overlaid as coloured chips on the in-app Hub
// calendar.
//
// Scope: reads calendar_connections ONLY (show_on_calendar is a new opt-in that
// legacy inline scheduler_settings calendars never set). Google via
// calendar.events.list, Outlook via /me/calendarView.
//
// Guarantees:
//   - FAIL-OPEN per connection. A disconnected/erroring calendar degrades to no
//     events; never throws.
//   - Refreshed access tokens are persisted back to the connection row (same
//     contract as freebusy.ts).

import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

export interface OverlayEvent {
	id: string;
	title: string;
	start: string;      // ISO
	end: string;        // ISO
	allDay: boolean;
	color: string | null;
	calendarName: string | null;
	provider: 'google' | 'outlook';
	connectionId: string | number;
	link: string | null;
}

interface OverlayConnection {
	id: string | number;
	provider: 'google' | 'outlook';
	refresh_token: string;
	access_token?: string | null;
	token_expiry?: string | null;
	calendar_id?: string | null;
	color?: string | null;
	display_name?: string | null;
	account_email?: string | null;
}

// No index-signature type: `.google`/`.outlook` stay non-optional string under
// noUncheckedIndexedAccess, so OverlayEvent.color is never `undefined`.
const PROVIDER_DEFAULT_COLOR = { google: '#4285F4', outlook: '#0F6CBD' };

function adminClient() {
	const config = useRuntimeConfig();
	return createDirectus(config.public.directusUrl).with(rest()).with(staticToken(config.directusServerToken as string));
}

/** Read overlay events for a single host across all show_on_calendar connections. */
export async function getOverlayEventsForUser(
	userId: string,
	rangeStart: Date,
	rangeEnd: Date,
): Promise<OverlayEvent[]> {
	const config = useRuntimeConfig();
	const client = adminClient();

	let conns: OverlayConnection[] = [];
	try {
		conns = (await client.request(
			(readItems as any)('calendar_connections', {
				fields: ['id', 'provider', 'refresh_token', 'access_token', 'token_expiry', 'calendar_id', 'color', 'display_name', 'account_email'],
				filter: { user: { _eq: userId }, show_on_calendar: { _eq: true }, enabled: { _eq: true } },
				limit: -1,
			}),
		)) as OverlayConnection[];
	} catch {
		return []; // collection missing → nothing to overlay
	}
	conns = conns.filter((c) => c.refresh_token);
	if (conns.length === 0) return [];

	const all: OverlayEvent[] = [];
	await Promise.all(
		conns.map(async (conn) => {
			try {
				const events = conn.provider === 'google'
					? await fetchGoogleEvents(client, config, conn, rangeStart, rangeEnd)
					: await fetchOutlookEvents(client, config, conn, rangeStart, rangeEnd);
				all.push(...events);
			} catch (e: any) {
				console.warn(`[calendar-overlay] ${conn.provider} events fetch failed for host ${userId} (fail-open):`, e?.message);
			}
		}),
	);
	return all;
}

async function persistAccessToken(client: any, connId: string | number, accessToken: string, expiryIso: string) {
	try {
		await client.request((updateItem as any)('calendar_connections', connId, { access_token: accessToken, token_expiry: expiryIso }));
	} catch {
		/* non-fatal */
	}
}

// ── Google (events.list) ──────────────────────────────────────────────────────

async function fetchGoogleEvents(client: any, config: any, conn: OverlayConnection, rangeStart: Date, rangeEnd: Date): Promise<OverlayEvent[]> {
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
		void persistAccessToken(client, conn.id, tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : computeTokenExpiry(undefined, 1 / 24));
	});

	const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
	const calId = conn.calendar_id || 'primary';
	const { data } = await calendar.events.list({
		calendarId: calId,
		timeMin: rangeStart.toISOString(),
		timeMax: rangeEnd.toISOString(),
		singleEvents: true,
		orderBy: 'startTime',
		maxResults: 250,
	});

	const color = conn.color || PROVIDER_DEFAULT_COLOR.google;
	const name = conn.display_name || conn.account_email || 'Google Calendar';
	return (data.items || [])
		.filter((it) => it.status !== 'cancelled' && (it.start?.dateTime || it.start?.date))
		.map((it) => {
			const allDay = !it.start?.dateTime;
			const start = it.start?.dateTime || `${it.start?.date}T00:00:00`;
			const end = it.end?.dateTime || `${it.end?.date || it.start?.date}T00:00:00`;
			return {
				id: `gcal-${conn.id}-${it.id}`,
				title: it.summary || '(No title)',
				start: new Date(start).toISOString(),
				end: new Date(end).toISOString(),
				allDay,
				color,
				calendarName: name,
				provider: 'google' as const,
				connectionId: conn.id,
				link: it.htmlLink || null,
			};
		});
}

// ── Outlook / Microsoft Graph (calendarView) ─────────────────────────────────

async function fetchOutlookEvents(client: any, config: any, conn: OverlayConnection, rangeStart: Date, rangeEnd: Date): Promise<OverlayEvent[]> {
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
	void persistAccessToken(client, conn.id, accessToken, computeTokenExpiry(tokenResponse.expires_in));

	const calId = conn.calendar_id && conn.calendar_id !== 'primary' ? conn.calendar_id : null;
	const base = calId
		? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calId)}/calendarView`
		: 'https://graph.microsoft.com/v1.0/me/calendarView';
	const url = `${base}?startDateTime=${encodeURIComponent(rangeStart.toISOString())}&endDateTime=${encodeURIComponent(rangeEnd.toISOString())}&$top=250&$select=id,subject,start,end,isAllDay,webLink,isCancelled&$orderby=start/dateTime`;

	const res = (await $fetch(url, {
		method: 'GET',
		headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
	})) as any;

	const color = conn.color || PROVIDER_DEFAULT_COLOR.outlook;
	const name = conn.display_name || conn.account_email || 'Outlook Calendar';
	return (res?.value || [])
		.filter((it: any) => !it.isCancelled && it.start?.dateTime && it.end?.dateTime)
		.map((it: any) => {
			const s = it.start.dateTime.endsWith('Z') ? it.start.dateTime : it.start.dateTime + 'Z';
			const e = it.end.dateTime.endsWith('Z') ? it.end.dateTime : it.end.dateTime + 'Z';
			return {
				id: `ocal-${conn.id}-${it.id}`,
				title: it.subject || '(No title)',
				start: new Date(s).toISOString(),
				end: new Date(e).toISOString(),
				allDay: !!it.isAllDay,
				color,
				calendarName: name,
				provider: 'outlook' as const,
				connectionId: conn.id,
				link: it.webLink || null,
			};
		});
}
