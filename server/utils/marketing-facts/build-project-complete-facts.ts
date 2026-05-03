/**
 * Project-complete fact builder.
 *
 * Two phases share this builder:
 *   - request_testimonial — 1 warm ask to the primary contact
 *   - repurpose_to_campaign — broader broadcast referencing the project as a
 *     case study
 *
 * For both phases we anchor on the *specific* completed project in
 * candidate_data.signal. That row is the centerpiece of every touch.
 *
 * For repurpose phase we additionally pull 2-3 *similar* completed projects
 * (same service) so the generator can position the anchor as part of a
 * pattern rather than a one-off.
 */
import { readItems } from '@directus/sdk';
import type { AvailableFact } from './build-dormant-facts';

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 32) || 'fact';
}

export interface ProjectCompleteSignal {
	project_title?: string;
	client_name?: string;
	primary_contact_name?: string;
	days_since_complete?: number;
	budget_usd?: number;
	recent_win?: string;
}

export async function buildAvailableFactsForProjectComplete(args: {
	organizationId: string;
	signal: ProjectCompleteSignal;
	phase: 'request_testimonial' | 'repurpose_to_campaign';
}): Promise<AvailableFact[]> {
	const { organizationId, signal, phase } = args;
	const directus = getTypedDirectus();
	const facts: AvailableFact[] = [];

	// ── 1. The anchor project ───────────────────────────────────────────────
	let anchor: any = null;
	if (signal.project_title) {
		try {
			const rows = await directus.request(
				readItems('projects', {
					filter: {
						_and: [
							{ organization: { _eq: organizationId } },
							{ title: { _eq: signal.project_title } },
						],
					},
					fields: [
						'id',
						'title',
						'description',
						'date_updated',
						'date_created',
						'client.name',
						'service.id',
						'service.name',
					],
					limit: 1,
				}),
			) as any[];
			anchor = rows?.[0] || null;
		} catch (err: any) {
			console.warn('[marketing-facts/project-complete] anchor query failed:', err.message);
		}
	}

	const anchorClient = anchor?.client?.name || signal.client_name || undefined;
	const anchorService = anchor?.service?.name || undefined;
	const anchorServiceId = anchor?.service?.id || undefined;
	const anchorTitle = anchor?.title || signal.project_title || 'recent project';
	const anchorId = `proj_${slugify(anchorTitle)}`;

	facts.push({
		id: anchorId,
		kind: 'project',
		title: anchorTitle,
		one_line_summary: anchorClient
			? `${anchorService ? anchorService + ' for ' : 'Engagement with '}${anchorClient}, recently wrapped.`
			: `${anchorService || 'Recent'} project, recently wrapped.`,
		detail: anchor?.description ? String(anchor.description).slice(0, 280) : undefined,
		date: anchor?.date_updated || anchor?.date_created || undefined,
		client_name: anchorClient,
	});

	// ── 2. Recent win tied to this project (e.g. an award) ──────────────────
	if (signal.recent_win) {
		facts.push({
			id: `win_${slugify(signal.recent_win)}`,
			kind: 'win',
			title: signal.recent_win,
			one_line_summary: `${signal.recent_win}${anchorTitle ? ` (${anchorTitle})` : ''}.`,
		});
	}

	// ── 3. Sibling projects in the same service (repurpose phase only) ──────
	if (phase === 'repurpose_to_campaign' && anchorServiceId) {
		try {
			const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS).toISOString();
			const siblings = await directus.request(
				readItems('projects', {
					filter: {
						_and: [
							{ organization: { _eq: organizationId } },
							{ status: { _eq: 'Completed' } },
							{ service: { _eq: anchorServiceId } },
							{ id: { _neq: anchor?.id } },
							{ date_updated: { _gte: sixMonthsAgo } },
						],
					},
					fields: ['id', 'title', 'client.name', 'date_updated'],
					sort: ['-date_updated'],
					limit: 3,
				}),
			) as any[];
			for (const sib of siblings || []) {
				const sName = sib.client?.name as string | undefined;
				facts.push({
					id: `proj_${slugify(sib.title || `s${sib.id}`)}`,
					kind: 'project',
					title: sib.title || 'Sibling project',
					one_line_summary: sName
						? `${anchorService || 'Same service'} for ${sName}, recently wrapped.`
						: `${anchorService || 'Same service'} engagement, recently wrapped.`,
					date: sib.date_updated || undefined,
					client_name: sName,
				});
			}
		} catch (err: any) {
			console.warn('[marketing-facts/project-complete] siblings query failed:', err.message);
		}
	}

	// ── 4. The anchor's service as a fact (so it can be referenced) ─────────
	if (anchorService) {
		facts.push({
			id: `svc_${slugify(anchorService)}`,
			kind: 'service',
			title: anchorService,
		one_line_summary: `${anchorService} engagements.`,
		});
	}

	return facts;
}
