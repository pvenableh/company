// GET /api/onboarding/industries
// Public, session-less list of industries for the signup wizard's chips. The
// authed /api/directus/items proxy returns nothing for a guest (draft signup),
// and fetching Directus directly from the browser is cross-origin (CORS), so the
// wizard reads this same-origin route instead. `industries` is a small,
// anon-readable reference collection.
import { readItems } from '@directus/sdk';

export default defineCachedEventHandler(async () => {
  const directus = getServerDirectus();
  try {
    const rows = (await directus.request(
      readItems('industries', { fields: ['id', 'name'], sort: ['name'], limit: -1 }),
    )) as Array<{ id: string; name: string }>;
    return { data: rows };
  } catch {
    return { data: [] };
  }
}, { maxAge: 300, name: 'onboarding-industries', getKey: () => 'all' });
