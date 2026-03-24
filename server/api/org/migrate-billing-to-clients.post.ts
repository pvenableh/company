// server/api/org/migrate-billing-to-clients.post.ts
/**
 * Billing migration: move billing data from organizations → clients → invoice snapshots.
 *
 * This script:
 * 1. For each invoice with bill_to but no client → matches a client by name and links it
 * 2. For each client that was migrated from an org → copies org billing fields to client
 * 3. For each invoice with a linked client → snapshots billing fields onto the invoice
 *
 * Body:
 *   organizationId: string   — The org whose invoices/clients to migrate
 *   dryRun?: boolean         — Preview changes without writing (default: true)
 *
 * Requires owner/admin role.
 *
 * New fields this migration expects to exist in Directus:
 *   clients:  billing_email, billing_name, billing_address, payment_terms
 *   invoices: billing_email, billing_name, billing_address
 *
 * Run the companion setup script first to create these fields in Directus.
 */

import { readItems, updateItem } from '@directus/sdk';

interface MigrationAction {
  type: 'link_client' | 'copy_billing_to_client' | 'snapshot_invoice';
  id: string;
  details: Record<string, any>;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId, dryRun = true } = body;

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  // Permission check
  await requireOrgPermission(event, organizationId, 'invoices', 'update');

  const directus = getTypedDirectus();

  const actions: MigrationAction[] = [];
  const warnings: string[] = [];
  const errors: { step: string; message: string }[] = [];

  try {
    // ── Step 1: Fetch all data we'll need ────────────────────────────────────
    const [clients, invoices] = await Promise.all([
      directus.request(
        readItems('clients', {
          filter: { organization: { _eq: organizationId } },
          fields: [
            'id', 'name', 'billing_email', 'billing_name', 'billing_address',
            'billing_contacts', 'primary_contact.id', 'primary_contact.email',
            'primary_contact.first_name', 'primary_contact.last_name',
          ],
          limit: -1,
        }),
      ) as Promise<any[]>,
      directus.request(
        readItems('invoices', {
          filter: {
            _or: [
              { bill_to: { _eq: organizationId } },
              { client: { organization: { _eq: organizationId } } },
            ],
          },
          fields: [
            'id', 'invoice_code', 'client', 'bill_to',
            'billing_email', 'billing_name', 'billing_address',
            'bill_to.id', 'bill_to.name', 'bill_to.email', 'bill_to.emails', 'bill_to.address',
            'client.id', 'client.name', 'client.billing_email', 'client.billing_name', 'client.billing_address',
            'client.billing_contacts', 'client.organization',
          ],
          limit: -1,
        }),
      ) as Promise<any[]>,
    ]);

    // Build client lookup by normalized name
    const clientsByName = new Map<string, any>();
    for (const client of clients) {
      const key = client.name?.toLowerCase().trim();
      if (key) clientsByName.set(key, client);
    }

    // Also fetch orgs that were bill_to targets, for billing data extraction
    const billToOrgIds = [...new Set(
      invoices
        .map(inv => typeof inv.bill_to === 'object' ? inv.bill_to?.id : inv.bill_to)
        .filter(Boolean),
    )];

    let orgsById = new Map<string, any>();
    if (billToOrgIds.length > 0) {
      const orgs = await directus.request(
        readItems('organizations', {
          filter: { id: { _in: billToOrgIds } },
          fields: ['id', 'name', 'email', 'emails', 'address', 'billing_contacts'],
          limit: -1,
        }),
      ) as any[];
      for (const org of orgs) {
        orgsById.set(org.id, org);
      }
    }

    // ── Step 2: Link unlinked invoices to clients ────────────────────────────
    for (const inv of invoices) {
      const clientId = typeof inv.client === 'object' ? inv.client?.id : inv.client;
      if (clientId) continue; // Already linked

      const billToOrg = typeof inv.bill_to === 'object' ? inv.bill_to : orgsById.get(inv.bill_to);
      if (!billToOrg?.name) {
        warnings.push(`Invoice ${inv.invoice_code || inv.id}: bill_to org has no name, cannot match`);
        continue;
      }

      const matchedClient = clientsByName.get(billToOrg.name.toLowerCase().trim());
      if (!matchedClient) {
        warnings.push(`Invoice ${inv.invoice_code || inv.id}: no client matches bill_to org "${billToOrg.name}"`);
        continue;
      }

      actions.push({
        type: 'link_client',
        id: inv.id,
        details: {
          invoiceCode: inv.invoice_code,
          billToOrg: billToOrg.name,
          matchedClient: matchedClient.name,
          matchedClientId: matchedClient.id,
        },
      });

      if (!dryRun) {
        try {
          await directus.request(updateItem('invoices', inv.id, { client: matchedClient.id }));
        } catch (err: any) {
          errors.push({ step: `link_client:${inv.id}`, message: err.message });
        }
      }

      // Update in-memory for subsequent steps
      inv.client = matchedClient;
    }

    // ── Step 3: Copy org billing data to clients (if client is missing it) ───
    const processedClientIds = new Set<string>();
    for (const inv of invoices) {
      const client = typeof inv.client === 'object' ? inv.client : clients.find(c => c.id === inv.client);
      if (!client || processedClientIds.has(client.id)) continue;
      processedClientIds.add(client.id);

      // Skip if client already has billing_email populated
      if (client.billing_email) continue;

      const billToOrg = typeof inv.bill_to === 'object' ? inv.bill_to : orgsById.get(inv.bill_to);
      if (!billToOrg) continue;

      // Resolve the best email: billing_contacts[0] → org.emails[0] → org.email
      const orgBillingContacts = billToOrg.billing_contacts;
      let billingEmail: string | null = null;
      let billingName: string | null = null;

      if (Array.isArray(orgBillingContacts) && orgBillingContacts.length > 0) {
        billingEmail = orgBillingContacts[0].email || null;
        billingName = orgBillingContacts[0].name || null;
      }

      if (!billingEmail && Array.isArray(billToOrg.emails) && billToOrg.emails.length > 0) {
        billingEmail = billToOrg.emails[0];
      }

      if (!billingEmail && billToOrg.email) {
        billingEmail = billToOrg.email;
      }

      // Also try the client's own billing_contacts JSON (the old format)
      if (!billingEmail && Array.isArray(client.billing_contacts) && client.billing_contacts.length > 0) {
        billingEmail = client.billing_contacts[0].email || null;
        billingName = billingName || client.billing_contacts[0].name || null;
      }

      const billingAddress = billToOrg.address || null;

      if (!billingEmail && !billingAddress) continue;

      const update: Record<string, any> = {};
      if (billingEmail) update.billing_email = billingEmail;
      if (billingName) update.billing_name = billingName;
      if (billingAddress) update.billing_address = billingAddress;

      actions.push({
        type: 'copy_billing_to_client',
        id: client.id,
        details: {
          clientName: client.name,
          source: billToOrg.name,
          ...update,
        },
      });

      if (!dryRun) {
        try {
          await directus.request(updateItem('clients', client.id, update));
          // Update in-memory
          Object.assign(client, update);
        } catch (err: any) {
          errors.push({ step: `copy_billing:${client.id}`, message: err.message });
        }
      }
    }

    // ── Step 4: Snapshot billing fields onto invoices ─────────────────────────
    for (const inv of invoices) {
      // Skip if invoice already has a billing snapshot
      if (inv.billing_email) continue;

      const client = typeof inv.client === 'object' ? inv.client : clients.find(c => c.id === inv.client);
      const billToOrg = typeof inv.bill_to === 'object' ? inv.bill_to : orgsById.get(inv.bill_to);

      // Resolve billing fields: prefer client, fall back to org
      let billingEmail: string | null = null;
      let billingName: string | null = null;
      let billingAddress: string | null = null;

      if (client) {
        billingEmail = client.billing_email || null;
        billingName = client.billing_name || client.name || null;
        billingAddress = client.billing_address || null;

        // Fallback to billing_contacts JSON
        if (!billingEmail && Array.isArray(client.billing_contacts) && client.billing_contacts.length > 0) {
          billingEmail = client.billing_contacts[0].email || null;
          billingName = billingName || client.billing_contacts[0].name || null;
        }
      }

      if (!billingEmail && billToOrg) {
        if (Array.isArray(billToOrg.emails) && billToOrg.emails.length > 0) {
          billingEmail = billToOrg.emails[0];
        } else if (billToOrg.email) {
          billingEmail = billToOrg.email;
        }
        billingName = billingName || billToOrg.name || null;
        billingAddress = billingAddress || billToOrg.address || null;
      }

      if (!billingEmail && !billingName && !billingAddress) continue;

      const update: Record<string, any> = {};
      if (billingEmail) update.billing_email = billingEmail;
      if (billingName) update.billing_name = billingName;
      if (billingAddress) update.billing_address = billingAddress;

      actions.push({
        type: 'snapshot_invoice',
        id: inv.id,
        details: {
          invoiceCode: inv.invoice_code,
          ...update,
        },
      });

      if (!dryRun) {
        try {
          await directus.request(updateItem('invoices', inv.id, update));
        } catch (err: any) {
          errors.push({ step: `snapshot:${inv.id}`, message: err.message });
        }
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const linked = actions.filter(a => a.type === 'link_client').length;
    const copied = actions.filter(a => a.type === 'copy_billing_to_client').length;
    const snapshotted = actions.filter(a => a.type === 'snapshot_invoice').length;

    return {
      dryRun,
      message: dryRun
        ? `Dry run complete. ${linked} invoices to link, ${copied} clients to update, ${snapshotted} invoices to snapshot. Set dryRun: false to execute.`
        : `Migration complete. ${linked} invoices linked, ${copied} clients updated, ${snapshotted} invoices snapshotted.`,
      summary: {
        totalInvoices: invoices.length,
        totalClients: clients.length,
        invoicesLinked: linked,
        clientBillingCopied: copied,
        invoicesSnapshotted: snapshotted,
      },
      actions,
      warnings,
      errors,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[migrate-billing-to-clients] Error:', error);
    throw createError({
      statusCode: 500,
      message: error.message || 'Billing migration failed',
    });
  }
});
