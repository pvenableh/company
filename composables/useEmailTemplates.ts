import type { EmailTemplate, MjmlCompileResult } from '~/types/email/blocks';

export function useEmailTemplates() {
  const items = useDirectusItems<EmailTemplate>('email_templates');

  const getTemplates = async (type?: 'newsletter' | 'transactional'): Promise<EmailTemplate[]> => {
    const filter: Record<string, any> = {};
    if (type) filter.type = { _eq: type };
    return items.list({ fields: ['*'], filter, sort: ['-date_updated'] });
  };

  const getTemplate = async (id: number): Promise<EmailTemplate> => {
    return items.get(id, { fields: ['*', 'blocks.*', 'blocks.block_id.*'] });
  };

  const createTemplate = async (data: Partial<EmailTemplate>): Promise<EmailTemplate> => {
    return items.create(data);
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

  return {
    getTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    previewNewsletter,
    sendTestEmail,
  };
}
