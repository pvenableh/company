// server/utils/mentionParser.ts
/**
 * Parse @mentions from text content.
 *
 * Mention format: @[user-uuid]
 * Example: "Hey @[8cc67ebc-3c52-475a-9ae6-fba26963a9ad], check this out"
 *
 * Returns an array of unique user UUIDs found in the text.
 */

const MENTION_REGEX = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

export function parseMentions(text: string | null | undefined): string[] {
  if (!text) return [];

  const mentions = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.add(match[1].toLowerCase());
  }

  return Array.from(mentions);
}
