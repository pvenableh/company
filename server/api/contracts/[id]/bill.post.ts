/**
 * "Bill this contract" — the deterministic contract→invoice rail (mirror of the
 * proposal→contract rail in contracts/from-proposal). One button on a SIGNED
 * contract queues a create_invoice AI action pre-filled from the contract
 * (client + total_value → a single line item).
 *
 * DECISION (flagged for Peter, built as recommended): this routes through the
 * create_invoice ai_action rather than writing an invoice directly, so the
 * result keeps the AI-action audit trail + undo (see project_ai_action_layer_
 * phases) and reuses the exact contract-resolution + org-verification already in
 * proposeCreateInvoice — no invoice is created until a human approves the pending
 * proposal in the AI Activity queue. To switch to a raw immediate write instead,
 * replace the proposeToolCall call with a direct createInvoice + return the id.
 *
 * Why a server route: reads the contract with the admin client (contract read
 * perms are FK-walked) then gates on requireOrgMembership, the same pattern as
 * from-proposal / marketing-campaigns.
 */
import { readItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { proposeToolCall } from '~~/server/utils/llm/tool-proposals';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Contract id is required' });

  const directus = getTypedDirectus();
  const contract = (await directus
    .request(readItem('contracts' as any, id, { fields: ['id', 'contract_status', 'organization', 'client', 'total_value'] as any }))
    .catch(() => null)) as any;
  if (!contract) throw createError({ statusCode: 404, message: 'Contract not found' });

  const orgId = typeof contract.organization === 'object' ? contract.organization?.id : contract.organization;
  if (!orgId) throw createError({ statusCode: 422, message: 'Contract has no organization' });
  await requireOrgMembership(event, orgId);

  if (contract.contract_status !== 'signed') {
    throw createError({ statusCode: 409, message: 'Only a signed contract can be billed.' });
  }

  // Reuse the create_invoice proposal path verbatim: from_contract_id makes it
  // pull the contract's client + total_value and seed a line item, then queue a
  // pending create_invoice ai_action (audit + undo preserved).
  const result = await proposeToolCall(
    'create_invoice',
    { from_contract_id: String(contract.id) },
    { organizationId: String(orgId), userId: String(userId), entityType: 'contracts', entityId: String(contract.id) },
  );

  if (!result.success) {
    // Surface the human-readable reason (e.g. contract has no client / no value).
    throw createError({ statusCode: 422, message: result.error || 'Could not draft an invoice from this contract.' });
  }

  return {
    actionId: (result.data as any)?.actionId ?? null,
    status: 'pending',
    summary: result.summary,
  };
});
