// lib/utils.ts
/**
 * Utility functions for styling with Tailwind CSS and class-variance-authority
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert NuxtUI icon format (i-heroicons-xxx) to @nuxt/icon format (heroicons:xxx)
 */
export function convertIconName(name: string): string {
  if (!name) return "";
  if (name.includes(":")) return name;

  let stripped = name;
  if (stripped.startsWith("i-")) {
    stripped = stripped.slice(2);
  }

  const collections = [
    "heroicons-solid",
    "heroicons-outline",
    "heroicons",
    "lucide",
    "mdi",
    "ph",
    "carbon",
    "tabler",
    "material-symbols",
  ];

  for (const collection of collections) {
    if (stripped.startsWith(`${collection}-`)) {
      return `${collection}:${stripped.slice(collection.length + 1)}`;
    }
  }

  return `heroicons:${stripped}`;
}
