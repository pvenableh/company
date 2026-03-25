// utils/dates.ts
/**
 * Friendly date formatting utilities.
 * Auto-imported by Nuxt — available in all components and pages.
 *
 * Three verbosity levels:
 *   getFriendlyDate()      → "2 days ago" (relative)
 *   getFriendlyDateTwo()   → "Mar 24" (short absolute)
 *   getFriendlyDateThree() → "Mar 24, 2026" (full absolute)
 */

/**
 * Relative date string: "just now", "5 minutes ago", "2 days ago", etc.
 * Falls back to absolute date for anything older than 30 days.
 */
export function getFriendlyDate(dateInput: string | Date | null | undefined): string {
	if (!dateInput) return '';
	const date = new Date(dateInput);
	if (isNaN(date.getTime())) return '';

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Short absolute date: "Mar 24" (no year).
 * Adds year if the date is not in the current year.
 */
export function getFriendlyDateTwo(dateInput: string | Date | null | undefined): string {
	if (!dateInput) return '';
	const date = new Date(dateInput);
	if (isNaN(date.getTime())) return '';

	const now = new Date();
	const sameYear = date.getFullYear() === now.getFullYear();

	if (sameYear) {
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Full absolute date: "Mar 24, 2026" (always includes year).
 */
export function getFriendlyDateThree(dateInput: string | Date | null | undefined): string {
	if (!dateInput) return '';
	const date = new Date(dateInput);
	if (isNaN(date.getTime())) return '';

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
