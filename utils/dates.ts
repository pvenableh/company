// utils/dates.ts
/**
 * Centralized date formatting utilities.
 * Auto-imported by Nuxt — available in all components and pages.
 *
 * ABSOLUTE FORMATS (no relative wording):
 *   getFriendlyDateTwo()    → "Mar 24"           (short, no year unless different year)
 *   getFriendlyDateThree()  → "Mar 24, 2026"     (full, always includes year)
 *   formatDateLong()        → "March 24, 2026"   (long month name)
 *   formatDateWithTime()    → "Mar 24, 2026, 2:30 PM"
 *   formatDateTimeFull()    → "Mon, Mar 24, 2:30 PM"  (weekday + date + time)
 *   formatDateTimeCompact() → "Mar 24, 2:30 PM"  (date + time, no year)
 *   formatWeekday()         → "Mon"               (short weekday only)
 *
 * RELATIVE FORMATS:
 *   getFriendlyDate()       → "2d ago"            (compact relative)
 *   getRelativeTime()       → "2 days ago"        (verbose relative)
 *   formatRelativeDay()     → "Today" / "Yesterday" / "Mar 24" (day-level relative)
 *
 * DUE-DATE HELPERS:
 *   formatDueDate()         → "Apr 8"             (alias for getFriendlyDateTwo)
 *   formatDueDateStatus()   → "past" | "urgent" | "medium" | ""  (CSS class)
 *   formatDueDateDetail()   → { text: "2d overdue", class: "text-red-500" }
 *   getDaysUntilDue()       → number of days (negative = overdue)
 *
 * STATUS HELPERS:
 *   isPastOrFuture()        → "past" | "future" | "today" | ""
 *   isOverdue()             → boolean
 *
 * TIME-ONLY:
 *   formatTime()            → "2:30 PM"
 *   formatTimeFromString()  → "2:30 PM" (from "14:30" string)
 *
 * OTHER:
 *   getFirstLetter()        → "A" (first char uppercased)
 */

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------
function toDate(input: string | Date | number | null | undefined): Date | null {
	if (input == null) return null;
	const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
	return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Absolute date formats
// ---------------------------------------------------------------------------

/**
 * Short absolute date: "Mar 24" (no year unless different year).
 */
export function getFriendlyDateTwo(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	const sameYear = date.getFullYear() === new Date().getFullYear();
	if (sameYear) {
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Full absolute date: "Mar 24, 2026" (always includes year).
 */
export function getFriendlyDateThree(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Long-form absolute date: "March 24, 2026".
 */
export function formatDateLong(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Date + time: "Mar 24, 2026, 2:30 PM".
 */
export function formatDateWithTime(dateInput: string | Date | number | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * Weekday + date + time: "Mon, Mar 24, 2:30 PM".
 */
export function formatDateTimeFull(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

/**
 * Compact date + time (no year): "Mar 24, 2:30 PM".
 */
export function formatDateTimeCompact(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * Short weekday only: "Mon".
 */
export function formatWeekday(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// ---------------------------------------------------------------------------
// Relative date formats
// ---------------------------------------------------------------------------

/**
 * Compact relative: "just now", "5m ago", "2d ago", "1w ago".
 * Falls back to absolute date for anything older than 30 days.
 */
export function getFriendlyDate(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';

	const diffMs = Date.now() - date.getTime();
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
 * Verbose relative: "just now", "5 minutes ago", "2 days ago".
 * Supports future dates ("3 days from now").
 * Falls back to absolute date for anything older than 30 days.
 */
export function getRelativeTime(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';

	const diffMs = Date.now() - date.getTime();
	const isFuture = diffMs < 0;
	const abs = Math.abs(diffMs);
	const secs = Math.floor(abs / 1000);
	const mins = Math.floor(abs / 60000);
	const hours = Math.floor(abs / 3600000);
	const days = Math.floor(abs / 86400000);
	const suffix = isFuture ? 'from now' : 'ago';

	if (secs < 60) return 'just now';
	if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ${suffix}`;
	if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ${suffix}`;
	if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ${suffix}`;

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Day-level relative: "Today", "Yesterday", or short date ("Mar 24").
 * Falls back to short absolute date for older dates.
 */
export function formatRelativeDay(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';

	const today = new Date();
	if (date.toDateString() === today.toDateString()) return 'Today';

	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

	const diffDays = Math.floor((today.getTime() - date.getTime()) / 86400000);
	if (diffDays > 0 && diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Due-date helpers
// ---------------------------------------------------------------------------

/**
 * Short due-date label: same as getFriendlyDateTwo ("Apr 8").
 */
export function formatDueDate(dateInput: string | Date | null | undefined): string {
	return getFriendlyDateTwo(dateInput);
}

/**
 * CSS-class-friendly urgency status for a due date:
 *   'past'   — overdue
 *   'urgent' — due within 2 days
 *   'medium' — due within 7 days
 *   ''       — more than 7 days out
 */
export function formatDueDateStatus(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';

	const diffDays = (date.getTime() - Date.now()) / 86400000;
	if (diffDays < 0) return 'past';
	if (diffDays <= 2) return 'urgent';
	if (diffDays <= 7) return 'medium';
	return '';
}

/**
 * Detailed due-date info with text + CSS class:
 *   { text: "2d overdue",   class: "text-red-500" }
 *   { text: "Due today",    class: "text-yellow-500" }
 *   { text: "Due tomorrow", class: "text-yellow-400" }
 *   { text: "5d left",      class: "text-gray-400" }
 */
export function formatDueDateDetail(dateInput: string | Date | null | undefined): { text: string; class: string } | null {
	const date = toDate(dateInput);
	if (!date) return null;

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diff = date.getTime() - today.getTime();
	const days = Math.ceil(diff / 86400000);

	if (days < 0) return { text: `${Math.abs(days)}d overdue`, class: 'text-red-500' };
	if (days === 0) return { text: 'Due today', class: 'text-yellow-500' };
	if (days === 1) return { text: 'Due tomorrow', class: 'text-yellow-400' };
	return { text: `${days}d left`, class: 'text-gray-400' };
}

/**
 * Number of days until due date (negative = overdue).
 */
export function getDaysUntilDue(dateInput: string | Date | null | undefined): number {
	const date = toDate(dateInput);
	if (!date) return 0;
	return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/**
 * Returns 'past', 'future', or 'today' relative to the current date.
 */
export function isPastOrFuture(dateInput: string | Date | null | undefined): 'past' | 'future' | 'today' | '' {
	const date = toDate(dateInput);
	if (!date) return '';

	const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const nowOnly = new Date();
	nowOnly.setHours(0, 0, 0, 0);

	if (dateOnly.getTime() === nowOnly.getTime()) return 'today';
	return dateOnly < nowOnly ? 'past' : 'future';
}

/**
 * Simple boolean: is the date in the past?
 */
export function isOverdue(dateInput: string | Date | null | undefined): boolean {
	const date = toDate(dateInput);
	if (!date) return false;
	return date < new Date();
}

// ---------------------------------------------------------------------------
// Time-only helpers
// ---------------------------------------------------------------------------

/**
 * Time from a Date: "2:30 PM".
 */
export function formatTime(dateInput: string | Date | null | undefined): string {
	const date = toDate(dateInput);
	if (!date) return '';
	return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Time from an "HH:MM" string: "2:30 PM".
 */
export function formatTimeFromString(timeStr: string | null | undefined): string {
	if (!timeStr) return '';
	const [h, m] = timeStr.split(':');
	const hour = parseInt(h);
	if (isNaN(hour)) return timeStr;
	const ampm = hour >= 12 ? 'PM' : 'AM';
	const displayHour = hour % 12 || 12;
	return `${displayHour}:${m} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Other
// ---------------------------------------------------------------------------

/**
 * Returns the first letter of a string, uppercased.
 */
export function getFirstLetter(value: string | null | undefined): string {
	if (!value) return '';
	return value.charAt(0).toUpperCase();
}
