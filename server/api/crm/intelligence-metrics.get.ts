/**
 * CRM Intelligence Metrics — Stage 6 dashboard data.
 *
 * Returns six algorithmic metric groups for the /apps/clients?view=intelligence
 * dashboard. All purely computed from Directus — no AI tokens used.
 *
 * - pipelineVelocity:  avg days to win + per-stage avg days in stage
 * - conversionBySource: per-source total / converted / rate / value
 * - partnerROI:         contact_connections aggregated against resulting clients + revenue
 * - coldContacts:       prospects/clients with no recent touch (last_contacted_at + date_updated fallback)
 * - bookings:           appointment no-show rate + top event types (last 90d)
 * - leadSourceTrend:    new vs converted leads per source for the dashboard summary
 *
 * Query: organizationId (required)
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const query = getQuery(event);
	const orgId = query.organizationId as string;
	if (!orgId) throw createError({ statusCode: 400, message: 'organizationId is required' });

	const directus = await getUserDirectus(event);
	setResponseHeader(event, 'Cache-Control', 'private, max-age=30');

	const now = new Date();
	const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000).toISOString();
	const sixMonthsAgo = new Date(now.getTime() - 180 * 86_400_000).toISOString();
	const oneYearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString();
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

	try {
		const [
			allLeads,
			connections,
			appointments,
			coldCandidates,
			recentInvoices,
		] = await Promise.all([
			// Leads in last year — both open + converted + lost
			directus.request(readItems('leads', {
				filter: {
					organization: { _eq: orgId },
					date_created: { _gte: oneYearAgo },
				},
				fields: [
					'id', 'stage', 'source', 'estimated_value', 'actual_value',
					'converted_to_customer', 'date_created', 'date_updated', 'closed_date',
					'resulting_client',
				],
				limit: -1,
			})).catch(() => [] as any[]),

			// Partner / referral connections
			directus.request(readItems('contact_connections', {
				filter: {
					client: { organization: { _eq: orgId } },
					role: { _in: ['referral_partner', 'consultant', 'vendor', 'investor', 'board', 'other'] },
				},
				fields: [
					'id', 'role', 'introduced_by',
					'contact.id', 'contact.first_name', 'contact.last_name', 'contact.company',
					'client.id', 'client.name', 'client.account_state',
				],
				limit: -1,
			})).catch(() => [] as any[]),

			// Appointments in last 90 days
			directus.request(readItems('appointments', {
				filter: {
					_or: [
						{ event_type: { organization: { _eq: orgId } } },
						{ video_meeting: { related_organization: { _eq: orgId } } },
					],
					start_time: { _gte: ninetyDaysAgo },
				},
				fields: [
					'id', 'status', 'start_time', 'end_time',
					'event_type.id', 'event_type.title', 'event_type.color',
				],
				limit: -1,
			})).catch(() => [] as any[]),

			// Cold-contact candidates: prospects + clients with stale touch
			directus.request(readItems('contacts', {
				filter: {
					organizations: { organizations_id: { _eq: orgId } },
					category: { _in: ['client', 'prospect', 'partner', 'developer', 'architect', 'hospitality'] },
				},
				fields: [
					'id', 'first_name', 'last_name', 'company', 'category', 'email',
					'date_created', 'date_updated', 'last_contacted_at', 'last_opened_at',
				],
				limit: 500,
			})).catch(() => [] as any[]),

			// Recent paid invoices for partner-ROI revenue attribution
			directus.request(readItems('invoices', {
				filter: {
					organization: { _eq: orgId },
					status: { _eq: 'paid' },
					invoice_date: { _gte: sixMonthsAgo.slice(0, 10) },
				},
				fields: ['id', 'total_amount', 'client.id', 'invoice_date'],
				limit: 500,
			})).catch(() => [] as any[]),
		]);

		// ─── Pipeline Velocity ───
		// For converted leads: avg days from date_created → closed_date (or date_updated).
		// Per-stage: harder without an event log, so we approximate "current open avg age".
		const wonLeads = (allLeads as any[]).filter((l) => l.stage === 'won' || l.converted_to_customer);
		const winDays: number[] = [];
		for (const lead of wonLeads) {
			const created = lead.date_created ? new Date(lead.date_created).getTime() : null;
			const closed = (lead.closed_date || lead.date_updated)
				? new Date(lead.closed_date || lead.date_updated).getTime()
				: null;
			if (created && closed && closed >= created) {
				const days = Math.floor((closed - created) / 86_400_000);
				if (days >= 0 && days < 730) winDays.push(days);
			}
		}
		const avgDaysToWin = winDays.length
			? Math.round(winDays.reduce((a, b) => a + b, 0) / winDays.length)
			: null;
		const medianDaysToWin = winDays.length
			? winDays.slice().sort((a, b) => a - b)[Math.floor(winDays.length / 2)]
			: null;

		const stageAvgAge: Record<string, { count: number; avgDays: number }> = {};
		const stageBuckets: Record<string, number[]> = {};
		for (const lead of allLeads as any[]) {
			const stage = lead.stage;
			if (!stage || stage === 'won' || stage === 'lost') continue;
			const created = lead.date_created ? new Date(lead.date_created).getTime() : null;
			if (!created) continue;
			const days = Math.floor((now.getTime() - created) / 86_400_000);
			(stageBuckets[stage] ||= []).push(days);
		}
		for (const [stage, days] of Object.entries(stageBuckets)) {
			stageAvgAge[stage] = {
				count: days.length,
				avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
			};
		}

		// ─── Conversion by Source ───
		const sourceMap: Record<string, { total: number; converted: number; pipelineValue: number; wonValue: number }> = {};
		for (const lead of allLeads as any[]) {
			const source = lead.source || 'unknown';
			const bucket = (sourceMap[source] ||= { total: 0, converted: 0, pipelineValue: 0, wonValue: 0 });
			bucket.total++;
			const isWon = lead.stage === 'won' || lead.converted_to_customer;
			if (isWon) {
				bucket.converted++;
				bucket.wonValue += Number(lead.actual_value || lead.estimated_value || 0);
			} else if (lead.stage !== 'lost') {
				bucket.pipelineValue += Number(lead.estimated_value || 0);
			}
		}
		const conversionBySource = Object.entries(sourceMap)
			.map(([source, b]) => ({
				source,
				total: b.total,
				converted: b.converted,
				conversionRate: b.total > 0 ? Math.round((b.converted / b.total) * 100) : 0,
				pipelineValue: Math.round(b.pipelineValue),
				wonValue: Math.round(b.wonValue),
			}))
			.sort((a, b) => b.total - a.total);

		// ─── Partner ROI ───
		// Group connections by partner contact; sum revenue of associated clients.
		const clientRevenue = new Map<string, number>();
		for (const inv of recentInvoices as any[]) {
			const clientId = typeof inv.client === 'object' ? inv.client?.id : inv.client;
			if (!clientId) continue;
			clientRevenue.set(clientId, (clientRevenue.get(clientId) || 0) + Number(inv.total_amount || 0));
		}

		// Partner-attributed leads: leads where source='referral' + has resulting_client.
		const referredLeadsByClient = new Map<string, number>();
		for (const lead of allLeads as any[]) {
			if (lead.source !== 'referral') continue;
			const rc = lead.resulting_client;
			const clientId = typeof rc === 'object' ? rc?.id : rc;
			if (!clientId) continue;
			referredLeadsByClient.set(clientId, (referredLeadsByClient.get(clientId) || 0) + 1);
		}

		const partnerMap = new Map<string, {
			contactId: string;
			name: string;
			company: string | null;
			role: string;
			introducedBy: 'partner' | 'us' | null;
			clientsIntroduced: { id: string; name: string }[];
			totalRevenue: number;
			referralLeadCount: number;
		}>();
		for (const conn of connections as any[]) {
			const contact = conn.contact;
			const client = conn.client;
			if (!contact || typeof contact !== 'object' || !client || typeof client !== 'object') continue;
			const contactId = contact.id;
			const partner = partnerMap.get(contactId) || {
				contactId,
				name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown',
				company: contact.company || null,
				role: conn.role,
				introducedBy: conn.introduced_by || null,
				clientsIntroduced: [] as { id: string; name: string }[],
				totalRevenue: 0,
				referralLeadCount: 0,
			};
			if (!partner.clientsIntroduced.find((c) => c.id === client.id)) {
				partner.clientsIntroduced.push({ id: client.id, name: client.name || 'Untitled' });
				partner.totalRevenue += clientRevenue.get(client.id) || 0;
				partner.referralLeadCount += referredLeadsByClient.get(client.id) || 0;
			}
			partnerMap.set(contactId, partner);
		}
		const partnerROI = Array.from(partnerMap.values())
			.map((p) => ({ ...p, totalRevenue: Math.round(p.totalRevenue) }))
			.sort((a, b) => (b.totalRevenue - a.totalRevenue) || (b.clientsIntroduced.length - a.clientsIntroduced.length))
			.slice(0, 10);

		// ─── Cold Contacts ───
		const coldList = (coldCandidates as any[])
			.map((c) => {
				const last = c.last_contacted_at || c.last_opened_at || c.date_updated || c.date_created;
				if (!last) return null;
				const lastTs = new Date(last).getTime();
				const daysSince = Math.floor((now.getTime() - lastTs) / 86_400_000);
				return {
					id: c.id,
					name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown',
					company: c.company || null,
					category: c.category,
					daysSinceContact: daysSince,
					lastChannel: c.last_contacted_at ? 'contacted' : c.last_opened_at ? 'opened email' : 'no activity',
				};
			})
			.filter((c): c is NonNullable<typeof c> => !!c && c.daysSinceContact >= 30 && c.daysSinceContact <= 365)
			.sort((a, b) => b.daysSinceContact - a.daysSinceContact)
			.slice(0, 12);

		// ─── Bookings (no-show rate + top event types) ───
		const appts = appointments as any[];
		const completedAppts = appts.filter((a) => {
			if (!a.end_time) return false;
			return new Date(a.end_time).getTime() < now.getTime();
		});
		const canceledCount = appts.filter((a) => a.status === 'canceled').length;
		const confirmedCount = appts.filter((a) => a.status === 'confirmed').length;
		const noShowRate = (completedAppts.length + canceledCount) > 0
			? Math.round((canceledCount / (completedAppts.length + canceledCount)) * 100)
			: null;

		const eventTypeBucket = new Map<string, { id: string; name: string; color: string | null; count: number }>();
		for (const a of appts) {
			const et = a.event_type;
			if (!et || typeof et !== 'object') continue;
			const key = et.id;
			const existing = eventTypeBucket.get(key) || {
				id: key,
				name: et.title || 'Untitled',
				color: et.color || null,
				count: 0,
			};
			existing.count++;
			eventTypeBucket.set(key, existing);
		}
		const topEventTypes = Array.from(eventTypeBucket.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, 6);

		// ─── Lead source trend (30 vs prior 60-30 day window) ───
		const thirtyTs = new Date(thirtyDaysAgo).getTime();
		const sixtyTs = thirtyTs - 30 * 86_400_000;
		let leadsLast30 = 0, leadsPrior30 = 0;
		for (const lead of allLeads as any[]) {
			if (!lead.date_created) continue;
			const ts = new Date(lead.date_created).getTime();
			if (ts >= thirtyTs) leadsLast30++;
			else if (ts >= sixtyTs) leadsPrior30++;
		}

		return {
			pipelineVelocity: {
				avgDaysToWin,
				medianDaysToWin,
				wonLeadsAnalyzed: winDays.length,
				stageAvgAge,
			},
			conversionBySource,
			partnerROI,
			coldContacts: coldList,
			bookings: {
				total: appts.length,
				completed: completedAppts.length,
				canceled: canceledCount,
				confirmed: confirmedCount,
				noShowRate,
				topEventTypes,
			},
			leadTrend: {
				last30: leadsLast30,
				prior30: leadsPrior30,
				delta: leadsLast30 - leadsPrior30,
			},
		};
	} catch (error: any) {
		console.error('[crm/intelligence-metrics] Failed:', error.message);
		throw createError({ statusCode: 500, message: 'Failed to compute CRM intelligence metrics' });
	}
});
