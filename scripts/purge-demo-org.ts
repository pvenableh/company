#!/usr/bin/env npx tsx
/**
 * One-shot cleanup for demo orgs. Takes one or more org IDs on the command
 * line and deletes every row scoped to that org in dependency order, then
 * deletes the org itself.
 *
 * Usage:
 *   pnpm tsx scripts/purge-demo-org.ts <org-id> [<org-id> ...]
 *
 * This exists because `clients.organization` (and other FKs) are NOT NULL
 * without cascade, so a plain DELETE on the org blows up. Used to clean
 * up duplicate agency-demo orgs accidentally created by an earlier broken
 * idempotency check.
 */

import 'dotenv/config';
import { assertDirectusToken, directusRequest } from './lib/demo-seed';

assertDirectusToken();

const orgIds = process.argv.slice(2);
if (orgIds.length === 0) {
	console.error('Usage: pnpm tsx scripts/purge-demo-org.ts <org-id> [<org-id> ...]');
	process.exit(1);
}

async function deleteByFilter(
	collection: string,
	filter: Record<string, any>,
	idField: string = 'id',
	label?: string,
): Promise<number> {
	const qs = `filter=${encodeURIComponent(JSON.stringify(filter))}&fields=${idField}&limit=-1`;
	const res = await directusRequest<any[]>(`/items/${collection}?${qs}`);
	if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return 0;
	const ids = res.data.map((r: any) => r[idField]).filter(Boolean);
	if (ids.length === 0) return 0;
	const del = await directusRequest(`/items/${collection}`, 'DELETE', ids);
	if (!del.ok) {
		console.error(`  [fail] delete ${label || collection} (${ids.length}): ${del.error}`);
		return 0;
	}
	console.log(`  [ok]   ${label || collection}: ${ids.length}`);
	return ids.length;
}

