/**
 * Get a single marketing campaign with full plan data.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Campaign ID is required' });
  }

  const campaign = await getMarketingCampaign(id);
  await requireOrgMembership(event, campaign.organization || '');
  return campaign;
});
