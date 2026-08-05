// server/utils/pitch-ingest.ts
/**
 * Pure-ish transforms applied to an uploaded pitch's HTML at ingest time so the
 * stored document is fully self-contained and CDN-free:
 *
 *  1. rewriteAssetSrc  — swap relative asset references (video/img/source/poster)
 *     for the Directus /assets/<id> URLs of the files we uploaded alongside it.
 *  2. selfHostGoogleFonts — fetch the linked Google Fonts CSS, download each
 *     woff2, re-host it (caller uploads + returns a URL), and inline an
 *     @font-face <style> so the client never calls fonts.googleapis.com /
 *     fonts.gstatic.com. Honors the "kill the Google CDN dependency" intent.
 *
 * Both are best-effort and non-destructive: anything they can't resolve is left
 * exactly as-authored so a partial match never corrupts the pitch.
 */

/** Escape a string for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace references to `filename` (as authored, e.g. "walkthrough.mp4") with
 * `url` everywhere it appears inside a src/href/poster attribute value. Matches
 * the bare name or any relative path ending in it (./x.mp4, assets/x.mp4).
 */
export function rewriteAssetSrc(html: string, assetMap: Record<string, string>): string {
  let out = html;
  for (const [filename, url] of Object.entries(assetMap)) {
    if (!filename || !url) continue;
    const name = escapeRe(filename);
    // attr="...optional/path/filename" → attr="url" (single or double quotes)
    const re = new RegExp(`(src|href|poster)=(["'])([^"']*?/)?${name}\\2`, 'g');
    out = out.replace(re, (_m, attr, q) => `${attr}=${q}${url}${q}`);
  }
  return out;
}

const GOOGLE_FONTS_LINK_RE =
  /<link\b[^>]*href=(["'])(https:\/\/fonts\.googleapis\.com\/css2?[^"']*)\1[^>]*>/gi;
const GSTATIC_URL_RE = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2?)\)/gi;

// A modern-browser UA makes Google return woff2 (its response is UA-dependent).
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Rewrite every Google Fonts <link> into an inlined @font-face block whose font
 * files are re-hosted via `uploadWoff2` (which uploads the bytes and returns a
 * servable URL). Preconnect hints to the Google domains are stripped too.
 *
 * Fully best-effort: if the CSS fetch, a woff2 download, or an upload fails, the
 * original <link> is preserved so the pitch still renders (just via the CDN).
 */
export async function selfHostGoogleFonts(
  html: string,
  uploadWoff2: (bytes: Buffer, srcUrl: string) => Promise<string | null>,
): Promise<{ html: string; rehosted: number; failed: number }> {
  const links = [...html.matchAll(GOOGLE_FONTS_LINK_RE)];
  if (!links.length) return { html, rehosted: 0, failed: 0 };

  // De-dupe downloads across all links so a woff2 shared by two families is
  // fetched + uploaded once.
  const urlToHosted = new Map<string, string>();
  let rehosted = 0;
  let failed = 0;
  let out = html;

  for (const link of links) {
    const cssUrl = link[2]!;
    let css: string;
    try {
      const res = await fetch(cssUrl, { headers: { 'User-Agent': BROWSER_UA } });
      if (!res.ok) { failed++; continue; }
      css = await res.text();
    } catch { failed++; continue; }

    const fontUrls = [...css.matchAll(GSTATIC_URL_RE)].map((m) => m[1]!);
    let cssRewritten = css;
    let allOk = true;

    for (const fontUrl of fontUrls) {
      if (!urlToHosted.has(fontUrl)) {
        try {
          const r = await fetch(fontUrl, { headers: { 'User-Agent': BROWSER_UA } });
          if (!r.ok) { allOk = false; break; }
          const hosted = await uploadWoff2(Buffer.from(await r.arrayBuffer()), fontUrl);
          if (!hosted) { allOk = false; break; }
          urlToHosted.set(fontUrl, hosted);
          rehosted++;
        } catch { allOk = false; break; }
      }
      const hosted = urlToHosted.get(fontUrl)!;
      cssRewritten = cssRewritten.split(fontUrl).join(hosted);
    }

    if (!allOk) { failed++; continue; } // leave this <link> untouched
    out = out.replace(link[0], `<style data-selfhosted-fonts>\n${cssRewritten}\n</style>`);
  }

  // Drop now-useless preconnect hints to the Google font domains.
  out = out.replace(
    /<link\b[^>]*href=(["'])https:\/\/fonts\.g(?:oogleapis|static)\.com\/?\1[^>]*>\s*/gi,
    '',
  );

  return { html: out, rehosted, failed };
}