async function purgeOrg(orgId: string): Promise<void> {
	console.log(`\n=== Purging org ${orgId} ===`);

	// Find children that nest further, then delete leaf-first.
	const projectsRes = await directusRequest<any[]>(
		`/items/projects?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const projectIds = (projectsRes.ok && Array.isArray(projectsRes.data) ? projectsRes.data : []).map((p: any) => p.id);

	const eventsRes = projectIds.length
		? await directusRequest<any[]>(
				`/items/project_events?filter=${encodeURIComponent(JSON.stringify({ project: { _in: projectIds } }))}&fields=id&limit=-1`,
			)
		: { ok: true, data: [] as any[] };
	const eventIds = (eventsRes.ok && Array.isArray(eventsRes.data) ? eventsRes.data : []).map((e: any) => e.id);

	const invoicesRes = await directusRequest<any[]>(
		`/items/invoices?filter=${encodeURIComponent(JSON.stringify({ bill_to: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const invoiceIds = (invoicesRes.ok && Array.isArray(invoicesRes.data) ? invoicesRes.data : []).map((i: any) => i.id);

	const leadsRes = await directusRequest<any[]>(
		`/items/leads?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const leadIds = (leadsRes.ok && Array.isArray(leadsRes.data) ? leadsRes.data : []).map((l: any) => l.id);

	const clientsRes = await directusRequest<any[]>(
		`/items/clients?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const clientIds = (clientsRes.ok && Array.isArray(clientsRes.data) ? clientsRes.data : []).map((c: any) => c.id);

	const ticketsRes = await directusRequest<any[]>(
		`/items/tickets?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const ticketIds = (ticketsRes.ok && Array.isArray(ticketsRes.data) ? ticketsRes.data : []).map((t: any) => t.id);

	const teamsRes = await directusRequest<any[]>(
		`/items/teams?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const teamIds = (teamsRes.ok && Array.isArray(teamsRes.data) ? teamsRes.data : []).map((t: any) => t.id);

	const channelsRes = await directusRequest<any[]>(
		`/items/channels?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const channelIds = (channelsRes.ok && Array.isArray(channelsRes.data) ? channelsRes.data : []).map((c: any) => c.id);

	const mailingListsRes = await directusRequest<any[]>(
		`/items/mailing_lists?filter=${encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }))}&fields=id&limit=-1`,
	);
	const mailingListIds = (mailingListsRes.ok && Array.isArray(mailingListsRes.data) ? mailingListsRes.data : []).map((m: any) => m.id);

	// Delete leaves first, then roots.
	if (eventIds.length) await deleteByFilter('project_tasks', { event_id: { _in: eventIds } }, 'id', 'project_tasks');
	if (invoiceIds.length) await deleteByFilter('line_items', { invoice_id: { _in: invoiceIds } }, 'id', 'line_items');
	if (invoiceIds.length) await deleteByFilter('invoices_projects', { invoices_id: { _in: invoiceIds } }, 'id', 'invoices_projects');
	if (invoiceIds.length) await deleteByFilter('invoices_products', { invoices_id: { _in: invoiceIds } }, 'id', 'invoices_products');
	if (invoiceIds.length) await deleteByFilter('payments_received', { invoice_id: { _in: invoiceIds } }, 'id', 'payments_received');
	if (invoiceIds.length) await deleteByFilter('project_events_invoices', { invoices_id: { _in: invoiceIds } }, 'id', 'project_events_invoices');

	if (projectIds.length) await deleteByFilter('project_events', { project: { _in: projectIds } }, 'id', 'project_events');
	if (projectIds.length) await deleteByFilter('projects_directus_users', { projects_id: { _in: projectIds } }, 'id', 'projects_directus_users');
	if (projectIds.length) await deleteByFilter('projects_files', { projects_id: { _in: projectIds } }, 'id', 'projects_files');
	if (projectIds.length) await deleteByFilter('invoices_projects', { projects_id: { _in: projectIds } }, 'id', 'invoices_projects');

	if (leadIds.length) await deleteByFilter('lead_activities', { lead: { _in: leadIds } }, 'id', 'lead_activities');
	if (ticketIds.length) await deleteByFilter('tickets_directus_users', { tickets_id: { _in: ticketIds } }, 'id', 'tickets_directus_users');
	if (ticketIds.length) await deleteByFilter('tickets_files', { tickets_id: { _in: ticketIds } }, 'id', 'tickets_files');
	if (teamIds.length) await deleteByFilter('team_goals', { team: { _in: teamIds } }, 'id', 'team_goals');
	if (teamIds.length) await deleteByFilter('junction_directus_users_teams', { teams_id: { _in: teamIds } }, 'id', 'junction_directus_users_teams');
	if (teamIds.length) await deleteByFilter('clients_teams', { teams_id: { _in: teamIds } }, 'id', 'clients_teams');
	if (channelIds.length) await deleteByFilter('messages', { channel: { _in: channelIds } }, 'id', 'messages');
	if (mailingListIds.length) await deleteByFilter('mailing_list_contacts', { list_id: { _in: mailingListIds } }, 'id', 'mailing_list_contacts');
	if (clientIds.length) await deleteByFilter('contact_connections', { client: { _in: clientIds } }, 'id', 'contact_connections');

	// Org-direct children
	await deleteByFilter('proposals', { organization: { _eq: orgId } }, 'id', 'proposals');
	await deleteByFilter('marketing_campaigns', { organization: { _eq: orgId } }, 'id', 'marketing_campaigns');
	await deleteByFilter('mailing_lists', { organization: { _eq: orgId } }, 'id', 'mailing_lists');
	await deleteByFilter('channels', { organization: { _eq: orgId } }, 'id', 'channels');
	await deleteByFilter('tickets', { organization: { _eq: orgId } }, 'id', 'tickets');
	await deleteByFilter('leads', { organization: { _eq: orgId } }, 'id', 'leads');
	await deleteByFilter('invoices', { bill_to: { _eq: orgId } }, 'id', 'invoices');
	await deleteByFilter('projects', { organization: { _eq: orgId } }, 'id', 'projects');
	await deleteByFilter('teams', { organization: { _eq: orgId } }, 'id', 'teams');
	await deleteByFilter('contacts_organizations', { organizations_id: { _eq: orgId } }, 'id', 'contacts_organizations');
	await deleteByFilter('clients', { organization: { _eq: orgId } }, 'id', 'clients');
	await deleteByFilter('org_memberships', { organization: { _eq: orgId } }, 'id', 'org_memberships');
	await deleteByFilter('organizations_directus_users', { organizations_id: { _eq: orgId } }, 'id', 'organizations_directus_users');
	await deleteByFilter('org_roles', { organization: { _eq: orgId } }, 'id', 'org_roles');

	// Finally the org itself
	const del = await directusRequest(`/items/organizations/${orgId}`, 'DELETE');
	if (!del.ok) {
		console.error(`  [fail] delete organization ${orgId}: ${del.error}`);
	} else {
		console.log(`  [ok]   organization ${orgId} deleted`);
	}
}

async function main() {
	for (const id of orgIds) {
		await purgeOrg(id);
	}
	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Purge failed:', err);
	process.exit(1);
});
