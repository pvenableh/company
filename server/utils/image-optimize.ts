/**
 * Server-side image optimization for uploads (Smart optimize). Uses `sharp`
 * (already a dependency) to shrink oversized photos before they hit storage —
 * the single biggest lever on org storage growth. Applied at the upload
 * endpoints so every path benefits.
 *
 * Rules:
 *   - Only raster photos (jpeg/png/webp/tiff/avif). SVG and GIF are passed
 *     through untouched (vectors + animation don't re-encode safely here).
 *   - Downscale so the longest edge is <= MAX_EDGE (never upscales).
 *   - Re-encode to WebP at QUALITY. Keeps the result only if it's actually
 *     smaller than the original; otherwise the original bytes are returned.
 *   - Best-effort: any failure returns the original untouched.
 */
import sharp from 'sharp';

const MAX_EDGE = Number(process.env.IMAGE_MAX_EDGE) || 2560;
const QUALITY = Number(process.env.IMAGE_WEBP_QUALITY) || 82;

const OPTIMIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/avif']);

export interface OptimizedImage {
  bytes: Buffer;
  type: string;
  filename: string;
  optimized: boolean;
}

/** Return the type unchanged if we don't optimize it. */
export function isOptimizableImage(type: string | undefined | null): boolean {
  return !!type && OPTIMIZABLE.has(type.toLowerCase());
}

/**
 * Optimize a single image buffer. Returns the (possibly) smaller bytes plus the
 * resulting mime + filename. Non-images and failures return the input as-is.
 */
export async function optimizeImageBuffer(
  bytes: Buffer,
  type: string,
  filename: string,
): Promise<OptimizedImage> {
  if (!isOptimizableImage(type)) {
    return { bytes, type, filename, optimized: false };
  }
  try {
    const img = sharp(bytes, { failOn: 'none' }).rotate(); // honor EXIF orientation
    const meta = await img.metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);

    let pipeline = img;
    if (longest > MAX_EDGE) {
      pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
    }
    const out = await pipeline.webp({ quality: QUALITY }).toBuffer();

    // Only take the optimized version if it genuinely saves space.
    if (out.length < bytes.length) {
      const newName = filename.replace(/\.(jpe?g|png|tiff?|avif|webp)$/i, '') + '.webp';
      return { bytes: out, type: 'image/webp', filename: newName, optimized: true };
    }
    return { bytes, type, filename, optimized: false };
  } catch (err) {
    console.warn('[image-optimize] skipped (failed):', filename, (err as Error).message);
    return { bytes, type, filename, optimized: false };
  }
}
