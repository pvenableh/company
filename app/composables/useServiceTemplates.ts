/**
 * useServiceTemplates — manage org-scoped service offering templates that
 * power the AI proposal-drafter on /leads/[id].
 */

export interface ServiceTemplate {
  id: string;
  status: 'published' | 'draft' | 'archived';
  name: string;
  category: string;
  description: string | null;
  scope_template: string | null;
  default_total: number | null;
  default_duration_days: number | null;
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
      fields: ['id', 'name', 'category', 'description', 'scope_template', 'default_total', 'default_duration_days'],
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

  const update = async (id: string, data: Partial<ServiceTemplate>): Promise<ServiceTemplate> => {
    return (await templates.update(id, data as any)) as ServiceTemplate;
  };

  const remove = async (id: string): Promise<void> => {
    await templates.remove(id);
  };

  return { list, listPublished, create, update, remove };
}
