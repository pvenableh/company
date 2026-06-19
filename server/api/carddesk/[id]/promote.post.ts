/**
 * Promote a cd_contact into the org's CRM.
 *
 * Bridges a user-scoped Card Desk card into the org's Earnest CRM by:
 *   1. Insert/lookup the contacts row (action='create' inserts + junction;
 *      action='link' uses an existing one).
 *   2. Set cd_contacts.promoted_contact = contact.id (the FK that flips the
 *      Card Desk dashboard CTA into the "In Earnest CRM" badge and the
 *      Earnest-side "Sourced via Card Desk" chip).
 *   3. If open_lead && rating supports a stage, insert a leads row with
 *      lead_score derived from rating (hot=75, warm=50, nurture=25).
 *   4. Log a cd_activities row of type 'promoted_to_earnest' for the
 *      timeline + XP attribution.
 *   5. Bump cd_xp_state.total_xp (50 base + 50 if a Lead was opened).
 *
 * Failures after the contacts row is created are logged but not rolled back —
 * an orphan contact is recoverable; throwing here loses the FK link.
 *
 * Body:
 *   action: 'create' | 'link'
 *   existing_contact_id?: string  (required when action='link')
 *   open_lead?: boolean           (default true; ignored if rating is cold/null)
 *   org_id: string
 */
