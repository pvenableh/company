// server/api/org/referral-brand.get.ts
/**
 * Public referrer-brand lookup for the signup page.
 *
 * A subscriber's referral link is `/register?ref=<orgId>`. When someone lands
 * there, the signup page calls this endpoint to brand the experience as the
 * referring agency ("<Agency> invited you to Earnest"). Unauthenticated by
 * design — same pattern as the invite-details / public-invoice brand fetch,
 * using the server token via fetchOrgBrand. Returns only public brand bits.
 */
export default defineEventHandler(async (event) => {
  const ref = getQuery(event).ref;
  if (!ref || typeof ref !== 'string') {
    throw createError({ statusCode: 400, message: 'ref is required' });
  }

  const brand = await fetchOrgBrand(ref);
  if (!brand) {
    throw createError({ statusCode: 404, message: 'Referrer not found' });
  }

  return {
    id: brand.id,
    name: brand.name,
    logo: brand.logo, // asset id; client builds the URL
    brand_color: brand.brand_color,
  };
});
