// server/api/link-preview.get.ts
// Fetches Open Graph metadata for a URL to render link previews in messages/comments.

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const url = query.url as string;

  if (!url || typeof url !== 'string') {
    throw createError({ statusCode: 400, message: 'Missing url parameter' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid URL' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Earnest LinkPreview/1.0',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { url, title: null, description: null, image: null, siteName: null };
    }

    const html = await response.text();

    // Parse Open Graph tags
    const og = (property: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`, 'i'));
      return match?.[1] || null;
    };

    // Fallback to regular meta tags
    const meta = (name: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'));
      return match?.[1] || null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    return {
      url,
      title: og('title') || meta('title') || titleMatch?.[1]?.trim() || null,
      description: og('description') || meta('description') || null,
      image: og('image') || null,
      siteName: og('site_name') || null,
    };
  } catch (err: any) {
    // Timeout or network error — return empty preview
    return { url, title: null, description: null, image: null, siteName: null };
  }
});
