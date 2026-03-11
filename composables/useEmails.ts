import type { Email } from '~/types/email/blocks';

export function useEmails() {
  const items = useDirectusItems<Email>('emails');

  const getEmails = async (params?: {
    status?: string;
    limit?: number;
    page?: number;
  }): Promise<Email[]> => {
    const filter: Record<string, any> = {};
    if (params?.status) filter.status = { _eq: params.status };
    return items.list({
      fields: ['*', 'template_id.name', 'template_id.type'],
      filter: Object.keys(filter).length ? filter : undefined,
      sort: ['-date_created'],
      limit: params?.limit || 50,
      page: params?.page || 1,
    });
  };

  const getEmail = async (id: number): Promise<Email> => {
    return items.get(id, {
      fields: ['*', 'template_id.*'],
    });
  };

  const createDraft = async (data: Partial<Email>): Promise<Email> => {
    return items.create({
      ...data,
      status: 'draft',
    } as any);
  };

  const updateEmail = async (id: number, data: Partial<Email>): Promise<Email> => {
    return items.update(id, data);
  };

  const deleteEmail = async (id: number): Promise<boolean> => {
    return items.remove(id);
  };

  const sendEmail = async (emailId: number) => {
    const email = await getEmail(emailId);
    return $fetch('/api/email/newsletter-send', {
      method: 'POST',
      body: {
        email_id: emailId,
        template_id: typeof email.template_id === 'object'
          ? (email.template_id as any)?.id
          : email.template_id,
        name: email.name,
        subject: email.subject,
        target_lists: typeof email.target_lists === 'string'
          ? JSON.parse(email.target_lists) : email.target_lists,
        cc_list: typeof email.cc_list === 'string'
          ? JSON.parse(email.cc_list) : email.cc_list,
        bcc_list: typeof email.bcc_list === 'string'
          ? JSON.parse(email.bcc_list) : email.bcc_list,
        custom_variables: typeof email.custom_variables === 'string'
          ? JSON.parse(email.custom_variables) : email.custom_variables,
      },
    });
  };

  return {
    getEmails,
    getEmail,
    createDraft,
    updateEmail,
    deleteEmail,
    sendEmail,
  };
}
