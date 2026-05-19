/**
 * useServiceTemplates — manage org-scoped service offering templates that
 * power the AI proposal-drafter on /leads/[id] and seed the scope_tree
 * primitive's "From service" add-phase action.
 *
 * The user-facing label is "Service offering" now, but the Directus
 * collection name (`service_templates`) is preserved to avoid a rename
 * migration. New writes go to `scope_payload` (structured ScopeTreePayload);
 * legacy `scope_template` text is read-only and retained as a fallback.
 */
import type { ScopeTreePayload } from '~~/shared/blocks/types';

export interface ServiceTemplate {
  // Setup script declared `meta.special: ['uuid']` but Directus created the
  // column as integer; existing demo rows have integer ids. Accept both so
  // the type matches reality without re-creating the column.
  id: string | number;
  status: 'published' | 'draft' | 'archived';
  name: string;
  category: string;
  description: string | null;
  /** Legacy free-text scope. Read-only fallback for rows that pre-date the
   *  typed-block migration. Don't write to this from new code. */
  scope_template: string | null;
  /** Structured ScopeTreePayload editable via the shared ScopeTreeEditor.
   *  Empty/null = no scope authored yet. */
  scope_payload: ScopeTreePayload | null;
  default_total: number | null;
  default_duration_days: number | null;
  /** Hex swatch (e.g. "#56cfe1"). Null = fall through to the Work-app accent
   *  in any UI that wants to distinguish services. */
  color: string | null;
  /** Single emoji used to personalize the service in pickers, list cards,
   *  and preview chips. Null = no glyph. */
  icon: string | null;
  organization: string;
  date_created?: string;
  date_updated?: string;
  user_created?: string;
  user_updated?: string;
}

export function useServiceTemplates() {
  const templates = useDirectusItems('service_templates');
  const { selectedOrg } = useOrganization();

  const list = async (opts: { includeArchived?: boolean } = {}): Promise<ServiceTemplate[]> => {
    if (!selectedOrg.value) return [];
    const statusValues = opts.includeArchived
      ? ['published', 'draft', 'archived']
      : ['published', 'draft'];
    return (await templates.list({
      fields: ['*'],
      filter: {
        organization: { _eq: selectedOrg.value },
        status: { _in: statusValues },
      },
      sort: ['-date_updated'],
      limit: 200,
    })) as ServiceTemplate[];
  };

  const listPublished = async (): Promise<ServiceTemplate[]> => {
    if (!selectedOrg.value) return [];
    return (await templates.list({
      fields: ['id', 'name', 'category', 'description', 'scope_template', 'scope_payload', 'default_total', 'default_duration_days', 'color', 'icon'],
      filter: {
        organization: { _eq: selectedOrg.value },
        status: { _eq: 'published' },
      },
      sort: ['name'],
      limit: 100,
    })) as ServiceTemplate[];
  };

  const create = async (data: Partial<ServiceTemplate>): Promise<ServiceTemplate> => {
    return (await templates.create({
      ...data,
      organization: data.organization || selectedOrg.value,
      status: data.status || 'published',
    } as any)) as ServiceTemplate;
  };

  const update = async (id: string | number, data: Partial<ServiceTemplate>): Promise<ServiceTemplate> => {
    return (await templates.update(id as any, data as any)) as ServiceTemplate;
  };

  const remove = async (id: string | number): Promise<void> => {
    await templates.remove(id as any);
  };

  return { list, listPublished, create, update, remove };
}
