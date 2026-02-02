// server/api/auth/validate-token.post.ts
/**
 * Validates a Directus access token by attempting to fetch current user
 */

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { token } = body;

    if (!token) {
      return { valid: false };
    }

    const config = useRuntimeConfig();
    const directusUrl = config.directus.url;

    // Validate by making a request to Directus
    const response = await $fetch(`${directusUrl}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        fields: 'id',
      },
    });

    return { valid: !!response?.data?.id };
  } catch (error: any) {
    return { valid: false };
  }
});
