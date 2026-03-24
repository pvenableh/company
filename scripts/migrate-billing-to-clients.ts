#!/usr/bin/env npx tsx
/**
 * Billing migration: move billing data from organizations → clients → invoice snapshots.
 *
 * Usage:
 *   npx tsx scripts/migrate-billing-to-clients.ts <organizationId> [--execute]
 *
 * Without --execute, runs in dry-run mode (no writes).
 * Reads DIRECTUS_URL and DIRECTUS_SERVER_TOKEN from .env (or environment).
 */

import { createDirectus, rest, authentication, readItems, updateItem } from '@directus/sdk';
import { config } from 'dotenv';

config(); // load .env

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.huestudios.company';
const DIRECTUS_SERVER_TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!DIRECTUS_SERVER_TOKEN) {
  console.error('ERROR: DIRECTUS_SERVER_TOKEN is not set. Add it to your .env file.');
  process.exit(1);
}

const organizationId = process.argv[2];
const dryRun = !process.argv.includes('--execute');

if (!organizationId) {
  console.error('Usage: npx tsx scripts/migrate-billing-to-clients.ts <organizationId> [--execute]');
  process.exit(1);
}

const directus = createDirectus(DIRECTUS_URL).with(rest()).with(authentication('json'));
directus.setToken(DIRECTUS_SERVER_TOKEN);

interface MigrationAction {
  type: 'link_client' | 'copy_billing_to_client' | 'snapshot_invoice';
  id: string;
  details: Record<string, any>;
}

async function run() {
  console.log(`\n=== Billing Migration ===`);
  console.log(`Organization: ${organizationId}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'EXECUTE (will write!)'}\n`);

  const actions: MigrationAction[] = [];
  const warnings: string[] = [];
  const errors: { step: string; message: string }[] = [];

  // ── Step 1: Fetch all data ─────────────────────────────────────────────
  console.log('Fetching clients and invoices...');

  const [clients, invoices] = await Promise.all([
    directus.request(
      readItems('clients' as any, {
        filter: { organization: { _eq: organizationId } },
        fields: [
          'id', 'name', 'billing_email', 'billing_name', 'billing_address',
          'billing_contacts', 'primary_contact.id', 'primary_contact.email',
          'primary_contact.first_name', 'primary_contact.last_name',
        ],
        limit: -1,
      }),
    ) as any as any[],
    directus.request(
      readItems('invoices' as any, {
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
    ) as any as any[],
  ]);

  console.log(`Found ${clients.length} clients, ${invoices.length} invoices.`);

  // Build client lookup by normalized name
  const clientsByName = new Map<string, any>();
  for (const client of clients) {
    const key = client.name?.toLowerCase().trim();
    if (key) clientsByName.set(key, client);
  }

  // Fetch orgs that were bill_to targets
  const billToOrgIds = [...new Set(
    invoices
      .map(inv => typeof inv.bill_to === 'object' ? inv.bill_to?.id : inv.bill_to)
      .filter(Boolean),
  )];

  const orgsById = new Map<string, any>();
  if (billToOrgIds.length > 0) {
    const orgs = await directus.request(
      readItems('organizations' as any, {
        filter: { id: { _in: billToOrgIds } },
        fields: ['id', 'name', 'email', 'emails', 'address', 'billing_contacts'],
        limit: -1,
      }),
    ) as any as any[];
    for (const org of orgs) {
      orgsById.set(org.id, org);
    }
  }

  // ── Step 2: Link unlinked invoices to clients ──────────────────────────
  console.log('\nStep 2: Linking invoices to clients...');
  for (const inv of invoices) {
    const clientId = typeof inv.client === 'object' ? inv.client?.id : inv.client;
    if (clientId) continue;

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
        await directus.request(updateItem('invoices' as any, inv.id, { client: matchedClient.id }));
      } catch (err: any) {
        errors.push({ step: `link_client:${inv.id}`, message: err.message });
      }
    }

    inv.client = matchedClient;
  }

  // ── Step 3: Copy org billing data to clients ───────────────────────────
  console.log('Step 3: Copying org billing data to clients...');
  const processedClientIds = new Set<string>();
  for (const inv of invoices) {
    const client = typeof inv.client === 'object' ? inv.client : clients.find(c => c.id === inv.client);
    if (!client || processedClientIds.has(client.id)) continue;
    processedClientIds.add(client.id);

    if (client.billing_email) continue;

    const billToOrg = typeof inv.bill_to === 'object' ? inv.bill_to : orgsById.get(inv.bill_to);
    if (!billToOrg) continue;

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
      details: { clientName: client.name, source: billToOrg.name, ...update },
    });

    if (!dryRun) {
      try {
        await directus.request(updateItem('clients' as any, client.id, update));
        Object.assign(client, update);
      } catch (err: any) {
        errors.push({ step: `copy_billing:${client.id}`, message: err.message });
      }
    }
  }

  // ── Step 4: Snapshot billing fields onto invoices ──────────────────────
  console.log('Step 4: Snapshotting billing fields onto invoices...');
  for (const inv of invoices) {
    if (inv.billing_email) continue;

    const client = typeof inv.client === 'object' ? inv.client : clients.find(c => c.id === inv.client);
    const billToOrg = typeof inv.bill_to === 'object' ? inv.bill_to : orgsById.get(inv.bill_to);

    let billingEmail: string | null = null;
    let billingName: string | null = null;
    let billingAddress: string | null = null;

    if (client) {
      billingEmail = client.billing_email || null;
      billingName = client.billing_name || client.name || null;
      billingAddress = client.billing_address || null;

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
      details: { invoiceCode: inv.invoice_code, ...update },
    });

    if (!dryRun) {
      try {
        await directus.request(updateItem('invoices' as any, inv.id, update));
      } catch (err: any) {
        errors.push({ step: `snapshot:${inv.id}`, message: err.message });
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const linked = actions.filter(a => a.type === 'link_client').length;
  const copied = actions.filter(a => a.type === 'copy_billing_to_client').length;
  const snapshotted = actions.filter(a => a.type === 'snapshot_invoice').length;

  console.log('\n=== Summary ===');
  console.log(`Total invoices: ${invoices.length}`);
  console.log(`Total clients:  ${clients.length}`);
  console.log(`Invoices to link:     ${linked}`);
  console.log(`Clients to update:    ${copied}`);
  console.log(`Invoices to snapshot: ${snapshotted}`);

  if (warnings.length > 0) {
    console.log(`\n⚠ Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (errors.length > 0) {
    console.log(`\n✗ Errors (${errors.length}):`);
    for (const e of errors) console.log(`  - [${e.step}] ${e.message}`);
  }

  if (dryRun) {
    console.log('\nThis was a DRY RUN. Re-run with --execute to apply changes.');
  } else {
    console.log('\nMigration complete.');
  }

  // Print detailed actions
  if (actions.length > 0) {
    console.log('\n=== Actions ===');
    for (const a of actions) {
      console.log(`  [${a.type}] ${a.id}:`, JSON.stringify(a.details));
    }
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});