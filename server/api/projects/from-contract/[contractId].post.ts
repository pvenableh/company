/**
 * Convert a contract into a project. Creates the project (client, value, org
 * from the contract), back-links `contract.project`, and seeds project_events
 * from the contract's scope phases (the scope_tree block) as a starting
 * milestone timeline. Mirrors the from-proposal→contract pattern (admin token +
 * requireOrgMembership, because Directus-11 doesn't FK-walk create filters).
 *
 * Additive: nothing about existing contract/project flows changes — this just
 * adds the "make a project out of this signed deal" step.
 */
import { readItem, createItem, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

// Days between seeded milestones when the scope has no explicit dates.
const PHASE_STAGGER_DAYS = 14;

export default defineEventHandler(async (event) => {
  const contractId = getRouterParam(event, 'contractId');
  if (!contractId) throw createError({ statusCode: 400, message: 'contractId required' });

  const directus = getTypedDirectus();

  const contract = await directus.request(
    readItem('contracts', contractId, {
      fields: ['id', 'title', 'organization', 'client', 'contact', 'lead', 'total_value', 'blocks', 'project'],
    }),
  ).catch(() => null) as any;
  if (!contract) throw createError({ statusCode: 404, message: 'Contract not found' });
  if (!contract.organization) throw createError({ statusCode: 422, message: 'Contract has no organization' });

  await requireOrgMembership(event, contract.organization);

  if (contract.project) {
    // Already converted — return the existing project (idempotent-ish).
    return { projectId: typeof contract.project === 'object' ? contract.project.id : contract.project, eventsCreated: 0, alreadyLinked: true };
  }

  const today = new Date();
  const project = await directus.request(
    createItem('projects', {
      title: contract.title || 'New Project',
      client: contract.client || null,
      organization: contract.organization,
      contract_value: contract.total_value ?? null,
      status: 'Scheduled',
      start_date: today.toISOString().slice(0, 10),
    } as any),
  ) as any;
  const projectId = project.id;

  // Back-link the contract to its project (Contract owns the FK).
  await directus.request(updateItem('contracts', contractId, { project: projectId } as any)).catch(() => {});

  // Seed events from the scope phases (first scope_tree block, if any).
  let eventsCreated = 0;
  try {
    const blocks = Array.isArray(contract.blocks) ? contract.blocks : [];
    const scope = blocks.find((b: any) => b?.type === 'scope_tree');
    const phases: any[] = scope?.payload?.phases || [];
    let previousEventId: string | null = null;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i] || {};
      const d = new Date(today.getTime() + i * PHASE_STAGGER_DAYS * 86400000);
      const descParts = [p.summary, ...(Array.isArray(p.bullets) ? p.bullets.map((b: string) => `• ${b}`) : [])].filter(Boolean);
      const created = await directus.request(
        createItem('project_events', {
          project: projectId,
          title: p.heading || `Phase ${i + 1}`,
          description: descParts.join('\n') || null,
          event_date: d.toISOString().slice(0, 10),
          date: d.toISOString().slice(0, 10),
          type: 'Timeline',
          is_milestone: true,
          status: 'Scheduled',
          priority: 'Normal',
          sort: i,
          depends_on: previousEventId,
        } as any),
      ) as any;
      previousEventId = created.id;
      eventsCreated++;
    }
  } catch (err: any) {
    console.warn('[from-contract] event seeding failed:', err?.message);
  }

  return { projectId, eventsCreated };
});