import { createItem, readItem, readItems, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { generateUnsubscribeToken } from '~~/server/utils/unsubscribe';

interface Body {
  action: 'create' | 'link';
  existing_contact_id?: string;
  open_lead?: boolean;
  org_id: string;
  /**
   * What this card is being converted into:
   *   'contact' (default) — rolodex contact (+ optional lead)
   *   'client' | 'partner' — also create an Earnest CRM Client account and
   *     flag the card as graduated. Mirrors CardDesk's own graduate flow.
   */
  goal?: 'contact' | 'client' | 'partner';
  conversion_reason?: string;
  conversion_note?: string;
  estimated_value?: number | null;
}

const STAGE_FROM_RATING: Record<string, string> = {
  hot: 'qualified',
  warm: 'contacted',
  nurture: 'new',
};

const LEAD_SCORE_FROM_RATING: Record<string, number> = {
  hot: 75,
  warm: 50,
  nurture: 25,
};

export default defineEventHandler(async (event) => {
  const cdContactId = getRouterParam(event, 'id');
  if (!cdContactId) throw createError({ statusCode: 400, message: 'cd_contact id required' });

  const body = await readBody<Body>(event);
  if (!body?.org_id) throw createError({ statusCode: 400, message: 'org_id required' });
  if (body.action !== 'create' && body.action !== 'link') {
    throw createError({ statusCode: 400, message: 'action must be "create" or "link"' });
  }
  if (body.action === 'link' && !body.existing_contact_id) {
    throw createError({ statusCode: 400, message: 'existing_contact_id required for link action' });
  }

  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  await requireOrgMembership(event, body.org_id);

  const wantsClient = body.goal === 'client' || body.goal === 'partner';

  const directus = getTypedDirectus();
  const cd: any = await directus.request(
    readItem('cd_contacts', cdContactId, {
      fields: [
        'id', 'name', 'first_name', 'last_name', 'email', 'phone', 'company', 'title',
        'rating', 'user_created', 'promoted_contact', 'industry', 'location',
        'estimated_value', 'is_client', 'is_partner', 'earnest_client_id',
      ],
    }),
  );

  if (!cd) throw createError({ statusCode: 404, message: 'cd_contact not found' });
  if (cd.user_created !== userId) throw createError({ statusCode: 403, message: 'Not your cd_contact' });

  // Already promoted to a contact AND no further client/partner conversion is
  // being requested (or it's already done)? Short-circuit with the existing
  // link so the modal can render the "already in Earnest" state idempotently.
  // When a client/partner conversion IS requested and not yet done, we fall
  // through and reuse the existing contact to graduate it.
  if (cd.promoted_contact && (!wantsClient || cd.earnest_client_id)) {
    const existing: any = await directus.request(
      readItem('contacts', cd.promoted_contact, {
        fields: ['id', 'first_name', 'last_name', 'email', 'company', 'title'],
      }),
    );
    return {
      contact: existing,
      lead: null,
      client: null,
      alreadyExisted: true,
      xpEarned: 0,
    };
  }

  // ── 1. Insert or lookup the contacts row ────────────────────────────────
  let contact: any;
  let contactWasCreated = false;

  if (cd.promoted_contact) {
    // Card already has a CRM contact — reuse it to graduate to a client/partner.
    contact = await directus.request(
      readItem('contacts', cd.promoted_contact, {
        fields: ['id', 'first_name', 'last_name', 'email', 'company', 'title'],
      }),
    );
    if (!contact) throw createError({ statusCode: 404, message: 'linked contact no longer exists' });
  } else if (body.action === 'link') {
    // Verify the existing contact actually belongs to this org — otherwise
    // a malicious caller could link a cd_contact to any contact ID they
    // could guess.
    const linked: any[] = await directus.request(
      readItems('contacts', {
        fields: ['id', 'first_name', 'last_name', 'email', 'company', 'title'],
        filter: {
          _and: [
            { id: { _eq: body.existing_contact_id! } },
            { organizations: { organizations_id: { _eq: body.org_id } } },
          ],
        },
        limit: 1,
      }),
    );
    contact = linked[0];
    if (!contact) throw createError({ statusCode: 404, message: 'existing_contact_id not found in this org' });
  } else {
    // Email-dup guard: prevents two users from independently promoting cd_contacts
    // with the same email into separate contact rows. The preview route shows a
    // match prompt but a stale or skipped preview would otherwise still race
    // here.
    const cdEmail = (cd.email || '').trim().toLowerCase();
    if (cdEmail) {
      const dupes: any[] = await directus.request(
        readItems('contacts', {
          fields: ['id', 'first_name', 'last_name', 'email', 'company', 'title'],
          filter: {
            _and: [
              { email: { _eq: cdEmail } },
              { organizations: { organizations_id: { _eq: body.org_id } } },
            ],
          },
          sort: ['-date_updated'],
          limit: 1,
        }),
      );
      if (dupes[0]) {
        throw createError({
          statusCode: 409,
          message: `A contact with email "${cdEmail}" already exists in this org. Re-open the promote modal to link it instead, or change the Card Desk email if this is a different person.`,
          data: { existingContact: dupes[0] },
        });
      }
    }

    const firstName = cd.first_name || (cd.name?.split(' ')[0] ?? 'Unknown');
    const lastName = cd.last_name || (cd.name?.split(' ').slice(1).join(' ') ?? '');
    contact = await directus.request(
      createItem('contacts', {
        first_name: firstName,
        last_name: lastName,
        email: cd.email || null,
        phone: cd.phone || null,
        company: cd.company || null,
        title: cd.title || null,
        source: 'carddesk',
        status: 'published',
        email_subscribed: true,
        unsubscribe_token: generateUnsubscribeToken(),
      }),
    );
    contactWasCreated = true;
    // M2M junction — a contacts row with no junction is invisible to every
    // tenant query and effectively orphaned.
    await directus.request(
      createItem('contacts_organizations', {
        contacts_id: contact.id,
        organizations_id: body.org_id,
      }),
    );
  }

  // ── 2-5. Best-effort link + lead + activity + XP ────────────────────────
  // Anything after the contact insert can be retried by re-running the
  // promote action (the cd_contacts.promoted_contact check up top makes
  // it idempotent). Failures here log loudly but don't roll back the
  // contact create.
  let lead: any = null;
  let client: any = null;
  let xpEarned = 0;
  let linkSucceeded = !!cd.promoted_contact;

  if (!cd.promoted_contact) {
    try {
      await directus.request(
        updateItem('cd_contacts', cdContactId, { promoted_contact: contact.id }),
      );
      linkSucceeded = true;
    } catch (e: any) {
      console.error('[promote] failed to set cd_contacts.promoted_contact', {
        cdContactId, contactId: contact.id, contactWasCreated, error: e?.message,
      });
    }
  }

  const wantsLead = body.open_lead !== false && cd.rating && STAGE_FROM_RATING[cd.rating];
  if (wantsLead) {
    try {
      lead = await directus.request(
        createItem('leads', {
          name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() + ' (Card Desk)',
          stage: STAGE_FROM_RATING[cd.rating],
          related_contact: contact.id,
          assigned_to: userId,
          organization: body.org_id,
          lead_score: LEAD_SCORE_FROM_RATING[cd.rating] || 25,
        }),
      );
    } catch (e: any) {
      console.error('[promote] failed to create lead', {
        cdContactId, contactId: contact.id, rating: cd.rating, error: e?.message,
      });
    }
  }

  // ── Client / Partner graduation ─────────────────────────────────────────
  // When the card is graduating to a client (or partner), spin up an Earnest
  // CRM Client account anchored to this contact, and flag the card so the
  // dashboard reflects the graduation. Idempotent on earnest_client_id.
  if (wantsClient && !cd.earnest_client_id) {
    const clientName =
      cd.company?.trim() ||
      `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
      cd.name?.trim() ||
      'New Client';
    const noteParts = [
      `Converted from Card Desk${body.conversion_reason ? ` — ${body.conversion_reason}` : ''}.`,
      body.conversion_note || '',
    ].filter(Boolean);
    try {
      client = await directus.request(
        createItem('clients', {
          name: clientName,
          organization: body.org_id,
          primary_contact: contact.id,
          industry: cd.industry || null,
          location: cd.location || null,
          notes: noteParts.join(' ').trim() || null,
          // status omitted — clients.status enum differs from other collections
          // (migrate-orgs-to-clients uses 'active'); let Directus apply its default.
        }),
      );
    } catch (e: any) {
      console.error('[promote] failed to create client', {
        cdContactId, contactId: contact.id, error: e?.message,
      });
    }

    // Flag the card as graduated, idempotently. Best-effort.
    const nowIso = new Date().toISOString();
    const cdPatch: Record<string, any> = client ? { earnest_client_id: client.id } : {};
    if (body.goal === 'partner') {
      cdPatch.is_partner = true;
      cdPatch.partner_at = nowIso;
    } else {
      cdPatch.is_client = true;
      cdPatch.client_at = nowIso;
    }
    if (body.estimated_value != null) cdPatch.estimated_value = body.estimated_value;
    if (Object.keys(cdPatch).length) {
      try {
        await directus.request(updateItem('cd_contacts', cdContactId, cdPatch));
      } catch (e: any) {
        console.error('[promote] failed to stamp client graduation on cd_contact', {
          cdContactId, error: e?.message,
        });
      }
    }
  }

  // Activity log. cd_activities now supports lifecycle types (converted_client/
  // converted_partner); fall back to the legacy 'other' for plain contact
  // promotion. The label is what readers see in the timeline.
  const activityType = client
    ? body.goal === 'partner'
      ? 'converted_partner'
      : 'converted_client'
    : 'promoted_to_earnest';
  const activityLabel = client
    ? body.goal === 'partner'
      ? 'Converted to Partner in Earnest'
      : 'Converted to Client in Earnest'
    : 'Promoted to Earnest CRM';
  try {
    await directus.request(
      createItem('cd_activities', {
        contact: cdContactId,
        type: activityType,
        label: activityLabel,
        note: client
          ? body.conversion_reason || (lead ? `Opened a ${lead.stage} lead.` : null)
          : lead
            ? `Opened a ${lead.stage} lead.`
            : null,
        date: new Date().toISOString(),
        user_created: userId,
      }),
    );
  } catch (e: any) {
    console.error('[promote] failed to log cd_activity', { cdContactId, error: e?.message });
  }

  // XP: 50 base for the contact link, +50 for a lead, +100 for a client/partner.
  xpEarned = (cd.promoted_contact ? 0 : 50) + (lead ? 50 : 0) + (client ? 100 : 0);
  try {
    await bumpXp(directus, userId, xpEarned);
  } catch (e: any) {
    console.error('[promote] failed to bump XP', { cdContactId, userId, xpEarned, error: e?.message });
  }

  return {
    contact,
    lead: lead
      ? { id: lead.id, name: lead.name, stage: lead.stage, related_contact: contact.id }
      : null,
    client: client
      ? { id: client.id, name: client.name, goal: body.goal || 'client' }
      : null,
    alreadyExisted: body.action === 'link' && !cd.promoted_contact ? true : !!cd.promoted_contact,
    xpEarned,
    linkSucceeded,
  };
});

async function bumpXp(directus: any, userId: string, delta: number) {
  if (!delta) return;
  const rows: any[] = await directus.request(
    readItems('cd_xp_state', {
      fields: ['id', 'total_xp'],
      filter: { user_created: { _eq: userId } },
      limit: 1,
    }),
  );
  if (rows.length === 0) {
    await directus.request(
      createItem('cd_xp_state', {
        total_xp: delta,
        last_activity_date: new Date().toISOString(),
        user_created: userId,
      }),
    );
    return;
  }
  const row = rows[0];
  await directus.request(
    updateItem('cd_xp_state', row.id, {
      total_xp: (row.total_xp || 0) + delta,
      last_activity_date: new Date().toISOString(),
    }),
  );
}
