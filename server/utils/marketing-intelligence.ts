// server/utils/marketing-intelligence.ts
/**
 * Marketing Intelligence Data Aggregation.
 *
 * Gathers marketing-relevant data across Directus collections
 * and returns a structured summary for LLM context.
 * Keeps output under ~4000 tokens when serialized.
 */

import { readItems, readItem, aggregate } from '@directus/sdk';
import type { MarketingContext } from '~/types/marketing';

type DirectusClient = Awaited<ReturnType<typeof getUserDirectus>>;

export async function getMarketingContext(
	directus: DirectusClient,
	orgId: string,
): Promise<MarketingContext> {
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

	// Fetch all data in parallel
	const [
		contacts,
		recentContacts,
		socialPosts,
		socialAccounts,
		emails,
		mailingLists,
		clients,
		invoices,
		projects,
		tickets,
	] = await Promise.all([
		// Contacts: total + subscription info
		directus.request(readItems('contacts', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'email_subscribed', 'tags'],
			limit: -1,
		})).catch(() => [] as any[]),

		// Recent contacts (last 30 days)
		directus.request(readItems('contacts', {
			filter: {
				organization: { _eq: orgId },
				date_created: { _gte: thirtyDaysAgo },
			},
			fields: ['id'],
			limit: -1,
		})).catch(() => [] as any[]),

		// Social posts (last 30 days)
		directus.request(readItems('social_posts', {
			filter: {
				organization: { _eq: orgId },
				date_created: { _gte: thirtyDaysAgo },
			},
			fields: ['id', 'caption', 'platforms', 'post_status', 'published_at', 'date_created'],
			limit: 50,
			sort: ['-date_created'],
		})).catch(() => [] as any[]),

		// Social accounts
		directus.request(readItems('social_accounts', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'platform', 'account_name'],
			limit: 50,
		})).catch(() => [] as any[]),

		// Emails / campaigns
		directus.request(readItems('emails', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'name', 'subject', 'sent_at', 'total_recipients'],
			limit: 20,
			sort: ['-date_created'],
		})).catch(() => [] as any[]),

		// Mailing lists
		directus.request(readItems('mailing_lists', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'name', 'subscriber_count'],
			limit: 50,
		})).catch(() => [] as any[]),

		// Clients
		directus.request(readItems('clients', {
			filter: { organization: { _eq: orgId } },
			fields: ['id', 'name', 'status', 'tags'],
			limit: -1,
		})).catch(() => [] as any[]),

		// Invoices (last 6 months)
		directus.request(readItems('invoices', {
			filter: {
				organization: { _eq: orgId },
				invoice_date: { _gte: sixMonthsAgo },
			},
			fields: ['id', 'total_amount', 'invoice_date', 'line_items'],
			limit: 200,
			sort: ['-invoice_date'],
		})).catch(() => [] as any[]),

		// Projects (active)
		directus.request(readItems('projects', {
			filter: {
				organization: { _eq: orgId },
				status: { _neq: 'completed' },
			},
			fields: ['id', 'title', 'status', 'due_date'],
			limit: 50,
			sort: ['due_date'],
		})).catch(() => [] as any[]),

		// Tickets (last 30 days)
		directus.request(readItems('tickets', {
			filter: {
				organization: { _eq: orgId },
				date_created: { _gte: thirtyDaysAgo },
			},
			fields: ['id', 'title', 'status'],
			limit: 100,
		})).catch(() => [] as any[]),
	]);

	// ─── Fetch Brand Context (org + clients with brand data) ───
	const [orgBrand, clientsBrand] = await Promise.all([
		directus.request(readItem('organizations', orgId, {
			fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
		})).catch(() => null as any),

		directus.request(readItems('clients', {
			filter: {
				organization: { _eq: orgId },
				_or: [
					{ brand_direction: { _nnull: true } },
					{ goals: { _nnull: true } },
					{ target_audience: { _nnull: true } },
				],
			},
			fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location', 'services'],
			limit: 50,
		})).catch(() => [] as any[]),
	]);

	// ─── Summarize Contacts ───
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

	// ─── Summarize Social ───
	const connectedPlatforms = [...new Set((socialAccounts as any[]).map((a: any) => a.platform))];
	const recentPostsSummary = (socialPosts as any[]).slice(0, 5).map((p: any) => ({
		platform: Array.isArray(p.platforms) ? p.platforms.map((pl: any) => pl.platform || pl).join(', ') : 'unknown',
		caption: (p.caption || '').slice(0, 80),
		status: p.post_status || 'draft',
		date: p.published_at || p.date_created || '',
	}));

	// ─── Summarize Email ───
	const recentCampaigns = (emails as any[]).slice(0, 5).map((e: any) => ({
		name: e.name || '',
		subject: e.subject || '',
		sentAt: e.sent_at || '',
		totalRecipients: e.total_recipients || 0,
	}));
	const totalSubscribers = (mailingLists as any[]).reduce(
		(sum: number, ml: any) => sum + (ml.subscriber_count || 0),
		0,
	);

	// ─── Summarize Clients ───
	const clientsByStatus = (clients as any[]).reduce((acc: Record<string, number>, c: any) => {
		const status = c.status || 'unknown';
		acc[status] = (acc[status] || 0) + 1;
		return acc;
	}, {});
	const clientsByIndustry: Record<string, number> = {};
	for (const client of clients as any[]) {
		const tags = Array.isArray(client.tags) ? client.tags : [];
		for (const tag of tags.slice(0, 3)) {
			clientsByIndustry[tag] = (clientsByIndustry[tag] || 0) + 1;
		}
	}

	// ─── Summarize Revenue ───
	const monthlyRevenue: Record<string, number> = {};
	for (const inv of invoices as any[]) {
		if (!inv.invoice_date) continue;
		const month = inv.invoice_date.slice(0, 7); // YYYY-MM
		monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (Number(inv.total_amount) || 0);
	}
	const monthlyTrend = Object.entries(monthlyRevenue)
		.sort(([a], [b]) => a.localeCompare(b))
		.slice(-6)
		.map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

	// Extract top services from invoice line items
	const serviceCounts: Record<string, number> = {};
	for (const inv of invoices as any[]) {
		const items = Array.isArray(inv.line_items) ? inv.line_items : [];
		for (const item of items) {
			const desc = item.description || item.name || '';
			if (desc) {
				serviceCounts[desc] = (serviceCounts[desc] || 0) + 1;
			}
		}
	}
	const topServices = Object.entries(serviceCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([name]) => name);

	// ─── Summarize Projects ───
	const upcomingDueDates = (projects as any[])
		.filter((p: any) => p.due_date)
		.slice(0, 5)
		.map((p: any) => ({ title: p.title || '', dueDate: p.due_date }));

	// ─── Summarize Tickets ───
	const ticketsByStatus = (tickets as any[]).reduce((acc: Record<string, number>, t: any) => {
		const status = t.status || 'unknown';
		acc[status] = (acc[status] || 0) + 1;
		return acc;
	}, {});

	// ─── Build account followers map ───
	const accountFollowers: Record<string, number> = {};
	for (const platform of connectedPlatforms) {
		accountFollowers[platform] = (socialAccounts as any[])
			.filter((a: any) => a.platform === platform)
			.length;
	}

	return {
		contacts: {
			total: (contacts as any[]).length,
			subscribedCount: (contacts as any[]).filter((c: any) => c.email_subscribed).length,
			recentGrowth: (recentContacts as any[]).length,
			topTags,
		},
		social: {
			connectedPlatforms,
			recentPosts: recentPostsSummary,
			postsLast30Days: (socialPosts as any[]).length,
			accountFollowers,
		},
		email: {
			totalCampaigns: (emails as any[]).length,
			recentCampaigns,
			mailingListCount: (mailingLists as any[]).length,
			totalSubscribers,
		},
		clients: {
			total: (clients as any[]).length,
			byStatus: clientsByStatus,
			byIndustry: clientsByIndustry,
		},
		revenue: {
			monthlyTrend,
			topServices,
		},
		projects: {
			activeCount: (projects as any[]).length,
			upcomingDueDates,
		},
		tickets: {
			totalLast30Days: (tickets as any[]).length,
			byStatus: ticketsByStatus,
		},
		brandContext: {
			organization: {
				name: orgBrand?.name || null,
				brandDirection: orgBrand?.brand_direction || null,
				goals: orgBrand?.goals || null,
				targetAudience: orgBrand?.target_audience || null,
				location: orgBrand?.location || null,
			},
			clients: (clientsBrand as any[]).map((c: any) => ({
				name: c.name,
				brandDirection: c.brand_direction || null,
				goals: c.goals || null,
				targetAudience: c.target_audience || null,
				location: c.location || null,
				services: Array.isArray(c.services) ? c.services : [],
			})),
		},
	};
}
