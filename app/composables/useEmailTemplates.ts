import type { EmailTemplate, MjmlCompileResult } from '~~/shared/email/blocks';

export function useEmailTemplates() {
  const items = useDirectusItems<EmailTemplate>('email_templates');
  const { selectedOrg, getOrganizationFilter } = useOrganization();

  const getTemplates = async (type?: 'newsletter' | 'transactional'): Promise<EmailTemplate[]> => {
    const filter: any = { _and: [] };

    // Org-scope
    const orgFilter = getOrganizationFilter();
    if (orgFilter?.organization) {
      filter._and.push({ organization: orgFilter.organization });
    }

    if (type) {
      filter._and.push({ type: { _eq: type } });
    }

    return items.list({
      fields: ['*'],
      filter: filter._and.length ? filter : undefined,
      sort: ['-date_updated'],
    });
  };

  const getTemplate = async (id: number): Promise<EmailTemplate> => {
    return items.get(id, { fields: ['*', 'blocks.*', 'blocks.block_id.*'] });
  };

  const createTemplate = async (data: Partial<EmailTemplate>): Promise<EmailTemplate> => {
    // Auto-set organization on create
    return items.create({
      status: 'published',
      ...data,
      organization: selectedOrg.value || undefined,
    } as any);
  };

  const updateTemplate = async (id: number, data: Partial<EmailTemplate>): Promise<EmailTemplate> => {
    return items.update(id, data);
  };

  const deleteTemplate = async (id: number): Promise<boolean> => {
    return items.remove(id);
  };

  const previewNewsletter = async (
    mjmlSource: string,
    variables: Record<string, any> = {}
  ): Promise<MjmlCompileResult> => {
    return $fetch('/api/email/preview', {
      method: 'POST',
      body: { mjml_source: mjmlSource, variables },
    });
  };

  const sendTestEmail = async (
    templateId: number,
    toEmail: string,
    sampleVariables: Record<string, any> = {}
  ) => {
    return $fetch('/api/email/test-send', {
      method: 'POST',
      body: {
        template_id: templateId,
        to_email: toEmail,
        sample_variables: sampleVariables,
      },
    });
  };

  const duplicateTemplate = async (sourceId: number, newName?: string): Promise<EmailTemplate> => {
    const source = await getTemplate(sourceId);
    const created = await createTemplate({
      name: newName || `${source.name} (Copy)`,
      type: source.type,
      status: 'draft',
      include_header: source.include_header,
      include_footer: source.include_footer,
      include_web_version_bar: source.include_web_version_bar,
    });

    // Copy blocks from source template
    if (source.blocks?.length) {
      const blockItems = useDirectusItems('template_blocks');
      for (const tb of source.blocks) {
        const block = typeof tb.block_id === 'object' ? tb.block_id : { id: tb.block_id };
        await blockItems.create({
          template_id: created.id,
          block_id: block.id,
          sort: tb.sort,
          instance_variables: tb.instance_variables,
        } as any);
      }
    }

    return created;
  };

  return {
    getTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    previewNewsletter,
    sendTestEmail,
  };
}
