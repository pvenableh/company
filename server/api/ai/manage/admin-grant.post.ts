/**
 * Directus-admin-only: grant comp tokens to an org's prepaid balance.
 *
 * Bypasses Stripe — used by the founding team to top up their own/staff orgs
 * at Anthropic cost rather than the customer-facing markup. Increments
 * `ai_token_balance` by the grant amount.
 *
 * Body: { organizationId: string, tokens: number, note?: string }
 */
import { readItem, updateItem } from '@directus/sdk';

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const directus = getTypedDirectus();

  // Verify caller is a Directus system admin (not just an org admin).
  const caller = await directus.request(
    readItem('directus_users', userId, { fields: ['id', 'email', 'role'] }),
  ).catch(() => null) as any;

  const callerRoleId = typeof caller?.role === 'object' ? caller.role?.id : caller?.role;
  if (callerRoleId !== ADMIN_ROLE_ID) {
    throw createError({ statusCode: 403, message: 'Directus system admin required' });
  }

  const body = await readBody(event);
  const { organizationId, tokens, note } = body || {};

  if (!organizationId || typeof organizationId !== 'string') {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }
  const grant = Number(tokens);
  if (!Number.isFinite(grant) || grant <= 0) {
    throw createError({ statusCode: 400, message: 'tokens must be a positive number' });
  }
  if (grant > 50_000_000) {
    throw createError({ statusCode: 400, message: 'Single grant capped at 50M tokens — use the database for larger amounts' });
  }

  const org = await directus.request(
    readItem('organizations', organizationId, { fields: ['id', 'name', 'ai_token_balance'] }),
  ) as any;

  const currentBalance = Number(org?.ai_token_balance) || 0;
  const newBalance = currentBalance + grant;

  await directus.request(
    updateItem('organizations', organizationId, { ai_token_balance: newBalance }),
  );

  console.log(
    `[admin-grant] ${caller.email} granted ${grant.toLocaleString()} tokens to "${org.name}" (${currentBalance.toLocaleString()} → ${newBalance.toLocaleString()})${note ? ` — ${note}` : ''}`,
  );

  return {
    success: true,
    organizationId,
    granted: grant,
    previousBalance: currentBalance,
    newBalance,
  };
});
