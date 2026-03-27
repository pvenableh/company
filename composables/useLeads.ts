/**
 * useLeads - Lead management composable
 *
 * Wraps useDirectusItems('leads') with typed helpers for
 * the lead pipeline dashboard.
 */

import type { LeadFilters, LeadStage, LeadStats } from '~/types/leads';

export function useLeads() {
  const leads = useDirectusItems('leads');

  const getLeads = async (filters?: LeadFilters) => {
    const filter: Record<string, any> = {};

    if (filters?.status) filter.status = { _eq: filters.status };
    if (filters?.stage) filter.stage = { _eq: filters.stage };
    if (filters?.priority) filter.priority = { _eq: filters.priority };
    if (filters?.source) filter.source = { _eq: filters.source };
    if (filters?.assigned_to) filter.assigned_to = { _eq: filters.assigned_to };
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

  return {
    getLeads,
    getLead,
    updateLeadStage,
    assignLead,
    getLeadStats,
    ...leads,
  };
}
