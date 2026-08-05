// server/api/directus/files/upload.post.ts
/**
 * Server API route for file upload (native Directus uploadFiles).
 *
 * On the way through we now:
 *   1. Smart-optimize images (sharp) so oversized photos shrink before storage.
 *   2. Enforce the per-file size cap + the org's storage quota (413 if over),
 *      when the caller passes `organization`.
 *   3. Increment the org's cached storage counter after a successful upload.
 * Optimization is best-effort and never blocks a legitimate upload; quota
 * enforcement is skipped only when no `organization` is supplied (legacy callers).
 */
import { uploadFiles } from "@directus/sdk";
import { optimizeImageBuffer } from "~~/server/utils/image-optimize";
import { addOrgStorageUsage, enforceStorageLimit } from "~~/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event);
    const formData = await readMultipartFormData(event);

    if (!formData) {
      throw createError({ statusCode: 400, message: "No file data provided" });
    }

    const fileData = formData.find((part) => part.name === "file");
    if (!fileData) {
      throw createError({ statusCode: 400, message: "No file found in form data" });
    }

    // Build metadata object from the non-file parts
    const metadata: Record<string, any> = {};
    formData.forEach((part) => {
      if (part.name !== "file" && part.data) {
        const value = part.data.toString();
        try {
          metadata[part.name] = JSON.parse(value);
        } catch {
          metadata[part.name] = value;
        }
      }
    });

    const organization: string | null = typeof metadata.organization === "string" ? metadata.organization : null;

    // 1. Smart-optimize images before anything touches storage.
    const optimized = await optimizeImageBuffer(
      Buffer.from(fileData.data),
      fileData.type || "application/octet-stream",
      fileData.filename || "upload",
    );

    // 2. Enforce per-file cap + org quota against the FINAL (optimized) size.
    if (organization) {
      await enforceStorageLimit(organization, optimized.bytes.length);
    }

    // Create FormData for Directus SDK with the (possibly) optimized bytes.
    const uploadFormData = new FormData();
    const blob = new Blob([new Uint8Array(optimized.bytes)], { type: optimized.type });
    uploadFormData.append("file", blob, optimized.filename);

    if (metadata.title) uploadFormData.append("title", metadata.title);
    if (metadata.description) uploadFormData.append("description", metadata.description);
    if (metadata.folder) uploadFormData.append("folder", metadata.folder);
    if (metadata.tags) uploadFormData.append("tags", JSON.stringify(metadata.tags));

    // Upload using SDK — withAuthRetry refreshes + retries once on a rejected token.
    const result = await withAuthRetry(event, (directus) => directus.request(uploadFiles(uploadFormData)));

    // 3. Bump the org's cached storage counter (best-effort).
    if (organization) {
      await addOrgStorageUsage(organization, optimized.bytes.length);
    }

    return result;
  } catch (error: any) {
    // Surface 413 (too large / quota) verbatim so the client can show the right message.
    console.error("File upload error:", error);
    throw createError({
      statusCode: error.statusCode || 500,
      data: error.data,
      message: error.message || "Failed to upload file",
    });
  }
});
