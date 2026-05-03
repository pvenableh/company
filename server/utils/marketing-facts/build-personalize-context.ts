/**
 * Per-contact context builder for marketing touch personalization.
 *
 * Returns a small bundle of CRM facts about a single contact to inform a
 * personalized variant of an email touch. Kept narrow on purpose: the
 * generator should personalize in voice and angle, not regurgitate dossier.
 *
 * Excluded by design:
 *   - ai_notes (no privacy flag — could include AI-summarized internal content)
 *   - financial fields (contract_value, lifetime_revenue)
 *   - internal team-only fields (assigned_to, lead_score)
 *
 * Included:
 *   - first_name, last_name, company, title, category
 *   - contacts.notes (plain text the user typed directly)
 *   - last project (via contact.client → projects.client)
 *   - open lead status (most recent, non-closed)
 *   - days since last engagement (last_opened_at | last_clicked_at | date_updated)
 */
import { readItem, readItems } from '@directus/sdk';

export interface PerContactContext {
	contact_id: string;
	first_name: string | null;
	last_name: string | null;
	company: string | null;
	title: string | null;
	category: string | null;
	notes_excerpt: string | null;
	last_project: {
		title: string;
		status: string;
		completed_at: string | null;
	} | null;
	open_lead: {
		stage: string | null;
		project_type: string | null;
		updated_at: string | null;
	} | null;
	days_since_last_engagement: number | null;
}

const NOTES_EXCERPT_CHARS = 400;

function truncate(s: string | null | undefined, max: number): string | null {
	if (!s) return null;
	const trimmed = s.trim();
	if (trimmed.length <= max) return trimmed;
	return trimmed.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
}

function daysBetween(a: Date, b: Date): number {
	return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function buildPerContactContext(args: {
	organizationId: string;
	contactId: string;
}): Promise<PerContactContext | null> {
	const directus = getTypedDirectus();
	const { contactId } = args;

	const contact = await directus
		.request(
			readItem('contacts', contactId, {
				fields: [
					'id',
					'first_name',
					'last_name',
					'company',
					'title',
					'category',
					'notes',
					'client',
					'last_opened_at',
					'last_clicked_at',
					'date_updated',
				],
			}),
		)
		.catch(() => null) as any;

	if (!contact) return null;

	// Last completed project for this contact's client (if any).
	let lastProject: PerContactContext['last_project'] = null;
	if (contact.client) {
		try {
			const projects = await directus.request(
				readItems('projects', {
					filter: {
						_and: [
							{ client: { _eq: contact.client } },
							{ organization: { _eq: args.organizationId } },
						],
					},
					fields: ['id', 'title', 'status', 'completion_date', 'date_updated'],
					sort: ['-completion_date', '-date_updated'],
					limit: 1,
				}),
			) as any[];
			if (projects[0]) {
				lastProject = {
					title: projects[0].title || 'Project',
					status: projects[0].status || 'unknown',
					completed_at: projects[0].completion_date || projects[0].date_updated || null,
				};
			}
		} catch {
			// Non-fatal — leave lastProject null.
		}
	}

	// Most recent open lead (stage not in won/lost).
	let openLead: PerContactContext['open_lead'] = null;
	try {
		const leads = await directus.request(
			readItems('leads', {
				filter: {
					_and: [
						{ related_contact: { _eq: contactId } },
						{ organization: { _eq: args.organizationId } },
						{ stage: { _nin: ['won', 'lost'] as any } },
					],
				},
				fields: ['id', 'stage', 'project_type', 'date_updated'],
				sort: ['-date_updated'],
				limit: 1,
			}),
		) as any[];
		if (leads[0]) {
			openLead = {
				stage: leads[0].stage || null,
				project_type: leads[0].project_type || null,
				updated_at: leads[0].date_updated || null,
			};
		}
	} catch {
		// Non-fatal.
	}

	const engagementCandidates = [
		contact.last_opened_at,
		contact.last_clicked_at,
		contact.date_updated,
	].filter(Boolean) as string[];
	const lastEngagement = engagementCandidates
		.map((s) => new Date(s))
		.filter((d) => !isNaN(d.getTime()))
		.sort((a, b) => b.getTime() - a.getTime())[0];

	const daysSince = lastEngagement ? daysBetween(lastEngagement, new Date()) : null;

	return {
		contact_id: contact.id,
		first_name: contact.first_name || null,
		last_name: contact.last_name || null,
		company: contact.company || null,
		title: contact.title || null,
		category: contact.category || null,
		notes_excerpt: truncate(contact.notes, NOTES_EXCERPT_CHARS),
		last_project: lastProject,
		open_lead: openLead,
		days_since_last_engagement: daysSince,
	};
}
