// server/utils/crm-intelligence.ts
/**
 * CRM Intelligence Data Aggregation.
 *
 * Gathers CRM-relevant data across all Directus collections
 * (contacts, cd_contacts, clients, projects, tasks, tickets, invoices, deals)
 * and returns a structured summary for LLM context.
 */

import { readItem, readItems } from '@directus/sdk';
import type { CRMContext } from '~~/shared/crm-intelligence';

type DirectusClient = Awaited<ReturnType<typeof getUserDirectus>>;

export async function getCRMContext(
	directus: DirectusClient,
	orgId: string,
	userId?: string,
): Promise<CRMContext> {
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
	const now = new Date();

	// Fetch all data in parallel
	const [
		contacts,
		recentContacts,
		clients,
		projects,
		completedProjects,
		tasks,
		tickets,
		completedTickets,
		invoices,
		deals,
		convertedDeals,
		cdContacts,
		cdActivities,
		cdXpState,
	] = await Promise.all([
		// ─── Contacts ───
		directus.request(readItems('contacts', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'email', 'phone', 'email_subscribed', 'tags', 'industry'],
			limit: -1,
		})).catch(() => [] as any[]),

		directus.request(readItems('contacts', {
			filter: {
				organization: { _eq: orgId },
				date_created: { _gte: thirtyDaysAgo },
			},
			fields: ['id'],
			limit: -1,
		})).catch(() => [] as any[]),

		// ─── Clients ───
		directus.request(readItems('clients', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'name', 'status', 'tags', 'date_created'],
			limit: -1,
		})).catch(() => [] as any[]),

		// ─── Projects (active) ───
		directus.request(readItems('projects', {
			filter: {
				organization: { _eq: orgId },
				status: { _neq: 'completed' },
			},
			fields: ['id', 'title', 'status', 'due_date', 'start_date', 'client.name'],
			limit: 100,
			sort: ['due_date'],
		})).catch(() => [] as any[]),

		// ─── Projects (completed, for avg completion calc) ───
		directus.request(readItems('projects', {
			filter: {
				organization: { _eq: orgId },
				status: { _eq: 'completed' },
				date_created: { _gte: sixMonthsAgo },
			},
			fields: ['id', 'start_date', 'due_date', 'date_created', 'date_updated'],
			limit: 50,
		})).catch(() => [] as any[]),

		// ─── Tasks ───
		directus.request(readItems('project_tasks', {
			filter: {
				_or: [
					{ assignee_id: { _eq: userId || '$CURRENT_USER' } },
					{ event_id: { organization: { _eq: orgId } } },
				],
			},
			fields: ['id', 'status', 'completed', 'due_date'],
			limit: 200,
		})).catch(() => [] as any[]),

		// ─── Tickets (last 30 days + overdue) ───
		directus.request(readItems('tickets', {
			filter: {
				organization: { _eq: orgId },
				_or: [
					{ date_created: { _gte: thirtyDaysAgo } },
					{ status: { _nin: ['completed', 'archived'] } },
				],
			},
			fields: ['id', 'title', 'status', 'priority', 'due_date', 'assigned_to', 'client.name', 'date_created', 'date_updated'],
			limit: 200,
			sort: ['due_date'],
		})).catch(() => [] as any[]),

		// ─── Completed tickets (for resolution time) ───
		directus.request(readItems('tickets', {
			filter: {
				organization: { _eq: orgId },
				status: { _eq: 'completed' },
				date_updated: { _gte: thirtyDaysAgo },
			},
			fields: ['id', 'date_created', 'date_updated'],
			limit: 100,
		})).catch(() => [] as any[]),

		// ─── Invoices (last 6 months) ───
		directus.request(readItems('invoices', {
			filter: {
				_or: [
					{ bill_to: { _eq: orgId } },
					{ organization: { _eq: orgId } },
				],
				invoice_date: { _gte: sixMonthsAgo },
			},
			fields: ['id', 'invoice_code', 'total_amount', 'invoice_date', 'due_date', 'status', 'bill_to.name', 'client.name'],
			limit: 300,
			sort: ['-invoice_date'],
		})).catch(() => [] as any[]),

		// ─── Deals (open) ───
		directus.request(readItems('leads', {
			filter: {
				organization: { _eq: orgId },
				status: { _in: ['published', 'draft'] },
				converted_to_customer: { _neq: true },
			},
			fields: ['id', 'status', 'priority', 'estimated_value', 'next_follow_up', 'source', 'date_created'],
			limit: 100,
			sort: ['next_follow_up'],
		})).catch(() => [] as any[]),

		// ─── Deals (converted, for conversion rate) ───
		directus.request(readItems('leads', {
			filter: {
				organization: { _eq: orgId },
				converted_to_customer: { _eq: true },
				date_created: { _gte: sixMonthsAgo },
			},
			fields: ['id'],
			limit: -1,
		})).catch(() => [] as any[]),

		// ─── CardDesk Contacts ───
		userId ? directus.request(readItems('cd_contacts', {
			filter: { user_created: { _eq: userId } },
			fields: ['id', 'name', 'company', 'rating', 'hibernated', 'is_client', 'date_created'],
			limit: -1,
		})).catch(() => [] as any[]) : Promise.resolve([] as any[]),

		// ─── CardDesk Activities (last 30 days) ───
		userId ? directus.request(readItems('cd_activities', {
			filter: {
				user_created: { _eq: userId },
				date: { _gte: thirtyDaysAgo },
			},
			fields: ['id', 'type', 'date', 'is_response', 'contact.id', 'contact.name'],
			sort: ['-date'],
			limit: 200,
		})).catch(() => [] as any[]) : Promise.resolve([] as any[]),

		// ─── CardDesk XP State ───
		userId ? directus.request(readItems('cd_xp_state', {
			filter: { user_created: { _eq: userId } },
			fields: ['level', 'streak', 'total_clients', 'total_contacts'],
			limit: 1,
		})).catch(() => [] as any[]) : Promise.resolve([] as any[]),
	]);

	// ─── Fetch Brand Context (org, clients with brand data, teams) ───
	const [orgData, clientsBrand, teams] = await Promise.all([
		directus.request(readItem('organizations', orgId, {
			fields: ['brand_direction', 'goals', 'target_audience', 'location'],
		})).catch(() => null as any),

		directus.request(readItems('clients', {
			filter: {
				organization: { _eq: orgId },
				_or: [
					{ brand_direction: { _nnull: true } },
					{ goals: { _nnull: true } },
					{ target_audience: { _nnull: true } },
					{ services: { _nnull: true } },
				],
			},
			fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location', 'services'],
			limit: 50,
		})).catch(() => [] as any[]),

		directus.request(readItems('teams', {
			filter: {
				organization: { _eq: orgId },
				active: { _eq: true },
				_or: [
					{ focus: { _nnull: true } },
					{ goals: { _nnull: true } },
				],
			},
			fields: ['name', 'focus', 'goals'],
			limit: 20,
		})).catch(() => [] as any[]),
	]);

	// ─── Build Contacts Summary ───
	const contactsByIndustry: Record<string, number> = {};
	for (const c of contacts as any[]) {
		if (c.industry) {
			contactsByIndustry[c.industry] = (contactsByIndustry[c.industry] || 0) + 1;
		}
	}
	const allTags = (contacts as any[])
		.flatMap((c: any) => (Array.isArray(c.tags) ? c.tags : []))
		.reduce((acc: Record<string, number>, tag: string) => {
			acc[tag] = (acc[tag] || 0) + 1;
			return acc;
		}, {});
	const topTags = Object.entries(allTags)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([tag]) => tag);

	// ─── Build CardDesk Summary ───
	const activeCd = (cdContacts as any[]).filter((c: any) => !c.hibernated);
	const cdByRating: Record<string, number> = {};
	for (const c of activeCd) {
		const r = c.rating || 'unrated';
		cdByRating[r] = (cdByRating[r] || 0) + 1;
	}

	// Build last activity map for follow-up detection
	const lastActivityMap = new Map<string, { type: string; date: string }>();
	for (const act of cdActivities as any[]) {
		const contactId = act.contact?.id;
		if (contactId && !lastActivityMap.has(contactId)) {
			lastActivityMap.set(contactId, { type: act.type, date: act.date });
		}
	}

	const cdNeedsFollowUp: CRMContext['cardDesk']['needsFollowUp'] = [];
	for (const contact of activeCd) {
		if (contact.rating !== 'hot' && contact.rating !== 'warm') continue;
		const lastAct = lastActivityMap.get(contact.id);
		const lastDate = lastAct?.date ? new Date(lastAct.date) : (contact.date_created ? new Date(contact.date_created) : null);
		if (!lastDate) continue;
		const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
		if (daysSince >= 3) {
			cdNeedsFollowUp.push({
				name: contact.name || 'Unknown',
				company: contact.company || null,
				rating: contact.rating,
				daysSinceContact: daysSince,
			});
		}
	}
	cdNeedsFollowUp.sort((a, b) => b.daysSinceContact - a.daysSinceContact);

	const cdConverted = (cdContacts as any[]).filter((c: any) => c.is_client).length;
	const cdConversionRate = activeCd.length > 0
		? Math.round((cdConverted / activeCd.length) * 100)
		: 0;

	// Activities summary
	const cdRecentActivities = (cdActivities as any[]).slice(0, 10).map((a: any) => ({
		type: a.type,
		contactName: a.contact?.name || null,
		date: a.date,
		isResponse: a.is_response || false,
	}));

	const uniqueContactsWithActivity = new Set((cdActivities as any[]).map((a: any) => a.contact?.id).filter(Boolean));
	const avgActivitiesPerContact = uniqueContactsWithActivity.size > 0
		? Math.round(((cdActivities as any[]).length / uniqueContactsWithActivity.size) * 10) / 10
		: 0;

	const xpData = (cdXpState as any[])[0];

	// ─── Build Clients Summary ───
	const clientsByStatus: Record<string, number> = {};
	for (const c of clients as any[]) {
		const status = c.status || 'unknown';
		clientsByStatus[status] = (clientsByStatus[status] || 0) + 1;
	}
	const recentClients = (clients as any[])
		.sort((a: any, b: any) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())
		.slice(0, 5)
		.map((c: any) => ({ name: c.name, status: c.status || 'active', createdAt: c.date_created }));

	// Count clients with active projects/tickets
	const clientNamesWithProjects = new Set((projects as any[]).map((p: any) => p.client?.name).filter(Boolean));
	const clientNamesWithTickets = new Set(
		(tickets as any[]).filter((t: any) => t.status !== 'completed' && t.status !== 'archived')
			.map((t: any) => t.client?.name).filter(Boolean),
	);

	// ─── Build Projects Summary ───
	const projectsByStatus: Record<string, number> = {};
	const overdueProjects: CRMContext['projects']['overdue'] = [];
	const dueSoonProjects: CRMContext['projects']['dueSoon'] = [];

	for (const p of projects as any[]) {
		const status = p.status || 'unknown';
		projectsByStatus[status] = (projectsByStatus[status] || 0) + 1;

		if (p.due_date) {
			const dueDate = new Date(p.due_date);
			const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
			if (daysUntil < 0) {
				overdueProjects.push({ title: p.title, dueDate: p.due_date, client: p.client?.name || null });
			} else if (daysUntil <= 7) {
				dueSoonProjects.push({ title: p.title, dueDate: p.due_date, client: p.client?.name || null });
			}
		}
	}

	// Average completion time
	let avgCompletionDays: number | null = null;
	const completionDays = (completedProjects as any[])
		.filter((p: any) => p.start_date && p.date_updated)
		.map((p: any) => Math.floor((new Date(p.date_updated).getTime() - new Date(p.start_date).getTime()) / 86400000))
		.filter((d) => d > 0);
	if (completionDays.length > 0) {
		avgCompletionDays = Math.round(completionDays.reduce((a, b) => a + b, 0) / completionDays.length);
	}

	const tasksAll = tasks as any[];
	const tasksCompleted = tasksAll.filter((t: any) => t.completed).length;
	const tasksPending = tasksAll.filter((t: any) => !t.completed).length;

	// ─── Build Tickets Summary ───
	const ticketsByStatus: Record<string, number> = {};
	const ticketsByPriority: Record<string, number> = {};
	const overdueTickets: CRMContext['tickets']['overdue'] = [];
	let unassignedTickets = 0;

	for (const t of tickets as any[]) {
		const status = t.status || 'unknown';
		ticketsByStatus[status] = (ticketsByStatus[status] || 0) + 1;

		const priority = t.priority || 'normal';
		ticketsByPriority[priority] = (ticketsByPriority[priority] || 0) + 1;

		if (!t.assigned_to) unassignedTickets++;

		if (t.due_date && t.status !== 'completed' && t.status !== 'archived') {
			const dueDate = new Date(t.due_date);
			if (dueDate < now) {
				overdueTickets.push({
					title: t.title,
					dueDate: t.due_date,
					client: t.client?.name || null,
					priority: t.priority || 'normal',
				});
			}
		}
	}

	// Average resolution time
	let avgResolutionDays: number | null = null;
	const resolutionDays = (completedTickets as any[])
		.filter((t: any) => t.date_created && t.date_updated)
		.map((t: any) => Math.floor((new Date(t.date_updated).getTime() - new Date(t.date_created).getTime()) / 86400000))
		.filter((d) => d >= 0);
	if (resolutionDays.length > 0) {
		avgResolutionDays = Math.round(resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length);
	}

	// ─── Build Invoices Summary ───
	const monthlyRevenue: Record<string, number> = {};
	const outstandingInvoices: CRMContext['invoices']['outstanding'] = [];
	let totalOutstanding = 0;
	const clientRevenue: Record<string, number> = {};

	for (const inv of invoices as any[]) {
		const amount = Number(inv.total_amount) || 0;

		if (inv.invoice_date) {
			const month = inv.invoice_date.slice(0, 7);
			monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;
		}

		const clientName = inv.client?.name || inv.bill_to?.name || null;
		if (clientName) {
			clientRevenue[clientName] = (clientRevenue[clientName] || 0) + amount;
		}

		if (inv.status === 'pending' && inv.due_date) {
			const dueDate = new Date(inv.due_date);
			const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
			if (daysOverdue > 0) {
				totalOutstanding += amount;
				outstandingInvoices.push({
					code: inv.invoice_code || inv.id,
					amount,
					dueDate: inv.due_date,
					client: clientName,
					daysOverdue,
				});
			}
		}
	}

	const monthlyTrend = Object.entries(monthlyRevenue)
		.sort(([a], [b]) => a.localeCompare(b))
		.slice(-6)
		.map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

	const totalRevenue = monthlyTrend.reduce((sum, m) => sum + m.total, 0);
	const avgInvoiceValue = (invoices as any[]).length > 0
		? Math.round(totalRevenue / (invoices as any[]).length)
		: 0;

	const topClients = Object.entries(clientRevenue)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }));

	outstandingInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

	// ─── Build Deals Summary ───
	const dealsBySource: Record<string, number> = {};
	const overdueFollowUps: CRMContext['deals']['overdueFollowUps'] = [];
	let totalPipelineValue = 0;

	for (const d of deals as any[]) {
		const value = Number(d.estimated_value) || 0;
		totalPipelineValue += value;

		if (d.source) {
			dealsBySource[d.source] = (dealsBySource[d.source] || 0) + 1;
		}

		if (d.next_follow_up) {
			const followUpDate = new Date(d.next_follow_up);
			if (followUpDate < now) {
				const daysOverdue = Math.floor((now.getTime() - followUpDate.getTime()) / 86400000);
				overdueFollowUps.push({
					id: d.id,
					source: d.source || null,
					value,
					daysOverdue,
				});
			}
		}
	}

	const avgDealValue = (deals as any[]).length > 0
		? Math.round(totalPipelineValue / (deals as any[]).length)
		: 0;

	const totalDealsAllTime = (deals as any[]).length + (convertedDeals as any[]).length;
	const dealConversionRate = totalDealsAllTime > 0
		? Math.round(((convertedDeals as any[]).length / totalDealsAllTime) * 100)
		: null;

	overdueFollowUps.sort((a, b) => b.daysOverdue - a.daysOverdue);

	// ─── Build Activities Summary ───
	const cdActivityTypes: Record<string, number> = {};
	let responseCount = 0;
	for (const a of cdActivities as any[]) {
		cdActivityTypes[a.type] = (cdActivityTypes[a.type] || 0) + 1;
		if (a.is_response) responseCount++;
	}
	const totalCdActivities = (cdActivities as any[]).length;
	const responseRate = totalCdActivities > 0
		? Math.round((responseCount / totalCdActivities) * 100)
		: 0;
	const weeksInPeriod = Math.max(1, Math.min(4, Math.ceil(
		(now.getTime() - new Date(thirtyDaysAgo).getTime()) / (7 * 86400000),
	)));
	const avgActivitiesPerWeek = Math.round((totalCdActivities / weeksInPeriod) * 10) / 10;

	return {
		contacts: {
			total: (contacts as any[]).length,
			subscribedCount: (contacts as any[]).filter((c: any) => c.email_subscribed).length,
			recentGrowth: (recentContacts as any[]).length,
			topTags,
			byIndustry: contactsByIndustry,
			withEmail: (contacts as any[]).filter((c: any) => c.email).length,
			withPhone: (contacts as any[]).filter((c: any) => c.phone).length,
		},
		cardDesk: {
			total: activeCd.length,
			byRating: cdByRating,
			convertedClients: cdConverted,
			hibernated: (cdContacts as any[]).filter((c: any) => c.hibernated).length,
			needsFollowUp: cdNeedsFollowUp.slice(0, 10),
			recentActivities: cdRecentActivities,
			avgActivitiesPerContact,
			conversionRate: cdConversionRate,
			xp: {
				level: xpData?.level || 1,
				streak: xpData?.streak || 0,
				totalClients: xpData?.total_clients || 0,
			},
		},
		clients: {
			total: (clients as any[]).length,
			byStatus: clientsByStatus,
			recentClients,
			withActiveProjects: clientNamesWithProjects.size,
			withOpenTickets: clientNamesWithTickets.size,
		},
		projects: {
			total: (projects as any[]).length,
			byStatus: projectsByStatus,
			overdue: overdueProjects.slice(0, 5),
			dueSoon: dueSoonProjects.slice(0, 5),
			avgCompletionDays,
			tasksTotal: tasksAll.length,
			tasksCompleted,
			tasksPending,
		},
		tickets: {
			totalLast30Days: (tickets as any[]).length,
			byStatus: ticketsByStatus,
			byPriority: ticketsByPriority,
			avgResolutionDays,
			overdue: overdueTickets.slice(0, 5),
			unassigned: unassignedTickets,
		},
		invoices: {
			totalRevenue6Months: Math.round(totalRevenue),
			monthlyTrend,
			outstanding: outstandingInvoices.slice(0, 5),
			totalOutstanding: Math.round(totalOutstanding),
			avgInvoiceValue,
			topClients,
		},
		deals: {
			open: (deals as any[]).length,
			pipelineValue: Math.round(totalPipelineValue),
			overdueFollowUps: overdueFollowUps.slice(0, 5),
			bySource: dealsBySource,
			avgDealValue,
			conversionRate: dealConversionRate,
		},
		activities: {
			totalLast30Days: totalCdActivities,
			byType: cdActivityTypes,
			responseRate,
			avgActivitiesPerWeek,
		},
		brandContext: {
			organization: {
				brandDirection: orgData?.brand_direction || null,
				goals: orgData?.goals || null,
				targetAudience: orgData?.target_audience || null,
				location: orgData?.location || null,
			},
			clients: (clientsBrand as any[]).map((c: any) => ({
				name: c.name,
				brandDirection: c.brand_direction || null,
				goals: c.goals || null,
				targetAudience: c.target_audience || null,
				location: c.location || null,
				services: Array.isArray(c.services) ? c.services : [],
			})),
			teams: (teams as any[]).map((t: any) => ({
				name: t.name,
				focus: t.focus || null,
				goals: t.goals || null,
			})),
		},
	};
}
