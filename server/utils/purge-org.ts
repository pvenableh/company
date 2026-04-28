/**
 * Server-side cascade-purge for an organization. Mirrors the manual
 * `scripts/purge-demo-org.ts` walk but is callable from request handlers
 * (Vercel Cron, Directus Flow, admin UI) without spawning a child process.
 *
 * Deletes leaf-first because most child FKs are NOT NULL without cascade.
 * Returns a per-collection count so the caller can log/audit the run.
 *
 * Caller is responsible for ALL authorisation. This is a destructive op
 * with no further safeguards.
 */
import {
  readItems,
  deleteItem,
  deleteItems,
} from '@directus/sdk';

export interface PurgeReport {
  orgId: string;
  totals: Record<string, number>;
  orgDeleted: boolean;
  errors: string[];
}

async function deleteByFilter(
  directus: any,
  collection: string,
  filter: Record<string, any>,
  report: PurgeReport,
): Promise<number> {
  try {
    const rows = await directus.request(
      readItems(collection, { filter, fields: ['id'], limit: -1 }),
    ) as Array<{ id: any }>;
    const ids = (rows || []).map((r) => r.id).filter((v) => v != null);
    if (ids.length === 0) return 0;
    await directus.request(deleteItems(collection, ids as any));
    report.totals[collection] = (report.totals[collection] || 0) + ids.length;
    return ids.length;
  } catch (err: any) {
    const msg = `delete ${collection}: ${err?.message || err}`;
    report.errors.push(msg);
    console.error(`[purge-org] ${msg}`);
    return 0;
  }
}

async function listIds(directus: any, collection: string, filter: any): Promise<any[]> {
  try {
    const rows = await directus.request(
      readItems(collection, { filter, fields: ['id'], limit: -1 }),
    ) as Array<{ id: any }>;
    return (rows || []).map((r) => r.id).filter((v) => v != null);
  } catch {
    return [];
  }
}

export async function purgeOrganization(orgId: string): Promise<PurgeReport> {
  const directus = getTypedDirectus();
  const report: PurgeReport = { orgId, totals: {}, orgDeleted: false, errors: [] };

  // Discover IDs in scope first so we can chase grandchildren.
  const projectIds = await listIds(directus, 'projects', { organization: { _eq: orgId } });
  const eventIds = projectIds.length
    ? await listIds(directus, 'project_events', { project: { _in: projectIds } })
    : [];
  const invoiceIds = await listIds(directus, 'invoices', { bill_to: { _eq: orgId } });
  const leadIds = await listIds(directus, 'leads', { organization: { _eq: orgId } });
  const clientIds = await listIds(directus, 'clients', { organization: { _eq: orgId } });
  const ticketIds = await listIds(directus, 'tickets', { organization: { _eq: orgId } });
  const teamIds = await listIds(directus, 'teams', { organization: { _eq: orgId } });
  const channelIds = await listIds(directus, 'channels', { organization: { _eq: orgId } });
  const mailingListIds = await listIds(directus, 'mailing_lists', { organization: { _eq: orgId } });

  // Leaf-first deletes
  if (eventIds.length) await deleteByFilter(directus, 'project_tasks', { event_id: { _in: eventIds } }, report);
  if (invoiceIds.length) {
    await deleteByFilter(directus, 'line_items', { invoice_id: { _in: invoiceIds } }, report);
    await deleteByFilter(directus, 'invoices_projects', { invoices_id: { _in: invoiceIds } }, report);
    await deleteByFilter(directus, 'invoices_products', { invoices_id: { _in: invoiceIds } }, report);
    await deleteByFilter(directus, 'payments_received', { invoice_id: { _in: invoiceIds } }, report);
    await deleteByFilter(directus, 'project_events_invoices', { invoices_id: { _in: invoiceIds } }, report);
  }
  if (projectIds.length) {
    await deleteByFilter(directus, 'project_events', { project: { _in: projectIds } }, report);
    await deleteByFilter(directus, 'projects_directus_users', { projects_id: { _in: projectIds } }, report);
    await deleteByFilter(directus, 'projects_files', { projects_id: { _in: projectIds } }, report);
    await deleteByFilter(directus, 'invoices_projects', { projects_id: { _in: projectIds } }, report);
  }
  if (leadIds.length) await deleteByFilter(directus, 'lead_activities', { lead: { _in: leadIds } }, report);
  if (ticketIds.length) {
    await deleteByFilter(directus, 'tickets_directus_users', { tickets_id: { _in: ticketIds } }, report);
    await deleteByFilter(directus, 'tickets_files', { tickets_id: { _in: ticketIds } }, report);
  }
  if (teamIds.length) {
    await deleteByFilter(directus, 'team_goals', { team: { _in: teamIds } }, report);
    await deleteByFilter(directus, 'junction_directus_users_teams', { teams_id: { _in: teamIds } }, report);
    await deleteByFilter(directus, 'clients_teams', { teams_id: { _in: teamIds } }, report);
  }
  if (channelIds.length) await deleteByFilter(directus, 'messages', { channel: { _in: channelIds } }, report);
  if (mailingListIds.length) await deleteByFilter(directus, 'mailing_list_contacts', { list_id: { _in: mailingListIds } }, report);
  if (clientIds.length) await deleteByFilter(directus, 'contact_connections', { client: { _in: clientIds } }, report);

  // Org-direct children
  await deleteByFilter(directus, 'proposals', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'marketing_campaigns', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'mailing_lists', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'channels', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'tickets', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'leads', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'invoices', { bill_to: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'projects', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'teams', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'contacts_organizations', { organizations_id: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'clients', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'org_memberships', { organization: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'organizations_directus_users', { organizations_id: { _eq: orgId } }, report);
  await deleteByFilter(directus, 'org_roles', { organization: { _eq: orgId } }, report);

  // Finally the org itself
  try {
    await directus.request(deleteItem('organizations', orgId));
    report.orgDeleted = true;
  } catch (err: any) {
    const msg = `delete organization ${orgId}: ${err?.message || err}`;
    report.errors.push(msg);
    console.error(`[purge-org] ${msg}`);
  }

  return report;
}
