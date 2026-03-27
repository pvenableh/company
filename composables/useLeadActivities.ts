/**
 * useLeadActivities - Activity timeline for leads
 */

export function useLeadActivities() {
  const activities = useDirectusItems('lead_activities');

  const getActivitiesForLead = async (leadId: number | string) => {
    return await activities.list({
      fields: [
        '*',
        'contact.id',
        'contact.first_name',
        'contact.last_name',
        'attachments.directus_files_id.id',
        'attachments.directus_files_id.title',
        'attachments.directus_files_id.type',
      ],
      filter: {
        lead: { _eq: leadId },
      },
      sort: ['-activity_date'],
      limit: 50,
    });
  };

  const createActivity = async (data: {
    lead: number | string;
    activity_type: string;
    subject: string;
    description?: string;
    outcome?: string;
    next_action?: string;
    next_action_date?: string;
    contact?: string;
  }) => {
    return await activities.create({
      ...data,
      activity_date: new Date().toISOString(),
    } as any);
  };

  return {
    getActivitiesForLead,
    createActivity,
    ...activities,
  };
}
