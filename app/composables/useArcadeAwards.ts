// composables/useArcadeAwards.ts
/**
 * Bridge between "real work happened" and the arcade reward layer.
 *
 * Call `awardEvent('ticket_closed')` the instant a user completes work. It:
 *   1. fires the floating +EP pop immediately (optimistic, snappy), then
 *   2. POSTs to /api/score/award for the authoritative total, and
 *   3. plays badge-unlock + level-up celebrations the server reports.
 *
 * Presentation (icon / label / dimension) lives here; canonical EP + level
 * live on the server (server/utils/earnestScore.ts). Keep the `ep` values in
 * EVENT_META roughly in sync with EP_AWARDS for the optimistic pop.
 */
import type { ArcadeDimension } from '~/composables/useArcade';
import type { MarkGesture } from '~/components/Earnest/Mark.vue';

interface EventMeta {
	ep: number;
	label: string;
	icon: string;
	dimension: ArcadeDimension;
}

// Which mascot gesture each completion plays. Big deliverables clap; the rest
// get a thumbs-up. Level-ups (detected from the server award) always celebrate.
const EVENT_GESTURE: Record<ArcadeEvent, MarkGesture> = {
	task_completed: 'thumbsup',
	ticket_closed: 'clap',
	project_completed: 'clap',
	project_on_time: 'clap',
	deal_won: 'clap',
	lead_qualified: 'thumbsup',
	lead_stage_advanced: 'thumbsup',
	follow_up_completed: 'thumbsup',
	contact_added: 'thumbsup',
	invoice_sent: 'thumbsup',
	invoice_paid_on_time: 'clap',
	meeting_held: 'thumbsup',
	social_post: 'thumbsup',
	daily_quest: 'celebrate',
	weekly_quest: 'celebrate',
};

export type ArcadeEvent =
	| 'task_completed'
	| 'ticket_closed'
	| 'project_completed'
	| 'project_on_time'
	| 'deal_won'
	| 'lead_qualified'
	| 'lead_stage_advanced'
	| 'follow_up_completed'
	| 'contact_added'
	| 'invoice_sent'
	| 'invoice_paid_on_time'
	| 'meeting_held'
	| 'social_post'
	| 'daily_quest'
	| 'weekly_quest';

const EVENT_META: Record<ArcadeEvent, EventMeta> = {
	task_completed: { ep: 3, label: 'Task done', icon: '✅', dimension: 'consistency' },
	ticket_closed: { ep: 10, label: 'Ticket closed', icon: '⚡', dimension: 'delivery' },
	project_completed: { ep: 25, label: 'Project shipped', icon: '🚀', dimension: 'delivery' },
	project_on_time: { ep: 15, label: 'On time!', icon: '⏱️', dimension: 'delivery' },
	deal_won: { ep: 20, label: 'Deal won', icon: '🏆', dimension: 'growth' },
	lead_qualified: { ep: 10, label: 'Lead qualified', icon: '🎯', dimension: 'growth' },
	lead_stage_advanced: { ep: 5, label: 'Lead advanced', icon: '📈', dimension: 'growth' },
	follow_up_completed: { ep: 5, label: 'Followed up', icon: '📞', dimension: 'growth' },
	contact_added: { ep: 10, label: 'New contact', icon: '🤝', dimension: 'growth' },
	invoice_sent: { ep: 5, label: 'Invoice sent', icon: '📤', dimension: 'finance' },
	invoice_paid_on_time: { ep: 15, label: 'Paid!', icon: '💰', dimension: 'finance' },
	meeting_held: { ep: 5, label: 'Meeting held', icon: '🎥', dimension: 'communication' },
	social_post: { ep: 3, label: 'Post published', icon: '📣', dimension: 'growth' },
	daily_quest: { ep: 15, label: 'Daily quest!', icon: '🎯', dimension: 'consistency' },
	weekly_quest: { ep: 40, label: 'Weekly quest!', icon: '🏅', dimension: 'consistency' },
};

export function useArcadeAwards() {
	const arcade = useArcade();
	const mascot = useEarnestMascot();
	const { selectedOrg } = useOrganization();

	/**
	 * Award EP for a completed-work event. Fire-and-forget; never throws into
	 * the caller's critical path.
	 *
	 * @param eventType which event happened
	 * @param opts.amount optional dollar figure to show on the pop (money events)
	 * @param opts.silent skip the optimistic pop (e.g. when the caller already
	 *        showed feedback) but still record the award
	 */
	const awardEvent = async (
		eventType: ArcadeEvent,
		opts: { amount?: number; silent?: boolean } = {},
	) => {
		const meta = EVENT_META[eventType];
		if (!meta) return;

		if (!opts.silent) {
			arcade.reward({
				ep: meta.ep,
				label: meta.label,
				icon: meta.icon,
				dimension: meta.dimension,
				amount: opts.amount,
			});
		}

		// Earnest reacts to the win (no-op unless the mascot is enabled + mounted).
		mascot.react(EVENT_GESTURE[eventType]);

		const orgId = selectedOrg.value;
		if (!orgId) return;

		try {
			const res = await $fetch<any>('/api/score/award', {
				method: 'POST',
				body: { orgId, event: eventType },
			});
			const data = res?.data;
			if (!data) return;
			for (const b of data.newBadges ?? []) {
				arcade.unlockBadge(b.name, b.icon, b.description);
			}
			if (data.leveledUp && data.level && data.levelTitle) {
				window.setTimeout(() => arcade.celebrateLevelUp(data.level, data.levelTitle), 650);
				// a level-up trumps the per-event gesture — Earnest celebrates.
				mascot.react('celebrate');
			}
		} catch (e) {
			// Scoring is best-effort — the pop already fired, so a failed award
			// just means the persisted total lags. Log and move on.
			if (import.meta.dev) console.warn('[arcade] award failed:', e);
		}
	};

	return { awardEvent };
}
