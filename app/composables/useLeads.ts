/**
 * useLeads - Lead management composable
 *
 * Wraps useDirectusItems('leads') with typed helpers for
 * the lead pipeline dashboard.
 */

import type { LeadFilters, LeadStage, LeadStats } from '~~/shared/leads';
import { LEAD_PIPELINE_STAGES, FOLLOW_UP_INTERVALS } from '~~/shared/leads';

export function useLeads() {
  const leads = useDirectusItems('leads');

  const getLeads = async (filters?: LeadFilters) => {
    const filter: Record<string, any> = {};

    if (filters?.status) filter.status = { _eq: filters.status };
    if (filters?.stage) filter.stage = { _eq: filters.stage };
    if (filters?.priority) filter.priority = { _eq: filters.priority };
    if (filters?.source) filter.source = { _eq: filters.source };
    if (filters?.assigned_to) filter.assigned_to = { _eq: filters.assigned_to };
    if (filters?.related_contact) filter.related_contact = { _eq: filters.related_contact };
    if (filters?.tag) filter.tags = { _contains: filters.tag };
    if (filters?.date_from) filter.date_created = { _gte: filters.date_from };
    if (filters?.date_to) {
      filter.date_created = { ...filter.date_created, _lte: filters.date_to };
    }

    return await leads.list({
      fields: [
        '*',
        'related_contact.id',
        'related_contact.first_name',
        'related_contact.last_name',
        'related_contact.email',
        'related_contact.company',
        'related_contact.phone',
        'assigned_to.id',
        'assigned_to.first_name',
        'assigned_to.last_name',
        'assigned_to.avatar',
        'organization.id',
        'organization.name',
      ],
      filter,
      sort: ['-date_created'],
      search: filters?.search || undefined,
      limit: 100,
    });
  };

  const getLead = async (id: number | string) => {
    return await leads.get(id, {
      fields: [
        '*',
        'related_contact.id',
        'related_contact.first_name',
        'related_contact.last_name',
        'related_contact.email',
        'related_contact.company',
        'related_contact.phone',
        'related_contact.photo',
        'related_contact.linkedin_url',
        'related_contact.website',
        'related_contact.email_subscribed',
        'related_contact.email_bounced',
        'related_contact.email_bounce_type',
        'related_contact.total_emails_sent',
        'related_contact.total_opens',
        'related_contact.total_clicks',
        'related_contact.last_opened_at',
        'related_contact.last_clicked_at',
        'related_contact.lists.id',
        'related_contact.lists.subscribed',
        'related_contact.lists.list_id.id',
        'related_contact.lists.list_id.name',
        'assigned_to.id',
        'assigned_to.first_name',
        'assigned_to.last_name',
        'assigned_to.avatar',
        'organization.id',
        'organization.name',
      ],
    });
  };

  const updateLeadStage = async (id: number | string, stage: LeadStage) => {
    return await leads.update(id, { stage } as any);
  };

  const assignLead = async (id: number | string, userId: string) => {
    return await leads.update(id, { assigned_to: userId } as any);
  };

  const getLeadStats = async (): Promise<LeadStats> => {
    const allLeads = await leads.list({
      fields: ['id', 'stage', 'lead_score', 'estimated_value', 'date_created'],
      limit: -1,
    });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const by_stage: Record<string, number> = {
      new: 0, contacted: 0, qualified: 0, proposal_sent: 0, negotiating: 0, won: 0, lost: 0,
    };

    let totalScore = 0;
    let pipelineValue = 0;
    let newThisWeek = 0;

    for (const lead of allLeads as any[]) {
      if (lead.stage && by_stage[lead.stage] !== undefined) {
        by_stage[lead.stage]++;
      }
      totalScore += lead.lead_score || 0;
      pipelineValue += parseFloat(lead.estimated_value) || 0;
      if (new Date(lead.date_created) > weekAgo) newThisWeek++;
    }

    return {
      total: allLeads.length,
      by_stage: by_stage as Record<LeadStage, number>,
      avg_score: allLeads.length ? Math.round(totalScore / allLeads.length) : 0,
      pipeline_value: pipelineValue,
      new_this_week: newThisWeek,
    };
  };

  const createLead = async (payload: Record<string, any>) => {
    const { selectedOrg } = useOrganization();
    return await leads.create({
      ...payload,
      organization: payload.organization || selectedOrg.value,
      stage: payload.stage || 'new',
    } as any);
  };

  const updateLead = async (id: number | string, payload: Record<string, any>) => {
    return await leads.update(id, {
      ...payload,
      date_updated: new Date(),
    } as any);
  };

  const scheduleFollowUp = async (leadId: number | string, stage: LeadStage) => {
    const intervalDays = FOLLOW_UP_INTERVALS[stage];
    if (!intervalDays) return;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);
    const nextFollowUp = nextDate.toISOString();

    await leads.update(leadId, { next_follow_up: nextFollowUp } as any);

    const { createActivity } = useLeadActivities();
    await createActivity({
      lead: Number(leadId),
      activity_type: 'follow_up',
      subject: `Auto follow-up scheduled (${stage})`,
      description: `Follow-up automatically scheduled ${intervalDays} day${intervalDays > 1 ? 's' : ''} after stage change to ${stage}.`,
      next_action: `Follow up on ${nextDate.toLocaleDateString()}`,
      next_action_date: nextFollowUp,
    });
  };

  const updateLeadStageWithAutomation = async (
    id: number | string,
    newStage: LeadStage,
    oldStage?: LeadStage,
  ): Promise<{ requiresConversion?: boolean; requiresLostReason?: boolean }> => {
    if (newStage === 'won') {
      return { requiresConversion: true };
    }
    if (newStage === 'lost') {
      return { requiresLostReason: true };
    }

    await leads.update(id, { stage: newStage, date_updated: new Date() } as any);

    // Log stage change activity
    const { createActivity } = useLeadActivities();
    await createActivity({
      lead: Number(id),
      activity_type: 'note',
      subject: `Stage changed to ${newStage}`,
      description: oldStage ? `Pipeline stage moved from ${oldStage} to ${newStage}.` : `Pipeline stage set to ${newStage}.`,
    });

    // Auto-schedule follow-up
    await scheduleFollowUp(id, newStage);

    return {};
  };

  /**
   * Add a lead to a mailing list. If the lead has no related_contact yet,
   * auto-creates one from the lead's data (option-b approach from the
   * contacts/leads unification plan). Returns the contact id used.
   */
  const addLeadToList = async (
    leadId: number | string,
    listId: number,
    source = 'lead_list_promote',
  ): Promise<{ contactId: string; created: boolean }> => {
    const { createContact, addToList } = useContacts();

    const lead = await getLead(leadId) as any;
    if (!lead) throw new Error('Lead not found');

    let contactId: string | null = null;
    let created = false;

    const rc = lead.related_contact;
    contactId = typeof rc === 'string' ? rc : rc?.id || null;

    if (!contactId) {
      // Promote: synthesize a Contact from what the lead has (name/company/source).
      // Marketing needs an email to be useful, so fall back to a stub if missing.
      const newContact = await createContact({
        first_name: (rc?.first_name || '') as string,
        last_name: (rc?.last_name || '') as string,
        email: (rc?.email || '') as string,
        phone: (rc?.phone as string) || undefined,
        company: (rc?.company as string) || undefined,
        source: `lead:${lead.source || 'unknown'}`,
      } as any);
      contactId = (newContact as any)?.id || null;
      if (!contactId) throw new Error('Failed to create contact from lead');
      await leads.update(leadId, { related_contact: contactId } as any);
      created = true;
    }

    await addToList(contactId, listId, source);
    return { contactId, created };
  };

  const convertToClient = async (
    leadId: number | string,
    clientData: Record<string, any>,
    projectData?: Record<string, any>,
    options?: { contactData?: { first_name?: string; last_name?: string; email?: string; phone?: string } },
  ) => {
    const { createClient } = useClients();
    const { createContact } = useContacts();
    const projectItems = useDirectusItems('projects');
    const { selectedOrg } = useOrganization();

    // If the lead has no related_contact yet but we have contact fields, create one first
    let contactId: string | null = clientData.primary_contact || null;
    const lead = await getLead(leadId);
    if (!contactId && !(lead as any)?.related_contact && options?.contactData) {
      const { first_name, last_name, email } = options.contactData;
      if (first_name || last_name || email) {
        const created = await createContact({
          first_name: first_name || '',
          last_name: last_name || '',
          email: email || '',
          phone: options.contactData.phone,
          source: 'lead_conversion',
        } as any);
        contactId = (created as any)?.id || null;
        if (contactId) {
          await leads.update(leadId, { related_contact: contactId } as any);
        }
      }
    }

    // Create client
    const client = await createClient({
      ...clientData,
      primary_contact: contactId || clientData.primary_contact || null,
      organization: clientData.organization || selectedOrg.value,
    });

    // Link contact to the new client (reverse FK) if we have one
    if (contactId && (client as any)?.id) {
      try {
        const { linkToClient } = useContacts();
        await linkToClient(contactId, (client as any).id);
      } catch (err) {
        console.warn('Failed to link contact to client (non-fatal):', err);
      }
    }

    // Create project if requested
    if (projectData && (client as any)?.id) {
      await projectItems.create({
        ...projectData,
        client: (client as any).id,
        organization: projectData.organization || selectedOrg.value,
        status: projectData.status || 'Active',
      } as any);
    }

    // Mark lead as converted
    await leads.update(leadId, {
      converted_to_customer: true,
      stage: 'won',
      actual_value: clientData.contract_value || null,
      closed_date: new Date().toISOString(),
      date_updated: new Date(),
    } as any);

    // Log conversion activity
    const { createActivity } = useLeadActivities();
    await createActivity({
      lead: Number(leadId),
      activity_type: 'note',
      subject: 'Lead converted to client',
      description: `Created client "${clientData.name}" and marked lead as won.`,
    });

    return client;
  };

  const markLeadLost = async (leadId: number | string, lostReason: string, closedDate?: string) => {
    await leads.update(leadId, {
      stage: 'lost',
      lost_reason: lostReason,
      closed_date: closedDate || new Date().toISOString(),
      date_updated: new Date(),
    } as any);

    const { createActivity } = useLeadActivities();
    await createActivity({
      lead: Number(leadId),
      activity_type: 'note',
      subject: 'Lead marked as lost',
      description: `Reason: ${lostReason}`,
    });
  };

  const getLeadsByStage = async (filters?: LeadFilters): Promise<Record<LeadStage, any[]>> => {
    const allLeads = await getLeads(filters);

    const grouped: Record<LeadStage, any[]> = {
      new: [], contacted: [], qualified: [], proposal_sent: [], negotiating: [], won: [], lost: [],
    };

    for (const lead of allLeads as any[]) {
      const stage = lead.stage as LeadStage;
      if (grouped[stage]) {
        grouped[stage].push(lead);
      }
    }

    // Sort each stage by lead_score descending
    for (const stage of Object.keys(grouped) as LeadStage[]) {
      grouped[stage].sort((a: any, b: any) => (b.lead_score || 0) - (a.lead_score || 0));
    }

    return grouped;
  };

  const archiveLead = async (id: number | string) => {
    await leads.update(id, { status: 'archived', date_updated: new Date() } as any);
  };

  const junkLead = async (id: number | string) => {
    await leads.update(id, { status: 'junk', date_updated: new Date() } as any);
  };

  const restoreLead = async (id: number | string) => {
    await leads.update(id, { status: 'published', date_updated: new Date() } as any);
  };

  const getArchivedLeads = async () => {
    return await leads.list({
      fields: [
        '*',
        'related_contact.id',
        'related_contact.first_name',
        'related_contact.last_name',
        'related_contact.email',
        'related_contact.company',
        'assigned_to.id',
        'assigned_to.first_name',
        'assigned_to.last_name',
      ],
      filter: {
        status: { _in: ['archived', 'junk'] },
      },
      sort: ['-date_updated'],
      limit: 100,
    });
  };

  return {
    getLeads,
    getLead,
    updateLeadStage,
    assignLead,
    getLeadStats,
    createLead,
    updateLead,
    updateLeadStageWithAutomation,
    convertToClient,
    markLeadLost,
    scheduleFollowUp,
    getLeadsByStage,
    archiveLead,
    junkLead,
    restoreLead,
    getArchivedLeads,
    addLeadToList,
    ...leads,
  };
}
